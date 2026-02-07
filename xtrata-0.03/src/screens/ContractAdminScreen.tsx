import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import {
  boolCV,
  type ClarityValue,
  principalCV,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import {
  type ContractRegistryEntry,
  getLegacyContract
} from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import { getNetworkMismatch } from '../lib/network/guard';
import { createXtrataClient } from '../lib/contract/client';
import { resolveContractCapabilities } from '../lib/contract/capabilities';
import {
  EMPTY_ADMIN_STATUS,
  useContractAdminStatus
} from '../lib/contract/admin-status';
import { formatMicroStx, MICROSTX_PER_STX } from '../lib/contract/fees';

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
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

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

const isValidPrincipal = (value: string) => {
  if (validateStacksAddress(value)) {
    return true;
  }
  const [address, ...rest] = value.split('.');
  if (!address || rest.length === 0) {
    return false;
  }
  if (!validateStacksAddress(address)) {
    return false;
  }
  const contractName = rest.join('.');
  return CONTRACT_NAME_PATTERN.test(contractName);
};

export default function ContractAdminScreen(props: ContractAdminScreenProps) {
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
  const readOnlySender =
    props.walletSession.address ?? props.contract.address;
  const adminStatusQuery = useContractAdminStatus({
    client,
    senderAddress: readOnlySender
  });
  const legacyAdminStatusQuery = useContractAdminStatus({
    client: legacyClient ?? client,
    senderAddress: readOnlySender,
    enabled: !!legacyContract
  });
  const status = adminStatusQuery.data ?? EMPTY_ADMIN_STATUS;
  const legacyStatus = legacyContract
    ? legacyAdminStatusQuery.data ?? EMPTY_ADMIN_STATUS
    : EMPTY_ADMIN_STATUS;

  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const legacyMismatch = legacyContract
    ? getNetworkMismatch(legacyContract.network, props.walletSession.network)
    : mismatch;
  const canTransact = !!props.walletSession.address && !mismatch;

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
  const [legacyPauseMessage, setLegacyPauseMessage] = useState<string | null>(
    null
  );
  const [legacyPausePending, setLegacyPausePending] = useState(false);
  const [legacyOwnerInput, setLegacyOwnerInput] = useState('');
  const [legacyOwnerMessage, setLegacyOwnerMessage] = useState<string | null>(
    null
  );
  const [legacyOwnerPending, setLegacyOwnerPending] = useState(false);
  const [legacyLockOpen, setLegacyLockOpen] = useState(false);
  const [legacyLockConfirm, setLegacyLockConfirm] = useState('');
  const [legacyLockAckPaused, setLegacyLockAckPaused] = useState(false);
  const [legacyLockAckIrreversible, setLegacyLockAckIrreversible] =
    useState(false);

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

  const requestContractCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    const network = props.walletSession.network ?? props.contract.network;
    const stxAddress = props.walletSession.address;
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: props.contract.address,
        contractName: props.contract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network,
        stxAddress,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () =>
          reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };
  const requestLegacyContractCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    if (!legacyContract) {
      return Promise.reject(new Error('Legacy contract is unavailable.'));
    }
    const network = props.walletSession.network ?? legacyContract.network;
    const stxAddress = props.walletSession.address;
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: legacyContract.address,
        contractName: legacyContract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
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
    if (!canTransact) {
      setFeeUnitMessage('Connect a matching wallet to update fee unit.');
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
    if (!canTransact) {
      setPauseMessage('Connect a matching wallet to update pause status.');
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
    if (!canTransact) {
      setRoyaltyMessage('Connect a matching wallet to update royalty recipient.');
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
    if (!canTransact) {
      setOwnerMessage('Connect a matching wallet to transfer ownership.');
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
  const handleLegacyPause = async (nextValue: boolean) => {
    if (!legacyContract) {
      setLegacyPauseMessage('Legacy contract not configured for this selection.');
      return;
    }
    if (!legacyCanTransact) {
      setLegacyPauseMessage('Connect the legacy admin wallet to pause v1.');
      return;
    }
    setLegacyPausePending(true);
    setLegacyPauseMessage(nextValue ? 'Pausing legacy contract...' : 'Unpausing legacy contract...');
    try {
      const tx = await requestLegacyContractCall({
        functionName: 'set-paused',
        functionArgs: [boolCV(nextValue)]
      });
      setLegacyPauseMessage(`Legacy pause tx sent: ${tx.txId}`);
      await legacyAdminStatusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLegacyPauseMessage(`Legacy pause failed: ${message}`);
    } finally {
      setLegacyPausePending(false);
    }
  };
  const handleLegacyTransferOwnership = async () => {
    if (!legacyContract) {
      setLegacyOwnerMessage('Legacy contract not configured for this selection.');
      return;
    }
    if (!legacyCanTransact) {
      setLegacyOwnerMessage('Connect the legacy admin wallet to transfer ownership.');
      return;
    }
    if (legacyStatus.paused !== true) {
      setLegacyOwnerMessage('Pause v1 before transferring ownership.');
      return;
    }
    const value = legacyOwnerInput.trim();
    if (!isValidPrincipal(value)) {
      setLegacyOwnerMessage('Enter a valid Stacks address or contract principal.');
      return;
    }
    setLegacyOwnerPending(true);
    setLegacyOwnerMessage('Sending legacy ownership transfer...');
    try {
      const tx = await requestLegacyContractCall({
        functionName: 'transfer-contract-ownership',
        functionArgs: [principalCV(value)]
      });
      setLegacyOwnerMessage(`Legacy ownership tx sent: ${tx.txId}`);
      await legacyAdminStatusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLegacyOwnerMessage(`Legacy ownership transfer failed: ${message}`);
    } finally {
      setLegacyOwnerPending(false);
    }
  };

  useEffect(() => {
    if (!legacyLockOpen) {
      setLegacyLockConfirm('');
      setLegacyLockAckPaused(false);
      setLegacyLockAckIrreversible(false);
    }
  }, [legacyLockOpen]);

  const adminLabel = status.admin ?? 'Unknown';
  const royaltyLabel = status.royaltyRecipient ?? 'Unknown';
  const feeUnitLabel =
    currentFeeUnit !== null ? formatMicroStx(currentFeeUnit) : 'Unknown';
  const pausedLabel =
    status.paused === null ? 'Unknown' : status.paused ? 'Paused' : 'Active';
  const nextTokenLabel =
    status.nextTokenId !== null ? status.nextTokenId.toString() : 'Unknown';
  const legacyAdminLabel = legacyStatus.admin ?? 'Unknown';
  const legacyPausedLabel =
    legacyStatus.paused === null
      ? 'Unknown'
      : legacyStatus.paused
        ? 'Paused'
        : 'Active';
  const legacyIsAdmin =
    !!props.walletSession.address &&
    legacyStatus.admin !== null &&
    props.walletSession.address === legacyStatus.admin;
  const legacyCanTransact =
    !!props.walletSession.address && !legacyMismatch && legacyIsAdmin;
  const legacyContractLabel = legacyContract
    ? `${legacyContract.address}.${legacyContract.contractName}`
    : 'Not configured';
  const legacyPauseRequired = legacyStatus.paused !== true;
  const legacyOwnerValid = isValidPrincipal(legacyOwnerInput.trim());
  const legacyLockReady =
    legacyCanTransact &&
    !legacyPauseRequired &&
    legacyOwnerValid &&
    legacyLockAckPaused &&
    legacyLockAckIrreversible &&
    legacyLockConfirm.trim().toUpperCase() === 'LOCK';

  return (
    <section
      className={`panel app-section${props.collapsed ? ' panel--collapsed' : ''}`}
      id="contract-admin"
    >
      <div className="panel__header">
        <div>
          <h2>Contract admin</h2>
          <p>Manage fees, pause state, and admin settings.</p>
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

        {legacyContract && (
          <div className="mint-panel mint-panel--critical">
            <span className="meta-label">V2 launch safety lock (critical)</span>
            <p className="meta-value">
              Run once when moving the collection to v2. This permanently stops
              v1 minting and keeps IDs contiguous across the collection.
            </p>
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Legacy contract</span>
                <span className="meta-value">{legacyContractLabel}</span>
              </div>
              <div>
                <span className="meta-label">Legacy admin</span>
                <span className="meta-value">{legacyAdminLabel}</span>
              </div>
              <div>
                <span className="meta-label">Legacy paused</span>
                <span className="meta-value">{legacyPausedLabel}</span>
              </div>
            </div>
            <ol className="critical-steps">
              <li>Pause v1 (below).</li>
              <li>Transfer v1 ownership to a lock/burn principal.</li>
              <li>Deploy v2 under the same deployer as v1.</li>
              <li>Set v2 next-id to last v1 id + 1 (one-time).</li>
              <li>Allowlist partner collection contracts.</li>
              <li>Unpause v2 for public mints (or keep paused to restrict).</li>
            </ol>
            <div className="mint-actions">
              <button
                className="button"
                type="button"
                onClick={() => void handleLegacyPause(true)}
                disabled={
                  !legacyCanTransact || legacyPausePending || legacyStatus.paused === true
                }
              >
                {legacyPausePending ? 'Pausing...' : 'Pause v1'}
              </button>
            </div>
            {legacyPauseMessage && (
              <span className="meta-value">{legacyPauseMessage}</span>
            )}
            <label className="field">
              <span className="field__label">Lock/burn principal</span>
              <input
                className="input"
                placeholder="ST... or ST...contract-name"
                value={legacyOwnerInput}
                onChange={(event) => {
                  setLegacyOwnerInput(event.target.value);
                  setLegacyOwnerMessage(null);
                }}
              />
              <span className="field__hint">
                This is irreversible. Use a lock contract or burn address you
                control.
              </span>
            </label>
            <div className="mint-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setLegacyLockOpen(true)}
                disabled={
                  !legacyCanTransact ||
                  legacyOwnerPending ||
                  !legacyOwnerInput.trim() ||
                  legacyPauseRequired
                }
              >
                Review lock transfer
              </button>
            </div>
            {legacyOwnerMessage && (
              <span className="meta-value">{legacyOwnerMessage}</span>
            )}
            {!legacyCanTransact && (
              <span className="meta-value">
                Connect the legacy admin wallet on {legacyContract.network} to
                enable lock actions.
              </span>
            )}
            <p className="meta-value">
              Leaving v1 open can create duplicate ID numbers across contracts and
              will break the “single collection” promise.
            </p>
          </div>
        )}

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
                  disabled={!canTransact || feeUnitPending}
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
                  disabled={!canTransact || pausePending || status.paused === true}
                >
                  Pause
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void handleSetPaused(false)}
                  disabled={!canTransact || pausePending || status.paused === false}
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
                disabled={!canTransact || royaltyPending}
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
                  disabled={!canTransact || ownerPending}
                >
                  {ownerPending ? 'Transferring...' : 'Transfer ownership'}
                </button>
              </div>
              {ownerMessage && (
                <span className="meta-value">{ownerMessage}</span>
              )}
            </div>
          )}
        </div>

        {!props.walletSession.address && (
          <div className="alert">
            Connect a wallet to submit admin transactions.
          </div>
        )}
        {mismatch && (
          <div className="alert">
            Wallet network is {mismatch.actual}. Switch to{' '}
            {mismatch.expected} for admin actions.
          </div>
        )}
      </div>

      {legacyContract && legacyLockOpen && (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal modal--critical"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legacy-lock-title"
          >
            <div className="modal__header">
              <h3 id="legacy-lock-title" className="modal__title">
                Confirm v1 ownership transfer (irreversible)
              </h3>
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={() => setLegacyLockOpen(false)}
              >
                Cancel
              </button>
            </div>
            <p className="meta-value">
              This will permanently lock v1 and prevent any future v1 mints.
              Ensure the legacy contract is paused first.
            </p>
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Legacy contract</span>
                <span className="meta-value">{legacyContractLabel}</span>
              </div>
              <div>
                <span className="meta-label">Legacy paused</span>
                <span className="meta-value">{legacyPausedLabel}</span>
              </div>
              <div>
                <span className="meta-label">New owner</span>
                <span className="meta-value">
                  {legacyOwnerInput.trim() || 'Not set'}
                </span>
              </div>
            </div>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={legacyLockAckPaused}
                onChange={(event) => setLegacyLockAckPaused(event.target.checked)}
              />
              <span className="field__label">
                I confirm v1 is paused and should never mint again.
              </span>
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={legacyLockAckIrreversible}
                onChange={(event) =>
                  setLegacyLockAckIrreversible(event.target.checked)
                }
              />
              <span className="field__label">
                I understand this transfer is irreversible.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Type LOCK to confirm</span>
              <input
                className="input"
                placeholder="LOCK"
                value={legacyLockConfirm}
                onChange={(event) => setLegacyLockConfirm(event.target.value)}
              />
            </label>
            {!legacyOwnerValid && legacyOwnerInput.trim() && (
              <div className="alert">
                Enter a valid Stacks address or contract principal for the new owner.
              </div>
            )}
            {legacyPauseRequired && (
              <div className="alert">
                Legacy contract must be paused before ownership transfer.
              </div>
            )}
            {!legacyCanTransact && (
              <div className="alert">
                Connect the legacy admin wallet on {legacyContract.network} to
                proceed.
              </div>
            )}
            <div className="modal__actions">
              <button
                className="button"
                type="button"
                onClick={() => void handleLegacyTransferOwnership()}
                disabled={!legacyLockReady || legacyOwnerPending}
              >
                {legacyOwnerPending ? 'Transferring...' : 'Confirm transfer'}
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setLegacyLockOpen(false)}
              >
                Back
              </button>
            </div>
            {legacyOwnerMessage && (
              <span className="meta-value">{legacyOwnerMessage}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
