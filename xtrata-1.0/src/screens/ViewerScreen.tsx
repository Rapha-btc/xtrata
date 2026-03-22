import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent
} from 'react';
import { showContractCall } from '../lib/wallet/connect';
import {
  PostConditionMode,
  contractPrincipalCV,
  uintCV
} from '@stacks/transactions';
import { buildTransferCall, createXtrataClient } from '../lib/contract/client';
import { isReadOnlyBackoffActive } from '../lib/contract/read-only';
import { getLegacyContract, type ContractRegistryEntry } from '../lib/contract/registry';
import { getContractId, type ContractConfig } from '../lib/contract/config';
import {
  buildContractTransferPostCondition,
  buildTransferPostCondition
} from '../lib/contract/post-conditions';
import { getNetworkMismatch, type NetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildActiveListingIndex,
  buildMarketListingKey,
  loadMarketActivity
} from '../lib/market/indexer';
import {
  MARKET_REGISTRY,
  getMarketContractId,
  getMarketRegistryEntry
} from '../lib/market/registry';
import {
  createMarketSelectionStore,
  MARKET_SELECTION_EVENT
} from '../lib/market/selection';
import { parseMarketContractId } from '../lib/market/contract';
import { createMarketClient } from '../lib/market/client';
import type { MarketActivityEvent } from '../lib/market/types';
import {
  getBuyActionValidationMessage,
  isSameAddress,
  getCancelActionValidationMessage,
  getListActionValidationMessage,
  validateBuyAction,
  validateCancelAction,
  validateListAction
} from '../lib/market/actions';
import {
  buildMarketBuyPostConditions,
  formatMarketPriceWithUsd,
  getMarketBuyFailureMessage,
  getMarketPriceInputLabel,
  getMarketSettlementAsset,
  getMarketSettlementBadgeVariant,
  getMarketSettlementLabel,
  getMarketSettlementSupportMessage,
  isMarketSettlementSupported,
  parseMarketPriceInput
} from '../lib/market/settlement';
import { useUsdPriceBook } from '../lib/pricing/hooks';
import {
  mergeListingIndexes,
  resolveMissingListingsForTokens
} from '../lib/market/listing-resolution';
import {
  getChunkKey,
  getDependenciesKey,
  getTokenSummaryKey,
  getTokenThumbnailKey,
  getViewerKey,
  fetchTokenSummaryWithFallback,
  useCombinedLastTokenId,
  useTokenSummaries
} from '../lib/viewer/queries';
import { buildTokenPage } from '../lib/viewer/model';
import type { TokenSummary } from '../lib/viewer/types';
import { bytesToHex } from '../lib/utils/encoding';
import TokenContentPreview from '../components/TokenContentPreview';
import TokenCardMedia from '../components/TokenCardMedia';
import AddressLabel from '../components/AddressLabel';
import { getMediaKind } from '../lib/viewer/content';
import { loadInscriptionThumbnailFromCache } from '../lib/viewer/cache';
import { logInfo } from '../lib/utils/logger';
import { getTransferValidationMessage, validateTransferRequest } from '../lib/wallet/transfer';
import type { WalletSession } from '../lib/wallet/types';
import type { WalletLookupState } from '../lib/wallet/lookup';
import { formatBytes, truncateMiddle } from '../lib/utils/format';
import {
  fetchParents,
  findChildrenFromKnownTokens,
  findSiblingsFromParents
} from '../lib/viewer/relationships';
import {
  loadRelationshipChildren
} from '../lib/viewer/relationship-index';
import {
  syncRelationshipIndex,
  type RelationshipSyncProgress
} from '../lib/viewer/relationship-sync';
import { loadWalletHoldingsIndex } from '../lib/viewer/wallet-index';

const PAGE_SIZE = 16;
const REFRESH_INTERVAL_MS = 6_000;
const REFRESH_WINDOW_MS = 120_000;
const PREFETCH_PAGE_DELAY_MS = 800;
const PREFETCH_PAGE_CONCURRENCY = 2;
const RECENT_PAGE_LIMIT = 5;
const RECENT_PAGE_STORAGE_KEY = 'xtrata.v15.1.viewer.recent-pages';
const WALLET_LISTINGS_SCAN_LIMIT = 120;
const WALLET_LISTINGS_LIMIT = 160;
const WALLET_TOKEN_SCAN_LIMIT = 2000;
const WALLET_TOKEN_INITIAL_SCAN = 320;
const WALLET_TOKEN_SCAN_STEP = 320;
const RELATIONSHIP_THUMBNAIL_LIMIT = 12;
const MARKET_DATA_STALE_MS = 60_000;
const WALLET_LISTINGS_REFETCH_MS = 120_000;
const WALLET_HOLDINGS_STALE_MS = 120_000;
const sortBigIntAsc = (left: bigint, right: bigint) =>
  left < right ? -1 : left > right ? 1 : 0;

export type ViewerMode = 'collection' | 'wallet';

const marketSelectionStore = createMarketSelectionStore();

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
  onAddParentDraft?: (id: bigint) => void;
  modeLabels?: {
    collection?: string;
    wallet?: string;
  };
  viewerTitles?: {
    collection?: string;
    wallet?: string;
  };
  allowSummaryPrefetch?: boolean;
  allowBackgroundRelationshipSync?: boolean;
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

type RecentPagesRecord = Record<
  string,
  {
    pages: string[][];
    updatedAt: number;
  }
>;

const loadRecentPages = (scopeKey: string) => {
  if (typeof window === 'undefined') {
    return [] as string[][];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_PAGE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentPagesRecord;
    return parsed[scopeKey]?.pages ?? [];
  } catch (error) {
    return [];
  }
};

