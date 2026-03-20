import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '../lib/wallet/connect';
import { useQueryClient } from '@tanstack/react-query';
import {
  boolCV,
  type ClarityValue,
  PostConditionMode,
  principalCV,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import { getLegacyContract, type ContractRegistryEntry } from '../lib/contract/registry';
import { getContractId } from '../lib/contract/config';
import type { WalletSession } from '../lib/wallet/types';
import { getNetworkMismatch } from '../lib/network/guard';
import { createXtrataClient } from '../lib/contract/client';
import { resolveContractCapabilities } from '../lib/contract/capabilities';
import {
  EMPTY_ADMIN_STATUS,
  useContractAdminStatus
} from '../lib/contract/admin-status';
import { formatMicroStx, MICROSTX_PER_STX } from '../lib/contract/fees';
import { getViewerKey } from '../lib/viewer/queries';

type ContractAdminScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type TxPayload = {
  txId: string;
};

const FEE_UNIT_MIN_MICROSTX = 1_000;
const FEE_UNIT_MAX_MICROSTX = 1_000_000;

const parseStxInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const formatStxFromMicro = (value: number, decimals = 6) =>
  `${(value / MICROSTX_PER_STX).toFixed(decimals)} STX`;

const parseTokenIdInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = BigInt(trimmed);
    if (parsed < 0n) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

const normalizeAddress = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
};

const addressesEqual = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight;
};

