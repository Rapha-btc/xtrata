import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { showContractCall } from '@stacks/connect';
import { PostConditionMode } from '@stacks/transactions';
import { buildTransferCall, createXtrataClient } from '../lib/contract/client';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import { getContractId } from '../lib/contract/config';
import { buildTransferPostCondition } from '../lib/contract/post-conditions';
import { getNetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getChunkKey,
  getDependenciesKey,
  getViewerKey,
  useLastTokenId,
  useTokenSummaries
} from '../lib/viewer/queries';
import { buildTokenPage, buildTokenRange } from '../lib/viewer/model';
import type { TokenSummary } from '../lib/viewer/types';
import { filterTokensByOwner } from '../lib/viewer/ownership';
import { bytesToHex } from '../lib/utils/encoding';
import TokenContentPreview from '../components/TokenContentPreview';
import TokenCardMedia from '../components/TokenCardMedia';
import { getMediaKind } from '../lib/viewer/content';
import { getTransferValidationMessage, validateTransferRequest } from '../lib/wallet/transfer';
import type { WalletSession } from '../lib/wallet/types';
import type { WalletLookupState } from '../lib/wallet/lookup';
import { truncateMiddle } from '../lib/utils/format';

const PAGE_SIZE = 16;
const REFRESH_INTERVAL_MS = 6_000;
const REFRESH_WINDOW_MS = 120_000;

export type ViewerMode = 'collection' | 'wallet';

