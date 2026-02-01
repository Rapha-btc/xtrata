import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { createXtrataClient } from '../lib/contract/client';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import { getContractId } from '../lib/contract/config';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getChunkKey,
  getDependenciesKey,
  getViewerKey,
  useLastTokenId,
  useTokenSummaries
} from '../lib/viewer/queries';
import { buildTokenPage } from '../lib/viewer/model';
import type { TokenSummary } from '../lib/viewer/types';
import { bytesToHex } from '../lib/utils/encoding';
import TokenContentPreview from '../components/TokenContentPreview';
import TokenCardMedia from '../components/TokenCardMedia';
import { getMediaKind } from '../lib/viewer/content';

const PAGE_SIZE = 16;
const REFRESH_INTERVAL_MS = 6_000;
const REFRESH_WINDOW_MS = 120_000;

type ViewerScreenProps = {
  contract: ContractRegistryEntry;
  senderAddress: string;
  focusKey?: number;
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
  contractId: string;
  senderAddress: string;
  client: ReturnType<typeof createXtrataClient>;
  isActiveTab: boolean;
}) => {
  const [chunkInput, setChunkInput] = useState('');
  const [chunkIndex, setChunkIndex] = useState<bigint | null>(null);

  const dependenciesQuery = useQuery({
    queryKey: props.token
      ? getDependenciesKey(props.contractId, props.token.id)
      : ['viewer', props.contractId, 'dependencies', 'none'],
    queryFn: () =>
      props.token
        ? props.client.getDependencies(props.token.id, props.senderAddress)
        : Promise.resolve([]),
    enabled: !!props.token
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
    enabled: !!props.token && chunkIndex !== null
  });

  if (!props.token) {
    const pendingId = props.selectedTokenId;
    return (
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>
              {pendingId !== null
                ? `Token #${pendingId.toString()}`
                : 'Token details'}
            </h2>
            <p>
              {pendingId !== null
                ? 'Loading token preview and metadata.'
                : 'Select a token to inspect metadata and chunks.'}
            </p>
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
          <p>Art-forward preview with optional diagnostics.</p>
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
                  {!chunkQuery.isLoading && chunkIndex !== null && !chunkQuery.data && (
                    <span>No chunk found for that index.</span>
                  )}
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
  const lastTokenQuery = useLastTokenId({
    client,
    senderAddress: props.senderAddress,
    enabled: props.isActiveTab
  });
  const [pageIndex, setPageIndex] = useState(0);
  const lastTokenIdRef = useRef<bigint | undefined>(undefined);
  const refreshIntervalRef = useRef<number | null>(null);
  const refreshDeadlineRef = useRef<number | null>(null);
  const initialPageSetRef = useRef(false);
  const contractIdRef = useRef<string | null>(null);
  const autoSelectRef = useRef(true);
  const focusRequestRef = useRef<{
    key: number;
    baseline: bigint | null;
  } | null>(null);

  const maxPage = useMemo(() => {
    if (lastTokenQuery.data === undefined) {
      return 0;
    }
    const maxPageValue = Number(lastTokenQuery.data / BigInt(PAGE_SIZE));
    return Number.isSafeInteger(maxPageValue) ? maxPageValue : 0;
  }, [lastTokenQuery.data]);

  useEffect(() => {
    if (contractIdRef.current !== contractId) {
      contractIdRef.current = contractId;
      initialPageSetRef.current = false;
      autoSelectRef.current = true;
    }
  }, [contractId]);

  useEffect(() => {
    if (lastTokenQuery.data === undefined) {
      return;
    }
    if (initialPageSetRef.current) {
      return;
    }
    setPageIndex(maxPage);
    initialPageSetRef.current = true;
  }, [lastTokenQuery.data, maxPage]);

  useEffect(() => {
    autoSelectRef.current = true;
  }, [pageIndex]);

  useEffect(() => {
    if (lastTokenQuery.data === undefined) {
      return;
    }
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [lastTokenQuery.data, maxPage, pageIndex]);

  const pageTokenIds = useMemo(() => {
    if (lastTokenQuery.data === undefined) {
      return [];
    }
    return buildTokenPage(lastTokenQuery.data, pageIndex, PAGE_SIZE);
  }, [lastTokenQuery.data, pageIndex]);

  const { tokenIds, tokenQueries } = useTokenSummaries({
    client,
    senderAddress: props.senderAddress,
    tokenIds: pageTokenIds,
    enabled: props.isActiveTab
  });

  type GridSlot = {
    id: bigint | null;
    query: (typeof tokenQueries)[number] | null;
    key?: string;
  };

  const tokenSummaries = tokenQueries
    .map((query, index) => {
      const id = tokenIds[index];
      if (id === undefined || !query.data) {
        return null;
      }
      return query.data;
    })
    .filter((token): token is TokenSummary => !!token);

  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const handleSelectToken = useCallback((id: bigint) => {
    autoSelectRef.current = false;
    setSelectedTokenId(id);
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
  }, [props.focusKey, refreshViewer, stopRefresh, endRefresh]);

  useEffect(() => {
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
  }, [pageTokenIds, selectedTokenId]);


  useEffect(() => {
    const focusRequest = focusRequestRef.current;
    if (!focusRequest) {
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
  }, [lastTokenQuery.data, maxPage, endRefresh]);

  const gridSlots = useMemo(() => {
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
  }, [tokenIds, tokenQueries, lastTokenQuery.isLoading]);

  const selectedToken = tokenSummaries.find(
    (token) => token.id === selectedTokenId
  ) ?? null;
  const rangeLabel =
    lastTokenQuery.data === undefined
      ? 'Loading...'
      : tokenIds.length > 0
        ? `IDs ${tokenIds[0].toString()}–${tokenIds[tokenIds.length - 1].toString()}`
        : 'No tokens';

  return (
    <section
      className={`viewer app-section app-section--fit${props.collapsed ? ' module--collapsed' : ''}`}
      id="collection-viewer"
    >
      <div className="panel">
        <div className="panel__header viewer-header">
          <div>
            <h2>Collection viewer</h2>
          </div>
          <div className="panel__actions viewer-header__actions">
            <button
              className="button button--ghost button--collapse"
              type="button"
              onClick={props.onToggleCollapse}
              aria-expanded={!props.collapsed}
            >
              {props.collapsed ? 'Expand' : 'Collapse'}
            </button>
            <div className="viewer-controls viewer-controls--compact">
              <span className="badge badge--neutral badge--compact">
                {lastTokenQuery.data !== undefined
                  ? `Last ID: ${lastTokenQuery.data.toString()}`
                  : 'Loading'}
              </span>
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
            </div>
          </div>
        </div>
        <div className="panel__body viewer-panel__body">
          <div className="grid-panel">
            <div className="grid-panel__meta">
              {lastTokenQuery.isLoading && tokenIds.length === 0 && (
                <p>Loading collection...</p>
              )}
              {lastTokenQuery.isError && (
                <p>Unable to load collection for {contractId}.</p>
              )}
              {!lastTokenQuery.isLoading && tokenIds.length === 0 && (
                <p>No tokens minted yet.</p>
              )}
            </div>
            {gridSlots.length > 0 && (
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
            )}
          </div>
        </div>
      </div>
      <TokenDetails
        token={selectedToken}
        selectedTokenId={selectedTokenId}
        contractId={contractId}
        senderAddress={props.senderAddress}
        client={client}
        isActiveTab={props.isActiveTab}
      />
    </section>
  );
}
