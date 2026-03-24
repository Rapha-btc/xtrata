import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent
} from 'react';
import {
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  uintCV,
  type ClarityValue
} from '@stacks/transactions';
import { useQueryClient } from '@tanstack/react-query';
import { PUBLIC_CONTRACT, PUBLIC_MINT_RESTRICTIONS } from './config/public';
import CollectionCoverImage from './components/CollectionCoverImage';
import { getContractId } from './lib/contract/config';
import { resolveCollectionMintPaymentModel } from './lib/collection-mint/payment-model';
import {
  isDisplayedCollectionMintFree,
  resolveCollectionMintPricingMetadata,
  resolveDisplayedCollectionMintPrice,
  type CollectionMintPricingMetadata
} from './lib/collection-mint/pricing-metadata';
import { resolveCollectionMintPriceTone } from './lib/collection-mint/price-tone';
import { resolveCollectionContractLink } from './lib/collections/contract-link';
import {
  getCollectionPageDisplayOrder,
  sortPublicCollectionCards
} from './lib/collections/public-order';
import { isRateLimitError, isReadOnlyNetworkError } from './lib/contract/read-only';
import { getApiBaseUrls } from './lib/network/config';
import { formatMicroStxWithUsd } from './lib/pricing/format';
import { useUsdPriceBook } from './lib/pricing/hooks';
import { getViewerKey } from './lib/viewer/queries';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { getWalletLookupState } from './lib/wallet/lookup';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getNetworkFromAddress, getNetworkMismatch } from './lib/network/guard';
import { toStacksNetwork } from './lib/network/stacks';
import type { NetworkType } from './lib/network/types';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from './lib/theme/preferences';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import AddressLabel from './components/AddressLabel';
import MintScreen from './screens/MintScreen';
import PublicMarketScreen from './screens/PublicMarketScreen';
import ViewerScreen, { type ViewerMode } from './screens/ViewerScreen';

const walletSessionStore = createWalletSessionStore();

const WORKSPACE_PATH = '/workspace';
const LIVE_MINT_REFRESH_INTERVAL_MS = 3 * 60_000;
const LIVE_MINT_ERROR_BACKOFF_MS = 5 * 60_000;
const LIVE_MINT_RATE_LIMIT_BACKOFF_MS = 15 * 60_000;
const SIMPLE_HOME_INITIAL_SCROLL_NUDGE_PX = 18;

type StarterDoc = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

type LiveCollectionRecord = {
  id: string;
  slug: string;
  display_name: string | null;
  artist_address: string | null;
  state: string;
  contract_address: string | null;
  metadata?: Record<string, unknown> | null;
};

type CollectionContractTarget = {
  address: string;
  contractName: string;
  network: NetworkType;
};

type LiveMintStatus = {
  paused: boolean | null;
  finalized: boolean | null;
  mintPrice: bigint | null;
  activePhaseId: bigint | null;
  activePhaseMintPrice: bigint | null;
  effectiveMintPrice: bigint | null;
  maxSupply: bigint | null;
  mintedCount: bigint | null;
  reservedCount: bigint | null;
  remaining: bigint | null;
  refreshedAt: number;
};

type LiveCollectionCard = {
  id: string;
  slug: string;
  name: string;
  artistAddress: string;
  displayOrder: number | null;
  symbol: string;
  description: string;
  livePath: string;
  coverImage: Record<string, unknown> | null;
  fallbackCoreContractId: string | null;
  fallbackSupply: bigint | null;
  contractTarget: CollectionContractTarget | null;
  templateVersion: string;
  pricing: CollectionMintPricingMetadata;
};

type SimpleHomeSectionKey = 'live-drops' | 'home-viewer' | 'market' | 'mint' | 'starter-docs';

const STARTER_DOCS: StarterDoc[] = [
  {
    title: 'How to inscribe on Xtrata',
    description: 'Plain-language walkthrough: begin, upload batches, then seal.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/xtrata-quickstart.md',
    cta: 'Read quickstart'
  },
  {
    title: 'Inscription handbook',
    description: 'Deeper technical guide for builders integrating reads and rendering.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/xtrata-inscription-handbook.md',
    cta: 'Open handbook'
  },
  {
    title: 'Artist collection launch guide',
    description: 'How artists launch collection mints and manage collection setup.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/artist-guides/collection-launch-guide.md',
    cta: 'Open artist guide'
  },
  {
    title: 'Collection template deploy guide',
    description:
      'Simplest path for artists to deploy a collection contract through the manage portal.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/artist-guides/collection-template-deploy-guide.md',
    cta: 'Open deploy guide'
  }
];

