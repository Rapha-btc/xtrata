import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type ClarityValue, PostConditionMode, uintCV } from '@stacks/transactions';
import { showContractCall } from '../lib/wallet/connect';
import type { WalletSession } from '../lib/wallet/types';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import { getContractId } from '../lib/contract/config';
import { getNetworkMismatch } from '../lib/network/guard';
import { createXtrataClient } from '../lib/contract/client';
import {
  getMigrationSourceContracts,
  resolveMigrationRoute
} from '../lib/contract/migration';
import { getViewerKey } from '../lib/viewer/queries';

type MigrationScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type TxPayload = {
  txId: string;
};

const parseTokenIdInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = BigInt(trimmed);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeAddress = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
};

const addressesEqual = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  return !!normalizedLeft && !!normalizedRight && normalizedLeft === normalizedRight;
};

export default function MigrationScreen(props: MigrationScreenProps) {
  const queryClient = useQueryClient();
  const targetClient = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const targetContractId = getContractId(props.contract);
  const readOnlySender =
    props.walletSession.address ?? props.contract.address;
  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const canTransact = !!props.walletSession.address && !mismatch;
  const migrationSources = useMemo(
    () => getMigrationSourceContracts(props.contract),
    [props.contract]
  );
  const [selectedSourceContractId, setSelectedSourceContractId] = useState('');
  const [migrationIdInput, setMigrationIdInput] = useState('');
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [migrationInfo, setMigrationInfo] = useState<{
    id: bigint;
    sourceExists: boolean;
    sourceOwner: string | null;
    sourceEscrowed: boolean;
    targetExists: boolean;
    functionName: string;
  } | null>(null);

  useEffect(() => {
    if (migrationSources.length === 0) {
      setSelectedSourceContractId('');
      return;
    }
    const matchesCurrent = migrationSources.some(
      (entry) => getContractId(entry) === selectedSourceContractId
    );
    if (!matchesCurrent) {
      setSelectedSourceContractId(getContractId(migrationSources[0]));
    }
  }, [migrationSources, selectedSourceContractId]);

  useEffect(() => {
    setMigrationStatus(null);
    setMigrationInfo(null);
  }, [targetContractId, selectedSourceContractId]);

  const selectedSourceContract = useMemo(() => {
    if (migrationSources.length === 0) {
      return null;
    }
    return (
      migrationSources.find(
        (entry) => getContractId(entry) === selectedSourceContractId
      ) ?? migrationSources[0]
    );
  }, [migrationSources, selectedSourceContractId]);
  const selectedSourceClient = useMemo(
    () =>
      selectedSourceContract
        ? createXtrataClient({ contract: selectedSourceContract })
        : null,
    [selectedSourceContract]
  );
  const route = useMemo(
    () =>
      selectedSourceContract
        ? resolveMigrationRoute({
            source: selectedSourceContract,
            target: props.contract
          })
        : null,
    [props.contract, selectedSourceContract]
  );
  const sourceContractId = selectedSourceContract
    ? getContractId(selectedSourceContract)
    : null;

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

  const handleCheckMigration = async () => {
    if (!selectedSourceContract || !selectedSourceClient || !route) {
      setMigrationStatus('Migration route not available for the selected source.');
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
      const [sourceMeta, sourceOwner, targetMeta] = await Promise.all([
        selectedSourceClient.getInscriptionMeta(parsed, readOnlySender),
        selectedSourceClient.getOwner(parsed, readOnlySender),
        targetClient.getInscriptionMeta(parsed, readOnlySender)
      ]);
      const sourceExists = !!sourceMeta;
      const targetExists = !!targetMeta;
      const sourceEscrowed =
        !!sourceOwner && addressesEqual(sourceOwner, targetContractId);
      setMigrationInfo({
        id: parsed,
        sourceExists,
        sourceOwner,
        sourceEscrowed,
        targetExists,
        functionName: route.functionName
      });
      if (!sourceExists) {
        setMigrationStatus(`${selectedSourceContract.label} inscription not found.`);
      } else if (targetExists && sourceEscrowed) {
        setMigrationStatus(`Already migrated into ${props.contract.label}.`);
      } else if (targetExists) {
        setMigrationStatus(
          `${props.contract.label} already has token ${parsed.toString()}. Review provenance before retrying.`
        );
      } else if (!sourceOwner) {
        setMigrationStatus(
          `Unable to read ${selectedSourceContract.label} owner. Try again.`
        );
      } else if (!props.walletSession.address) {
        setMigrationStatus('Connect a wallet to migrate.');
      } else if (!addressesEqual(sourceOwner, props.walletSession.address)) {
        setMigrationStatus(
          `Wallet does not own ${selectedSourceContract.label} token (owner: ${sourceOwner}). Cancel listings or escrow before migrating.`
        );
      } else if (sourceEscrowed) {
        setMigrationStatus(
          `${selectedSourceContract.label} token is already escrowed in ${props.contract.label}.`
        );
      } else {
        setMigrationStatus(`Ready to migrate via ${route.functionName}.`);
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
    if (!selectedSourceContract || !route || !sourceContractId) {
      setMigrationStatus('Migration route not available for the selected source.');
      return;
    }
    if (!props.walletSession.address) {
      setMigrationStatus('Connect a wallet to migrate.');
      return;
    }
    if (mismatch) {
      setMigrationStatus(
        `Wallet network is ${mismatch.actual}. Switch to ${mismatch.expected} to migrate.`
      );
      return;
    }
    const parsed = parseTokenIdInput(migrationIdInput);
    if (parsed === null) {
      setMigrationStatus('Enter a valid token ID.');
      return;
    }
    setMigrationPending(true);
    setMigrationStatus(`Sending ${route.functionName} transaction...`);
    try {
      const tx = await requestContractCall({
        functionName: route.functionName,
        functionArgs: [uintCV(parsed)],
        postConditionMode: PostConditionMode.Allow
      });
      setMigrationStatus(`Migration tx sent: ${tx.txId}`);
      void queryClient.invalidateQueries({
        queryKey: getViewerKey(targetContractId)
      });
      void queryClient.refetchQueries({
        queryKey: getViewerKey(targetContractId),
        type: 'active'
      });
      void queryClient.invalidateQueries({
        queryKey: getViewerKey(sourceContractId)
      });
      void queryClient.refetchQueries({
        queryKey: getViewerKey(sourceContractId),
        type: 'active'
      });
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
      id="migration"
    >
      <div className="panel__header">
        <div>
          <h2>Migration</h2>
          <p>
            Move a token from a supported legacy core into the selected active
            core. This is holder-driven and does not require admin access.
          </p>
        </div>
        <div className="panel__actions">
          <span className={`badge badge--${props.contract.network}`}>
            {props.contract.network}
          </span>
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
        {migrationSources.length === 0 ? (
          <p className="meta-value">
            No migration routes are configured for {props.contract.label}.
          </p>
        ) : (
          <div className="mint-grid">
            <div className="mint-panel">
              <span className="meta-label">Migration route</span>
              <p className="meta-value">
                Tokens keep the same ID. The legacy token is moved into target
                escrow and the selected target contract mints the replacement
                token back to the current wallet owner.
              </p>
              <div className="meta-grid meta-grid--dense">
                <div>
                  <span className="meta-label">Target contract</span>
                  <span className="meta-value">{props.contract.label}</span>
                </div>
                <div>
                  <span className="meta-label">Supported sources</span>
                  <span className="meta-value">
                    {migrationSources.map((entry) => entry.label).join(', ')}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Route function</span>
                  <span className="meta-value">
                    {route?.functionName ?? 'Unavailable'}
                  </span>
                </div>
              </div>
              <ol className="meta-value">
                <li>Choose the source contract that currently holds the token.</li>
                <li>Enter the token ID and check the current ownership state.</li>
                <li>Send one migration transaction from the wallet that owns that source token.</li>
              </ol>
              {migrationSources.length > 1 && (
                <label className="field">
                  <span className="field__label">Source contract</span>
                  <select
                    className="select"
                    value={selectedSourceContractId}
                    onChange={(event) => setSelectedSourceContractId(event.target.value)}
                    disabled={migrationPending}
                  >
                    {migrationSources.map((entry) => {
                      const contractId = getContractId(entry);
                      return (
                        <option key={contractId} value={contractId}>
                          {entry.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
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
                  disabled={migrationPending || !route}
                >
                  {migrationPending ? 'Checking...' : 'Check status'}
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleMigrateToken()}
                  disabled={!canTransact || migrationPending || !route}
                >
                  {migrationPending ? 'Migrating...' : 'Migrate token'}
                </button>
              </div>
              {migrationInfo && (
                <div className="meta-grid meta-grid--dense">
                  <div>
                    <span className="meta-label">Source exists</span>
                    <span className="meta-value">
                      {migrationInfo.sourceExists ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Source owner</span>
                    <span className="meta-value">
                      {migrationInfo.sourceOwner ?? 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Escrowed in target</span>
                    <span className="meta-value">
                      {migrationInfo.sourceEscrowed ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Target exists</span>
                    <span className="meta-value">
                      {migrationInfo.targetExists ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              )}
              {migrationStatus && (
                <span className="meta-value">{migrationStatus}</span>
              )}
              {!props.walletSession.address && (
                <p className="meta-value">
                  Connect the wallet that owns the source token before
                  migrating.
                </p>
              )}
              {mismatch && (
                <p className="meta-value">
                  Wallet network is {mismatch.actual}. Switch to{' '}
                  {mismatch.expected} to migrate.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
