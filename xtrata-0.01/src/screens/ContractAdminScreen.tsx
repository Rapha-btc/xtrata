import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import {
  boolCV,
  type ClarityValue,
  principalCV,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import type { ContractRegistryEntry } from '../lib/contract/registry';
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

export default function ContractAdminScreen(props: ContractAdminScreenProps) {
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
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
  const status = adminStatusQuery.data ?? EMPTY_ADMIN_STATUS;

  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
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

  const adminLabel = status.admin ?? 'Unknown';
  const royaltyLabel = status.royaltyRecipient ?? 'Unknown';
  const feeUnitLabel =
    currentFeeUnit !== null ? formatMicroStx(currentFeeUnit) : 'Unknown';
  const pausedLabel =
    status.paused === null ? 'Unknown' : status.paused ? 'Paused' : 'Active';
  const nextTokenLabel =
    status.nextTokenId !== null ? status.nextTokenId.toString() : 'Unknown';

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
    </section>
  );
}