export default function ContractAdminScreen(props: ContractAdminScreenProps) {
  const queryClient = useQueryClient();
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const legacyContract = useMemo(
    () => getLegacyContract(props.contract),
    [props.contract]
  );
  const legacyClient = useMemo(
    () =>
      legacyContract ? createXtrataClient({ contract: legacyContract }) : null,
    [legacyContract]
  );
  const capabilities = useMemo(
    () => resolveContractCapabilities(props.contract),
    [props.contract]
  );
  const contractId = getContractId(props.contract);
  const legacyContractId = legacyContract ? getContractId(legacyContract) : null;
  const readOnlySender =
    props.walletSession.address ?? props.contract.address;
  const adminStatusQuery = useContractAdminStatus({
    client,
    senderAddress: readOnlySender
  });
  const status = adminStatusQuery.data ?? EMPTY_ADMIN_STATUS;
  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const canTransact = !!props.walletSession.address && !mismatch;
  const isAdminWallet = addressesEqual(status.admin, props.walletSession.address);
  const canRunAdminActions = canTransact && isAdminWallet;

  const [feeUnitInput, setFeeUnitInput] = useState('');
  const [feeUnitMessage, setFeeUnitMessage] = useState<string | null>(null);
  const [feeUnitPending, setFeeUnitPending] = useState(false);
  const [pauseMessage, setPauseMessage] = useState<string | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const [royaltyInput, setRoyaltyInput] = useState('');
  const [royaltyMessage, setRoyaltyMessage] = useState<string | null>(null);
  const [royaltyPending, setRoyaltyPending] = useState(false);
  const [ownerInput, setOwnerInput] = useState('');
  const [ownerMessage, setOwnerMessage] = useState<string | null>(null);
  const [ownerPending, setOwnerPending] = useState(false);
  const [migrationIdInput, setMigrationIdInput] = useState('');
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [migrationInfo, setMigrationInfo] = useState<{
    id: bigint;
    v1Exists: boolean;
    v1Owner: string | null;
    v1Escrowed: boolean;
    v2Exists: boolean;
  } | null>(null);

  const currentFeeUnit = useMemo(() => {
    if (!status.feeUnitMicroStx) {
      return null;
    }
    const asNumber = Number(status.feeUnitMicroStx);
    if (!Number.isSafeInteger(asNumber) || asNumber <= 0) {
      return null;
    }
    return asNumber;
  }, [status.feeUnitMicroStx]);

  useEffect(() => {
    if (!currentFeeUnit) {
      return;
    }
    if (feeUnitInput.trim()) {
      return;
    }
    setFeeUnitInput((currentFeeUnit / MICROSTX_PER_STX).toFixed(6));
  }, [currentFeeUnit, feeUnitInput]);

  useEffect(() => {
    if (!status.royaltyRecipient) {
      return;
    }
    if (royaltyInput.trim()) {
      return;
    }
    setRoyaltyInput(status.royaltyRecipient);
  }, [status.royaltyRecipient, royaltyInput]);

  const requireAdminActionAccess = (
    setMessage: (message: string) => void,
    actionLabel: string
  ) => {
    if (!props.walletSession.address) {
      setMessage(`Connect a wallet to ${actionLabel}.`);
      return false;
    }
    if (mismatch) {
      setMessage(
        `Wallet network is ${mismatch.actual}. Switch to ${mismatch.expected} to ${actionLabel}.`
      );
      return false;
    }
    if (!status.admin) {
      setMessage(`Unable to verify contract admin. Refresh status to ${actionLabel}.`);
      return false;
    }
    if (!isAdminWallet) {
      setMessage(
        `Connected wallet is not contract admin (${status.admin}). Admin actions are locked.`
      );
      return false;
    }
    return true;
  };

  const requestContractCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
    postConditionMode?: PostConditionMode;
  }) => {
    const network = props.walletSession.network ?? props.contract.network;
    const stxAddress = props.walletSession.address;
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: props.contract.address,
        contractName: props.contract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        postConditionMode: options.postConditionMode,
        network,
        stxAddress,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () =>
          reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  const handleSetFeeUnit = async () => {
    if (!capabilities.supportsFeeUnit) {
      setFeeUnitMessage('Fee unit updates are not supported by this contract.');
      return;
    }
    if (!requireAdminActionAccess(setFeeUnitMessage, 'update fee unit')) {
      return;
    }
    const parsed = parseStxInput(feeUnitInput);
    if (parsed === null) {
      setFeeUnitMessage('Enter a valid STX amount.');
      return;
    }
    const microStx = Math.round(parsed * MICROSTX_PER_STX);
    if (microStx < FEE_UNIT_MIN_MICROSTX || microStx > FEE_UNIT_MAX_MICROSTX) {
      setFeeUnitMessage('Fee unit must be between 0.001 and 1.0 STX.');
      return;
    }
    if (currentFeeUnit !== null) {
      if (microStx > currentFeeUnit * 2) {
        setFeeUnitMessage('Fee unit cannot increase more than 2x per update.');
        return;
      }
      if (microStx < Math.floor(currentFeeUnit / 10)) {
        setFeeUnitMessage('Fee unit cannot decrease more than 10x per update.');
        return;
      }
    }

    setFeeUnitPending(true);
    setFeeUnitMessage('Sending fee unit update...');
    try {
      const tx = await requestContractCall({
        functionName: 'set-fee-unit',
        functionArgs: [uintCV(BigInt(microStx))]
      });
      setFeeUnitMessage(`Fee unit tx sent: ${tx.txId}`);
      await adminStatusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeeUnitMessage(`Fee unit update failed: ${message}`);
    } finally {
      setFeeUnitPending(false);
    }
  };

  const handleSetPaused = async (nextValue: boolean) => {
    if (!capabilities.supportsPause) {
      setPauseMessage('Pause controls are not supported by this contract.');
      return;
    }
    if (!requireAdminActionAccess(setPauseMessage, 'update pause status')) {
      return;
    }
    setPausePending(true);
    setPauseMessage(nextValue ? 'Pausing contract...' : 'Unpausing contract...');
    try {
      const tx = await requestContractCall({
        functionName: 'set-paused',
        functionArgs: [boolCV(nextValue)]
      });
      setPauseMessage(`Pause tx sent: ${tx.txId}`);
      await adminStatusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPauseMessage(`Pause update failed: ${message}`);
    } finally {
      setPausePending(false);
    }
  };

  const handleSetRoyaltyRecipient = async () => {
    if (!requireAdminActionAccess(setRoyaltyMessage, 'update royalty recipient')) {
      return;
    }
    const value = royaltyInput.trim();
    if (!validateStacksAddress(value)) {
      setRoyaltyMessage('Enter a valid Stacks address.');
      return;
    }
    setRoyaltyPending(true);
    setRoyaltyMessage('Sending royalty recipient update...');
    try {
      const tx = await requestContractCall({
        functionName: 'set-royalty-recipient',
        functionArgs: [principalCV(value)]
      });
      setRoyaltyMessage(`Royalty tx sent: ${tx.txId}`);
      await adminStatusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRoyaltyMessage(`Royalty update failed: ${message}`);
    } finally {
      setRoyaltyPending(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!capabilities.supportsOwnershipTransfer) {
      setOwnerMessage('Ownership transfer is not supported by this contract.');
      return;
    }
    if (!requireAdminActionAccess(setOwnerMessage, 'transfer ownership')) {
      return;
    }
    const value = ownerInput.trim();
    if (!validateStacksAddress(value)) {
      setOwnerMessage('Enter a valid Stacks address.');
      return;
    }
    setOwnerPending(true);
    setOwnerMessage('Sending ownership transfer...');
    try {
      const tx = await requestContractCall({
        functionName: 'transfer-contract-ownership',
        functionArgs: [principalCV(value)]
      });
      setOwnerMessage(`Ownership tx sent: ${tx.txId}`);
      await adminStatusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOwnerMessage(`Ownership transfer failed: ${message}`);
    } finally {
      setOwnerPending(false);
    }
  };

  const adminLabel = status.admin ?? 'Unknown';
  const royaltyLabel = status.royaltyRecipient ?? 'Unknown';
  const feeUnitLabel =
    currentFeeUnit !== null ? formatMicroStx(currentFeeUnit) : 'Unknown';
  const pausedLabel =
    status.paused === null ? 'Unknown' : status.paused ? 'Paused' : 'Active';
  const nextTokenLabel =
    status.nextTokenId !== null ? status.nextTokenId.toString() : 'Unknown';
  const showMigrationModule =
    (props.contract.protocolVersion === '2.1.0' ||
      props.contract.protocolVersion === '2.1.1') &&
    !!legacyContract;
  const v2ContractPrincipal = `${props.contract.address}.${props.contract.contractName}`;

  const handleCheckMigration = async () => {
    if (!legacyClient) {
      setMigrationStatus('Legacy contract not configured for this contract.');
      setMigrationInfo(null);
      return;
    }
    const parsed = parseTokenIdInput(migrationIdInput);
    if (parsed === null) {
      setMigrationStatus('Enter a valid token ID.');
      setMigrationInfo(null);
      return;
    }
    setMigrationPending(true);
    setMigrationStatus('Checking migration status...');
    try {
      const [v1Meta, v1Owner, v2Meta] = await Promise.all([
        legacyClient.getInscriptionMeta(parsed, readOnlySender),
        legacyClient.getOwner(parsed, readOnlySender),
        client.getInscriptionMeta(parsed, readOnlySender)
      ]);
      const v1Exists = !!v1Meta;
      const v2Exists = !!v2Meta;
      const v1Escrowed =
        !!v1Owner && addressesEqual(v1Owner, v2ContractPrincipal);
      setMigrationInfo({
        id: parsed,
        v1Exists,
        v1Owner,
        v1Escrowed,
        v2Exists
      });
      if (!v1Exists) {
        setMigrationStatus('V1 inscription not found.');
      } else if (v2Exists) {
        setMigrationStatus('Already migrated into V2.');
      } else if (!v1Owner) {
        setMigrationStatus('Unable to read V1 owner. Try again.');
      } else if (!props.walletSession.address) {
        setMigrationStatus('Connect a wallet to migrate.');
      } else if (!addressesEqual(v1Owner, props.walletSession.address)) {
        setMigrationStatus(
          `Wallet does not own V1 token (owner: ${v1Owner}). Cancel listings or escrow before migrating.`
        );
      } else {
        setMigrationStatus('Ready to migrate.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMigrationStatus(`Migration check failed: ${message}`);
      setMigrationInfo(null);
    } finally {
      setMigrationPending(false);
    }
  };

  const handleMigrateToken = async () => {
    if (!showMigrationModule) {
      return;
    }
    if (!canTransact) {
      setMigrationStatus('Connect a matching wallet to migrate.');
      return;
    }
    const parsed = parseTokenIdInput(migrationIdInput);
    if (parsed === null) {
      setMigrationStatus('Enter a valid token ID.');
      return;
    }
    setMigrationPending(true);
    setMigrationStatus('Sending migrate-from-v1 transaction...');
    try {
      const tx = await requestContractCall({
        functionName: 'migrate-from-v1',
        functionArgs: [uintCV(parsed)],
        postConditionMode: PostConditionMode.Allow
      });
      setMigrationStatus(`Migration tx sent: ${tx.txId}`);
      void queryClient.invalidateQueries({
        queryKey: getViewerKey(contractId)
      });
      void queryClient.refetchQueries({
        queryKey: getViewerKey(contractId),
        type: 'active'
      });
      if (legacyContractId) {
        void queryClient.invalidateQueries({
          queryKey: getViewerKey(legacyContractId)
        });
        void queryClient.refetchQueries({
          queryKey: getViewerKey(legacyContractId),
          type: 'active'
        });
      }
      await handleCheckMigration();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('post-condition')) {
        setMigrationStatus(
          'Migration failed due to wallet post-condition rules. Retry and confirm your wallet is not enforcing custom deny rules.'
        );
      } else {
        setMigrationStatus(`Migration failed: ${message}`);
      }
    } finally {
      setMigrationPending(false);
    }
  };

  return (
    <section
      className={`panel app-section${props.collapsed ? ' panel--collapsed' : ''}`}
      id="contract-admin"
    >
      <div className="panel__header">
        <div>
          <h2>Contract admin</h2>
          <p>
            Manage fees, pause state, and admin settings. Actions are enabled
            only when the connected wallet matches the on-chain admin.
          </p>
        </div>
        <div className="panel__actions">
          <span className={`badge badge--${props.contract.network}`}>
            {props.contract.network}
          </span>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => adminStatusQuery.refetch()}
            disabled={adminStatusQuery.isFetching}
          >
            {adminStatusQuery.isFetching ? 'Refreshing...' : 'Refresh status'}
          </button>
          <button
            className="button button--ghost button--collapse"
            type="button"
            onClick={props.onToggleCollapse}
            aria-expanded={!props.collapsed}
          >
            {props.collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      <div className="panel__body">
        <div className="meta-grid meta-grid--dense">
          <div>
            <span className="meta-label">Admin</span>
            <span className="meta-value">{adminLabel}</span>
          </div>
          <div>
            <span className="meta-label">Royalty recipient</span>
            <span className="meta-value">{royaltyLabel}</span>
          </div>
          <div>
            <span className="meta-label">Fee unit</span>
            <span className="meta-value">{feeUnitLabel}</span>
          </div>
          <div>
            <span className="meta-label">Paused</span>
            <span className="meta-value">{pausedLabel}</span>
          </div>
          <div>
            <span className="meta-label">Next token ID</span>
            <span className="meta-value">{nextTokenLabel}</span>
          </div>
        </div>

        <div className="mint-grid">
          {capabilities.supportsFeeUnit && (
            <div className="mint-panel">
              <span className="meta-label">Fee unit (STX)</span>
              <label className="field">
                <span className="field__label">New fee unit</span>
                <input
                  className="input"
                  placeholder="0.100000"
                  value={feeUnitInput}
                  disabled={!canRunAdminActions}
                  onChange={(event) => {
                    setFeeUnitInput(event.target.value);
                    setFeeUnitMessage(null);
                  }}
                />
                <span className="meta-value">
                  Bounds: 0.001–1.0 STX. {currentFeeUnit !== null
                    ? `Current: ${formatStxFromMicro(currentFeeUnit)}.`
                    : 'Current: unknown.'}
                </span>
              </label>
              <div className="mint-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSetFeeUnit()}
                  disabled={!canRunAdminActions || feeUnitPending}
                >
                  {feeUnitPending ? 'Updating...' : 'Set fee unit'}
                </button>
              </div>
              {feeUnitMessage && (
                <span className="meta-value">{feeUnitMessage}</span>
              )}
            </div>
          )}

          {capabilities.supportsPause && (
            <div className="mint-panel">
              <span className="meta-label">Pause controls</span>
              <p className="meta-value">
                Current status: {pausedLabel}
              </p>
              <div className="mint-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSetPaused(true)}
                  disabled={!canRunAdminActions || pausePending || status.paused === true}
                >
                  Pause
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void handleSetPaused(false)}
                  disabled={!canRunAdminActions || pausePending || status.paused === false}
                >
                  Unpause
                </button>
              </div>
              {pauseMessage && (
                <span className="meta-value">{pauseMessage}</span>
              )}
            </div>
          )}

          <div className="mint-panel">
            <span className="meta-label">Royalty recipient</span>
            <label className="field">
              <span className="field__label">New recipient address</span>
              <input
                className="input"
                placeholder="ST..."
                value={royaltyInput}
                disabled={!canRunAdminActions}
                onChange={(event) => {
                  setRoyaltyInput(event.target.value);
                  setRoyaltyMessage(null);
                }}
              />
            </label>
            <div className="mint-actions">
              <button
                className="button"
                type="button"
                onClick={() => void handleSetRoyaltyRecipient()}
                disabled={!canRunAdminActions || royaltyPending}
              >
                {royaltyPending ? 'Updating...' : 'Set royalty recipient'}
              </button>
            </div>
            {royaltyMessage && (
              <span className="meta-value">{royaltyMessage}</span>
            )}
          </div>

          {capabilities.supportsOwnershipTransfer && (
            <div className="mint-panel">
              <span className="meta-label">Contract ownership</span>
              <label className="field">
                <span className="field__label">New owner address</span>
                <input
                  className="input"
                  placeholder="ST..."
                  value={ownerInput}
                  disabled={!canRunAdminActions}
                  onChange={(event) => {
                    setOwnerInput(event.target.value);
                    setOwnerMessage(null);
                  }}
                />
              </label>
              <div className="mint-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleTransferOwnership()}
                  disabled={!canRunAdminActions || ownerPending}
                >
                  {ownerPending ? 'Transferring...' : 'Transfer ownership'}
                </button>
              </div>
              {ownerMessage && (
                <span className="meta-value">{ownerMessage}</span>
              )}
            </div>
          )}

          {showMigrationModule && (
            <div className="mint-panel">
              <span className="meta-label">V1 → V2 migration</span>
              <p className="meta-value">
                Migrate a V1 inscription into V2 to unlock dependency linking
                and keep IDs in sync. This transfers the V1 token into the V2
                contract escrow and mints the V2 token with the same ID.
              </p>
              <ol className="meta-value">
                <li>Ensure the V1 token is in your wallet (cancel listings/escrow).</li>
                <li>Enter the token ID and check status.</li>
                <li>Send the migrate transaction and wait for confirmation.</li>
              </ol>
              <label className="field">
                <span className="field__label">Token ID</span>
                <input
                  className="input"
                  placeholder="7"
                  value={migrationIdInput}
                  onChange={(event) => {
                    setMigrationIdInput(event.target.value);
                    setMigrationStatus(null);
                  }}
                />
              </label>
              <div className="mint-actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void handleCheckMigration()}
                  disabled={migrationPending}
                >
                  {migrationPending ? 'Checking...' : 'Check status'}
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleMigrateToken()}
                  disabled={!canTransact || migrationPending}
                >
                  {migrationPending ? 'Migrating...' : 'Migrate from V1'}
                </button>
              </div>
              {migrationInfo && (
                <div className="meta-grid meta-grid--dense">
                  <div>
                    <span className="meta-label">V1 exists</span>
                    <span className="meta-value">
                      {migrationInfo.v1Exists ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">V1 owner</span>
                    <span className="meta-value">
                      {migrationInfo.v1Owner ?? 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Escrowed in V2</span>
                    <span className="meta-value">
                      {migrationInfo.v1Escrowed ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">V2 exists</span>
                    <span className="meta-value">
                      {migrationInfo.v2Exists ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              )}
              {migrationStatus && (
                <span className="meta-value">{migrationStatus}</span>
              )}
            </div>
          )}
        </div>

        {!props.walletSession.address && (
          <div className="alert">
            Connect a wallet to submit contract admin transactions.
          </div>
        )}
        {mismatch && (
          <div className="alert">
            Wallet network is {mismatch.actual}. Switch to{' '}
            {mismatch.expected} for admin actions.
          </div>
        )}
        {props.walletSession.address &&
          !mismatch &&
          !adminStatusQuery.isLoading &&
          !!status.admin &&
          !isAdminWallet && (
            <div className="alert">
              Connected wallet is not the contract admin ({status.admin}). Admin
              actions are disabled.
            </div>
          )}
        {props.walletSession.address &&
          !mismatch &&
          !adminStatusQuery.isLoading &&
          !status.admin && (
            <div className="alert">
              Unable to verify the contract admin address. Refresh status to
              retry.
            </div>
          )}
      </div>

    </section>
  );
}
