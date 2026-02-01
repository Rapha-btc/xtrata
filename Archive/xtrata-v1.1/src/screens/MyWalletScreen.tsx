import { useEffect, useMemo, useRef, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import { useQueryClient } from '@tanstack/react-query';
import { PostConditionMode, validateStacksAddress } from '@stacks/transactions';
import { buildTransferCall, createXtrataClient } from '../lib/contract/client';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import { buildTransferPostCondition } from '../lib/contract/post-conditions';
import type { WalletSession } from '../lib/wallet/types';
import { getNetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import {
  getViewerKey,
  useLastTokenId,
  useTokenSummaries
} from '../lib/viewer/queries';
import { filterTokensByOwner } from '../lib/viewer/ownership';
import type { TokenSummary } from '../lib/viewer/types';
import { getContractId } from '../lib/contract/config';
import {
  getTransferValidationMessage,
  validateTransferRequest
} from '../lib/wallet/transfer';
import TokenCardMedia from '../components/TokenCardMedia';
import TokenContentPreview from '../components/TokenContentPreview';
import { getMediaKind } from '../lib/viewer/content';

const PAGE_SIZE = 16;

type MyWalletScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  senderAddress: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isActiveTab: boolean;
};

const getMediaLabel = (mimeType: string | null | undefined) => {
  const kind = getMediaKind(mimeType ?? null);
  switch (kind) {
    case 'image':
      return 'IMAGE';
    case 'svg':
      return 'SVG';
    case 'audio':
      return 'AUDIO';
    case 'video':
      return 'VIDEO';
    case 'text':
      return 'TEXT';
    case 'html':
      return 'HTML';
    case 'binary':
      return 'BIN';
    default:
      return 'UNKNOWN';
  }
};

const OwnedTokenCard = (props: {
  token: TokenSummary;
  contractId: string;
  senderAddress: string;
  client: ReturnType<typeof createXtrataClient>;
  isSelected: boolean;
  onSelect: (id: bigint) => void;
  isActiveTab: boolean;
}) => {
  const mediaLabel = getMediaLabel(props.token.meta?.mimeType ?? null);
  const mediaTitle = props.token.meta?.mimeType ?? 'Unknown mime type';

  return (
    <button
      type="button"
      className={`token-card${props.isSelected ? ' token-card--active' : ''}`}
      onClick={() => props.onSelect(props.token.id)}
    >
      <div className="token-card__header" aria-hidden="true">
        <span className="token-card__id">#{props.token.id.toString()}</span>
      </div>
      <div className="token-card__media">
        <TokenCardMedia
          token={props.token}
          contractId={props.contractId}
          senderAddress={props.senderAddress}
          client={props.client}
          isActiveTab={props.isActiveTab}
        />
      </div>
      <div className="token-card__meta" aria-hidden="true">
        <span className="token-card__pill" title={mediaTitle}>
          {mediaLabel}
        </span>
      </div>
    </button>
  );
};

export default function MyWalletScreen(props: MyWalletScreenProps) {
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const queryClient = useQueryClient();
  const contractId = getContractId(props.contract);
  const walletAddress = props.walletSession.address;
  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );

  const [manualAddress, setManualAddress] = useState('');
  const trimmedManual = manualAddress.trim();
  const manualValid =
    trimmedManual.length === 0 || validateStacksAddress(trimmedManual);
  const targetAddress = walletAddress ?? (manualValid ? trimmedManual : '');

  const lastTokenQuery = useLastTokenId({
    client,
    senderAddress: props.senderAddress,
    enabled: props.isActiveTab
  });

  const { tokenIds, tokenQueries } = useTokenSummaries({
    client,
    senderAddress: props.senderAddress,
    lastTokenId: lastTokenQuery.data,
    enabled: props.isActiveTab
  });

  const tokenSummaries = tokenQueries
    .map((query, index) => {
      const id = tokenIds[index];
      if (id === undefined || !query.data) {
        return null;
      }
      return query.data;
    })
    .filter((token): token is TokenSummary => !!token);

  const ownedTokens = useMemo(
    () => filterTokensByOwner(tokenSummaries, targetAddress),
    [tokenSummaries, targetAddress]
  );
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [transferPending, setTransferPending] = useState(false);
  const [transferLog, setTransferLog] = useState<string[]>([]);
  const initialPageSetRef = useRef(false);
  const walletScopeRef = useRef<string>('');
  const autoSelectRef = useRef(true);

  const maxPage = useMemo(() => {
    if (ownedTokens.length === 0) {
      return 0;
    }
    return Math.max(0, Math.floor((ownedTokens.length - 1) / PAGE_SIZE));
  }, [ownedTokens.length]);

  const tokenListSettled =
    tokenQueries.length > 0 &&
    tokenQueries.every((query) => !query.isLoading);

  useEffect(() => {
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [pageIndex, maxPage]);

  useEffect(() => {
    const scopeKey = `${contractId}:${targetAddress ?? ''}`;
    if (walletScopeRef.current !== scopeKey) {
      walletScopeRef.current = scopeKey;
      initialPageSetRef.current = false;
      autoSelectRef.current = true;
      setSelectedTokenId(null);
      setTransferStatus(null);
    }
  }, [contractId, targetAddress]);

  useEffect(() => {
    if (ownedTokens.length === 0) {
      return;
    }
    if (initialPageSetRef.current) {
      return;
    }
    if (pageIndex !== maxPage) {
      setPageIndex(maxPage);
    }
    if (tokenListSettled) {
      initialPageSetRef.current = true;
    }
  }, [ownedTokens.length, pageIndex, maxPage, tokenListSettled]);

  useEffect(() => {
    autoSelectRef.current = true;
  }, [pageIndex]);

  useEffect(() => {
    setTransferStatus(null);
  }, [selectedTokenId, walletAddress]);

  const pageTokens = useMemo(() => {
    if (ownedTokens.length === 0) {
      return [];
    }
    const start = pageIndex * PAGE_SIZE;
    return ownedTokens.slice(start, start + PAGE_SIZE);
  }, [ownedTokens, pageIndex]);

  const handleSelectToken = (id: bigint) => {
    autoSelectRef.current = false;
    setSelectedTokenId(id);
  };

  const pageTargetId =
    pageTokens.length > 0 ? pageTokens[pageTokens.length - 1].id : null;

  useEffect(() => {
    if (pageTokens.length === 0) {
      setSelectedTokenId(null);
      return;
    }
    if (autoSelectRef.current) {
      if (pageTargetId === null) {
        setSelectedTokenId(null);
        return;
      }
      if (selectedTokenId !== pageTargetId) {
        setSelectedTokenId(pageTargetId);
      }
      return;
    }
    if (
      selectedTokenId !== null &&
      pageTokens.find((token) => token.id === selectedTokenId)
    ) {
      return;
    }
    if (pageTargetId !== null) {
      setSelectedTokenId(pageTargetId);
    }
  }, [pageTokens, selectedTokenId, pageTargetId]);

  const selectedToken =
    pageTokens.find((token) => token.id === selectedTokenId) ?? null;
  const transferValidation = validateTransferRequest({
    senderAddress: walletAddress,
    recipientAddress: transferRecipient,
    tokenId: selectedToken?.id ?? null,
    networkMismatch: !!mismatch
  });
  const transferValidationMessage =
    getTransferValidationMessage(transferValidation);
  const recipientValidationError =
    transferValidation.reason === 'missing-recipient' ||
    transferValidation.reason === 'invalid-recipient' ||
    transferValidation.reason === 'self-recipient';

  const appendTransferLog = (message: string) => {
    setTransferLog((prev) => {
      const next = [...prev, message];
      return next.slice(-20);
    });
    // eslint-disable-next-line no-console
    console.log(`[transfer] ${message}`);
  };

  const refreshWallet = () => {
    void queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    void queryClient.refetchQueries({
      queryKey: getViewerKey(contractId),
      type: 'active'
    });
  };

  const handleTransfer = () => {
    if (!transferValidation.ok || !selectedToken) {
      const message =
        transferValidationMessage ?? 'Transfer blocked: invalid inputs.';
      setTransferStatus(message);
      appendTransferLog(`Transfer blocked: ${transferValidation.reason ?? 'invalid'}.`);
      return;
    }

    const senderAddress = walletAddress;
    if (!senderAddress) {
      setTransferStatus('Connect a wallet to transfer inscriptions.');
      appendTransferLog('Transfer blocked: missing wallet.');
      return;
    }

    const recipient = transferValidation.recipient ?? transferRecipient.trim();
    const network = props.walletSession.network ?? props.contract.network;
    const callOptions = buildTransferCall({
      contract: props.contract,
      network: toStacksNetwork(network),
      id: selectedToken.id,
      sender: senderAddress,
      recipient,
      overrides: {
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildTransferPostCondition({
            contract: props.contract,
            senderAddress,
            tokenId: selectedToken.id
          })
        ]
      }
    });

    setTransferPending(true);
    setTransferStatus('Waiting for wallet confirmation...');
    appendTransferLog(
      `Transferring #${selectedToken.id.toString()} to ${recipient}.`
    );

    try {
      showContractCall({
        ...callOptions,
        stxAddress: senderAddress,
        onFinish: (payload) => {
          setTransferPending(false);
          setTransferStatus(`Transfer submitted: ${payload.txId}`);
          appendTransferLog(`Transfer submitted. txId=${payload.txId}`);
          refreshWallet();
        },
        onCancel: () => {
          setTransferPending(false);
          setTransferStatus('Transfer cancelled or failed in wallet.');
          appendTransferLog('Transfer cancelled or failed in wallet.');
        }
      });
      appendTransferLog('Wallet prompt opened.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTransferPending(false);
      setTransferStatus(`Transfer failed: ${message}`);
      appendTransferLog(`Transfer failed: ${message}`);
    }
  };

  return (
    <section
      className={`wallet app-section app-section--fit${props.collapsed ? ' module--collapsed' : ''}`}
      id="my-wallet"
    >
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>My wallet</h2>
            <p>Tokens owned by the current wallet address.</p>
          </div>
          <div className="panel__actions panel__actions--column">
            <button
              className="button button--ghost button--collapse"
              type="button"
              onClick={props.onToggleCollapse}
              aria-expanded={!props.collapsed}
            >
              {props.collapsed ? 'Expand' : 'Collapse'}
            </button>
            <div className="viewer-controls">
              <span className="badge badge--neutral">
                {ownedTokens.length} owned
              </span>
              <div className="viewer-controls__pagination">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() =>
                    setPageIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={pageIndex <= 0}
                >
                  Prev
                </button>
                <span className="viewer-controls__label">
                  Page {pageIndex + 1} of {maxPage + 1}
                </span>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() =>
                    setPageIndex((current) => Math.min(maxPage, current + 1))
                  }
                  disabled={pageIndex >= maxPage}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="panel__body wallet-panel__body">
          <div className="grid-panel">
            <div className="grid-panel__meta">
              {walletAddress ? (
                <div className="meta-grid">
                  <div>
                    <span className="meta-label">Wallet address</span>
                    <span className="meta-value">{walletAddress}</span>
                  </div>
                </div>
              ) : (
                <label className="field">
                  <span className="field__label">Inspect address</span>
                  <input
                    className="input"
                    placeholder="ST..."
                    value={manualAddress}
                    onChange={(event) => setManualAddress(event.target.value)}
                  />
                  {!manualValid && (
                    <span className="meta-value">
                      Enter a valid Stacks address to view holdings.
                    </span>
                  )}
                </label>
              )}

              {lastTokenQuery.isLoading && <p>Loading collection...</p>}
              {lastTokenQuery.isError && (
                <p>Unable to load collection for this contract.</p>
              )}
              {!lastTokenQuery.isLoading && !targetAddress && (
                <p>Connect a wallet or enter an address to view owned tokens.</p>
              )}
              {!lastTokenQuery.isLoading &&
                targetAddress &&
                ownedTokens.length === 0 && (
                  <p>No tokens owned by this address yet.</p>
                )}
            </div>
            {pageTokens.length > 0 && (
              <div className="square-frame">
                <div className="token-grid square-frame__content">
                  {pageTokens.map((token) => (
                        <OwnedTokenCard
                          key={token.id.toString()}
                          token={token}
                          contractId={contractId}
                          senderAddress={props.senderAddress}
                          client={client}
                          isSelected={token.id === selectedTokenId}
                          onSelect={handleSelectToken}
                          isActiveTab={props.isActiveTab}
                        />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Content preview</h2>
            <p>Shows the selected inscription from your wallet.</p>
          </div>
        </div>
        <div className="panel__body detail-panel">
          <div className="detail-panel__preview">
            {selectedToken ? (
          <TokenContentPreview
            token={selectedToken}
            contractId={contractId}
            senderAddress={props.senderAddress}
            client={client}
            isActiveTab={props.isActiveTab}
          />
            ) : selectedTokenId !== null ? (
              <p>Loading token #{selectedTokenId.toString()}...</p>
            ) : (
              <p>Select a token to preview its content.</p>
            )}
          </div>
          <div className="detail-panel__tools">
            <details className="preview-drawer preview-drawer--transfer" open>
              <summary>Transfer</summary>
              <div className="preview-drawer__body">
                <div className="transfer-panel">
                  <div>
                    <h3>Transfer inscription</h3>
                    <p>Send the selected inscription to another address.</p>
                  </div>
                  <div className="meta-grid">
                    <div>
                      <span className="meta-label">Selected token</span>
                      <span className="meta-value">
                        {selectedToken ? `#${selectedToken.id.toString()}` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="meta-label">Owner</span>
                      <span className="meta-value">
                        {selectedToken?.owner ?? 'Unknown'}
                      </span>
                    </div>
                  </div>
                  <label className="field">
                    <span className="field__label">Recipient address</span>
                    <input
                      className="input"
                      placeholder="ST..."
                      value={transferRecipient}
                      onChange={(event) => {
                        setTransferRecipient(event.target.value);
                        setTransferStatus(null);
                      }}
                      disabled={transferPending}
                    />
                    {recipientValidationError && transferValidationMessage && (
                      <span className="meta-value">{transferValidationMessage}</span>
                    )}
                  </label>
                  {transferStatus && (
                    <span className="meta-value">{transferStatus}</span>
                  )}
                  {!transferStatus &&
                    !recipientValidationError &&
                    transferValidationMessage && (
                      <span className="meta-value">{transferValidationMessage}</span>
                    )}
                  <div className="transfer-panel__actions">
                    <button
                      className="button button--mini"
                      type="button"
                      onClick={handleTransfer}
                      disabled={!transferValidation.ok || transferPending}
                    >
                      {transferPending ? 'Transferring...' : 'Transfer'}
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() => {
                        setTransferRecipient('');
                        setTransferStatus(null);
                      }}
                      disabled={transferPending}
                    >
                      Clear
                    </button>
                  </div>
                  {transferLog.length > 0 && (
                    <div className="transfer-log">
                      {transferLog.map((entry, index) => (
                        <span
                          key={`${entry}-${index}`}
                          className="transfer-log__item"
                        >
                          {entry}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