const HOME_HERO_CONTENT = {
  title: 'On-chain executable inscription data for artists and apps',
  subline: 'Smart infrastructure for recursive web3 applications and NFTs.',
  tag: 'Executable data layer anchored to bitcoin'
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toMultilineText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return null;
};

const isCollectionVisibleOnPublicPage = (metadata: unknown) => {
  const metadataRecord = toRecord(metadata);
  const collectionPage = toRecord(metadataRecord?.collectionPage);
  return toBoolean(collectionPage?.showOnPublicPage) === true;
};

const toBigIntOrNull = (value: unknown) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
};

const formatBigintLabel = (value: bigint | null) =>
  value === null ? 'Unknown' : value.toString();

const parseUintCv = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (parsed && typeof parsed === 'object' && 'value' in (parsed as Record<string, unknown>)) {
    return toBigIntOrNull((parsed as { value?: unknown }).value);
  }
  return toBigIntOrNull(parsed);
};

const unwrapReadOnly = (value: ClarityValue) => {
  if (value.type === ClarityType.ResponseOk) {
    return value.value;
  }
  if (value.type === ClarityType.ResponseErr) {
    const parsed = cvToValue(value.value) as unknown;
    throw new Error(String(parsed ?? 'Read-only call failed.'));
  }
  return value;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }
  if (!error) {
    return 'Unknown error';
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const shouldTryReadOnlyFallback = (error: unknown) =>
  isRateLimitError(error) || isReadOnlyNetworkError(error);

const toMintStatusErrorMessage = (error: unknown) => {
  if (isRateLimitError(error)) {
    return `Upstream API rate-limited this request. Mint status refresh is paused and will retry in about ${Math.round(
      LIVE_MINT_RATE_LIMIT_BACKOFF_MS / 60_000
    )} minutes.`;
  }
  return getErrorMessage(error);
};

const isCollectionSoldOut = (status: LiveMintStatus | null) => {
  if (!status) {
    return false;
  }
  if (status.remaining !== null && status.remaining <= 0n) {
    return true;
  }
  if (status.finalized === true) {
    return true;
  }
  if (
    status.maxSupply !== null &&
    status.mintedCount !== null &&
    status.mintedCount >= status.maxSupply
  ) {
    return true;
  }
  return false;
};

const buildMintStateLabel = (status: LiveMintStatus | null) => {
  if (!status) {
    return 'Published';
  }
  if (status.finalized) {
    return 'Finalized';
  }
  if (status.remaining !== null && status.remaining <= 0n) {
    return 'Sold out';
  }
  if (
    status.maxSupply !== null &&
    status.mintedCount !== null &&
    status.mintedCount >= status.maxSupply
  ) {
    return 'Sold out';
  }
  if (status.paused) {
    return 'Paused';
  }
  return 'Live';
};

const resolveDisplayedMintPrice = (
  collection: LiveCollectionCard,
  status: LiveMintStatus | null
) => {
  const onChainPrice = status?.effectiveMintPrice ?? null;
  if (!status) {
    return null;
  }
  if (status.activePhaseMintPrice !== null) {
    return onChainPrice;
  }
  const paymentModel = resolveCollectionMintPaymentModel(collection.templateVersion);
  return resolveDisplayedCollectionMintPrice({
    activePhaseMintPriceMicroStx: status.activePhaseMintPrice,
    onChainMintPriceMicroStx: onChainPrice,
    paymentModel,
    pricing: collection.pricing,
    statusMintPriceMicroStx: status.mintPrice
  });
};

const isCollectionFreeMint = (
  collection: LiveCollectionCard,
  status: LiveMintStatus | null
) => {
  if (!status) {
    return false;
  }
  return isDisplayedCollectionMintFree({
    activePhaseMintPriceMicroStx: status.activePhaseMintPrice,
    paymentModel: resolveCollectionMintPaymentModel(collection.templateVersion),
    pricing: collection.pricing,
    statusMintPriceMicroStx: status.mintPrice
  });
};

const resolveCollectionContractTarget = (
  collection: LiveCollectionRecord
): CollectionContractTarget | null => {
  const metadata = toRecord(collection.metadata);
  const resolved = resolveCollectionContractLink({
    collectionId: toText(collection.id),
    collectionSlug: toText(collection.slug),
    contractAddress: toText(collection.contract_address),
    metadata
  });
  if (!resolved) {
    return null;
  }
  return {
    address: resolved.address,
    contractName: resolved.contractName,
    network: getNetworkFromAddress(resolved.address) ?? 'mainnet'
  };
};

const loadPublicMintStatus = async (
  contract: CollectionContractTarget
): Promise<LiveMintStatus> => {
  const apiBaseUrls = getApiBaseUrls(contract.network);
  const senderAddress = contract.address;
  const readOnly = async (functionName: string, functionArgs: ClarityValue[] = []) => {
    let lastError: unknown = null;
    for (let index = 0; index < apiBaseUrls.length; index += 1) {
      const apiBaseUrl = apiBaseUrls[index];
      try {
        const response = await callReadOnlyFunction({
          contractAddress: contract.address,
          contractName: contract.contractName,
          functionName,
          functionArgs,
          senderAddress,
          network: toStacksNetwork(contract.network, apiBaseUrl)
        });
        return unwrapReadOnly(response);
      } catch (error) {
        lastError = error;
        const hasFallback = index < apiBaseUrls.length - 1;
        if (hasFallback && shouldTryReadOnlyFallback(error)) {
          continue;
        }
        break;
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error(getErrorMessage(lastError));
  };

  const [
    pausedCv,
    finalizedCv,
    mintPriceCv,
    activePhaseCv,
    maxSupplyCv,
    mintedCountCv,
    reservedCountCv
  ] = await Promise.all([
    readOnly('is-paused'),
    readOnly('get-finalized'),
    readOnly('get-mint-price'),
    readOnly('get-active-phase'),
    readOnly('get-max-supply'),
    readOnly('get-minted-count'),
    readOnly('get-reserved-count')
  ]);

  const paused = toBoolean(cvToValue(pausedCv)) ?? null;
  const finalized = toBoolean(cvToValue(finalizedCv)) ?? null;
  const mintPrice = parseUintCv(mintPriceCv);
  const activePhaseId = parseUintCv(activePhaseCv);
  let activePhaseMintPrice: bigint | null = null;
  if (activePhaseId !== null && activePhaseId > 0n) {
    const phaseValue = await readOnly('get-phase', [uintCV(activePhaseId)]);
    if (phaseValue.type === ClarityType.OptionalSome) {
      const tuple = phaseValue.value;
      if (tuple.type === ClarityType.Tuple) {
        const phasePriceCv = tuple.data['mint-price'];
        if (phasePriceCv) {
          activePhaseMintPrice = parseUintCv(phasePriceCv);
        }
      }
    }
  }

  const maxSupply = parseUintCv(maxSupplyCv);
  const mintedCount = parseUintCv(mintedCountCv);
  const reservedCount = parseUintCv(reservedCountCv);
  const effectiveMintPrice = activePhaseMintPrice ?? mintPrice;
  const remaining =
    maxSupply === null || mintedCount === null || reservedCount === null
      ? null
      : maxSupply <= mintedCount + reservedCount
        ? 0n
        : maxSupply - mintedCount - reservedCount;

  return {
    paused,
    finalized,
    mintPrice,
    activePhaseId,
    activePhaseMintPrice,
    effectiveMintPrice,
    maxSupply,
    mintedCount,
    reservedCount,
    remaining,
    refreshedAt: Date.now()
  };
};

const parseLiveCollectionsResponse = async (response: Response) => {
  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Collections response is not JSON: ${text.slice(0, 120)}`);
    }
  }
  if (!response.ok) {
    const message =
      toText(toRecord(payload)?.error) || `Failed to load collections (${response.status})`;
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error('Collections response is not an array.');
  }
  return payload as LiveCollectionRecord[];
};

export default function SimplePublicHome() {
  const contract = PUBLIC_CONTRACT;
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialTheme()
  );
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [walletPending, setWalletPending] = useState(false);
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [viewerFocusKey, setViewerFocusKey] = useState<number | null>(null);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('collection');
  const [viewerCollapsed, setViewerCollapsed] = useState(false);
  const [marketCollapsed, setMarketCollapsed] = useState(true);
  const [mintCollapsed, setMintCollapsed] = useState(false);
  const [docsCollapsed, setDocsCollapsed] = useState(false);
  const [liveCollections, setLiveCollections] = useState<LiveCollectionRecord[]>([]);
  const [liveCollectionsLoading, setLiveCollectionsLoading] = useState(false);
  const [liveCollectionsError, setLiveCollectionsError] = useState<string | null>(null);
  const [liveMintStatusByCollectionId, setLiveMintStatusByCollectionId] = useState<
    Record<string, LiveMintStatus | null>
  >({});
  const [liveMintStatusLoadingByCollectionId, setLiveMintStatusLoadingByCollectionId] =
    useState<Record<string, boolean>>({});
  const [liveMintStatusErrorByCollectionId, setLiveMintStatusErrorByCollectionId] =
    useState<Record<string, string | null>>({});
  const tabGuard = useActiveTabGuard();
  const queryClient = useQueryClient();

  const contractId = getContractId(contract);

  const walletLookupState = useMemo(
    () => getWalletLookupState('', walletSession.address ?? null),
    [walletSession.address]
  );
  const readOnlySender = walletSession.address ?? contract.address;
  const mismatch = getNetworkMismatch(contract.network, walletSession.network);
  const liveCollectionCards = useMemo<LiveCollectionCard[]>(() => {
    const cards = liveCollections
      .filter(
        (collection) =>
          String(collection.state ?? '')
            .trim()
            .toLowerCase() === 'published' &&
          isCollectionVisibleOnPublicPage(collection.metadata)
      )
      .map((collection) => {
        const metadata = toRecord(collection.metadata);
        const metadataCollection = toRecord(metadata?.collection);
        const metadataCollectionPage = toRecord(metadata?.collectionPage);
        const metadataPricing = toRecord(metadata?.pricing);
        const fallbackSupply = toBigIntOrNull(metadataCollection?.supply);
        const name =
          toText(metadataCollection?.name) ||
          toText(collection.display_name) ||
          toText(collection.slug) ||
          collection.id;
        const symbol = toText(metadataCollection?.symbol);
        const description =
          toMultilineText(metadataCollectionPage?.description) ||
          toMultilineText(metadataCollection?.description) ||
          'This collection is live and ready for minting.';
        const liveKey = toText(collection.slug) || collection.id;
        const livePath = `/collection/${encodeURIComponent(liveKey)}`;
        const contractTarget = resolveCollectionContractTarget(collection);
        return {
          id: collection.id,
          slug: toText(collection.slug),
          name,
          artistAddress: toText(collection.artist_address),
          displayOrder: getCollectionPageDisplayOrder(collection.metadata),
          symbol: symbol.length > 0 ? symbol : 'N/A',
          description,
          livePath,
          coverImage: toRecord(metadataCollectionPage?.coverImage),
          fallbackCoreContractId: toText(metadata?.coreContractId) || null,
          fallbackSupply,
          contractTarget,
          templateVersion: toText(metadata?.templateVersion),
          pricing: resolveCollectionMintPricingMetadata(metadataPricing)
        };
      });
    return sortPublicCollectionCards(cards);
  }, [liveCollections]);
  const usdPriceBook = useUsdPriceBook({
    enabled: liveCollectionCards.length > 0
  }).data ?? null;

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'xtrata Public',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const hasHiroApiKey =
    typeof __XSTRATA_HAS_HIRO_KEY__ !== 'undefined' &&
    __XSTRATA_HAS_HIRO_KEY__;
  const showRateLimitWarning = rateLimitWarning && !hasHiroApiKey;

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.matchMedia('(max-width: 959px)').matches) {
      return;
    }
    if (window.scrollY > 4) {
      return;
    }
    const hash = window.location.hash.trim().toLowerCase();
    if (hash && hash !== '#') {
      return;
    }

    let frameOne = 0;
    let frameTwo = 0;
    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        window.scrollBy({
          top: SIMPLE_HOME_INITIAL_SCROLL_NUDGE_PX,
          left: 0,
          behavior: 'auto'
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
    };
  }, []);

  useEffect(() => {
    if (hasHiroApiKey) {
      return;
    }
    const handler = () => {
      setRateLimitWarning(true);
    };
    window.addEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    return () => {
      window.removeEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    };
  }, [hasHiroApiKey]);

  useEffect(() => {
    const controller = new AbortController();
    const loadLiveCollections = async () => {
      setLiveCollectionsLoading(true);
      setLiveCollectionsError(null);
      try {
        const response = await fetch('/collections?publishedOnly=1&publicVisibleOnly=1', {
          signal: controller.signal
        });
        const payload = await parseLiveCollectionsResponse(response);
        if (controller.signal.aborted) {
          return;
        }
        setLiveCollections(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Unable to load live collections.';
        setLiveCollectionsError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLiveCollectionsLoading(false);
        }
      }
    };

    void loadLiveCollections();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const activeIds = new Set(liveCollectionCards.map((collection) => collection.id));
    setLiveMintStatusByCollectionId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([collectionId]) => activeIds.has(collectionId))
      )
    );
    setLiveMintStatusLoadingByCollectionId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([collectionId]) => activeIds.has(collectionId))
      )
    );
    setLiveMintStatusErrorByCollectionId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([collectionId]) => activeIds.has(collectionId))
      )
    );

    const cardsWithContracts = liveCollectionCards.filter(
      (
        collection
      ): collection is LiveCollectionCard & {
        contractTarget: CollectionContractTarget;
      } => collection.contractTarget !== null
    );
    const shouldRefreshLiveMintStatus =
      cardsWithContracts.length > 0 && tabGuard.isActive;
    if (!shouldRefreshLiveMintStatus) {
      return () => {
        cancelled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    const scheduleRefresh = (delayMs: number) => {
      if (cancelled) {
        return;
      }
      timeoutId = window.setTimeout(() => {
        void refreshMintStatus();
      }, delayMs);
    };

    const refreshMintStatus = async () => {
      setLiveMintStatusLoadingByCollectionId((current) => {
        const next = { ...current };
        cardsWithContracts.forEach((collection) => {
          next[collection.id] = true;
        });
        return next;
      });

      const settled = await Promise.all(
        cardsWithContracts.map(async (collection) => {
          try {
            const status = await loadPublicMintStatus(collection.contractTarget);
            return {
              id: collection.id,
              status,
              error: null as string | null,
              rateLimited: false
            };
          } catch (error) {
            return {
              id: collection.id,
              status: null as LiveMintStatus | null,
              error: toMintStatusErrorMessage(error),
              rateLimited: isRateLimitError(error)
            };
          }
        })
      );

      if (cancelled) {
        return;
      }

      const hasRateLimitedEntry = settled.some((entry) => entry.rateLimited);
      const hasErrorEntry = settled.some((entry) => entry.error !== null);

      setLiveMintStatusByCollectionId((current) => {
        const next = { ...current };
        settled.forEach((entry) => {
          if (entry.status) {
            next[entry.id] = entry.status;
          } else if (!next[entry.id]) {
            next[entry.id] = null;
          }
        });
        return next;
      });
      setLiveMintStatusErrorByCollectionId((current) => {
        const next = { ...current };
        settled.forEach((entry) => {
          next[entry.id] = entry.error;
        });
        return next;
      });
      setLiveMintStatusLoadingByCollectionId((current) => {
        const next = { ...current };
        cardsWithContracts.forEach((collection) => {
          next[collection.id] = false;
        });
        return next;
      });

      const nextDelayMs = hasRateLimitedEntry
        ? LIVE_MINT_RATE_LIMIT_BACKOFF_MS
        : hasErrorEntry
          ? LIVE_MINT_ERROR_BACKOFF_MS
          : LIVE_MINT_REFRESH_INTERVAL_MS;
      scheduleRefresh(nextDelayMs);
    };

    void refreshMintStatus();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [liveCollectionCards, tabGuard.isActive]);

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTheme = coerceThemeMode(event.target.value);
    setThemeMode(nextTheme);
    applyThemeToDocument(nextTheme);
    writeThemePreference(nextTheme);
  };

  const focusSection = (key: SimpleHomeSectionKey) => {
    if (key === 'home-viewer') {
      setViewerCollapsed(false);
    }
    if (key === 'market') {
      setMarketCollapsed(false);
    }
    if (key === 'mint') {
      setMintCollapsed(false);
    }
    if (key === 'starter-docs') {
      setDocsCollapsed(false);
    }
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const anchor = document.getElementById(key);
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        window.history.replaceState(null, '', `#${key}`);
      });
    }
  };

  const handleNavJump = (
    event: MouseEvent<HTMLAnchorElement>,
    key: SimpleHomeSectionKey
  ) => {
    event.preventDefault();
    focusSection(key);
  };

  const handleConnectWallet = async () => {
    setWalletPending(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
    } finally {
      setWalletPending(false);
    }
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    try {
      await walletAdapter.disconnect();
      setWalletSession(walletAdapter.getSession());
    } finally {
      setWalletPending(false);
    }
  };

  const handleInscriptionSealed = (payload: { txId: string }) => {
    setViewerFocusKey((prev) => (prev ?? 0) + 1);
    setViewerMode('collection');
    queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    const anchor = document.getElementById('home-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line no-console
    console.log(`[mint] Seal submitted, txId=${payload.txId}`);
  };

  return (
    <div className="app simple-home">
      <header className="app__header">
        <section className="panel simple-home__hero" aria-label="Simplified homepage">
          <div className="simple-home__hero-main">
            <div className="simple-home__hero-copy">
              <h1 className="app__title">
                XTRATA <span className="app__title-tag simple-home__title-tag">{HOME_HERO_CONTENT.tag}</span>
              </h1>
              <h2 className="simple-home__title">{HOME_HERO_CONTENT.title}</h2>
              <p className="simple-home__subline">{HOME_HERO_CONTENT.subline}</p>
            </div>
          </div>

          <div className="simple-home__wallet">
            <div className="simple-home__wallet-actions">
              <span className="badge badge--neutral">
                {walletSession.isConnected ? 'Connected' : 'Disconnected'}
              </span>
              {walletSession.isConnected ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleDisconnectWallet}
                  disabled={walletPending}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={handleConnectWallet}
                  disabled={walletPending}
                >
                  {walletPending ? 'Connecting...' : 'Connect wallet'}
                </button>
              )}
            </div>
            <div className="simple-home__wallet-identity">
              <span className="simple-home__wallet-label">Connected wallet</span>
              <AddressLabel
                className="simple-home__wallet-address"
                address={walletSession.address}
                network={walletSession.network}
                fallback="Not connected"
              />
              <span className="simple-home__wallet-network">
                Network: {walletSession.network ?? 'unknown'}
              </span>
            </div>
          </div>

          <div className="simple-home__tools">
            <div className="simple-home__actions">
              <a className="button" href="#mint" onClick={(event) => handleNavJump(event, 'mint')}>
                Inscribe
              </a>
              <a
                className="button button--ghost"
                href="#live-drops"
                onClick={(event) => handleNavJump(event, 'live-drops')}
              >
                Mint
              </a>
              <a
                className="button button--ghost"
                href="#market"
                onClick={(event) => handleNavJump(event, 'market')}
              >
                Marketplace
              </a>
              <a
                className="button button--ghost"
                href="#starter-docs"
                onClick={(event) => handleNavJump(event, 'starter-docs')}
              >
                Docs
              </a>
              <a className="button button--ghost" href={WORKSPACE_PATH}>
                Workspace
              </a>
            </div>
            <label className="theme-select" htmlFor="simple-home-theme-select">
              <span className="theme-select__label">Theme</span>
              <select
                id="simple-home-theme-select"
                className="theme-select__control"
                value={themeMode}
                onChange={handleThemeChange}
                onInput={handleThemeChange}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {mismatch && (
          <div className="alert simple-home__alert">
            Wallet is on {mismatch.actual}. Switch to {mismatch.expected} to mint with this
            contract.
          </div>
        )}

        {showRateLimitWarning && (
          <div className="alert simple-home__alert">
            <div>
              <strong>Rate limit detected.</strong> No Hiro API key is configured for the dev
              proxy. Set `HIRO_API_KEYS` (or `HIRO_API_KEY`) in `.env.local` and restart the dev
              server.
            </div>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setRateLimitWarning(false)}
            >
              Dismiss
            </button>
          </div>
        )}
      </header>

      {!tabGuard.isActive && (
        <div className="app__notice">
          <div className="alert">
            <div>
              <strong>Another xtrata tab is active.</strong> This tab is paused to avoid loading
              conflicts.
            </div>
            <button className="button" type="button" onClick={tabGuard.takeControl}>
              Make this tab active
            </button>
          </div>
        </div>
      )}

      <main className="app__main simple-home__main">
        <section className="panel app-section simple-home__drops" id="live-drops">
          <div className="panel__header">
            <div>
              <h2>Live Collection Mints</h2>
              <p>
                Featured Collections
              </p>
            </div>
            <div className="panel__actions">
              <span className="badge badge--neutral">
                {liveCollectionsLoading ? 'Refreshing' : `${liveCollectionCards.length} live`}
              </span>
            </div>
          </div>
          <div className="panel__body">
            {liveCollectionsError && <div className="alert">{liveCollectionsError}</div>}
            {!liveCollectionsError && liveCollectionsLoading && liveCollectionCards.length === 0 && (
              <p>Loading live drops...</p>
            )}
            {!liveCollectionsError &&
              !liveCollectionsLoading &&
              liveCollectionCards.length === 0 && (
                <p>No live drops are currently published to the public homepage.</p>
              )}
            {liveCollectionCards.length > 0 && (
              <div className="public-live-collections">
                {liveCollectionCards.map((collection) => {
                  const mintStatus = liveMintStatusByCollectionId[collection.id] ?? null;
                  const mintStatusLoading = Boolean(
                    liveMintStatusLoadingByCollectionId[collection.id]
                  );
                  const mintStatusError = liveMintStatusErrorByCollectionId[collection.id] ?? null;
                  const effectiveMintPrice = resolveDisplayedMintPrice(collection, mintStatus);
                  const effectiveMintPriceDisplay = formatMicroStxWithUsd(
                    effectiveMintPrice,
                    usdPriceBook
                  );
                  const maxSupply = mintStatus?.maxSupply ?? collection.fallbackSupply ?? null;
                  const mintedCount = mintStatus?.mintedCount ?? null;
                  const remainingCount =
                    mintStatus?.remaining ??
                    (maxSupply !== null && mintedCount !== null
                      ? maxSupply <= mintedCount
                        ? 0n
                        : maxSupply - mintedCount
                      : null);
                  const mintStateLabel = buildMintStateLabel(mintStatus);
                  const soldOut = isCollectionSoldOut(mintStatus);
                  const freeMint = isCollectionFreeMint(collection, mintStatus);
                  const priceTone = resolveCollectionMintPriceTone({
                    displayedMintPriceMicroStx: effectiveMintPrice,
                    freeMint
                  });
                  const statusBadge = soldOut ? (
                    <span className="badge badge--compact badge--sold-out">Sold out</span>
                  ) : freeMint ? (
                    <span className="badge badge--compact badge--free-mint">Free mint</span>
                  ) : null;
                  return (
                    <a
                      className="public-live-collections__card"
                      key={collection.id}
                      href={collection.livePath}
                      aria-label={`Open ${collection.name} collection page`}
                    >
                      <div className="public-live-collections__media-stack">
                        <div className="public-live-collections__media">
                          <CollectionCoverImage
                            coverImage={collection.coverImage}
                            collectionId={collection.id}
                            fallbackCoreContractId={collection.fallbackCoreContractId}
                            alt={`${collection.name} cover`}
                            placeholderClassName="public-live-collections__media-placeholder"
                            emptyMessage="Collection cover image not set yet."
                            loadingMessage="Resolving cover image..."
                            errorMessage="Collection cover image unavailable."
                            debugLabel={`simple-home-card:${collection.id}`}
                          />
                        </div>
                        <div
                          className={`public-live-collections__media-price public-live-collections__media-price--${priceTone}`}
                        >
                          Mint price
                          <strong>{effectiveMintPriceDisplay.primary}</strong>
                          <span className="public-live-collections__media-price-subtle">
                            {effectiveMintPriceDisplay.secondary ?? '\u00a0'}
                          </span>
                        </div>
                      </div>
                      <div className="public-live-collections__card-header">
                        <h3>{collection.name}</h3>
                        <div className="public-live-collections__card-badges">
                          <span className="badge badge--neutral">{collection.symbol}</span>
                          {statusBadge}
                        </div>
                      </div>
                      <div className="public-live-collections__artist">
                        <span className="meta-label">Artist</span>
                        <AddressLabel
                          className="public-live-collections__artist-label"
                          address={collection.artistAddress || null}
                          fallback="Artist unavailable"
                        />
                      </div>
                      <p className="public-live-collections__description">{collection.description}</p>
                      <div className="public-live-collections__summary">
                        <span className="public-live-collections__stat">
                          Supply: <strong>{formatBigintLabel(maxSupply)}</strong>
                        </span>
                        <span className="public-live-collections__stat">
                          Minted: <strong>{formatBigintLabel(mintedCount)}</strong>
                        </span>
                        <span className="public-live-collections__stat">
                          Remaining: <strong>{formatBigintLabel(remainingCount)}</strong>
                        </span>
                        <span className="public-live-collections__stat">
                          State: <strong>{mintStateLabel}</strong>
                        </span>
                      </div>
                      <div className="public-live-collections__card-meta">
                        <p className="meta-value">
                          Collection: <code>{collection.slug || collection.id}</code>
                        </p>
                        {mintStatusLoading && (
                          <p className="meta-value">Refreshing mint status...</p>
                        )}
                        {mintStatusError && (
                          <p className="meta-value">
                            Mint status unavailable: {mintStatusError}
                          </p>
                        )}
                      </div>
                      <div className="mint-actions">
                        <span className="button button--ghost button--mini">
                          Open collection page
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div id="home-viewer">
          <ViewerScreen
            contract={contract}
            senderAddress={readOnlySender}
            walletSession={walletSession}
            walletLookupState={walletLookupState}
            focusKey={viewerFocusKey ?? undefined}
            collapsed={viewerCollapsed}
            onToggleCollapse={() => setViewerCollapsed((prev) => !prev)}
            isActiveTab={tabGuard.isActive}
            mode={viewerMode}
            onModeChange={setViewerMode}
            modeLabels={{ collection: 'Explore', wallet: 'Wallet' }}
            viewerTitles={{ collection: 'Live inscription viewer', wallet: 'Wallet viewer' }}
            allowSummaryPrefetch={false}
            allowBackgroundRelationshipSync={false}
          />
        </div>

        <PublicMarketScreen
          contract={contract}
          walletSession={walletSession}
          collapsed={marketCollapsed}
          onToggleCollapse={() => setMarketCollapsed((prev) => !prev)}
        />

        <MintScreen
          contract={contract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={mintCollapsed}
          onToggleCollapse={() => setMintCollapsed((prev) => !prev)}
          restrictions={PUBLIC_MINT_RESTRICTIONS}
        />

        <section
          className={`panel app-section simple-home__docs${docsCollapsed ? ' panel--collapsed' : ''}`}
          id="starter-docs"
        >
          <div className="panel__header">
            <div>
              <h2>Start here docs</h2>
              <p>Focused resources for first-time visitors and artist launches.</p>
            </div>
            <div className="panel__actions">
              <a className="button button--ghost" href={WORKSPACE_PATH}>
                Open Workspace
              </a>
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => setDocsCollapsed((prev) => !prev)}
                aria-expanded={!docsCollapsed}
              >
                {docsCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <div className="simple-home__docs-grid">
              {STARTER_DOCS.map((doc) => (
                <article className="simple-home__doc-card" key={doc.href}>
                  <h3>{doc.title}</h3>
                  <p>{doc.description}</p>
                  <a href={doc.href} target="_blank" rel="noreferrer">
                    {doc.cta}
                  </a>
                </article>
              ))}
            </div>

            <article className="simple-home__artist-access">
              <h3>Artist collection-mint access</h3>
              <p>
                Artist management actions are available in the `/manage` portal for approved
                wallets.
              </p>
              <ul>
                <li>Review the collection launch guide and template deploy guide first.</li>
                <li>Prepare the wallet addresses you want allowlisted for `/manage`.</li>
                <li>
                  Apply through official channels: <a href="https://x.com/XtrataLayers">@XtrataLayers</a>
                  {' '}or contact Jim.BTC (`@JimDotBTC`) for artist portal access.
                </li>
              </ul>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