const saveRecentPage = (scopeKey: string, ids: bigint[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (ids.length === 0) {
    return;
  }
  const page = ids.map((id) => id.toString());
  try {
    const raw = window.localStorage.getItem(RECENT_PAGE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentPagesRecord) : {};
    const existing = parsed[scopeKey]?.pages ?? [];
    const pageKey = page.join(',');
    const filtered = existing.filter((item) => item.join(',') !== pageKey);
    const nextPages = [page, ...filtered].slice(0, RECENT_PAGE_LIMIT);
    parsed[scopeKey] = {
      pages: nextPages,
      updatedAt: Date.now()
    };
    window.localStorage.setItem(
      RECENT_PAGE_STORAGE_KEY,
      JSON.stringify(parsed)
    );
  } catch (error) {
    // ignore storage errors
  }
};

const parseStoredIds = (pages: string[][]) => {
  const ids: bigint[] = [];
  pages.forEach((page) => {
    page.forEach((value) => {
      try {
        ids.push(BigInt(value));
      } catch (error) {
        return;
      }
    });
  });
  return ids;
};

const TokenCard = (props: {
  token: TokenSummary;
  isSelected: boolean;
  isListed: boolean;
  listing: MarketActivityEvent | null;
  walletAddress: string | null;
  onSelect: (id: bigint) => void;
  onBuyListing: (token: TokenSummary, listing: MarketActivityEvent) => void;
  onCancelListing: (token: TokenSummary, listing: MarketActivityEvent) => void;
  marketActionPending: boolean;
  marketBuySupported: boolean;
  listingBadgeLabel: string;
  listingBadgeVariant: string;
  client: ReturnType<typeof createXtrataClient>;
  fallbackClient?: ReturnType<typeof createXtrataClient> | null;
  senderAddress: string;
  contractId: string;
  isActiveTab: boolean;
}) => {
  const mediaLabel = getMediaLabel(props.token.meta?.mimeType ?? null);
  const mediaTitle = props.token.meta?.mimeType ?? 'Unknown mime type';
  const listedByWallet =
    !!props.listing?.seller &&
    !!props.walletAddress &&
    isSameAddress(props.listing.seller, props.walletAddress);
  const showBuy = !!props.listing && !listedByWallet;
  const showCancel = !!props.listing && listedByWallet;
  const showActionButton = showBuy || showCancel;
  const actionLabel = showCancel ? 'Cancel' : 'Buy';
  const actionBusyLabel = showCancel ? 'Cancelling...' : 'Buying...';

  return (
    <div
      className={`token-card${props.isSelected ? ' token-card--active' : ''}`}
    >
      <button
        type="button"
        className="token-card__surface"
        onClick={() => props.onSelect(props.token.id)}
        aria-label={`Select token #${props.token.id.toString()}`}
      >
        {props.isListed && (
          <span
            className={`token-card__badge token-card__badge--listed token-card__badge--market ${props.listingBadgeVariant}`}
            title={`Listed for sale in ${props.listingBadgeLabel}`}
            aria-hidden="true"
          >
            {props.listingBadgeLabel}
          </span>
        )}
        <div className="token-card__header" aria-hidden="true">
          <span className="token-card__id">#{props.token.id.toString()}</span>
        </div>
        <div className="token-card__media">
          <TokenCardMedia
            token={props.token}
            contractId={props.contractId}
            senderAddress={props.senderAddress}
            client={props.client}
            fallbackClient={props.fallbackClient}
            isActiveTab={props.isActiveTab}
          />
        </div>
        <div className="token-card__meta" aria-hidden="true">
          <span className="token-card__pill" title={mediaTitle}>
            {mediaLabel}
          </span>
        </div>
      </button>
      {showActionButton && props.listing && (
        <div className="token-card__actions">
          <button
            type="button"
            className={`button button--mini${showCancel ? ' button--ghost' : ''}`}
            disabled={props.marketActionPending || (showBuy && !props.marketBuySupported)}
            onClick={(event) => {
              event.stopPropagation();
              props.onSelect(props.token.id);
              if (showCancel) {
                props.onCancelListing(props.token, props.listing!);
                return;
              }
              props.onBuyListing(props.token, props.listing!);
            }}
            title={showCancel ? 'Cancel listing' : 'Buy listing'}
          >
            {props.marketActionPending ? actionBusyLabel : actionLabel}
          </button>
        </div>
      )}
    </div>
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
  viewerContractId: string;
  senderAddress: string;
  client: ReturnType<typeof createXtrataClient>;
  fallbackClient?: ReturnType<typeof createXtrataClient> | null;
  walletSession: WalletSession;
  mode: ViewerMode;
  isActiveTab: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  listing: MarketActivityEvent | null;
  marketContract: ContractConfig | null;
  marketContractError: string | null;
  marketContractId: string | null;
  marketPaymentTokenContractId: string | null | undefined;
  marketMismatch: NetworkMismatch | null;
  marketNetworkMismatch: boolean;
  isMobile: boolean;
  useCompactPreviewLayout: boolean;
  mobilePanel: 'grid' | 'preview';
  onRequestGrid: () => void;
  knownChildren: bigint[];
  relationshipVersion: number;
  lastTokenId: bigint | null;
  onAddParentDraft?: (id: bigint) => void;
  onSelectToken: (id: bigint) => void;
  canSelectPrev: boolean;
  canSelectNext: boolean;
  onSelectPrev: () => void;
  onSelectNext: () => void;
  marketActionStatus: string | null;
  marketActionPending: boolean;
  usdPriceBook: ReturnType<typeof useUsdPriceBook>['data'] | null;
  onBuyListing: (token: TokenSummary, listing: MarketActivityEvent) => void;
  onCancelListing: (token: TokenSummary, listing: MarketActivityEvent) => void;
}) => {
  const queryClient = useQueryClient();
  const [chunkInput, setChunkInput] = useState('');
  const [chunkIndex, setChunkIndex] = useState<bigint | null>(null);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [transferPending, setTransferPending] = useState(false);
  const [transferLog, setTransferLog] = useState<string[]>([]);
  const [listPriceInput, setListPriceInput] = useState('');
  const [listStatus, setListStatus] = useState<string | null>(null);
  const [listPending, setListPending] = useState(false);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [walletToolsOpen, setWalletToolsOpen] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [detailPanelView, setDetailPanelView] = useState<'media' | 'metadata'>(
    'media'
  );
  const [metadataColumnCollapsed, setMetadataColumnCollapsed] = useState(false);
  const isWalletView = props.mode === 'wallet';
  const useSplitDetailTabs = props.useCompactPreviewLayout;
  const canToggleMetadataColumn = !useSplitDetailTabs;
  const metadataColumnHidden = canToggleMetadataColumn && metadataColumnCollapsed;
  const showMediaPane = !useSplitDetailTabs || detailPanelView === 'media';
  const showMetadataPane =
    (!useSplitDetailTabs || detailPanelView === 'metadata') && !metadataColumnHidden;
  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const walletAddress = props.walletSession.address;
  const listingOwnedByWallet =
    !!props.listing?.seller &&
    !!walletAddress &&
    isSameAddress(props.listing.seller, walletAddress);
  const showQuickBuy = !!props.listing && !listingOwnedByWallet;
  const showQuickCancel = !!props.listing && listingOwnedByWallet;
  const marketSettlement = getMarketSettlementAsset(
    props.marketPaymentTokenContractId
  );
  const marketSettlementLabel = getMarketSettlementLabel(marketSettlement);
  const marketSettlementBadgeVariant =
    getMarketSettlementBadgeVariant(marketSettlement);
  const marketSettlementSupported = isMarketSettlementSupported(marketSettlement);
  const marketSettlementMessage =
    getMarketSettlementSupportMessage(marketSettlement);
  const marketRegistryEntry = props.marketContractId
    ? getMarketRegistryEntry(props.marketContractId)
    : null;
  const marketPresetValue =
    marketRegistryEntry && props.marketContractId ? props.marketContractId : '';
  const listPriceAmount = parseMarketPriceInput(listPriceInput, marketSettlement);

  const dependenciesQuery = useQuery({
    queryKey: props.token
      ? getDependenciesKey(props.contractId, props.token.id)
      : ['viewer', props.contractId, 'dependencies', 'none'],
    queryFn: () =>
      props.token
        ? fetchParents({
            client: props.client,
            tokenId: props.token.id,
            senderAddress: props.senderAddress
          })
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
    setListStatus(null);
    setCancelStatus(null);
    setListPriceInput('');
  }, [props.selectedTokenId, walletAddress]);

  useEffect(() => {
    setWalletToolsOpen(false);
  }, [props.selectedTokenId, props.mode]);

  useEffect(() => {
    setDetailPanelView('media');
  }, [
    props.selectedTokenId,
    props.mobilePanel,
    props.mode,
    props.useCompactPreviewLayout
  ]);

  useEffect(() => {
    if (!showMetadataPane) {
      setWalletToolsOpen(false);
    }
  }, [showMetadataPane]);

  const revealWalletTools = useCallback(() => {
    if (useSplitDetailTabs) {
      setDetailPanelView('metadata');
    }
    if (metadataColumnHidden) {
      setMetadataColumnCollapsed(false);
    }
  }, [metadataColumnHidden, useSplitDetailTabs]);

  const handleOpenWalletTools = useCallback(() => {
    revealWalletTools();
    setWalletToolsOpen(true);
  }, [revealWalletTools]);

  const handleSelectWalletMarket = useCallback(
    (nextId: string) => {
      setListStatus(null);
      setCancelStatus(null);
      if (!nextId) {
        return;
      }
      revealWalletTools();
      setWalletToolsOpen(true);
      marketSelectionStore.save(nextId);
    },
    [revealWalletTools]
  );

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

  const combinedChildren = useMemo(() => {
    return Array.from(
      new Set(props.knownChildren.map((id) => id.toString())),
      (value) => BigInt(value)
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }, [props.knownChildren]);

  const parentIds = dependenciesQuery.data ?? [];
  const parentIdsKey = useMemo(
    () => parentIds.map((id) => id.toString()).join(','),
    [parentIds]
  );
  const siblingsQuery = useQuery({
    queryKey: props.token
      ? [
          'viewer',
          props.contractId,
          'relationship-siblings',
          props.token.id.toString(),
          parentIdsKey,
          props.lastTokenId?.toString() ?? 'none',
          props.relationshipVersion
        ]
      : ['viewer', props.contractId, 'relationship-siblings', 'none'],
    enabled:
      !!props.token &&
      !isWalletView &&
      props.isActiveTab &&
      parentIds.length > 0,
    queryFn: async () => {
      if (!props.token || parentIds.length === 0) {
        return [] as bigint[];
      }
      return findSiblingsFromParents({
        client: props.client,
        selectedTokenId: props.token.id,
        parentIds,
        lastTokenId: props.lastTokenId,
        senderAddress: props.senderAddress,
        loadIndexedChildren: (parentId) =>
          loadRelationshipChildren({
            contractId: props.contractId,
            parentId
          })
      });
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });
  const siblingIds = siblingsQuery.data ?? [];
  const parentThumbIds = parentIds.slice(0, RELATIONSHIP_THUMBNAIL_LIMIT);
  const { tokenQueries: parentThumbQueries } = useTokenSummaries({
    client: props.client,
    senderAddress: props.senderAddress,
    tokenIds: parentThumbIds,
    enabled:
      props.isActiveTab && !isWalletView && parentThumbIds.length > 0,
    contractIdOverride: props.contractId
  });
  const parentThumbItems = useMemo(
    () =>
      parentThumbIds.map((id, index) => ({
        id,
        summary: parentThumbQueries[index]?.data ?? null,
        isLoading: parentThumbQueries[index]?.isLoading ?? false
      })),
    [parentThumbIds, parentThumbQueries]
  );
  const parentOverflowCount = Math.max(
    0,
    parentIds.length - parentThumbIds.length
  );

  const childThumbIds = combinedChildren.slice(0, RELATIONSHIP_THUMBNAIL_LIMIT);
  const { tokenQueries: childThumbQueries } = useTokenSummaries({
    client: props.client,
    senderAddress: props.senderAddress,
    tokenIds: childThumbIds,
    enabled:
      props.isActiveTab && !isWalletView && childThumbIds.length > 0,
    contractIdOverride: props.contractId
  });
  const childThumbItems = useMemo(
    () =>
      childThumbIds.map((id, index) => ({
        id,
        summary: childThumbQueries[index]?.data ?? null,
        isLoading: childThumbQueries[index]?.isLoading ?? false
      })),
    [childThumbIds, childThumbQueries]
  );
  const childOverflowCount = Math.max(
    0,
    combinedChildren.length - childThumbIds.length
  );
  const siblingThumbIds = siblingIds.slice(0, RELATIONSHIP_THUMBNAIL_LIMIT);
  const { tokenQueries: siblingThumbQueries } = useTokenSummaries({
    client: props.client,
    senderAddress: props.senderAddress,
    tokenIds: siblingThumbIds,
    enabled:
      props.isActiveTab && !isWalletView && siblingThumbIds.length > 0,
    contractIdOverride: props.contractId
  });
  const siblingThumbItems = useMemo(
    () =>
      siblingThumbIds.map((id, index) => ({
        id,
        summary: siblingThumbQueries[index]?.data ?? null,
        isLoading: siblingThumbQueries[index]?.isLoading ?? false
      })),
    [siblingThumbIds, siblingThumbQueries]
  );
  const siblingOverflowCount = Math.max(
    0,
    siblingIds.length - siblingThumbIds.length
  );

  const appendTransferLog = (message: string) => {
    setTransferLog((prev) => {
      const next = [...prev, message];
      return next.slice(-20);
    });
    // eslint-disable-next-line no-console
    console.log(`[transfer] ${message}`);
  };

  const refreshViewer = () => {
    void queryClient.invalidateQueries({
      queryKey: getViewerKey(props.viewerContractId)
    });
    void queryClient.refetchQueries({
      queryKey: getViewerKey(props.viewerContractId),
      type: 'active'
    });
  };

  const refreshMarketActivity = () => {
    if (!props.marketContractId) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ['market', props.marketContractId, 'activity']
    });
    void queryClient.refetchQueries({
      queryKey: ['market', props.marketContractId, 'activity'],
      type: 'active'
    });
  };

  const selectedListed =
    !!props.listing &&
    !!props.marketContractId &&
    isSameAddress(props.token?.owner, props.marketContractId);
  const listingStatusLabel = props.listing
    ? selectedListed
      ? `Listed (#${props.listing.listingId.toString()})`
      : `Listing record (#${props.listing.listingId.toString()})`
    : 'Not listed';
  const listingPriceLabel =
    props.listing?.price !== undefined
      ? formatMarketPriceWithUsd(
          props.listing.price,
          marketSettlement,
          props.usdPriceBook
        )
      : null;
  const marketLabel = props.marketContractId ?? 'Select in Market module';
  const detailOwnerAddress = props.token?.owner ?? null;
  const detailCreatorAddress = props.token?.meta?.creator ?? null;
  const detailTokenUri = props.token?.tokenUri ?? null;
  const detailTokenUriLabel = detailTokenUri
    ? truncateMiddle(detailTokenUri, 20, 18)
    : 'Not set';
  const detailMimeType = props.token?.meta?.mimeType ?? 'Unknown';
  const detailTotalSize = props.token?.meta
    ? formatBytes(props.token.meta.totalSize)
    : 'Unknown';
  const detailChunks = props.token?.meta
    ? props.token.meta.totalChunks.toString()
    : 'Unknown';
  const detailSealed = props.token?.meta
    ? props.token.meta.sealed
      ? 'Yes'
      : 'No'
    : 'Unknown';
  const detailFinalHash = props.token?.meta?.finalHash
    ? bytesToHex(props.token.meta.finalHash)
    : null;
  const detailFinalHashLabel = detailFinalHash
    ? truncateMiddle(detailFinalHash, 14, 12)
    : 'Unavailable';
  const listValidation = validateListAction({
    hasMarketContract: !!props.marketContract,
    walletAddress,
    networkMismatch: !!props.marketMismatch,
    marketNetworkMismatch: props.marketNetworkMismatch,
    tokenId: props.token?.id ?? null,
    tokenOwner: props.token?.owner ?? null,
    isListed: selectedListed,
    priceInput: listPriceInput,
    parsePriceInput: (value) => parseMarketPriceInput(value, marketSettlement)
  });
  const listValidationMessage = getListActionValidationMessage(listValidation.reason, {
    priceSymbol: marketSettlement.symbol
  });
  const cancelValidation = validateCancelAction({
    hasMarketContract: !!props.marketContract,
    walletAddress,
    networkMismatch: !!props.marketMismatch,
    marketNetworkMismatch: props.marketNetworkMismatch,
    tokenId: props.token?.id ?? null,
    listingId: props.listing?.listingId ?? null,
    listingSeller: props.listing?.seller ?? null
  });
  const cancelValidationMessage = getCancelActionValidationMessage(
    cancelValidation.reason
  );

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

  const handleList = () => {
    setListStatus(null);
    setCancelStatus(null);
    if (!listValidation.ok || !props.marketContract || !walletAddress || !props.token) {
      const message =
        listValidationMessage ?? 'Listing blocked: invalid inputs.';
      setListStatus(message);
      return;
    }
    if (!marketSettlementSupported || listPriceAmount === null) {
      setListStatus(marketSettlementMessage ?? 'Unsupported payment token.');
      return;
    }

    setListPending(true);
    setListStatus('Waiting for wallet confirmation...');
    try {
      showContractCall({
        contractAddress: props.marketContract.address,
        contractName: props.marketContract.contractName,
        functionName: 'list-token',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          uintCV(props.token.id),
          uintCV(listValidation.priceAmount)
        ],
        network: props.walletSession.network ?? props.marketContract.network,
        stxAddress: walletAddress,
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildTransferPostCondition({
            contract: props.contract,
            senderAddress: walletAddress,
            tokenId: props.token.id
          })
        ],
        onFinish: (payload) => {
          setListPending(false);
          setListStatus(`Listing submitted: ${payload.txId}`);
          refreshViewer();
          refreshMarketActivity();
        },
        onCancel: () => {
          setListPending(false);
          setListStatus('Listing cancelled or failed in wallet.');
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setListPending(false);
      setListStatus(`Listing failed: ${message}`);
    }
  };

  const handleCancel = () => {
    setCancelStatus(null);
    setListStatus(null);
    if (
      !cancelValidation.ok ||
      !props.marketContract ||
      !walletAddress ||
      !props.token ||
      !props.listing
    ) {
      const message =
        cancelValidationMessage ?? 'Cancel blocked: invalid inputs.';
      setCancelStatus(message);
      return;
    }

    setCancelPending(true);
    setCancelStatus('Waiting for wallet confirmation...');
    try {
      showContractCall({
        contractAddress: props.marketContract.address,
        contractName: props.marketContract.contractName,
        functionName: 'cancel',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          uintCV(props.listing.listingId)
        ],
        network: props.walletSession.network ?? props.marketContract.network,
        stxAddress: walletAddress,
        onFinish: (payload) => {
          setCancelPending(false);
          setCancelStatus(`Cancel submitted: ${payload.txId}`);
          refreshViewer();
          refreshMarketActivity();
        },
        onCancel: () => {
          setCancelPending(false);
          setCancelStatus('Cancel cancelled or failed in wallet.');
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCancelPending(false);
      setCancelStatus(`Cancel failed: ${message}`);
    }
  };

  const relationshipParentsLabel = isWalletView
    ? 'Unavailable in wallet view.'
    : dependenciesQuery.isLoading
      ? 'Loading...'
      : dependenciesQuery.data && dependenciesQuery.data.length > 0
        ? dependenciesQuery.data.map((id) => id.toString()).join(', ')
        : 'None';
  const relationshipChildrenLabel =
    combinedChildren.length > 0
      ? combinedChildren.map((id) => id.toString()).join(', ')
      : 'None';
  const relationshipSiblingsLabel = isWalletView
    ? 'Unavailable in wallet view.'
    : dependenciesQuery.isLoading || siblingsQuery.isLoading || siblingsQuery.isFetching
      ? 'Loading...'
      : siblingIds.length > 0
        ? siblingIds.map((id) => id.toString()).join(', ')
        : 'None';
  const handlePreviewTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handlePreviewTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < 44 || absX < absY * 1.2) {
      return;
    }
    if (deltaX > 0 && props.canSelectPrev) {
      props.onSelectPrev();
      return;
    }
    if (deltaX < 0 && props.canSelectNext) {
      props.onSelectNext();
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
                  ? 'Select a token to preview, list, cancel, or transfer.'
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
            Owner:{' '}
            <AddressLabel
              address={detailOwnerAddress}
              network={props.contract.network}
              className="meta-value"
            />
          </p>
          {props.listing?.price !== undefined && (
            <p className="preview-pill preview-pill--strong">
              Listed ·{' '}
              {formatMarketPriceWithUsd(
                props.listing.price,
                marketSettlement,
                props.usdPriceBook
              )}
            </p>
          )}
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
      <div
        className={`panel__body detail-panel${useSplitDetailTabs ? ' detail-panel--mobile-split' : ''}${metadataColumnHidden ? ' detail-panel--metadata-collapsed' : ''}`}
      >
        {canToggleMetadataColumn && (
          <button
            type="button"
            className="detail-panel__meta-toggle"
            onClick={() => setMetadataColumnCollapsed((current) => !current)}
            aria-expanded={!metadataColumnHidden}
            aria-label={
              metadataColumnHidden
                ? 'Expand metadata column'
                : 'Collapse metadata column'
            }
            title={
              metadataColumnHidden
                ? 'Expand metadata column'
                : 'Collapse metadata column'
            }
          >
            {metadataColumnHidden ? '◀' : '▶'}
          </button>
        )}
        {useSplitDetailTabs && (
          <div
            className="viewer-detail-toggle"
            role="tablist"
            aria-label="Preview detail panel"
          >
            <button
              type="button"
              className={`viewer-detail-toggle__button${detailPanelView === 'media' ? ' is-active' : ''}`}
              aria-pressed={detailPanelView === 'media'}
              onClick={() => setDetailPanelView('media')}
            >
              Image
            </button>
            <button
              type="button"
              className={`viewer-detail-toggle__button${detailPanelView === 'metadata' ? ' is-active' : ''}`}
              aria-pressed={detailPanelView === 'metadata'}
              onClick={() => setDetailPanelView('metadata')}
            >
              Metadata
            </button>
          </div>
        )}
        <div
          className={`detail-panel__meta${showMetadataPane ? '' : ' detail-panel__section--hidden'}`}
        >
          <div className="transfer-panel detail-summary-panel">
            <div>
              <h3>Relationships</h3>
              <p>Token context and linked dependencies/dependents.</p>
            </div>
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Token</span>
                <span className="meta-value">#{props.token.id.toString()}</span>
              </div>
              <div>
                <span className="meta-label">Dependencies</span>
                <span className="meta-value">{relationshipParentsLabel}</span>
              </div>
              <div>
                <span className="meta-label">Dependents</span>
                <span className="meta-value">{relationshipChildrenLabel}</span>
              </div>
              <div>
                <span className="meta-label">Related tokens</span>
                <span className="meta-value">{relationshipSiblingsLabel}</span>
              </div>
            </div>
            {!isWalletView && parentThumbItems.length > 0 && (
              <div className="relation-panel">
                <span className="meta-label">Dependency thumbnails</span>
                <div className="relation-grid">
                  {parentThumbItems.map((item) => (
                    <button
                      key={item.id.toString()}
                      type="button"
                      className="relation-card relation-card--button"
                      onClick={() => props.onSelectToken(item.id)}
                      aria-label={`View dependency token #${item.id.toString()}`}
                    >
                      <div className="relation-frame">
                        {item.summary ? (
                          <TokenCardMedia
                            token={item.summary}
                            contractId={props.contractId}
                            senderAddress={props.senderAddress}
                            client={props.client}
                            isActiveTab={props.isActiveTab}
                          />
                        ) : (
                          <span className="relation-placeholder">
                            {item.isLoading ? 'Loading...' : 'Unavailable'}
                          </span>
                        )}
                      </div>
                      <span className="relation-label">
                        #{item.id.toString()}
                      </span>
                    </button>
                  ))}
                </div>
                {parentOverflowCount > 0 && (
                  <span className="meta-value">
                    +{parentOverflowCount} more dependencies
                  </span>
                )}
              </div>
            )}
            {!isWalletView && childThumbItems.length > 0 && (
              <div className="relation-panel">
                <span className="meta-label">Dependent thumbnails</span>
                <div className="relation-grid">
                  {childThumbItems.map((item) => (
                    <button
                      key={item.id.toString()}
                      type="button"
                      className="relation-card relation-card--button"
                      onClick={() => props.onSelectToken(item.id)}
                      aria-label={`View dependent token #${item.id.toString()}`}
                    >
                      <div className="relation-frame">
                        {item.summary ? (
                          <TokenCardMedia
                            token={item.summary}
                            contractId={props.contractId}
                            senderAddress={props.senderAddress}
                            client={props.client}
                            isActiveTab={props.isActiveTab}
                          />
                        ) : (
                          <span className="relation-placeholder">
                            {item.isLoading ? 'Loading...' : 'Unavailable'}
                          </span>
                        )}
                      </div>
                      <span className="relation-label">
                        #{item.id.toString()}
                      </span>
                    </button>
                  ))}
                </div>
                {childOverflowCount > 0 && (
                  <span className="meta-value">
                    +{childOverflowCount} more dependents
                  </span>
                )}
              </div>
            )}
            {!isWalletView && siblingThumbItems.length > 0 && (
              <div className="relation-panel">
                <span className="meta-label">Related token thumbnails</span>
                <div className="relation-grid">
                  {siblingThumbItems.map((item) => (
                    <button
                      key={item.id.toString()}
                      type="button"
                      className="relation-card relation-card--button"
                      onClick={() => props.onSelectToken(item.id)}
                      aria-label={`View related token #${item.id.toString()}`}
                    >
                      <div className="relation-frame">
                        {item.summary ? (
                          <TokenCardMedia
                            token={item.summary}
                            contractId={props.contractId}
                            senderAddress={props.senderAddress}
                            client={props.client}
                            isActiveTab={props.isActiveTab}
                          />
                        ) : (
                          <span className="relation-placeholder">
                            {item.isLoading ? 'Loading...' : 'Unavailable'}
                          </span>
                        )}
                      </div>
                      <span className="relation-label">
                        #{item.id.toString()}
                      </span>
                    </button>
                  ))}
                </div>
                {siblingOverflowCount > 0 && (
                  <span className="meta-value">
                    +{siblingOverflowCount} more siblings
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="transfer-panel detail-summary-panel">
            <div>
              <h3>Details</h3>
              <p>Owner, creator, and core inscription metadata.</p>
            </div>
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Owner</span>
                <AddressLabel
                  address={detailOwnerAddress}
                  network={props.contract.network}
                  className="meta-value"
                />
              </div>
              <div>
                <span className="meta-label">Creator</span>
                <AddressLabel
                  address={detailCreatorAddress}
                  network={props.contract.network}
                  className="meta-value"
                />
              </div>
              <div>
                <span className="meta-label">Token URI</span>
                <span className="meta-value" title={detailTokenUri ?? ''}>
                  {detailTokenUriLabel}
                </span>
              </div>
              <div>
                <span className="meta-label">Mime type</span>
                <span className="meta-value">{detailMimeType}</span>
              </div>
              <div>
                <span className="meta-label">Total size</span>
                <span className="meta-value">{detailTotalSize}</span>
              </div>
              <div>
                <span className="meta-label">Chunks</span>
                <span className="meta-value">{detailChunks}</span>
              </div>
              <div>
                <span className="meta-label">Sealed</span>
                <span className="meta-value">{detailSealed}</span>
              </div>
              <div>
                <span className="meta-label">Final hash</span>
                <span className="meta-value" title={detailFinalHash ?? ''}>
                  {detailFinalHashLabel}
                </span>
              </div>
            </div>
            {props.onAddParentDraft && (
              <div className="transfer-panel__actions">
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={() => props.onAddParentDraft?.(props.token!.id)}
                >
                  Use as dependency
                </button>
              </div>
            )}
          </div>
          {props.listing && (
            <div className="transfer-panel detail-summary-panel">
              <div>
                <h3>Listing</h3>
                <p>Current market state for this inscription.</p>
              </div>
              <div className="meta-grid meta-grid--dense">
                <div>
                  <span className="meta-label">Listing</span>
                  <span className="meta-value">
                    #{props.listing.listingId.toString()}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Settlement</span>
                  <span className="market-badge-row">
                    <span
                      className={`badge badge--compact ${marketSettlementBadgeVariant}`}
                    >
                      {marketSettlementLabel}
                    </span>
                  </span>
                </div>
                {props.listing.price !== undefined && (
                  <div>
                    <span className="meta-label">Price</span>
                    <span className="meta-value">
                      {formatMarketPriceWithUsd(
                        props.listing.price,
                        marketSettlement,
                        props.usdPriceBook
                      )}
                    </span>
                  </div>
                )}
                {props.listing.fee !== undefined && (
                  <div>
                    <span className="meta-label">Fee</span>
                    <span className="meta-value">
                      {formatMarketPriceWithUsd(
                        props.listing.fee,
                        marketSettlement,
                        props.usdPriceBook
                      )}
                    </span>
                  </div>
                )}
                {props.listing.seller && (
                  <div>
                    <span className="meta-label">Seller</span>
                    <AddressLabel
                      address={props.listing.seller}
                      network={props.contract.network}
                      className="meta-value"
                    />
                  </div>
                )}
                <div>
                  <span className="meta-label">Status</span>
                  <span className="meta-value">
                    {selectedListed ? 'Escrowed' : 'Listed'}
                  </span>
                </div>
              </div>
              {(showQuickBuy || showQuickCancel) && (
                <div className="transfer-panel__actions transfer-panel__actions--market">
                  {showQuickBuy && (
                    <button
                      className="button button--mini"
                      type="button"
                      disabled={props.marketActionPending || !marketSettlementSupported}
                      onClick={() => props.onBuyListing(props.token!, props.listing!)}
                    >
                      {props.marketActionPending ? 'Buying...' : 'Buy'}
                    </button>
                  )}
                  {showQuickCancel && (
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      disabled={props.marketActionPending}
                      onClick={() => props.onCancelListing(props.token!, props.listing!)}
                    >
                      {props.marketActionPending ? 'Cancelling...' : 'Cancel listing'}
                    </button>
                  )}
                </div>
              )}
              {props.marketActionStatus && (
                <span className="meta-value">{props.marketActionStatus}</span>
              )}
              {!props.marketActionStatus && marketSettlementMessage && (
                <span className="meta-value">{marketSettlementMessage}</span>
              )}
            </div>
          )}
        </div>
        <div
          className={`detail-panel__preview${showMediaPane ? '' : ' detail-panel__section--hidden'}`}
          onTouchStart={handlePreviewTouchStart}
          onTouchEnd={handlePreviewTouchEnd}
        >
          {(props.canSelectPrev || props.canSelectNext) && (
            <>
              <button
                type="button"
                className="preview-nav-button preview-nav-button--prev"
                onClick={props.onSelectPrev}
                disabled={!props.canSelectPrev}
                aria-label="Previous inscription"
                title="Previous inscription"
              >
                &#8249;
              </button>
              <button
                type="button"
                className="preview-nav-button preview-nav-button--next"
                onClick={props.onSelectNext}
                disabled={!props.canSelectNext}
                aria-label="Next inscription"
                title="Next inscription"
              >
                &#8250;
              </button>
            </>
          )}
          {isWalletView ? (
            <div className="wallet-preview">
              <TokenContentPreview
                token={props.token}
                contractId={props.contractId}
                senderAddress={props.senderAddress}
                client={props.client}
                fallbackClient={props.fallbackClient}
                isActiveTab={props.isActiveTab}
                showDetailsDrawer={false}
              />
              {props.listing && (
                <button
                  type="button"
                  className={`wallet-preview__badge ${marketSettlementBadgeVariant}`}
                  onClick={handleOpenWalletTools}
                  title="Open listing tools"
                >
                  {`Listed · ${marketSettlementLabel}`}
                </button>
              )}
            </div>
          ) : (
            <TokenContentPreview
              token={props.token}
              contractId={props.contractId}
              senderAddress={props.senderAddress}
              client={props.client}
              fallbackClient={props.fallbackClient}
              isActiveTab={props.isActiveTab}
              showDetailsDrawer={false}
              onRequestViewer={
                props.isMobile && !isWalletView ? props.onRequestGrid : undefined
              }
              viewerLabel={props.isMobile && !isWalletView ? 'Grid' : undefined}
            />
          )}
        </div>
        <div
          className={`${
            isWalletView
              ? 'detail-panel__tools'
              : 'detail-panel__tools detail-panel__tools--advanced'
          }${showMetadataPane ? '' : ' detail-panel__section--hidden'}`}
        >
          {isWalletView ? (
            <details
              className="preview-drawer preview-drawer--advanced"
              open={walletToolsOpen}
              onToggle={(event) => setWalletToolsOpen(event.currentTarget.open)}
            >
              <summary>Wallet tools</summary>
              <div className="preview-drawer__body">
                <div className="transfer-panel wallet-tools__panel">
                  <div>
                    <h3>Listing tools</h3>
                    <p>List or cancel the selected inscription.</p>
                  </div>
                  <div className="meta-grid">
                    <div>
                      <span className="meta-label">Selected token</span>
                      <span className="meta-value">
                        #{props.token.id.toString()}
                      </span>
                    </div>
                    <div>
                      <span className="meta-label">Market contract</span>
                      {props.marketContractId ? (
                        <AddressLabel
                          address={props.marketContractId}
                          network={props.marketContract?.network ?? props.contract.network}
                          className="meta-value"
                        />
                      ) : (
                        <span className="meta-value">{marketLabel}</span>
                      )}
                    </div>
                    <div>
                      <span className="meta-label">Listing status</span>
                      <span className="meta-value">{listingStatusLabel}</span>
                    </div>
                    <div>
                      <span className="meta-label">Settlement</span>
                      <span className="market-badge-row">
                        <span
                          className={`badge badge--compact ${marketSettlementBadgeVariant}`}
                        >
                          {marketSettlementLabel}
                        </span>
                      </span>
                    </div>
                    {listingPriceLabel && (
                      <div>
                        <span className="meta-label">Listing price</span>
                        <span className="meta-value">{listingPriceLabel}</span>
                      </div>
                    )}
                  </div>
                  {props.marketContractError && (
                    <span className="meta-value">{props.marketContractError}</span>
                  )}
                  {props.marketMismatch && (
                    <span className="meta-value">
                      Network mismatch: wallet on {props.marketMismatch.actual},
                      market is {props.marketMismatch.expected}.
                    </span>
                  )}
                  {props.marketNetworkMismatch && (
                    <span className="meta-value">
                      Market network must match the active NFT contract.
                    </span>
                  )}
                  <label className="field">
                    <span className="field__label">Settlement market</span>
                    <select
                      className="select"
                      value={marketPresetValue}
                      onChange={(event) =>
                        handleSelectWalletMarket(event.target.value)
                      }
                      disabled={listPending || cancelPending}
                    >
                      {!marketPresetValue && (
                        <option value="">Custom market (set in Market module)</option>
                      )}
                      {MARKET_REGISTRY.map((entry) => {
                        const id = getMarketContractId(entry);
                        const settlement = getMarketSettlementAsset(
                          entry.paymentTokenContractId
                        );
                        return (
                          <option key={id} value={id}>
                            {`${entry.label} · ${getMarketSettlementLabel(settlement)}`}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {!marketPresetValue && props.marketContractId && (
                    <span className="meta-value">
                      Custom market active. Open the Market module to edit the raw
                      contract ID directly.
                    </span>
                  )}
                  <label className="field">
                    <span className="field__label">
                      {getMarketPriceInputLabel(marketSettlement)}
                    </span>
                    <input
                      className="input"
                      placeholder="0.25"
                      value={listPriceInput}
                      onChange={(event) => {
                        setListPriceInput(event.target.value);
                        setListStatus(null);
                      }}
                      disabled={listPending || cancelPending}
                    />
                  </label>
                  {listStatus && <span className="meta-value">{listStatus}</span>}
                  {!listStatus && marketSettlementMessage && (
                    <span className="meta-value">{marketSettlementMessage}</span>
                  )}
                  {!listStatus && listValidationMessage && (
                    <span className="meta-value">{listValidationMessage}</span>
                  )}
                  {cancelStatus && <span className="meta-value">{cancelStatus}</span>}
                  {!cancelStatus && cancelValidationMessage && (
                    <span className="meta-value">{cancelValidationMessage}</span>
                  )}
                  <div className="transfer-panel__actions">
                    <button
                      className="button button--mini"
                      type="button"
                      onClick={handleList}
                      disabled={
                        !listValidation.ok ||
                        !marketSettlementSupported ||
                        listPending ||
                        cancelPending
                      }
                    >
                      {listPending ? 'Listing...' : 'List'}
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={handleCancel}
                      disabled={!cancelValidation.ok || cancelPending || listPending}
                    >
                      {cancelPending ? 'Cancelling...' : 'Cancel listing'}
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() => {
                        setListPriceInput('');
                        setListStatus(null);
                        setCancelStatus(null);
                      }}
                      disabled={listPending || cancelPending}
                    >
                      Clear
                    </button>
                  </div>
                </div>
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
                      <AddressLabel
                        address={props.token.owner}
                        network={props.contract.network}
                        className="meta-value"
                      />
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
                      disabled={
                        !transferValidation.ok ||
                        transferPending ||
                        listPending ||
                        cancelPending
                      }
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
  const usdPriceBook = useUsdPriceBook({
    enabled: props.isActiveTab && !props.collapsed
  }).data ?? null;
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const legacyContract = useMemo(
    () => getLegacyContract(props.contract),
    [props.contract]
  );
  const legacyClient = useMemo(
    () => (legacyContract ? createXtrataClient({ contract: legacyContract }) : null),
    [legacyContract]
  );
  const queryClient = useQueryClient();
  const contractId = getContractId(props.contract);
  const legacyContractId = legacyContract ? getContractId(legacyContract) : null;
  const primaryContractId = contractId;
  const defaultMarketId = getMarketContractId(MARKET_REGISTRY[0]);
  const [marketContractId, setMarketContractId] = useState(
    () => marketSelectionStore.load() ?? defaultMarketId
  );
  const isWalletView = props.mode === 'wallet';
  const collectionModeLabel = props.modeLabels?.collection ?? 'Collection';
  const walletModeLabel = props.modeLabels?.wallet ?? 'Wallet';
  const collectionViewerTitle = props.viewerTitles?.collection ?? 'Collection viewer';
  const walletViewerTitle = props.viewerTitles?.wallet ?? 'Wallet viewer';
  const allowSummaryPrefetch = props.allowSummaryPrefetch ?? true;
  const allowBackgroundRelationshipSync =
    props.allowBackgroundRelationshipSync ?? true;
  const walletAddress = props.walletSession.address ?? null;
  const resolvedWalletAddress = props.walletLookupState.resolvedAddress;
  const hasWalletTarget = !!resolvedWalletAddress;
  const walletOverrideActive =
    !!props.walletLookupState.lookupAddress ||
    !!props.walletLookupState.lookupName;
  const [mobilePanel, setMobilePanel] = useState<'grid' | 'preview'>('grid');
  const [isMobile, setIsMobile] = useState(false);
  const [isCompactPreviewViewport, setIsCompactPreviewViewport] = useState(false);
  const [collectionGridReady, setCollectionGridReady] = useState(false);
  const lastTokenQuery = useCombinedLastTokenId({
    primary: client,
    legacy: legacyClient,
    senderAddress: props.senderAddress,
    enabled: props.isActiveTab
  });
  const lastTokenId = lastTokenQuery.data?.lastTokenId ?? undefined;
  const legacyLastTokenId = lastTokenQuery.data?.legacyLastTokenId ?? null;
  const primaryAvailable = lastTokenQuery.data?.primaryAvailable ?? true;
  const legacyAvailable = lastTokenQuery.data?.legacyAvailable ?? false;
  const legacyFallbackActive =
    !!legacyClient && legacyAvailable && !primaryAvailable;
  const escrowOwner = legacyClient ? primaryContractId : null;

  useEffect(() => {
    if (!marketSelectionStore.load()) {
      marketSelectionStore.save(defaultMarketId);
    }
  }, [defaultMarketId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleSelection = () => {
      setMarketContractId(marketSelectionStore.load() ?? defaultMarketId);
    };
    window.addEventListener(MARKET_SELECTION_EVENT, handleSelection);
    return () => {
      window.removeEventListener(MARKET_SELECTION_EVENT, handleSelection);
    };
  }, [defaultMarketId]);

  const parsedMarket = useMemo(
    () => parseMarketContractId(marketContractId),
    [marketContractId]
  );
  const marketContract = parsedMarket.config;
  const marketContractError = parsedMarket.error;
  const marketContractIdLabel = marketContract ? getContractId(marketContract) : null;
  const marketRegistryEntry = getMarketRegistryEntry(marketContractIdLabel);
  const marketNetworkMismatch = marketContract
    ? marketContract.network !== props.contract.network
    : false;
  const marketMismatch = marketContract
    ? getNetworkMismatch(marketContract.network, props.walletSession.network)
    : null;
  const marketClient = useMemo(
    () => (marketContract ? createMarketClient({ contract: marketContract }) : null),
    [marketContract]
  );
  const marketPaymentTokenQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'payment-token'],
    enabled: !!marketClient && !!marketContractIdLabel && props.isActiveTab,
    staleTime: MARKET_DATA_STALE_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!marketClient) {
        return null;
      }
      return marketClient.getPaymentToken(props.senderAddress);
    }
  });
  const marketPaymentTokenContractId = marketPaymentTokenQuery.status === 'success'
    ? marketPaymentTokenQuery.data
    : marketRegistryEntry?.paymentTokenContractId;
  const marketSettlement = getMarketSettlementAsset(marketPaymentTokenContractId);
  const marketSettlementLabel = getMarketSettlementLabel(marketSettlement);
  const marketSettlementBadgeVariant =
    getMarketSettlementBadgeVariant(marketSettlement);
  const marketSettlementMessage =
    getMarketSettlementSupportMessage(marketSettlement);

  const marketActivityQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'activity'],
    enabled:
      !!marketContract && !marketNetworkMismatch && props.isActiveTab,
    queryFn: () => loadMarketActivity({ contract: marketContract! }),
    staleTime: MARKET_DATA_STALE_MS,
    refetchOnWindowFocus: false
  });
  const walletListingsQuery = useQuery({
    queryKey: [
      'market',
      marketContractIdLabel,
      contractId,
      legacyContractId ?? 'none',
      'wallet-listings',
      resolvedWalletAddress ?? 'none'
    ],
    enabled:
      !!marketClient &&
      !!marketContract &&
      !!resolvedWalletAddress &&
      props.isActiveTab &&
      isWalletView,
    staleTime: MARKET_DATA_STALE_MS,
    refetchInterval:
      props.isActiveTab && isWalletView ? WALLET_LISTINGS_REFETCH_MS : false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!marketClient || !marketContractIdLabel || !resolvedWalletAddress) {
        return [] as MarketActivityEvent[];
      }
      const allowedContracts = legacyContractId
        ? new Set([contractId, legacyContractId])
        : new Set([contractId]);
      const lastListingId = await marketClient.getLastListingId(
        resolvedWalletAddress
      );
      const listings: MarketActivityEvent[] = [];
      let cursor = lastListingId;
      let scanned = 0;
      const normalizedSeller = resolvedWalletAddress.toUpperCase();
      while (
        cursor >= 0n &&
        scanned < WALLET_LISTINGS_SCAN_LIMIT &&
        listings.length < WALLET_LISTINGS_LIMIT
      ) {
        const listing = await marketClient.getListing(cursor, resolvedWalletAddress);
        if (
          listing &&
          allowedContracts.has(listing.nftContract) &&
          listing.seller.toUpperCase() === normalizedSeller
        ) {
          listings.push({
            id: `onchain:${cursor.toString()}`,
            type: 'list',
            listingId: cursor,
            tokenId: listing.tokenId,
            price: listing.price,
            seller: listing.seller,
            nftContract: listing.nftContract
          });
        }
        if (cursor === 0n) {
          break;
        }
        cursor -= 1n;
        scanned += 1;
      }
      return listings;
    }
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [walletScanCount, setWalletScanCount] = useState(WALLET_TOKEN_INITIAL_SCAN);
  const [walletAutoFollowLatest, setWalletAutoFollowLatest] = useState(true);
  const lastTokenIdRef = useRef<bigint | undefined>(undefined);
  const refreshIntervalRef = useRef<number | null>(null);
  const refreshDeadlineRef = useRef<number | null>(null);
  const initialPageSetRef = useRef(false);
  const autoSelectRef = useRef(true);
  const viewScopeRef = useRef<string>('');
  const settledWalletTokensByScopeRef = useRef<Record<string, TokenSummary[]>>({});
  const focusRequestRef = useRef<{
    key: number;
    baseline: bigint | null;
  } | null>(null);
  const prefetchScopeRef = useRef<string>('');
  const loadOrderLogRef = useRef<string>('');
  const [settledWalletTokens, setSettledWalletTokens] = useState<TokenSummary[]>(
    []
  );
  const [relationshipIndexVersion, setRelationshipIndexVersion] = useState(0);
  const relationshipSyncInFlightRef = useRef<Record<string, boolean>>({});

  const collectionMaxPage = useMemo(() => {
    if (lastTokenId === undefined) {
      return 0;
    }
    const maxPageValue = Number(lastTokenId / BigInt(PAGE_SIZE));
    return Number.isSafeInteger(maxPageValue) ? maxPageValue : 0;
  }, [lastTokenId]);
  const activePageIndex = (() => {
    if (isWalletView) {
      return pageIndex;
    }
    if (lastTokenId === undefined) {
      return pageIndex;
    }
    if (!initialPageSetRef.current) {
      return collectionMaxPage;
    }
    return pageIndex;
  })();
  const walletScanLimitActive = useMemo(() => {
    if (!isWalletView || lastTokenId === undefined) {
      return false;
    }
    return lastTokenId + 1n > BigInt(WALLET_TOKEN_SCAN_LIMIT);
  }, [isWalletView, lastTokenId]);
  const walletScanCap = useMemo(() => {
    if (!isWalletView || lastTokenId === undefined) {
      return 0;
    }
    if (walletScanLimitActive) {
      return WALLET_TOKEN_SCAN_LIMIT;
    }
    return Number(lastTokenId + 1n);
  }, [isWalletView, lastTokenId, walletScanLimitActive]);
  const walletScanCountClamped = useMemo(() => {
    if (walletScanCap <= 0) {
      return 0;
    }
    return Math.min(Math.max(walletScanCount, PAGE_SIZE), walletScanCap);
  }, [walletScanCap, walletScanCount]);
  const walletScanStart = useMemo(() => {
    if (!isWalletView || lastTokenId === undefined) {
      return 0n;
    }
    if (walletScanCountClamped <= 0) {
      return 0n;
    }
    return lastTokenId + 1n - BigInt(walletScanCountClamped);
  }, [isWalletView, lastTokenId, walletScanCountClamped]);
  const walletListedTokenIds = useMemo(() => {
    if (!walletListingsQuery.data) {
      return [] as bigint[];
    }
    const allowedContracts = legacyContractId
      ? new Set([contractId, legacyContractId])
      : new Set([contractId]);
    const ids = new Set<string>();
    walletListingsQuery.data.forEach((event) => {
      if (!event.tokenId || !event.nftContract) {
        return;
      }
      if (!allowedContracts.has(event.nftContract)) {
        return;
      }
      ids.add(event.tokenId.toString());
    });
    return Array.from(ids, (value) => BigInt(value)).sort(sortBigIntAsc);
  }, [contractId, legacyContractId, walletListingsQuery.data]);
  const walletHoldingsIndexQuery = useQuery({
    queryKey: [
      'viewer',
      contractId,
      legacyContractId ?? 'none',
      'wallet-holdings-index',
      resolvedWalletAddress ?? 'none'
    ],
    enabled: props.isActiveTab && isWalletView && !!resolvedWalletAddress,
    staleTime: WALLET_HOLDINGS_STALE_MS,
    refetchOnWindowFocus: false,
    queryFn: () => {
      if (!resolvedWalletAddress) {
        return Promise.resolve(null);
      }
      return loadWalletHoldingsIndex({
        network: props.contract.network,
        walletAddress: resolvedWalletAddress,
        contractIds: legacyContractId
          ? [contractId, legacyContractId]
          : [contractId],
        maxIds: walletScanCap > 0 ? walletScanCap : WALLET_TOKEN_SCAN_LIMIT
      });
    }
  });
  const walletUsingFastIndex =
    walletHoldingsIndexQuery.data !== undefined &&
    walletHoldingsIndexQuery.data !== null;
  const walletIndexedTokenIds = walletHoldingsIndexQuery.data?.tokenIds ?? [];
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
    const ids = new Set<string>();
    if (walletUsingFastIndex) {
      walletIndexedTokenIds.forEach((id) => ids.add(id.toString()));
    } else if (lastTokenId !== undefined) {
      for (let id = walletScanStart; id <= lastTokenId; id += 1n) {
        ids.add(id.toString());
      }
    }
    walletListedTokenIds.forEach((id) => ids.add(id.toString()));
    return Array.from(ids, (value) => BigInt(value)).sort(sortBigIntAsc);
  }, [
    isWalletView,
    props.isActiveTab,
    resolvedWalletAddress,
    walletUsingFastIndex,
    walletIndexedTokenIds,
    walletListedTokenIds,
    lastTokenId,
    walletScanStart
  ]);

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
      setPageIndex(0);
      setWalletScanCount(WALLET_TOKEN_INITIAL_SCAN);
      setWalletAutoFollowLatest(true);
      setMobilePanel('grid');
      setCollectionGridReady(false);
      if (viewScopeKey.startsWith(`${contractId}:wallet:`)) {
        const cached = settledWalletTokensByScopeRef.current[viewScopeKey];
        setSettledWalletTokens(cached ?? []);
      } else {
        setSettledWalletTokens([]);
      }
    }
  }, [contractId, viewScopeKey]);

  const handleMobileGridRequest = useCallback(() => {
    setMobilePanel('grid');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const mobileQuery = window.matchMedia('(max-width: 959px)');
    const compactPreviewQuery = window.matchMedia(
      '(max-width: 959px), ((max-width: 1180px) and (max-aspect-ratio: 4/5))'
    );
    const handleChange = () => {
      setIsMobile(mobileQuery.matches);
      setIsCompactPreviewViewport(compactPreviewQuery.matches);
    };
    handleChange();
    mobileQuery.addEventListener('change', handleChange);
    compactPreviewQuery.addEventListener('change', handleChange);
    return () => {
      mobileQuery.removeEventListener('change', handleChange);
      compactPreviewQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const collectionTokenIds = useMemo(() => {
    if (lastTokenId === undefined) {
      return [];
    }
    return buildTokenPage(lastTokenId, activePageIndex, PAGE_SIZE);
  }, [lastTokenId, activePageIndex]);
  const pageTokenIds = collectionTokenIds;

  const fetchTokenSummaryForView = useCallback(
    (id: bigint) =>
      fetchTokenSummaryWithFallback({
        primaryClient: client,
        legacyClient,
        id,
        senderAddress: props.senderAddress,
        legacyMaxId: legacyLastTokenId,
        primaryAvailable,
        escrowOwner
      }),
    [
      client,
      legacyClient,
      props.senderAddress,
      legacyLastTokenId,
      primaryAvailable,
      escrowOwner
    ]
  );

  const { tokenIds: collectionIds, tokenQueries: collectionQueries } =
    useTokenSummaries({
      client,
      senderAddress: props.senderAddress,
      tokenIds: collectionTokenIds,
      enabled: props.isActiveTab && !isWalletView && collectionGridReady,
      contractIdOverride: contractId,
      fetchSummary: fetchTokenSummaryForView
    });

  const tokenIds = collectionIds;
  const tokenQueries = collectionQueries;

  const { tokenIds: walletIds, tokenQueries: walletQueries } = useTokenSummaries({
    client,
    senderAddress: props.senderAddress,
    tokenIds: walletTokenIds,
    enabled: props.isActiveTab && isWalletView,
    contractIdOverride: contractId,
    fetchSummary: fetchTokenSummaryForView
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

  const resolveTokenContractId = useCallback(
    (token: TokenSummary | null) => {
      if (!token) {
        return contractId;
      }
      if (token.sourceContractId) {
        return token.sourceContractId;
      }
      if (
        legacyContractId &&
        legacyLastTokenId !== null &&
        token.id <= legacyLastTokenId
      ) {
        return legacyContractId;
      }
      return contractId;
    },
    [contractId, legacyContractId, legacyLastTokenId]
  );

  const resolveTokenClient = useCallback(
    (token: TokenSummary | null) => {
      if (!legacyClient || !legacyContractId) {
        return client;
      }
      const resolvedId = resolveTokenContractId(token);
      return resolvedId === legacyContractId ? legacyClient : client;
    },
    [client, legacyClient, legacyContractId, resolveTokenContractId]
  );

  const resolveContentFallbackClient = useCallback(
    (token: TokenSummary | null) => {
      if (!token || !legacyClient || !legacyContractId || legacyLastTokenId === null) {
        return null;
      }
      if (token.id > legacyLastTokenId) {
        return null;
      }
      const resolvedId = resolveTokenContractId(token);
      if (resolvedId === legacyContractId) {
        return null;
      }
      return legacyClient;
    },
    [
      legacyClient,
      legacyContractId,
      legacyLastTokenId,
      resolveTokenContractId
    ]
  );

  const knownTokens = isWalletView ? walletSummaries : tokenSummaries;
  const dependencyCache = useMemo(() => {
    const map = new Map<string, bigint[]>();
    knownTokens.forEach((token) => {
      const key = getDependenciesKey(resolveTokenContractId(token), token.id);
      const cached = queryClient.getQueryData<bigint[]>(key);
      if (cached && cached.length > 0) {
        map.set(token.id.toString(), cached);
      }
    });
    return map;
  }, [knownTokens, queryClient, resolveTokenContractId]);

  const knownChildrenFromLoadedTokens = useMemo(() => {
    if (!selectedTokenId) {
      return [];
    }
    return findChildrenFromKnownTokens(
      knownTokens,
      selectedTokenId,
      dependencyCache
    );
  }, [knownTokens, selectedTokenId, dependencyCache]);

  const activeListingIndex = useMemo(() => {
    if (!marketActivityQuery.data || !marketContractIdLabel || marketNetworkMismatch) {
      return new Map<string, MarketActivityEvent>();
    }
    const merged = new Map<string, MarketActivityEvent>();
    const primary = buildActiveListingIndex(marketActivityQuery.data.events, contractId);
    primary.forEach((value, key) => merged.set(key, value));
    if (legacyContractId) {
      const legacy = buildActiveListingIndex(
        marketActivityQuery.data.events,
        legacyContractId
      );
      legacy.forEach((value, key) => merged.set(key, value));
    }
    return merged;
  }, [
    marketActivityQuery.data,
    marketContractIdLabel,
    marketNetworkMismatch,
    contractId,
    legacyContractId
  ]);
  const walletListingIds = useMemo(() => {
    const ids = new Set<string>();
    if (walletListingsQuery.data) {
      walletListingsQuery.data.forEach((event) => {
        if (event.tokenId && event.nftContract) {
          ids.add(buildMarketListingKey(event.nftContract, event.tokenId));
        }
      });
    }
    if (resolvedWalletAddress) {
      const normalized = resolvedWalletAddress.toUpperCase();
      activeListingIndex.forEach((event, key) => {
        if (!event.tokenId || !event.seller) {
          return;
        }
        if (event.seller.toUpperCase() !== normalized) {
          return;
        }
        ids.add(key);
      });
    }
    return ids;
  }, [activeListingIndex, resolvedWalletAddress, walletListingsQuery.data]);

  const ownedTokens = useMemo(() => {
    if (!resolvedWalletAddress) {
      return [];
    }
    const normalized = resolvedWalletAddress.toUpperCase();
    return walletSummaries.filter((token) => {
      const owner = token.owner?.toUpperCase();
      if (!owner) {
        return false;
      }
      if (owner === normalized) {
        return true;
      }
      const listingKey = buildMarketListingKey(
        resolveTokenContractId(token),
        token.id
      );
      return walletListingIds.has(listingKey);
    });
  }, [
    walletListingIds,
    walletSummaries,
    resolvedWalletAddress,
    resolveTokenContractId
  ]);

  const ownedTokensSignature = useMemo(
    () =>
      ownedTokens
        .map((token) => `${token.id.toString()}:${token.owner ?? 'none'}`)
        .join('|'),
    [ownedTokens]
  );

  const walletSummaryQueriesSettled =
    walletQueries.length === 0 ||
    walletQueries.every((query) => !query.isLoading);
  const walletIndexPending =
    isWalletView &&
    hasWalletTarget &&
    walletHoldingsIndexQuery.data === undefined &&
    !walletHoldingsIndexQuery.isError;
  const walletTokenListSettled = walletUsingFastIndex
    ? !walletIndexPending && walletSummaryQueriesSettled
    : walletSummaryQueriesSettled;

  useEffect(() => {
    if (
      !isWalletView ||
      walletUsingFastIndex ||
      !hasWalletTarget ||
      !walletTokenListSettled
    ) {
      return;
    }
    if (walletScanCountClamped >= walletScanCap) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const timer = window.setTimeout(() => {
      setWalletScanCount((current) => {
        const base = Math.min(Math.max(current, PAGE_SIZE), walletScanCap);
        return Math.min(walletScanCap, base + WALLET_TOKEN_SCAN_STEP);
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    hasWalletTarget,
    isWalletView,
    walletUsingFastIndex,
    walletScanCap,
    walletScanCountClamped,
    walletTokenListSettled
  ]);

  useEffect(() => {
    if (!isWalletView || !walletTokenListSettled) {
      return;
    }
    if (
      settledWalletTokensByScopeRef.current[viewScopeKey] &&
      ownedTokensSignature ===
        settledWalletTokensByScopeRef.current[viewScopeKey]
          .map((token) => `${token.id.toString()}:${token.owner ?? 'none'}`)
          .join('|')
    ) {
      return;
    }
    settledWalletTokensByScopeRef.current[viewScopeKey] = ownedTokens;
    setSettledWalletTokens(ownedTokens);
  }, [
    isWalletView,
    walletTokenListSettled,
    ownedTokens,
    ownedTokensSignature,
    viewScopeKey
  ]);

  const stableWalletTokens =
    isWalletView && !walletTokenListSettled ? settledWalletTokens : ownedTokens;
  const walletResolvedCount = useMemo(
    () =>
      walletQueries.filter((query) => query.data !== undefined || query.isError)
        .length,
    [walletQueries]
  );

  const isTokenListed = useCallback(
    (token: TokenSummary | null) => {
      if (!token || !marketContractIdLabel) {
        return false;
      }
      if (isSameAddress(token.owner, marketContractIdLabel)) {
        return true;
      }
      const key = buildMarketListingKey(
        resolveTokenContractId(token),
        token.id
      );
      return activeListingIndex.has(key);
    },
    [activeListingIndex, marketContractIdLabel, resolveTokenContractId]
  );

  const walletMaxPage = useMemo(() => {
    if (stableWalletTokens.length === 0) {
      return 0;
    }
    return Math.max(0, Math.floor((stableWalletTokens.length - 1) / PAGE_SIZE));
  }, [stableWalletTokens.length]);

  const maxPage = isWalletView ? walletMaxPage : collectionMaxPage;

  const pageTokens = useMemo(() => {
    if (!isWalletView) {
      return tokenSummaries;
    }
    if (stableWalletTokens.length === 0) {
      return [];
    }
    const start = activePageIndex * PAGE_SIZE;
    return stableWalletTokens.slice(start, start + PAGE_SIZE);
  }, [isWalletView, stableWalletTokens, activePageIndex, tokenSummaries]);
  const walletPageListingTargets = useMemo(() => {
    if (!isWalletView || pageTokens.length === 0) {
      return [] as Array<{
        nftContract: string;
        tokenId: bigint;
        owner: string | null;
      }>;
    }
    return pageTokens.map((token) => ({
      nftContract: resolveTokenContractId(token),
      tokenId: token.id,
      owner: token.owner
    }));
  }, [isWalletView, pageTokens, resolveTokenContractId]);
  const walletPageListingsQuery = useQuery({
    queryKey: [
      'market',
      marketContractIdLabel,
      contractId,
      'wallet-page-listings',
      activePageIndex,
      marketActivityQuery.data?.updatedAt ?? 0,
      walletPageListingTargets.map(
        (token) =>
          `${token.nftContract}:${token.tokenId.toString()}:${token.owner ?? 'none'}`
      )
    ],
    enabled:
      !!marketClient &&
      !!marketContractIdLabel &&
      !marketNetworkMismatch &&
      props.isActiveTab &&
      isWalletView &&
      walletPageListingTargets.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: () => {
      if (!marketClient || !marketContractIdLabel) {
        return Promise.resolve(new Map<string, MarketActivityEvent>());
      }
      return resolveMissingListingsForTokens({
        marketClient,
        senderAddress: props.senderAddress,
        marketContractId: marketContractIdLabel,
        tokens: walletPageListingTargets,
        existing: activeListingIndex,
        concurrency: 2
      });
    }
  });
  const listingIndex = useMemo(
    () => mergeListingIndexes(activeListingIndex, walletPageListingsQuery.data),
    [activeListingIndex, walletPageListingsQuery.data]
  );

  const currentPageIds = useMemo(() => {
    if (isWalletView) {
      return pageTokens.map((token) => token.id);
    }
    return pageTokenIds;
  }, [isWalletView, pageTokenIds, pageTokens]);

  useEffect(() => {
    if (!props.isActiveTab) {
      return;
    }
    if (currentPageIds.length === 0) {
      return;
    }
    saveRecentPage(viewScopeKey, currentPageIds);
  }, [currentPageIds, props.isActiveTab, viewScopeKey]);

  useEffect(() => {
    if (isWalletView) {
      if (!walletTokenListSettled) {
        return;
      }
      if (walletAutoFollowLatest && pageIndex !== walletMaxPage) {
        setPageIndex(walletMaxPage);
        return;
      }
      if (walletUsingFastIndex || walletScanCountClamped >= walletScanCap) {
        initialPageSetRef.current = true;
      }
      return;
    }
    if (lastTokenId === undefined) {
      return;
    }
    if (initialPageSetRef.current) {
      return;
    }
    setPageIndex(collectionMaxPage);
    initialPageSetRef.current = true;
  }, [
    isWalletView,
    walletAutoFollowLatest,
    walletUsingFastIndex,
    walletMaxPage,
    walletTokenListSettled,
    pageIndex,
    walletScanCountClamped,
    walletScanCap,
    lastTokenId,
    collectionMaxPage
  ]);

  useEffect(() => {
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [pageIndex, maxPage]);

  const handleSelectToken = useCallback((id: bigint) => {
    autoSelectRef.current = false;
    if (isWalletView) {
      setWalletAutoFollowLatest(false);
      const walletTokenIndex = stableWalletTokens.findIndex(
        (token) => token.id === id
      );
      if (walletTokenIndex >= 0) {
        setPageIndex(Math.floor(walletTokenIndex / PAGE_SIZE));
      }
    } else if (lastTokenId !== undefined && id >= 0n && id <= lastTokenId) {
      initialPageSetRef.current = true;
      const page = Number(id / BigInt(PAGE_SIZE));
      if (Number.isSafeInteger(page) && page >= 0) {
        setPageIndex(page);
      }
    }
    setSelectedTokenId(id);
    if (isMobile) {
      setMobilePanel('preview');
    }
  }, [isMobile, isWalletView, stableWalletTokens, lastTokenId]);
  const walletSelectedTokenIndex = useMemo(() => {
    if (!isWalletView || selectedTokenId === null) {
      return -1;
    }
    return stableWalletTokens.findIndex((token) => token.id === selectedTokenId);
  }, [isWalletView, selectedTokenId, stableWalletTokens]);
  const canSelectPrev = useMemo(() => {
    if (selectedTokenId === null) {
      return false;
    }
    if (isWalletView) {
      return walletSelectedTokenIndex > 0;
    }
    return selectedTokenId > 0n;
  }, [isWalletView, selectedTokenId, walletSelectedTokenIndex]);
  const canSelectNext = useMemo(() => {
    if (selectedTokenId === null) {
      return false;
    }
    if (isWalletView) {
      return (
        walletSelectedTokenIndex >= 0 &&
        walletSelectedTokenIndex < stableWalletTokens.length - 1
      );
    }
    if (lastTokenId === undefined) {
      return false;
    }
    return selectedTokenId < lastTokenId;
  }, [
    isWalletView,
    selectedTokenId,
    walletSelectedTokenIndex,
    stableWalletTokens.length,
    lastTokenId
  ]);
  const handleSelectPreviousToken = useCallback(() => {
    if (selectedTokenId === null) {
      return;
    }
    if (isWalletView) {
      if (walletSelectedTokenIndex <= 0) {
        return;
      }
      const previous = stableWalletTokens[walletSelectedTokenIndex - 1];
      if (!previous) {
        return;
      }
      handleSelectToken(previous.id);
      return;
    }
    if (selectedTokenId > 0n) {
      handleSelectToken(selectedTokenId - 1n);
    }
  }, [
    handleSelectToken,
    isWalletView,
    selectedTokenId,
    stableWalletTokens,
    walletSelectedTokenIndex
  ]);
  const handleSelectNextToken = useCallback(() => {
    if (selectedTokenId === null) {
      return;
    }
    if (isWalletView) {
      if (
        walletSelectedTokenIndex < 0 ||
        walletSelectedTokenIndex >= stableWalletTokens.length - 1
      ) {
        return;
      }
      const next = stableWalletTokens[walletSelectedTokenIndex + 1];
      if (!next) {
        return;
      }
      handleSelectToken(next.id);
      return;
    }
    if (lastTokenId !== undefined && selectedTokenId < lastTokenId) {
      handleSelectToken(selectedTokenId + 1n);
    }
  }, [
    handleSelectToken,
    isWalletView,
    selectedTokenId,
    stableWalletTokens,
    walletSelectedTokenIndex,
    lastTokenId
  ]);

  useEffect(() => {
    lastTokenIdRef.current = lastTokenId;
  }, [lastTokenId]);

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

  const prefetchTokenSummaries = useCallback(
    async (tokenIds: bigint[], cancelled: () => boolean) => {
      if (tokenIds.length === 0 || isReadOnlyBackoffActive()) {
        return;
      }
      const queue = [...tokenIds];
      const runWorker = async () => {
        while (queue.length > 0 && !cancelled()) {
          const id = queue.shift();
          if (id === undefined) {
            return;
          }
          if (isReadOnlyBackoffActive()) {
            return;
          }
          await queryClient.prefetchQuery({
            queryKey: getTokenSummaryKey(contractId, id),
            queryFn: () => fetchTokenSummaryForView(id),
            staleTime: 300_000
          });
        }
      };
      const workers = Array.from(
        { length: Math.min(PREFETCH_PAGE_CONCURRENCY, queue.length) },
        () => runWorker()
      );
      await Promise.all(workers);
    },
    [contractId, fetchTokenSummaryForView, queryClient]
  );

  const warmThumbnailCache = useCallback(
    async (tokenIds: bigint[], cancelled: () => boolean) => {
      if (tokenIds.length === 0) {
        return;
      }
      const queue = [...tokenIds];
      const runWorker = async () => {
        while (queue.length > 0 && !cancelled()) {
          const id = queue.shift();
          if (id === undefined) {
            return;
          }
          const cached = queryClient.getQueryData(
            getTokenThumbnailKey(contractId, id)
          ) as { data?: Uint8Array | null } | null | undefined;
          if (cached?.data && cached.data.length > 0) {
            continue;
          }
          const result = await loadInscriptionThumbnailFromCache(contractId, id);
          if (cancelled()) {
            return;
          }
          if (result?.data && result.data.length > 0) {
            queryClient.setQueryData(
              getTokenThumbnailKey(contractId, id),
              result
            );
          }
        }
      };
      const workers = Array.from(
        { length: Math.min(PREFETCH_PAGE_CONCURRENCY, queue.length) },
        () => runWorker()
      );
      await Promise.all(workers);
    },
    [contractId, queryClient]
  );

  useEffect(() => {
    if (!props.isActiveTab) {
      return;
    }
    const pages = loadRecentPages(viewScopeKey);
    if (pages.length === 0) {
      return;
    }
    const ids = parseStoredIds(pages);
    if (ids.length === 0) {
      return;
    }
    const uniqueIds = Array.from(
      new Set(ids.map((id) => id.toString()))
    ).map((value) => BigInt(value));
    let cancelled = false;
    const isCancelled = () => cancelled;
    void warmThumbnailCache(uniqueIds, isCancelled);
    return () => {
      cancelled = true;
    };
  }, [props.isActiveTab, viewScopeKey, warmThumbnailCache]);

  useEffect(() => {
    if (!props.isActiveTab) {
      return;
    }
    if (currentPageIds.length === 0) {
      return;
    }
    let cancelled = false;
    const isCancelled = () => cancelled;
    void warmThumbnailCache(currentPageIds, isCancelled);
    return () => {
      cancelled = true;
    };
  }, [currentPageIds, props.isActiveTab, warmThumbnailCache]);


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
        if (
          walletTokenListSettled &&
          stableWalletTokens.length === 0 &&
          (walletUsingFastIndex || walletScanCountClamped >= walletScanCap)
        ) {
          setSelectedTokenId(null);
        }
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
  }, [
    isWalletView,
    pageTokens,
    pageTokenIds,
    selectedTokenId,
    walletTokenListSettled,
    stableWalletTokens.length,
    walletUsingFastIndex,
    walletScanCountClamped,
    walletScanCap
  ]);


  useEffect(() => {
    const focusRequest = focusRequestRef.current;
    if (!focusRequest) {
      return;
    }
    if (isWalletView) {
      return;
    }
    if (lastTokenId === undefined) {
      return;
    }
    const baseline = focusRequest.baseline ?? lastTokenId;
    if (focusRequest.baseline === null) {
      focusRequest.baseline = baseline;
    }
    setPageIndex(maxPage);
    setSelectedTokenId(lastTokenId);
    if (lastTokenId > baseline) {
      endRefresh();
    }
  }, [isWalletView, lastTokenId, maxPage, endRefresh]);

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
  const shouldRefreshSelectedToken =
    isWalletView ||
    !selectedToken ||
    !selectedToken.meta ||
    !selectedToken.tokenUri;
  const selectedTokenQuery = useQuery({
    queryKey:
      selectedTokenId !== null
        ? getTokenSummaryKey(contractId, selectedTokenId)
        : ['viewer', contractId, 'token', 'none'],
    queryFn: () =>
      selectedTokenId !== null
        ? fetchTokenSummaryForView(selectedTokenId)
        : Promise.resolve(null),
    enabled:
      props.isActiveTab &&
      selectedTokenId !== null &&
      shouldRefreshSelectedToken,
    initialData: selectedToken ?? undefined,
    staleTime: 300_000,
    refetchOnWindowFocus: false
  });
  const resolvedSelectedToken = selectedTokenQuery.data ?? selectedToken;
  const selectedTokenSourceContractId = resolveTokenContractId(
    resolvedSelectedToken ?? null
  );
  const selectedSourceLastTokenId = useMemo(() => {
    if (selectedTokenSourceContractId === legacyContractId) {
      return legacyLastTokenId ?? null;
    }
    return lastTokenId ?? null;
  }, [
    selectedTokenSourceContractId,
    legacyContractId,
    legacyLastTokenId,
    lastTokenId
  ]);
  const indexedChildrenQuery = useQuery({
    queryKey: [
      'viewer',
      selectedTokenSourceContractId,
      'relationship-children',
      selectedTokenId?.toString() ?? 'none',
      relationshipIndexVersion
    ],
    enabled:
      props.isActiveTab &&
      !isWalletView &&
      selectedTokenId !== null,
    queryFn: () =>
      selectedTokenId !== null
        ? loadRelationshipChildren({
            contractId: selectedTokenSourceContractId,
            parentId: selectedTokenId
          })
        : Promise.resolve([]),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });
  const knownChildren = useMemo(() => {
    const merged = new Set<string>();
    knownChildrenFromLoadedTokens.forEach((id) => merged.add(id.toString()));
    (indexedChildrenQuery.data ?? []).forEach((id) =>
      merged.add(id.toString())
    );
    return Array.from(merged)
      .map((value) => BigInt(value))
      .sort(sortBigIntAsc);
  }, [knownChildrenFromLoadedTokens, indexedChildrenQuery.data]);
  const runRelationshipSync = useCallback(
    (params: {
      contractId: string;
      client: ReturnType<typeof createXtrataClient>;
      shouldCancel?: () => boolean;
      onProgress?: (progress: RelationshipSyncProgress) => void;
    }) =>
      syncRelationshipIndex({
        client: params.client,
        contractId: params.contractId,
        senderAddress: props.senderAddress,
        shouldCancel: params.shouldCancel,
        onProgress: params.onProgress
      }),
    [props.senderAddress]
  );
  useEffect(() => {
    if (
      !allowBackgroundRelationshipSync ||
      !props.isActiveTab ||
      isWalletView ||
      !collectionGridReady
    ) {
      return;
    }
    let cancelled = false;
    const targets: Array<{
      contractId: string;
      client: ReturnType<typeof createXtrataClient>;
    }> = [{ contractId, client }];
    if (legacyClient && legacyContractId) {
      targets.push({ contractId: legacyContractId, client: legacyClient });
    }
    const runnableTargets = targets.filter((target) => target.client.supportsMintedIndex);
    if (runnableTargets.length === 0) {
      return;
    }
    const run = async () => {
      for (const target of runnableTargets) {
        if (cancelled) {
          return;
        }
        if (relationshipSyncInFlightRef.current[target.contractId]) {
          continue;
        }
        relationshipSyncInFlightRef.current[target.contractId] = true;
        try {
          const result = await runRelationshipSync({
            contractId: target.contractId,
            client: target.client,
            shouldCancel: () => cancelled
          });
          if (!cancelled && result.scanned > 0n) {
            setRelationshipIndexVersion((version) => version + 1);
          }
        } catch {
          // noop: sync errors are surfaced by explicit sync actions.
        } finally {
          relationshipSyncInFlightRef.current[target.contractId] = false;
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    allowBackgroundRelationshipSync,
    props.isActiveTab,
    isWalletView,
    collectionGridReady,
    contractId,
    client,
    legacyClient,
    legacyContractId,
    runRelationshipSync,
    lastTokenId
  ]);
  const selectedListingKey = resolvedSelectedToken
    ? buildMarketListingKey(
        selectedTokenSourceContractId,
        resolvedSelectedToken.id
      )
    : null;
  const selectedListingFromIndex = useMemo(() => {
    if (!selectedListingKey) {
      return null;
    }
    return listingIndex.get(selectedListingKey) ?? null;
  }, [listingIndex, selectedListingKey]);
  const shouldFetchSelectedListing =
    !!marketClient &&
    !!marketContractIdLabel &&
    selectedTokenId !== null &&
    props.isActiveTab &&
    !!selectedListingKey &&
    !selectedListingFromIndex &&
    isSameAddress(resolvedSelectedToken?.owner, marketContractIdLabel);
  const selectedListingQuery = useQuery({
    queryKey: [
      'market',
      marketContractIdLabel,
      'listing-by-token',
      selectedTokenSourceContractId,
      selectedTokenId?.toString() ?? 'none'
    ],
    enabled: shouldFetchSelectedListing,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!marketClient || !selectedTokenId) {
        return null;
      }
      const listingId = await marketClient.getListingIdByToken(
        selectedTokenSourceContractId,
        selectedTokenId,
        props.senderAddress
      );
      if (listingId === null) {
        return null;
      }
      const listing = await marketClient.getListing(
        listingId,
        props.senderAddress
      );
      if (!listing) {
        return null;
      }
      return {
        id: `onchain:${listingId.toString()}`,
        type: 'list',
        listingId,
        tokenId: listing.tokenId,
        price: listing.price,
        seller: listing.seller,
        nftContract: listing.nftContract
      } as MarketActivityEvent;
    }
  });
  const selectedListing = selectedListingFromIndex ?? selectedListingQuery.data ?? null;
  const [marketActionStatus, setMarketActionStatus] = useState<string | null>(null);
  const [marketActionPending, setMarketActionPending] = useState(false);

  useEffect(() => {
    setMarketActionStatus(null);
  }, [selectedTokenId, walletAddress]);

  const refreshMarketAndViewer = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    void queryClient.refetchQueries({
      queryKey: getViewerKey(contractId),
      type: 'active'
    });
    if (marketContractIdLabel) {
      void queryClient.invalidateQueries({
        queryKey: ['market', marketContractIdLabel]
      });
      void queryClient.refetchQueries({
        queryKey: ['market', marketContractIdLabel],
        type: 'active'
      });
    }
  }, [contractId, marketContractIdLabel, queryClient]);

  const resolveListingContractConfig = useCallback(
    (nftContractId: string): ContractConfig | null => {
      if (nftContractId === contractId) {
        return props.contract;
      }
      if (
        legacyContract &&
        legacyContractId &&
        nftContractId === legacyContractId
      ) {
        return legacyContract;
      }
      return null;
    },
    [contractId, legacyContract, legacyContractId, props.contract]
  );

  const resolveListingActionTarget = useCallback(
    async (
      listing: MarketActivityEvent,
      requirePrice: boolean
    ): Promise<{
      listingId: bigint;
      tokenId: bigint;
      seller: string;
      nftContract: string;
      price: bigint | null;
    } | null> => {
      if (
        listing.tokenId !== undefined &&
        listing.seller &&
        listing.nftContract &&
        (!requirePrice || listing.price !== undefined)
      ) {
        return {
          listingId: listing.listingId,
          tokenId: listing.tokenId,
          seller: listing.seller,
          nftContract: listing.nftContract,
          price: listing.price ?? null
        };
      }
      if (!marketClient) {
        return null;
      }
      const fetched = await marketClient.getListing(
        listing.listingId,
        props.senderAddress
      );
      if (!fetched) {
        return null;
      }
      return {
        listingId: listing.listingId,
        tokenId: fetched.tokenId,
        seller: fetched.seller,
        nftContract: fetched.nftContract,
        price: fetched.price
      };
    },
    [marketClient, props.senderAddress]
  );

  const handleBuyListing = useCallback(
    async (token: TokenSummary, listing: MarketActivityEvent) => {
      setMarketActionStatus(null);
      const validation = validateBuyAction({
        hasMarketContract: !!marketContract,
        walletAddress,
        networkMismatch: !!marketMismatch,
        marketNetworkMismatch,
        listingId: listing.listingId,
        listingSeller: listing.seller ?? null
      });
      if (!validation.ok || !marketContract || !walletAddress) {
        const message =
          getBuyActionValidationMessage(validation.reason) ??
          'Buy blocked: invalid inputs.';
        setMarketActionStatus(message);
        return;
      }

      setMarketActionPending(true);
      setMarketActionStatus(
        `Preparing purchase for token #${token.id.toString()}...`
      );
      try {
        const target = await resolveListingActionTarget(listing, true);
        if (!target || target.price === null) {
          setMarketActionPending(false);
          setMarketActionStatus(
            'Listing details are unavailable. Refresh market data and retry.'
          );
          return;
        }
        if (isSameAddress(target.seller, walletAddress)) {
          setMarketActionPending(false);
          setMarketActionStatus('You cannot buy your own listing.');
          return;
        }
        const listingContract = resolveListingContractConfig(target.nftContract);
        if (!listingContract) {
          setMarketActionPending(false);
          setMarketActionStatus(
            `Unsupported listing contract: ${target.nftContract}`
          );
          return;
        }
        const postConditions = buildMarketBuyPostConditions({
          settlement: marketSettlement,
          buyerAddress: walletAddress,
          amount: target.price,
          nftContract: listingContract,
          senderContract: marketContract,
          tokenId: target.tokenId
        });
        if (!postConditions) {
          setMarketActionPending(false);
          setMarketActionStatus(
            marketSettlementMessage ?? 'Unsupported payment token.'
          );
          return;
        }
        showContractCall({
          contractAddress: marketContract.address,
          contractName: marketContract.contractName,
          functionName: 'buy',
          functionArgs: [
            contractPrincipalCV(
              listingContract.address,
              listingContract.contractName
            ),
            uintCV(target.listingId)
          ],
          network: props.walletSession.network ?? marketContract.network,
          stxAddress: walletAddress,
          postConditionMode: PostConditionMode.Deny,
          postConditions,
          onFinish: (payload) => {
            setMarketActionPending(false);
            setMarketActionStatus(`Purchase submitted: ${payload.txId}`);
            refreshMarketAndViewer();
          },
          onCancel: () => {
            setMarketActionPending(false);
            setMarketActionStatus('Purchase cancelled or failed in wallet.');
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setMarketActionPending(false);
        if (message.toLowerCase().includes('post-condition')) {
          setMarketActionStatus(getMarketBuyFailureMessage(marketSettlement));
          return;
        }
        setMarketActionStatus(`Purchase failed: ${message}`);
      }
    },
    [
      marketContract,
      walletAddress,
      marketMismatch,
      marketNetworkMismatch,
      marketSettlement,
      marketSettlementMessage,
      resolveListingActionTarget,
      resolveListingContractConfig,
      props.walletSession.network,
      refreshMarketAndViewer
    ]
  );

  const handleCancelListing = useCallback(
    async (token: TokenSummary, listing: MarketActivityEvent) => {
      setMarketActionStatus(null);
      const validation = validateCancelAction({
        hasMarketContract: !!marketContract,
        walletAddress,
        networkMismatch: !!marketMismatch,
        marketNetworkMismatch,
        tokenId: token.id,
        listingId: listing.listingId,
        listingSeller: listing.seller ?? null
      });
      if (!validation.ok || !marketContract || !walletAddress) {
        const message =
          getCancelActionValidationMessage(validation.reason) ??
          'Cancel blocked: invalid inputs.';
        setMarketActionStatus(message);
        return;
      }

      setMarketActionPending(true);
      setMarketActionStatus(
        `Preparing cancel for token #${token.id.toString()}...`
      );
      try {
        const target = await resolveListingActionTarget(listing, false);
        if (!target) {
          setMarketActionPending(false);
          setMarketActionStatus(
            'Listing details are unavailable. Refresh market data and retry.'
          );
          return;
        }
        if (!isSameAddress(target.seller, walletAddress)) {
          setMarketActionPending(false);
          setMarketActionStatus('Only the seller can cancel this listing.');
          return;
        }
        const listingContract = resolveListingContractConfig(target.nftContract);
        if (!listingContract) {
          setMarketActionPending(false);
          setMarketActionStatus(
            `Unsupported listing contract: ${target.nftContract}`
          );
          return;
        }
        showContractCall({
          contractAddress: marketContract.address,
          contractName: marketContract.contractName,
          functionName: 'cancel',
          functionArgs: [
            contractPrincipalCV(
              listingContract.address,
              listingContract.contractName
            ),
            uintCV(target.listingId)
          ],
          network: props.walletSession.network ?? marketContract.network,
          stxAddress: walletAddress,
          postConditionMode: PostConditionMode.Deny,
          postConditions: [
            buildContractTransferPostCondition({
              nftContract: listingContract,
              senderContract: marketContract,
              tokenId: target.tokenId
            })
          ],
          onFinish: (payload) => {
            setMarketActionPending(false);
            setMarketActionStatus(`Cancel submitted: ${payload.txId}`);
            refreshMarketAndViewer();
          },
          onCancel: () => {
            setMarketActionPending(false);
            setMarketActionStatus('Cancel cancelled or failed in wallet.');
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setMarketActionPending(false);
        setMarketActionStatus(`Cancel failed: ${message}`);
      }
    },
    [
      marketContract,
      walletAddress,
      marketMismatch,
      marketNetworkMismatch,
      resolveListingActionTarget,
      resolveListingContractConfig,
      props.walletSession.network,
      refreshMarketAndViewer
    ]
  );

  const getTokenListing = useCallback(
    (token: TokenSummary) => {
      const key = buildMarketListingKey(resolveTokenContractId(token), token.id);
      return listingIndex.get(key) ?? null;
    },
    [listingIndex, resolveTokenContractId]
  );

  useEffect(() => {
    if (isWalletView) {
      return;
    }
    if (!props.isActiveTab) {
      return;
    }
    if (collectionGridReady) {
      return;
    }
    if (lastTokenId === undefined) {
      return;
    }
    if (selectedTokenId !== lastTokenId) {
      return;
    }
    if (selectedTokenQuery.data || selectedTokenQuery.isError) {
      setCollectionGridReady(true);
    }
  }, [
    collectionGridReady,
    isWalletView,
    lastTokenId,
    props.isActiveTab,
    selectedTokenId,
    selectedTokenQuery.data,
    selectedTokenQuery.isError
  ]);

  useEffect(() => {
    if (isWalletView) {
      return;
    }
    if (!props.isActiveTab) {
      return;
    }
    if (lastTokenId === undefined) {
      return;
    }
    const logKey = `${contractId}:${lastTokenId.toString()}`;
    if (loadOrderLogRef.current === logKey) {
      return;
    }
    loadOrderLogRef.current = logKey;
    const pageIds = buildTokenPage(lastTokenId, activePageIndex, PAGE_SIZE);
    logInfo('viewer', 'Collection load order summary', {
      contractId,
      lastTokenId: lastTokenId.toString(),
      collectionMaxPage,
      initialPageSet: initialPageSetRef.current,
      activePageIndex,
      pageIndex,
      pageIds:
        pageIds.length > 0
          ? `${pageIds[0].toString()}–${pageIds[pageIds.length - 1].toString()}`
          : 'none',
      prefetchTargetPage:
        allowSummaryPrefetch && activePageIndex > 0 ? activePageIndex - 1 : null,
      prefetchStrategy: allowSummaryPrefetch ? 'previous-page' : 'disabled'
    });
  }, [
    allowSummaryPrefetch,
    contractId,
    isWalletView,
    props.isActiveTab,
    lastTokenId,
    collectionMaxPage,
    activePageIndex,
    pageIndex
  ]);

  const collectionPageSettled =
    collectionQueries.length > 0 &&
    collectionQueries.every((query) => !query.isLoading);

  useEffect(() => {
    if (isWalletView) {
      return;
    }
    if (!allowSummaryPrefetch) {
      return;
    }
    if (!props.isActiveTab) {
      return;
    }
    if (!collectionGridReady) {
      return;
    }
    if (lastTokenId === undefined) {
      return;
    }
    if (!collectionPageSettled) {
      return;
    }
    const prevPage = activePageIndex - 1;
    if (prevPage < 0) {
      return;
    }
    const lastId = lastTokenId;
    const pageIds = buildTokenPage(lastId, prevPage, PAGE_SIZE);
    if (pageIds.length === 0) {
      return;
    }
    const scopeKey = `${contractId}:${lastId.toString()}:${prevPage}`;
    if (prefetchScopeRef.current === scopeKey) {
      return;
    }
    prefetchScopeRef.current = scopeKey;
    let cancelled = false;
    const isCancelled = () => cancelled;
    const run = async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, PREFETCH_PAGE_DELAY_MS)
      );
      const ordered = [...pageIds].reverse();
      await prefetchTokenSummaries(ordered, isCancelled);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    activePageIndex,
    allowSummaryPrefetch,
    collectionGridReady,
    collectionPageSettled,
    contractId,
    isWalletView,
    lastTokenId,
    prefetchTokenSummaries,
    props.isActiveTab
  ]);

  const collectionRangeLabel =
    lastTokenId === undefined
      ? 'Loading...'
      : tokenIds.length > 0
        ? `IDs ${tokenIds[0].toString()}–${tokenIds[tokenIds.length - 1].toString()}`
        : 'No tokens';
  const walletScanSuffix =
    walletUsingFastIndex
      ? ' · indexed'
      : walletScanCap <= 0
        ? ''
        : walletScanCountClamped < walletScanCap
          ? ` · scan ${walletScanCountClamped}/${walletScanCap} IDs`
          : walletScanLimitActive
            ? ` · scanned last ${WALLET_TOKEN_SCAN_LIMIT} IDs`
            : '';
  const walletRangeLabel = !hasWalletTarget
    ? 'No wallet selected'
    : lastTokenQuery.isError
      ? 'Unable to load'
      : lastTokenQuery.isLoading
        ? 'Loading...'
        : !walletTokenListSettled
          ? walletQueries.length > 0
            ? `${settledWalletTokens.length > 0 ? 'Refreshing' : 'Loading'} ${walletResolvedCount}/${walletQueries.length}`
            : 'Loading...'
        : stableWalletTokens.length === 0
          ? !walletUsingFastIndex && walletScanCountClamped < walletScanCap
            ? `Scanning for holdings${walletScanSuffix}`
            : `No tokens${walletScanSuffix}`
          : `Showing ${pageIndex * PAGE_SIZE + 1}–${pageIndex * PAGE_SIZE + pageTokens.length} of ${stableWalletTokens.length}${walletScanSuffix}`;
  const rangeLabel = isWalletView ? walletRangeLabel : collectionRangeLabel;
  const displayPageIndex = isWalletView ? pageIndex : activePageIndex;
  const showWalletLoadingGrid =
    isWalletView &&
    hasWalletTarget &&
    pageTokens.length === 0 &&
    !lastTokenQuery.isLoading &&
    (!walletTokenListSettled ||
      (!walletUsingFastIndex &&
        walletTokenListSettled &&
        walletScanCountClamped < walletScanCap));
  const useCompactPreviewLayout = isCompactPreviewViewport;

  return (
    <section
      className={`viewer app-section app-section--fit${props.collapsed ? ' module--collapsed' : ''}`}
      id="collection-viewer"
      data-mobile-view={mobilePanel}
    >
      <div className="panel">
        <div className="panel__header viewer-header">
          <div>
            <h2>{isWalletView ? walletViewerTitle : collectionViewerTitle}</h2>
          </div>
          <div className="panel__actions viewer-header__actions">
            <div className="viewer-toggle" role="tablist" aria-label="Viewer mode">
              <button
                type="button"
                className={`viewer-toggle__button${!isWalletView ? ' is-active' : ''}`}
                aria-pressed={!isWalletView}
                onClick={() => props.onModeChange('collection')}
              >
                {collectionModeLabel}
              </button>
              <button
                type="button"
                className={`viewer-toggle__button${isWalletView ? ' is-active' : ''}`}
                aria-pressed={isWalletView}
                onClick={() => props.onModeChange('wallet')}
              >
                {walletModeLabel}
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
                  {lastTokenId !== undefined
                    ? `Last ID: ${lastTokenId.toString()}`
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
                  onClick={() => {
                    if (isWalletView) {
                      setWalletAutoFollowLatest(false);
                    }
                    setPageIndex((current) => {
                      const base =
                        isWalletView || initialPageSetRef.current
                          ? current
                          : collectionMaxPage;
                      return Math.max(0, base - 1);
                    });
                  }}
                  disabled={displayPageIndex <= 0}
                >
                  Prev
                </button>
                <span className="viewer-controls__label">
                  Page {displayPageIndex + 1} of {maxPage + 1}
                </span>
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={() => {
                    if (isWalletView) {
                      setWalletAutoFollowLatest(false);
                    }
                    setPageIndex((current) => {
                      const base =
                        isWalletView || initialPageSetRef.current
                          ? current
                          : collectionMaxPage;
                      return Math.min(maxPage, base + 1);
                    });
                  }}
                  disabled={displayPageIndex >= maxPage}
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
                    !walletTokenListSettled && (
                      <p>
                        {walletQueries.length > 0
                          ? `${settledWalletTokens.length > 0 ? 'Refreshing' : 'Loading'} wallet holdings (${walletResolvedCount}/${walletQueries.length})...`
                          : 'Loading wallet holdings...'}
                      </p>
                    )}
                  {hasWalletTarget &&
                    walletTokenListSettled &&
                    stableWalletTokens.length === 0 && (
                      <p>
                        {!walletUsingFastIndex && walletScanCountClamped < walletScanCap
                          ? `Scanning older IDs for holdings (${walletScanCountClamped}/${walletScanCap})...`
                          : 'No tokens owned by this address yet.'}
                      </p>
                    )}
                </>
              ) : (
                <>
                  {legacyFallbackActive && (
                    <p>
                      Legacy fallback active. Showing the v1 collection while v2 is
                      unavailable.
                    </p>
                  )}
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
                    {pageTokens.map((token) => {
                      const tokenClient = resolveTokenClient(token);
                      const fallbackClient = resolveContentFallbackClient(token);
                      const tokenContractId = resolveTokenContractId(token);
                      const tokenListing = getTokenListing(token);
                      return (
                        <TokenCard
                          key={token.id.toString()}
                          token={token}
                          isSelected={token.id === selectedTokenId}
                          isListed={isTokenListed(token)}
                          listing={tokenListing}
                          walletAddress={walletAddress}
                          onSelect={handleSelectToken}
                          onBuyListing={handleBuyListing}
                          onCancelListing={handleCancelListing}
                          marketActionPending={marketActionPending}
                          marketBuySupported={isMarketSettlementSupported(marketSettlement)}
                          listingBadgeLabel={marketSettlementLabel}
                          listingBadgeVariant={marketSettlementBadgeVariant}
                          client={tokenClient}
                          fallbackClient={fallbackClient}
                          senderAddress={props.senderAddress}
                          contractId={tokenContractId}
                          isActiveTab={props.isActiveTab}
                        />
                      );
                    })}
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
                        const tokenClient = resolveTokenClient(token);
                        const fallbackClient = resolveContentFallbackClient(token);
                        const tokenContractId = resolveTokenContractId(token);
                        const tokenListing = getTokenListing(token);
                        return (
                          <TokenCard
                            key={token.id.toString()}
                            token={token}
                            isSelected={token.id === selectedTokenId}
                            isListed={isTokenListed(token)}
                            listing={tokenListing}
                            walletAddress={walletAddress}
                            onSelect={handleSelectToken}
                            onBuyListing={handleBuyListing}
                            onCancelListing={handleCancelListing}
                            marketActionPending={marketActionPending}
                            marketBuySupported={isMarketSettlementSupported(marketSettlement)}
                            listingBadgeLabel={marketSettlementLabel}
                            listingBadgeVariant={marketSettlementBadgeVariant}
                            client={tokenClient}
                            fallbackClient={fallbackClient}
                            senderAddress={props.senderAddress}
                            contractId={tokenContractId}
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
            {showWalletLoadingGrid && (
              <div className="square-frame">
                <div className="token-grid square-frame__content">
                  {Array.from({ length: PAGE_SIZE }, (_, index) => (
                    <LoadingTokenCard key={`wallet-loading-${index}`} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <TokenDetails
        token={resolvedSelectedToken ?? null}
        selectedTokenId={selectedTokenId}
        contract={
          resolveTokenContractId(resolvedSelectedToken ?? null) ===
            legacyContractId && legacyContract
            ? legacyContract
            : props.contract
        }
        contractId={resolveTokenContractId(resolvedSelectedToken ?? null)}
        viewerContractId={contractId}
        senderAddress={props.senderAddress}
        client={resolveTokenClient(resolvedSelectedToken ?? null)}
        fallbackClient={resolveContentFallbackClient(resolvedSelectedToken ?? null)}
        walletSession={props.walletSession}
        mode={props.mode}
        isActiveTab={props.isActiveTab}
        collapsed={props.collapsed}
        onToggleCollapse={props.onToggleCollapse}
        listing={selectedListing}
        marketContract={marketContract}
        marketContractError={marketContractError}
        marketContractId={marketContractIdLabel}
        marketPaymentTokenContractId={marketPaymentTokenContractId}
        marketMismatch={marketMismatch}
        marketNetworkMismatch={marketNetworkMismatch}
        isMobile={isMobile}
        useCompactPreviewLayout={useCompactPreviewLayout}
        mobilePanel={mobilePanel}
        onRequestGrid={handleMobileGridRequest}
        knownChildren={knownChildren}
        relationshipVersion={relationshipIndexVersion}
        lastTokenId={selectedSourceLastTokenId}
        onAddParentDraft={props.onAddParentDraft}
        onSelectToken={handleSelectToken}
        canSelectPrev={canSelectPrev}
        canSelectNext={canSelectNext}
        onSelectPrev={handleSelectPreviousToken}
        onSelectNext={handleSelectNextToken}
        marketActionStatus={marketActionStatus}
        marketActionPending={marketActionPending}
        usdPriceBook={usdPriceBook}
        onBuyListing={handleBuyListing}
        onCancelListing={handleCancelListing}
      />
    </section>
  );
}