type ViewerScreenProps = {
  contract: ContractRegistryEntry;
  senderAddress: string;
  walletSession: WalletSession;
  walletLookupState: WalletLookupState;
  focusKey?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isActiveTab: boolean;
  mode: ViewerMode;
  onModeChange: (mode: ViewerMode) => void;
  onClearWalletLookup?: () => void;
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

const TokenCard = (props: {
  token: TokenSummary;
  isSelected: boolean;
  onSelect: (id: bigint) => void;
  client: ReturnType<typeof createXtrataClient>;
  senderAddress: string;
  contractId: string;
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

const LoadingTokenCard = (props: { id?: bigint; label?: string }) => {
  const heading =
    props.label ?? (props.id !== undefined ? `#${props.id.toString()}` : '...');
  const cells = Array.from({ length: 20 }, (_, index) => {
    const style = {
      '--delay': `${index * 90}ms`
    } as CSSProperties;
    return (
      <span
        key={`loader-${index}`}
        className="viewer-refresh__cell"
        style={style}
      />
    );
  });

  return (
    <div className="token-card token-card--loading" aria-busy="true">
      <div className="token-card__header">
        <span className="token-card__id">{heading}</span>
      </div>
      <div className="token-card__media token-card__media--loading">
        <div className="viewer-refresh__grid viewer-refresh__grid--card">
          {cells}
        </div>
      </div>
      <div className="token-card__meta" aria-hidden="true">
        <span className="token-card__pill">Loading</span>
      </div>
    </div>
  );
};

const TokenDetails = (props: {
  token: TokenSummary | null;
  selectedTokenId: bigint | null;
  contract: ContractRegistryEntry;
  contractId: string;
  senderAddress: string;
  client: ReturnType<typeof createXtrataClient>;
  walletSession: WalletSession;
  mode: ViewerMode;
  isActiveTab: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) => {
  const queryClient = useQueryClient();
  const [chunkInput, setChunkInput] = useState('');
  const [chunkIndex, setChunkIndex] = useState<bigint | null>(null);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [transferPending, setTransferPending] = useState(false);
  const [transferLog, setTransferLog] = useState<string[]>([]);
  const isWalletView = props.mode === 'wallet';
  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const walletAddress = props.walletSession.address;

  const dependenciesQuery = useQuery({
    queryKey: props.token
      ? getDependenciesKey(props.contractId, props.token.id)
      : ['viewer', props.contractId, 'dependencies', 'none'],
    queryFn: () =>
      props.token
        ? props.client.getDependencies(props.token.id, props.senderAddress)
        : Promise.resolve([]),
    enabled: !!props.token && !isWalletView
  });

  const chunkQuery = useQuery({
    queryKey:
      props.token && chunkIndex !== null
        ? getChunkKey(props.contractId, props.token.id, chunkIndex)
        : ['viewer', props.contractId, 'chunk', 'none'],
    queryFn: () =>
      props.token && chunkIndex !== null
        ? props.client.getChunk(props.token.id, chunkIndex, props.senderAddress)
        : Promise.resolve(null),
    enabled: !!props.token && !isWalletView && chunkIndex !== null
  });

  useEffect(() => {
    setTransferStatus(null);
  }, [props.selectedTokenId, walletAddress]);

  const transferValidation = validateTransferRequest({
    senderAddress: walletAddress,
    recipientAddress: transferRecipient,
    tokenId: props.token?.id ?? null,
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

  const refreshViewer = () => {
    void queryClient.invalidateQueries({ queryKey: getViewerKey(props.contractId) });
    void queryClient.refetchQueries({
      queryKey: getViewerKey(props.contractId),
      type: 'active'
    });
  };

  const handleTransfer = () => {
    if (!transferValidation.ok || !props.token) {
      const message =
        transferValidationMessage ?? 'Transfer blocked: invalid inputs.';
      setTransferStatus(message);
      appendTransferLog(`Transfer blocked: ${transferValidation.reason ?? 'invalid'}.`);
      return;
    }

    const sender = walletAddress;
    if (!sender) {
      setTransferStatus('Connect a wallet to transfer inscriptions.');
      appendTransferLog('Transfer blocked: missing wallet.');
      return;
    }

    const recipient = transferValidation.recipient ?? transferRecipient.trim();
    const network = props.walletSession.network ?? props.contract.network;
    const callOptions = buildTransferCall({
      contract: props.contract,
      network: toStacksNetwork(network),
      id: props.token.id,
      sender,
      recipient,
      overrides: {
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildTransferPostCondition({
            contract: props.contract,
            senderAddress: sender,
            tokenId: props.token.id
          })
        ]
      }
    });

    setTransferPending(true);
    setTransferStatus('Waiting for wallet confirmation...');
    appendTransferLog(
      `Transferring #${props.token.id.toString()} to ${recipient}.`
    );

    try {
      showContractCall({
        ...callOptions,
        stxAddress: sender,
        onFinish: (payload) => {
          setTransferPending(false);
          setTransferStatus(`Transfer submitted: ${payload.txId}`);
          appendTransferLog(`Transfer submitted. txId=${payload.txId}`);
          refreshViewer();
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

  if (!props.token) {
    const pendingId = props.selectedTokenId;
    return (
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>
              {pendingId !== null
                ? `Token #${pendingId.toString()}`
                : isWalletView
                  ? 'Wallet preview'
                  : 'Token details'}
            </h2>
            <p>
              {pendingId !== null
                ? 'Loading token preview and metadata.'
                : isWalletView
                  ? 'Select a token to preview and transfer.'
                  : 'Select a token to inspect metadata and chunks.'}
            </p>
          </div>
          <div className="panel__actions">
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
          <p>
            {pendingId !== null
              ? 'Loading selected token...'
              : 'No token selected.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <div>
          <h2>Token #{props.token.id.toString()}</h2>
          <p>
            {isWalletView
              ? 'Art-forward preview with wallet transfer tools.'
              : 'Art-forward preview with optional diagnostics.'}
          </p>
        </div>
        <div className="panel__actions">
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
      <div className="panel__body detail-panel">
        <div className="detail-panel__preview">
          <TokenContentPreview
            token={props.token}
            contractId={props.contractId}
            senderAddress={props.senderAddress}
            client={props.client}
            isActiveTab={props.isActiveTab}
          />
        </div>
        <div className="detail-panel__tools">
          {isWalletView ? (
            <details className="preview-drawer preview-drawer--advanced">
              <summary>Wallet tools</summary>
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
                        {props.token ? `#${props.token.id.toString()}` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="meta-label">Owner</span>
                      <span className="meta-value">
                        {props.token.owner ?? 'Unknown'}
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
          ) : (
            <details className="preview-drawer preview-drawer--advanced">
              <summary>Advanced</summary>
              <div className="preview-drawer__body">
                <div className="chunk-panel">
                  <div>
                    <span className="meta-label">Inspect chunk</span>
                    <div className="chunk-panel__controls">
                      <input
                        className="input"
                        placeholder="Chunk index"
                        value={chunkInput}
                        onChange={(event) => setChunkInput(event.target.value)}
                      />
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={() => {
                          try {
                            const parsed = BigInt(chunkInput.trim());
                            if (parsed < 0n) {
                              return;
                            }
                            setChunkIndex(parsed);
                          } catch (error) {
                            setChunkIndex(null);
                          }
                        }}
                      >
                        Fetch
                      </button>
                    </div>
                  </div>
                  <div>
                    {chunkQuery.isLoading && chunkIndex !== null && (
                      <span>Loading chunk...</span>
                    )}
                    {!chunkQuery.isLoading && chunkIndex !== null && chunkQuery.data && (
                      <div className="chunk-panel__output">
                        <span className="meta-label">Chunk bytes</span>
                        <span className="meta-value">
                          {chunkQuery.data.byteLength} bytes
                        </span>
                        <span className="meta-label">Preview (hex)</span>
                        <span className="meta-value">
                          {(() => {
                            const hex = bytesToHex(chunkQuery.data);
                            return hex.length > 96 ? `${hex.slice(0, 96)}...` : hex;
                          })()}
                        </span>
                      </div>
                    )}
                    {!chunkQuery.isLoading &&
                      chunkIndex !== null &&
                      !chunkQuery.data && <span>No chunk found for that index.</span>}
                  </div>
                </div>
                <div>
                  <span className="meta-label">Dependencies</span>
                  <span className="meta-value">
                    {dependenciesQuery.isLoading
                      ? 'Loading...'
                      : dependenciesQuery.data && dependenciesQuery.data.length > 0
                        ? dependenciesQuery.data.map((id) => id.toString()).join(', ')
                        : 'None'}
                  </span>
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default function ViewerScreen(props: ViewerScreenProps) {
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const queryClient = useQueryClient();
  const contractId = getContractId(props.contract);
  const isWalletView = props.mode === 'wallet';
  const walletAddress = props.walletSession.address ?? null;
  const resolvedWalletAddress = props.walletLookupState.resolvedAddress;
  const hasWalletTarget = !!resolvedWalletAddress;
  const walletOverrideActive = !!props.walletLookupState.lookupAddress;
  const [mobilePanel, setMobilePanel] = useState<'grid' | 'preview'>('grid');
  const lastTokenQuery = useLastTokenId({
    client,
    senderAddress: props.senderAddress,
    enabled: props.isActiveTab
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const lastTokenIdRef = useRef<bigint | undefined>(undefined);
  const refreshIntervalRef = useRef<number | null>(null);
  const refreshDeadlineRef = useRef<number | null>(null);
  const initialPageSetRef = useRef(false);
  const autoSelectRef = useRef(true);
  const viewScopeRef = useRef<string>('');
  const focusRequestRef = useRef<{
    key: number;
    baseline: bigint | null;
  } | null>(null);

  const collectionMaxPage = useMemo(() => {
    if (lastTokenQuery.data === undefined) {
      return 0;
    }
    const maxPageValue = Number(lastTokenQuery.data / BigInt(PAGE_SIZE));
    return Number.isSafeInteger(maxPageValue) ? maxPageValue : 0;
  }, [lastTokenQuery.data]);
  const walletTokenIds = useMemo(() => {
    if (!isWalletView) {
      return [] as bigint[];
    }
    if (!props.isActiveTab) {
      return [] as bigint[];
    }
    if (!resolvedWalletAddress) {
      return [] as bigint[];
    }
    if (lastTokenQuery.data === undefined) {
      return [] as bigint[];
    }
    return buildTokenRange(lastTokenQuery.data);
  }, [isWalletView, props.isActiveTab, resolvedWalletAddress, lastTokenQuery.data]);

  const viewScopeKey = useMemo(() => {
    if (isWalletView) {
      return `${contractId}:wallet:${resolvedWalletAddress ?? 'none'}`;
    }
    return `${contractId}:collection`;
  }, [contractId, isWalletView, resolvedWalletAddress]);

  useEffect(() => {
    if (viewScopeRef.current !== viewScopeKey) {
      viewScopeRef.current = viewScopeKey;
      initialPageSetRef.current = false;
      autoSelectRef.current = true;
      setSelectedTokenId(null);
      setPageIndex(0);
      setMobilePanel('grid');
    }
  }, [viewScopeKey]);

  const collectionTokenIds = useMemo(() => {
    if (lastTokenQuery.data === undefined) {
      return [];
    }
    return buildTokenPage(lastTokenQuery.data, pageIndex, PAGE_SIZE);
  }, [lastTokenQuery.data, pageIndex]);
  const pageTokenIds = collectionTokenIds;

  const { tokenIds: collectionIds, tokenQueries: collectionQueries } =
    useTokenSummaries({
      client,
      senderAddress: props.senderAddress,
      tokenIds: collectionTokenIds,
      enabled: props.isActiveTab && !isWalletView
    });

  const tokenIds = collectionIds;
  const tokenQueries = collectionQueries;

  const { tokenIds: walletIds, tokenQueries: walletQueries } = useTokenSummaries({
    client,
    senderAddress: props.senderAddress,
    tokenIds: walletTokenIds,
    enabled: props.isActiveTab && isWalletView
  });

  type GridSlot = {
    id: bigint | null;
    query: (typeof collectionQueries)[number] | null;
    key?: string;
  };

  const collectionSummaries = collectionQueries
    .map((query, index) => {
      const id = collectionIds[index];
      if (id === undefined || !query.data) {
        return null;
      }
      return query.data;
    })
    .filter((token): token is TokenSummary => !!token);

  const tokenSummaries = collectionSummaries;

  const walletSummaries = walletQueries
    .map((query, index) => {
      const id = walletIds[index];
      if (id === undefined || !query.data) {
        return null;
      }
      return query.data;
    })
    .filter((token): token is TokenSummary => !!token);

  const ownedTokens = useMemo(
    () => filterTokensByOwner(walletSummaries, resolvedWalletAddress),
    [walletSummaries, resolvedWalletAddress]
  );

  const walletTokenListSettled =
    walletQueries.length > 0 &&
    walletQueries.every((query) => !query.isLoading);

  const walletMaxPage = useMemo(() => {
    if (ownedTokens.length === 0) {
      return 0;
    }
    return Math.max(0, Math.floor((ownedTokens.length - 1) / PAGE_SIZE));
  }, [ownedTokens.length]);

  const maxPage = isWalletView ? walletMaxPage : collectionMaxPage;

  const pageTokens = useMemo(() => {
    if (!isWalletView) {
      return tokenSummaries;
    }
    if (ownedTokens.length === 0) {
      return [];
    }
    const start = pageIndex * PAGE_SIZE;
    return ownedTokens.slice(start, start + PAGE_SIZE);
  }, [isWalletView, ownedTokens, pageIndex, tokenSummaries]);

  useEffect(() => {
    if (isWalletView) {
      if (ownedTokens.length === 0) {
        return;
      }
      if (initialPageSetRef.current) {
        return;
      }
      if (pageIndex !== walletMaxPage) {
        setPageIndex(walletMaxPage);
      }
      if (walletTokenListSettled) {
        initialPageSetRef.current = true;
      }
      return;
    }
    if (lastTokenQuery.data === undefined) {
      return;
    }
    if (initialPageSetRef.current) {
      return;
    }
    setPageIndex(collectionMaxPage);
    initialPageSetRef.current = true;
  }, [
    isWalletView,
    ownedTokens.length,
    walletMaxPage,
    walletTokenListSettled,
    pageIndex,
    lastTokenQuery.data,
    collectionMaxPage
  ]);

  useEffect(() => {
    autoSelectRef.current = true;
  }, [pageIndex]);

  useEffect(() => {
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [pageIndex, maxPage]);

  const handleSelectToken = useCallback((id: bigint) => {
    autoSelectRef.current = false;
    setSelectedTokenId(id);
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 959px)').matches
    ) {
      setMobilePanel('preview');
    }
  }, []);

  useEffect(() => {
    lastTokenIdRef.current = lastTokenQuery.data;
  }, [lastTokenQuery.data]);

  const stopRefresh = useCallback(() => {
    if (refreshIntervalRef.current !== null) {
      window.clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    refreshDeadlineRef.current = null;
  }, []);

  const endRefresh = useCallback(() => {
    focusRequestRef.current = null;
    stopRefresh();
  }, [stopRefresh]);

  const refreshViewer = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    void queryClient.refetchQueries({
      queryKey: getViewerKey(contractId),
      type: 'active'
    });
  }, [queryClient, contractId]);


  useEffect(() => {
    if (props.focusKey === undefined) {
      return;
    }
    if (isWalletView) {
      return;
    }
    stopRefresh();
    focusRequestRef.current = {
      key: props.focusKey,
      baseline: lastTokenIdRef.current ?? null
    };
    refreshDeadlineRef.current = Date.now() + REFRESH_WINDOW_MS;
    refreshViewer();
    refreshIntervalRef.current = window.setInterval(() => {
      const deadline = refreshDeadlineRef.current;
      if (!deadline || Date.now() > deadline) {
        endRefresh();
        return;
      }
      if (!focusRequestRef.current) {
        endRefresh();
        return;
      }
      refreshViewer();
    }, REFRESH_INTERVAL_MS);
    return () => stopRefresh();
  }, [props.focusKey, isWalletView, refreshViewer, stopRefresh, endRefresh]);

  useEffect(() => {
    if (isWalletView) {
      if (pageTokens.length === 0) {
        setSelectedTokenId(null);
        return;
      }
      const pageTargetId = pageTokens[pageTokens.length - 1]?.id ?? null;
      if (autoSelectRef.current) {
        if (pageTargetId !== null && selectedTokenId !== pageTargetId) {
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
      return;
    }
    if (focusRequestRef.current) {
      return;
    }
    if (pageTokenIds.length === 0) {
      setSelectedTokenId(null);
      return;
    }
    const targetId = pageTokenIds[pageTokenIds.length - 1];
    if (autoSelectRef.current) {
      if (selectedTokenId !== targetId) {
        setSelectedTokenId(targetId);
      }
      return;
    }
    if (selectedTokenId !== null) {
      if (pageTokenIds.includes(selectedTokenId)) {
        return;
      }
    }
    setSelectedTokenId(targetId);
  }, [isWalletView, pageTokens, pageTokenIds, selectedTokenId]);


  useEffect(() => {
    const focusRequest = focusRequestRef.current;
    if (!focusRequest) {
      return;
    }
    if (isWalletView) {
      return;
    }
    if (lastTokenQuery.data === undefined) {
      return;
    }
    const baseline = focusRequest.baseline ?? lastTokenQuery.data;
    if (focusRequest.baseline === null) {
      focusRequest.baseline = baseline;
    }
    setPageIndex(maxPage);
    setSelectedTokenId(lastTokenQuery.data);
    if (lastTokenQuery.data > baseline) {
      endRefresh();
    }
  }, [isWalletView, lastTokenQuery.data, maxPage, endRefresh]);

  const gridSlots = useMemo(() => {
    if (isWalletView) {
      return [];
    }
    if (tokenIds.length > 0) {
      return tokenIds.map((id, index): GridSlot => ({
        id,
        query: tokenQueries[index] ?? null
      }));
    }
    if (lastTokenQuery.isLoading) {
      return Array.from({ length: PAGE_SIZE }, (_, index): GridSlot => ({
        id: null,
        query: null,
        key: `loading-${index}`
      }));
    }
    return [];
  }, [isWalletView, tokenIds, tokenQueries, lastTokenQuery.isLoading]);

  const selectedToken = isWalletView
    ? pageTokens.find((token) => token.id === selectedTokenId) ?? null
    : tokenSummaries.find((token) => token.id === selectedTokenId) ?? null;

  const collectionRangeLabel =
    lastTokenQuery.data === undefined
      ? 'Loading...'
      : tokenIds.length > 0
        ? `IDs ${tokenIds[0].toString()}–${tokenIds[tokenIds.length - 1].toString()}`
        : 'No tokens';
  const walletRangeLabel = !hasWalletTarget
    ? 'No wallet selected'
    : lastTokenQuery.isError
      ? 'Unable to load'
      : lastTokenQuery.isLoading || !walletTokenListSettled
        ? 'Loading...'
        : ownedTokens.length === 0
          ? 'No tokens'
          : `Showing ${pageIndex * PAGE_SIZE + 1}–${pageIndex * PAGE_SIZE + pageTokens.length} of ${ownedTokens.length}`;
  const rangeLabel = isWalletView ? walletRangeLabel : collectionRangeLabel;

  return (
    <section
      className={`viewer app-section app-section--fit${props.collapsed ? ' module--collapsed' : ''}`}
      id="collection-viewer"
      data-mobile-view={mobilePanel}
    >
      <div className="panel">
        <div className="panel__header viewer-header">
          <div>
            <h2>{isWalletView ? 'Wallet viewer' : 'Collection viewer'}</h2>
          </div>
          <div className="panel__actions viewer-header__actions">
            <div className="viewer-toggle" role="tablist" aria-label="Viewer mode">
              <button
                type="button"
                className={`viewer-toggle__button${!isWalletView ? ' is-active' : ''}`}
                aria-pressed={!isWalletView}
                onClick={() => props.onModeChange('collection')}
              >
                Collection
              </button>
              <button
                type="button"
                className={`viewer-toggle__button${isWalletView ? ' is-active' : ''}`}
                aria-pressed={isWalletView}
                onClick={() => props.onModeChange('wallet')}
              >
                Wallet
              </button>
            </div>
            <div className="viewer-controls viewer-controls--compact">
              {isWalletView ? (
                <>
                  <span className="badge badge--neutral badge--compact">
                    {resolvedWalletAddress
                      ? `Wallet: ${truncateMiddle(resolvedWalletAddress, 6, 6)}`
                      : 'Wallet: none'}
                  </span>
                  {walletOverrideActive && (
                    <span className="badge badge--neutral badge--compact">
                      Override
                    </span>
                  )}
                </>
              ) : (
                <span className="badge badge--neutral badge--compact">
                  {lastTokenQuery.data !== undefined
                    ? `Last ID: ${lastTokenQuery.data.toString()}`
                    : 'Loading'}
                </span>
              )}
              {isWalletView && walletOverrideActive && props.onClearWalletLookup && (
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={props.onClearWalletLookup}
                >
                  {walletAddress ? 'Use connected wallet' : 'Clear search'}
                </button>
              )}
              <div className="viewer-controls__pagination">
                <button
                  className="button button--ghost button--mini"
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
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={() =>
                    setPageIndex((current) => Math.min(maxPage, current + 1))
                  }
                  disabled={pageIndex >= maxPage}
                >
                  Next
                </button>
              </div>
              <span className="viewer-controls__range">{rangeLabel}</span>
              <div className="viewer-mobile-toggle" role="tablist" aria-label="Viewer panel">
                <button
                  type="button"
                  className={`viewer-mobile-toggle__button${mobilePanel === 'grid' ? ' is-active' : ''}`}
                  aria-pressed={mobilePanel === 'grid'}
                  onClick={() => setMobilePanel('grid')}
                >
                  Grid
                </button>
                <button
                  type="button"
                  className={`viewer-mobile-toggle__button${mobilePanel === 'preview' ? ' is-active' : ''}`}
                  aria-pressed={mobilePanel === 'preview'}
                  onClick={() => setMobilePanel('preview')}
                >
                  Preview
                </button>
              </div>
            </div>
            {props.collapsed && (
              <button
                className="button button--ghost button--collapse viewer-collapse-toggle viewer-collapse-toggle--grid"
                type="button"
                onClick={props.onToggleCollapse}
                aria-expanded={!props.collapsed}
              >
                Expand
              </button>
            )}
          </div>
        </div>
        <div className="panel__body viewer-panel__body">
          <div className="grid-panel">
            <div className="grid-panel__meta">
              {isWalletView ? (
                <>
                  {!hasWalletTarget && (
                    <p>
                      Enter a wallet address above or connect a wallet to view
                      holdings.
                    </p>
                  )}
                  {hasWalletTarget && lastTokenQuery.isError && (
                    <p>Unable to load collection for {contractId}.</p>
                  )}
                  {hasWalletTarget && lastTokenQuery.isLoading && (
                    <p>Loading collection...</p>
                  )}
                  {hasWalletTarget &&
                    !lastTokenQuery.isLoading &&
                    !walletTokenListSettled && <p>Loading wallet holdings...</p>}
                  {hasWalletTarget &&
                    walletTokenListSettled &&
                    ownedTokens.length === 0 && (
                      <p>No tokens owned by this address yet.</p>
                    )}
                </>
              ) : (
                <>
                  {lastTokenQuery.isLoading && tokenIds.length === 0 && (
                    <p>Loading collection...</p>
                  )}
                  {lastTokenQuery.isError && (
                    <p>Unable to load collection for {contractId}.</p>
                  )}
                  {!lastTokenQuery.isLoading && tokenIds.length === 0 && (
                    <p>No tokens minted yet.</p>
                  )}
                </>
              )}
            </div>
            {isWalletView ? (
              pageTokens.length > 0 && (
                <div className="square-frame">
                  <div className="token-grid square-frame__content">
                    {pageTokens.map((token) => (
                      <TokenCard
                        key={token.id.toString()}
                        token={token}
                        isSelected={token.id === selectedTokenId}
                        onSelect={handleSelectToken}
                        client={client}
                        senderAddress={props.senderAddress}
                        contractId={contractId}
                        isActiveTab={props.isActiveTab}
                      />
                    ))}
                  </div>
                </div>
              )
            ) : (
              gridSlots.length > 0 && (
                <div className="square-frame">
                  <div className="token-grid square-frame__content">
                    {gridSlots.map((slot, index) => {
                      if (slot.id !== null && slot.query?.data) {
                        const token = slot.query.data;
                        return (
                          <TokenCard
                            key={token.id.toString()}
                            token={token}
                            isSelected={token.id === selectedTokenId}
                            onSelect={handleSelectToken}
                            client={client}
                            senderAddress={props.senderAddress}
                            contractId={contractId}
                            isActiveTab={props.isActiveTab}
                          />
                        );
                      }
                      const key = slot.key ?? `loading-${index}`;
                      const cardKey =
                        slot.id !== null ? slot.id.toString() : key;
                      return (
                        <LoadingTokenCard
                          key={cardKey}
                          id={slot.id ?? undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
      <TokenDetails
        token={selectedToken}
        selectedTokenId={selectedTokenId}
        contract={props.contract}
        contractId={contractId}
        senderAddress={props.senderAddress}
        client={client}
        walletSession={props.walletSession}
        mode={props.mode}
        isActiveTab={props.isActiveTab}
        collapsed={props.collapsed}
        onToggleCollapse={props.onToggleCollapse}
      />
    </section>
  );
}
