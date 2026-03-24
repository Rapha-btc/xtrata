import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showContractCall } from './lib/wallet/connect';
import { sha256 } from '@noble/hashes/sha256';
import {
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  listCV,
  type PostCondition,
  PostConditionMode,
  principalCV,
  stringAsciiCV,
  uintCV,
  validateStacksAddress,
  type ClarityValue
} from '@stacks/transactions';
import { createXtrataClient } from './lib/contract/client';
import {
  batchChunks,
  CHUNK_SIZE,
  chunkBytes,
  computeExpectedHash,
  MAX_BATCH_SIZE
} from './lib/chunking/hash';
import {
  buildCollectionSmallSingleTxStxPostConditions,
  buildCollectionSealStxPostConditions,
  buildMintBeginStxPostConditions,
  buildSealStxPostConditions,
  resolveCollectionBeginSpendCapMicroStx,
  resolveCollectionSmallSingleTxSpendCapMicroStx,
  resolveCollectionSealSpendCapMicroStx,
  resolveSealSpendCapMicroStx
} from './lib/mint/post-conditions';
import { resolveCollectionContractLink } from './lib/collections/contract-link';
import {
  formatMiningFeeMicroStx,
  type CollectionMiningFeeGuidance
} from './lib/collection-mint/mining-fee-guidance';
import { formatMicroStxWithUsd } from './lib/pricing/format';
import { useUsdPriceBook } from './lib/pricing/hooks';
import {
  isDisplayedCollectionMintFree,
  resolveCollectionMintPricingMetadata,
  type CollectionMintPricingMetadata
} from './lib/collection-mint/pricing-metadata';
import { resolveCollectionMintPriceTone } from './lib/collection-mint/price-tone';
import {
  resolveCollectionMintPaymentModel,
  type CollectionMintPaymentModel
} from './lib/collection-mint/payment-model';
import { findFirstMatchInBatches } from './lib/collection-mint/resume-scan';
import {
  shouldUseCollectionSmallSingleTx,
  supportsCollectionSmallSingleTx
} from './lib/collection-mint/routing';
import { parseDeployPricingLockSnapshot } from './lib/deploy/pricing-lock';
import { PUBLIC_CONTRACT } from './config/public';
import {
  DEFAULT_TOKEN_URI,
  SMALL_MINT_HELPER_MAX_CHUNKS,
  TX_DELAY_SECONDS
} from './lib/mint/constants';
import { getNetworkFromAddress, getNetworkMismatch } from './lib/network/guard';
import { toStacksNetwork } from './lib/network/stacks';
import type { NetworkType } from './lib/network/types';
import type { UploadState } from './lib/protocol/types';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from './lib/theme/preferences';
import { getMediaKind } from './lib/viewer/content';
import { bytesToHex } from './lib/utils/encoding';
import { formatBytes } from './lib/utils/format';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import type { WalletSession } from './lib/wallet/types';
import AddressLabel from './components/AddressLabel';
import CollectionCoverImage from './components/CollectionCoverImage';
import WalletTopBar from './components/WalletTopBar';

const walletSessionStore = createWalletSessionStore();
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
const MINT_CHUNK_BATCH_SIZE = 30;
const STATUS_REFRESH_ACTIVE_MS = 6_000;
const STATUS_REFRESH_BACKGROUND_MS = 20_000;
const STATUS_REFRESH_MINTING_MS = 3_000;
const MINTED_SCAN_BATCH_SIZE = 8;
const CHAIN_SYNC_INTERVAL_MS = 3_000;
const CHAIN_SYNC_MAX_ATTEMPTS = 25;
const COLLECTION_UPLOAD_EXPIRY_BLOCKS = 4_320;
const APPROX_BLOCKS_PER_DAY = 144;
const COLLECTION_SNAPSHOT_CACHE_MS = 2 * 60_000;
const COLLECTION_ASSET_BYTES_CACHE_MS = 10 * 60_000;
const RESUMABLE_LOOKUP_CACHE_MS = 10_000;
const RESERVATION_SCAN_BATCH_SIZE = 6;
const RESERVATION_SCAN_COMPUTE_BATCH_SIZE = 3;
const CANONICAL_HASH_STORAGE_PREFIX = 'xtrata-live-canonical-hashes';
const XTRATA_APP_ICON_DATA_URI =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>';

type StepState = 'idle' | 'pending' | 'done' | 'error';

type CollectionMintLivePageProps = {
  collectionKey: string;
};

type CollectionRecord = {
  id: string;
  slug: string;
  display_name: string | null;
  artist_address: string | null;
  contract_address: string | null;
  state: string;
  metadata?: Record<string, unknown> | null;
};

type CollectionAsset = {
  asset_id: string;
  path: string;
  filename: string | null;
  mime_type: string;
  expected_hash: string | null;
  total_bytes: number;
  total_chunks: number;
  state: string;
};

type CollectionContractTarget = {
  address: string;
  contractName: string;
  network: NetworkType;
};

type ContractStatus = {
  paused: boolean | null;
  finalized: boolean | null;
  mintPrice: bigint | null;
  coreFeeUnitMicroStx: bigint | null;
  activePhaseId: bigint | null;
  activePhaseMintPrice: bigint | null;
  maxSupply: bigint | null;
  mintedCount: bigint | null;
  reservedCount: bigint | null;
};

type TxPayload = {
  txId: string;
};

type MintProgress = {
  hasReservation: boolean;
  uploadState: UploadState | null;
  tokenId: bigint | null;
};

type ResumableLookupCacheEntry = {
  owner: string;
  checkedAt: number;
  assetId: string | null;
  promise: Promise<string | null> | null;
};

type CollectionMintPricingConfig = {
  mode: CollectionMintPricingMetadata['mode'];
  mintPriceMicroStx: bigint | null;
  onChainMintPriceMicroStx: bigint | null;
  absorbedSealFeeMicroStx: bigint | null;
  absorbedBeginFeeMicroStx: bigint | null;
  absorbedProtocolFeeMicroStx: bigint | null;
  absorptionModel: string | null;
};

type CollectionSnapshot = {
  collection: CollectionRecord;
  assets: CollectionAsset[];
  feeGuidance: CollectionMiningFeeGuidance | null;
};

type TimedCacheEntry<T> = {
  updatedAt: number;
  value: T;
};

const collectionSnapshotCache = new Map<
  string,
  TimedCacheEntry<CollectionSnapshot>
>();
const collectionSnapshotInFlight = new Map<string, Promise<CollectionSnapshot>>();
const collectionAssetBytesCache = new Map<
  string,
  TimedCacheEntry<Uint8Array>
>();
const collectionAssetBytesInFlight = new Map<string, Promise<Uint8Array>>();

const readTimedCache = <T,>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  maxAgeMs: number
) => {
  const record = cache.get(key);
  if (!record) {
    return null;
  }
  if (Date.now() - record.updatedAt > maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return record.value;
};

const writeTimedCache = <T,>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  value: T
) => {
  cache.set(key, {
    updatedAt: Date.now(),
    value
  });
};

const cloneBytes = (value: Uint8Array) => new Uint8Array(value);

const isActiveCollectionAssetState = (value: unknown) => {
  const state = String(value ?? '').trim().toLowerCase();
  return state !== 'expired' && state !== 'sold-out';
};

const toText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const toMultilineText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\r\n/g, '\n');
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const parseJsonResponse = async <T,>(response: Response, label: string) => {
  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      const snippet = text.slice(0, 180).replace(/\s+/g, ' ').trim();
      throw new Error(`${label} is not JSON: ${snippet}`);
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? ((payload as { error: string }).error ?? '').trim()
        : '';
    throw new Error(message || `${label} request failed (${response.status}).`);
  }
  return payload as T;
};

const unwrapReadOnly = (value: ClarityValue) => {
  if (value.type === ClarityType.ResponseOk) {
    return value.value;
  }
  if (value.type === ClarityType.ResponseErr) {
    throw new Error('Read-only call failed.');
  }
  return value;
};

const parseUintCv = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (parsed === null || parsed === undefined) {
    return null;
  }
  if (typeof parsed === 'bigint') {
    return parsed;
  }
  if (typeof parsed === 'string') {
    try {
      return BigInt(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed === 'number') {
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return BigInt(Math.floor(parsed));
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'value' in (parsed as Record<string, unknown>)
  ) {
    const raw = (parsed as { value?: unknown }).value;
    if (typeof raw === 'bigint') {
      return raw;
    }
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }
  return null;
};

const parseMintedIndexTokenId = (value: ClarityValue) => {
  const optional = value.type === ClarityType.ResponseOk ? value.value : value;
  if (optional.type !== ClarityType.OptionalSome) {
    return null;
  }
  const tuple = optional.value;
  if (tuple.type !== ClarityType.Tuple) {
    return null;
  }
  const tokenIdCv = tuple.data['token-id'];
  if (!tokenIdCv) {
    return null;
  }
  return parseUintCv(tokenIdCv);
};

const normalizeHashHex = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/^0x/, '');
  if (!HASH_HEX_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
};

const hashHexToBytes = (hashHex: string) => {
  const normalized = normalizeHashHex(hashHex);
  if (!normalized) {
    return null;
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const inferNetworkFromContract = (value: string) =>
  getNetworkFromAddress(value) ?? 'mainnet';

const parseContractId = (value: string): CollectionContractTarget | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const [address = '', contractName = ''] = trimmed.split('.');
  if (!validateStacksAddress(address) || !CONTRACT_NAME_PATTERN.test(contractName)) {
    return null;
  }
  return {
    address,
    contractName,
    network: inferNetworkFromContract(address)
  };
};

const toMicroStxLabel = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  const negative = value < 0n;
  const normalized = negative ? -value : value;
  const whole = normalized / 1_000_000n;
  const fraction = (normalized % 1_000_000n).toString().padStart(6, '0');
  const fractionTrimmed = fraction.replace(/0+$/, '');
  const base = fractionTrimmed.length > 0 ? `${whole}.${fractionTrimmed}` : `${whole}`;
  return `${negative ? '-' : ''}${base} STX`;
};

const humanizeStateLabel = (value: string) => {
  const normalized = value.trim().replace(/[-_]+/g, ' ');
  if (!normalized) {
    return 'Unknown';
  }
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatCount = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  return value.toString();
};

const formatStepStatus = (state: StepState) => {
  if (state === 'pending') {
    return 'In progress';
  }
  if (state === 'done') {
    return 'Complete';
  }
  if (state === 'error') {
    return 'Error';
  }
  return 'Idle';
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), ms);
  });

const toPositiveInteger = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : 0;
};

const resolveAssetChunkCount = (asset: CollectionAsset) => {
  const totalChunks = toPositiveInteger(asset.total_chunks);
  if (totalChunks > 0) {
    return totalChunks;
  }
  const totalBytes = toPositiveInteger(asset.total_bytes);
  if (totalBytes <= 0) {
    return 0;
  }
  return Math.ceil(totalBytes / CHUNK_SIZE);
};

const toResumeStorageKey = (collectionId: string, address: string | null) => {
  if (!collectionId || !address) {
    return null;
  }
  return `xtrata-live-resume:${collectionId}:${address.toUpperCase()}`;
};

const toCanonicalHashStorageKey = (collectionId: string) => {
  if (!collectionId) {
    return null;
  }
  return `${CANONICAL_HASH_STORAGE_PREFIX}:${collectionId}`;
};

const shuffleAssets = (assets: CollectionAsset[]) => {
  const next = [...assets];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[target];
    next[target] = current;
  }
  return next;
};

const resolveCollectionMintPricingConfig = (
  metadata: Record<string, unknown> | null
): CollectionMintPricingConfig => {
  const pricing = resolveCollectionMintPricingMetadata(metadata?.pricing);
  return {
    mode: pricing.mode,
    mintPriceMicroStx: pricing.mintPriceMicroStx,
    onChainMintPriceMicroStx: pricing.onChainMintPriceMicroStx,
    absorbedSealFeeMicroStx: pricing.absorbedSealFeeMicroStx,
    absorbedBeginFeeMicroStx: pricing.absorbedBeginFeeMicroStx,
    absorbedProtocolFeeMicroStx: pricing.absorbedProtocolFeeMicroStx,
    absorptionModel: pricing.absorptionModel
  };
};

const isOptionalSome = (value: ClarityValue | null) => {
  if (!value) {
    return false;
  }
  const resolved = value.type === ClarityType.ResponseOk ? value.value : value;
  return resolved.type === ClarityType.OptionalSome;
};

export default function CollectionMintLivePage(props: CollectionMintLivePageProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialTheme());
  const [walletSession, setWalletSession] = useState<WalletSession>(() =>
    walletSessionStore.load()
  );
  const [walletPending, setWalletPending] = useState(false);
  const usdPriceBook = useUsdPriceBook().data ?? null;
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [assets, setAssets] = useState<CollectionAsset[]>([]);
  const [feeGuidance, setFeeGuidance] = useState<CollectionMiningFeeGuidance | null>(
    null
  );
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState<string | null>(null);
  const [contractStatus, setContractStatus] = useState<ContractStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusLastUpdatedAt, setStatusLastUpdatedAt] = useState<number | null>(null);
  const [mintPending, setMintPending] = useState(false);
  const [mintMessage, setMintMessage] = useState<string | null>(null);
  const [mintLog, setMintLog] = useState<string[]>([]);
  const [mintedTokenIds, setMintedTokenIds] = useState<Record<string, string>>({});
  const [collectionTokenNumberByGlobalId, setCollectionTokenNumberByGlobalId] = useState<
    Record<string, number>
  >({});
  const [collectionIndexCount, setCollectionIndexCount] = useState(0);
  const [collectionIndexSyncPending, setCollectionIndexSyncPending] = useState(false);
  const [collectionIndexSyncMessage, setCollectionIndexSyncMessage] = useState<string | null>(
    null
  );
  const resumableLookupCacheRef = useRef<ResumableLookupCacheEntry | null>(null);
  const canonicalHashStorageLoadedRef = useRef(false);
  const [canonicalHashHexByAssetId, setCanonicalHashHexByAssetId] = useState<
    Record<string, string>
  >({});
  const [mintedScanPending, setMintedScanPending] = useState(false);
  const [pendingMintAssetIds, setPendingMintAssetIds] = useState<string[]>([]);
  const [resumeAssetId, setResumeAssetId] = useState<string | null>(null);
  const [showMintGuide, setShowMintGuide] = useState(false);
  const [beginState, setBeginState] = useState<StepState>('idle');
  const [uploadState, setUploadState] = useState<StepState>('idle');
  const [sealState, setSealState] = useState<StepState>('idle');
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [txDelaySeconds, setTxDelaySeconds] = useState<number | null>(null);
  const [txDelayLabel, setTxDelayLabel] = useState<string | null>(null);

  const normalizedCollectionKey = useMemo(
    () => props.collectionKey.trim(),
    [props.collectionKey]
  );

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'Xtrata Collection Mint',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const metadata = useMemo(() => toRecord(collection?.metadata) ?? null, [collection]);
  const deployPricingLock = useMemo(
    () => parseDeployPricingLockSnapshot(metadata),
    [metadata]
  );
  const templateVersion = useMemo(
    () => toText(metadata?.templateVersion),
    [metadata]
  );
  const collectionMintPaymentModel = useMemo(
    () => resolveCollectionMintPaymentModel(templateVersion),
    [templateVersion]
  );
  const collectionMintPricingConfig = useMemo(
    () => resolveCollectionMintPricingConfig(metadata),
    [metadata]
  );
  // Keep legacy v1.1 compatibility (mint price charged at begin) while allowing
  // v1.2 collections to charge only protocol fee at begin and settle price at seal.
  const chargeMintPriceAtBegin = collectionMintPaymentModel !== 'seal';
  const metadataCollection = useMemo(
    () => toRecord(metadata?.collection) ?? null,
    [metadata]
  );
  const metadataCollectionPage = useMemo(
    () => toRecord(metadata?.collectionPage) ?? null,
    [metadata]
  );
  const metadataCover = useMemo(
    () => toRecord(metadataCollectionPage?.coverImage) ?? null,
    [metadataCollectionPage]
  );
  const resolvedCollectionId = useMemo(
    () => toText(collection?.id),
    [collection]
  );
  const resolvedCollectionSlug = useMemo(
    () => toText(collection?.slug),
    [collection]
  );
  const resumeStorageKey = useMemo(
    () => toResumeStorageKey(resolvedCollectionId, walletSession.address ?? null),
    [resolvedCollectionId, walletSession.address]
  );
  const canonicalHashStorageKey = useMemo(
    () => toCanonicalHashStorageKey(resolvedCollectionId),
    [resolvedCollectionId]
  );

  const collectionContract = useMemo(() => {
    const resolved = resolveCollectionContractLink({
      collectionId: toText(collection?.id),
      collectionSlug: toText(collection?.slug),
      contractAddress: toText(collection?.contract_address),
      metadata
    });
    if (!resolved) {
      return null;
    }
    return {
      address: resolved.address,
      contractName: resolved.contractName,
      network: inferNetworkFromContract(resolved.address)
    } as CollectionContractTarget;
  }, [collection, metadata]);

  const coreContract = useMemo(() => {
    const configuredCore = parseContractId(toText(metadata?.coreContractId));
    if (configuredCore) {
      return configuredCore;
    }
    return {
      address: PUBLIC_CONTRACT.address,
      contractName: PUBLIC_CONTRACT.contractName,
      network: PUBLIC_CONTRACT.network
    } satisfies CollectionContractTarget;
  }, [metadata]);

  const coreClient = useMemo(
    () =>
      createXtrataClient({
        contract: {
          address: coreContract.address,
          contractName: coreContract.contractName,
          network: coreContract.network
        }
      }),
    [coreContract]
  );

  const networkMismatch = useMemo(
    () =>
      collectionContract
        ? getNetworkMismatch(collectionContract.network, walletSession.network)
        : null,
    [collectionContract, walletSession.network]
  );

  const imageAssets = useMemo(
    () =>
      assets.filter((asset) => {
        if (!isActiveCollectionAssetState(asset.state)) {
          return false;
        }
        const mime = asset.mime_type.trim().toLowerCase();
        return mime.startsWith('image/');
      }),
    [assets]
  );

  const mintableAssets = useMemo(
    () => assets.filter((asset) => isActiveCollectionAssetState(asset.state)),
    [assets]
  );

  const largestMintableAsset = useMemo(() => {
    if (mintableAssets.length === 0) {
      return null;
    }
    let selected: CollectionAsset | null = null;
    let maxChunks = 0;
    for (const asset of mintableAssets) {
      const chunkCount = resolveAssetChunkCount(asset);
      if (chunkCount <= maxChunks) {
        continue;
      }
      maxChunks = chunkCount;
      selected = asset;
    }
    if (!selected) {
      return null;
    }
    return {
      totalChunks: maxChunks,
      totalBytes: toPositiveInteger(selected.total_bytes)
    };
  }, [mintableAssets]);

  const mintedGallery = useMemo(() => {
    const minted = mintableAssets.filter(
      (asset) => typeof mintedTokenIds[asset.asset_id] === 'string'
    );
    minted.sort((left, right) => {
      const leftGlobal = mintedTokenIds[left.asset_id] ?? '';
      const rightGlobal = mintedTokenIds[right.asset_id] ?? '';
      const leftLocal = leftGlobal ? collectionTokenNumberByGlobalId[leftGlobal] : undefined;
      const rightLocal = rightGlobal ? collectionTokenNumberByGlobalId[rightGlobal] : undefined;
      if (typeof leftLocal === 'number' && typeof rightLocal === 'number') {
        return leftLocal - rightLocal;
      }
      if (typeof leftLocal === 'number') {
        return -1;
      }
      if (typeof rightLocal === 'number') {
        return 1;
      }
      const leftName = left.filename ?? left.path;
      const rightName = right.filename ?? right.path;
      return leftName.localeCompare(rightName);
    });
    return minted;
  }, [collectionTokenNumberByGlobalId, mintableAssets, mintedTokenIds]);

  const fallbackCoverUrl = useMemo(() => {
    const fallback = imageAssets[0];
    if (!fallback || !resolvedCollectionId) {
      return null;
    }
    const query = new URLSearchParams({
      assetId: fallback.asset_id,
      purpose: 'cover'
    });
    return `/collections/${encodeURIComponent(
      resolvedCollectionId
    )}/asset-preview?${query.toString()}`;
  }, [imageAssets, resolvedCollectionId]);

  const collectionTitle = useMemo(
    () =>
      toText(collection?.display_name) ||
      toText(metadataCollection?.name) ||
      toText(collection?.slug) ||
      'Untitled collection',
    [collection, metadataCollection]
  );

  const collectionDescription = useMemo(
    () =>
      toMultilineText(metadataCollectionPage?.description) ||
      toMultilineText(metadataCollection?.description) ||
      'This collection is live on Xtrata.',
    [metadataCollection, metadataCollectionPage]
  );
  const artistAddress = useMemo(() => toText(collection?.artist_address), [collection]);
  const artistNetwork = useMemo(
    () =>
      (artistAddress ? getNetworkFromAddress(artistAddress) : null) ??
      collectionContract?.network ??
      null,
    [artistAddress, collectionContract]
  );

  const collectionSymbol = useMemo(
    () => toText(metadataCollection?.symbol) || 'NO-TICKER',
    [metadataCollection]
  );

  const collectionState = toText(collection?.state).toLowerCase() || 'unknown';
  const published = collectionState === 'published';

  const remaining = useMemo(() => {
    if (!contractStatus?.maxSupply || contractStatus.mintedCount === null) {
      return null;
    }
    const reserved = contractStatus.reservedCount ?? 0n;
    const used = contractStatus.mintedCount + reserved;
    if (used >= contractStatus.maxSupply) {
      return 0n;
    }
    return contractStatus.maxSupply - used;
  }, [contractStatus]);

  const soldOut = useMemo(() => {
    if (!contractStatus) {
      return false;
    }
    if (remaining !== null && remaining <= 0n) {
      return true;
    }
    if (contractStatus.finalized === true) {
      return true;
    }
    if (
      contractStatus.maxSupply !== null &&
      contractStatus.mintedCount !== null &&
      contractStatus.mintedCount >= contractStatus.maxSupply
    ) {
      return true;
    }
    return false;
  }, [contractStatus, remaining]);
  const shouldProbeWalletReservation = useMemo(
    () => (contractStatus?.reservedCount ?? 0n) > 0n && remaining !== null && remaining <= 0n,
    [contractStatus?.reservedCount, remaining]
  );

  const mintUnavailableReason = useMemo(() => {
    if (!published) {
      return 'This collection is not live yet.';
    }
    if (!collectionContract) {
      return 'Collection contract details are missing.';
    }
    if (contractStatus?.paused) {
      return 'Minting is currently paused.';
    }
    if (contractStatus?.finalized) {
      return 'Minting is finalized.';
    }
    if (remaining !== null && remaining <= 0n) {
      if ((contractStatus?.reservedCount ?? 0n) > 0n) {
        return null;
      }
      return 'This collection is sold out.';
    }
    if (mintableAssets.length === 0) {
      return 'No staged assets are available for minting.';
    }
    return null;
  }, [
    collectionContract,
    contractStatus?.finalized,
    contractStatus?.paused,
    contractStatus?.reservedCount,
    mintableAssets.length,
    published,
    remaining
  ]);

  const appendMintLog = useCallback((message: string) => {
    setMintLog((current) => [...current, message].slice(-20));
  }, []);

  const resetSteps = useCallback(() => {
    setBeginState('idle');
    setUploadState('idle');
    setSealState('idle');
    setBatchProgress(null);
    setTxDelaySeconds(null);
    setTxDelayLabel(null);
  }, []);

  const pauseBeforeNextTx = useCallback(async (label: string) => {
    setTxDelayLabel(label);
    for (let remaining = TX_DELAY_SECONDS; remaining > 0; remaining -= 1) {
      setTxDelaySeconds(remaining);
      await pause(1000);
    }
    setTxDelaySeconds(null);
    setTxDelayLabel(null);
  }, []);

  const normalizeMintError = useCallback((error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error);
    const normalized = raw.toLowerCase();
    if (normalized.includes('bad nonce')) {
      return 'Wallet nonce is behind a pending transaction. Wait for confirmations, then click Resume mint.';
    }
    if (normalized.includes('(err u105)') || normalized.includes('contract error u105')) {
      return 'Mint session was not found on-chain (u105). Click Resume mint to restart safely from chain state.';
    }
    if (normalized.includes('(err u2)')) {
      return 'STX payout transfer failed (err u2). A payout recipient is likely the same as the minting wallet. Use a different minter wallet or update payout recipients/splits.';
    }
    if (normalized.includes('(err u122)') || normalized.includes('contract error u122')) {
      return 'This asset hash is already sealed on-chain (u122). Refresh collection status and continue with the next item.';
    }
    if (normalized.includes('post-condition check failure')) {
      return 'Wallet safety checks blocked this transaction. This usually means payout settings or mint price changed. Refresh status and retry.';
    }
    if (normalized.includes('wallet cancelled') || normalized.includes('failed to broadcast')) {
      return 'Wallet cancelled or could not broadcast. No new mint step was confirmed. You can safely resume.';
    }
    return raw;
  }, []);

  const useMintPriceSealCap =
    collectionMintPaymentModel === 'seal' &&
    contractStatus?.activePhaseMintPrice === null &&
    collectionMintPricingConfig.mode === 'price-includes-seal-fee' &&
    collectionMintPricingConfig.onChainMintPriceMicroStx !== null &&
    collectionMintPricingConfig.onChainMintPriceMicroStx ===
      (contractStatus?.mintPrice ?? null) &&
    collectionMintPricingConfig.mintPriceMicroStx !== null;
  const useMintPriceTotalCap =
    collectionMintPaymentModel === 'seal' &&
    contractStatus?.activePhaseMintPrice === null &&
    collectionMintPricingConfig.mode === 'price-includes-total-fees' &&
    collectionMintPricingConfig.onChainMintPriceMicroStx !== null &&
    collectionMintPricingConfig.onChainMintPriceMicroStx ===
      (contractStatus?.mintPrice ?? null) &&
    collectionMintPricingConfig.mintPriceMicroStx !== null;

  const resolveBeginSpendCapForMintPriceTotal = useCallback(() => {
    if (!useMintPriceTotalCap) {
      return null;
    }
    return resolveCollectionBeginSpendCapMicroStx({
      mintPrice: contractStatus?.mintPrice ?? null,
      activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
      protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
      chargeMintPriceAtBegin
    });
  }, [
    chargeMintPriceAtBegin,
    contractStatus?.activePhaseMintPrice,
    contractStatus?.coreFeeUnitMicroStx,
    contractStatus?.mintPrice,
    useMintPriceTotalCap
  ]);

  const resolveMintBeginPostConditions = useCallback(
    (sender: string) => {
      const beginSpendCap = resolveCollectionBeginSpendCapMicroStx({
        mintPrice: contractStatus?.mintPrice ?? null,
        activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
        protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
        chargeMintPriceAtBegin
      });
      if (beginSpendCap === null) {
        return null;
      }
      return buildMintBeginStxPostConditions({
        sender,
        mintPrice: beginSpendCap
      });
    },
    [
      chargeMintPriceAtBegin,
      contractStatus?.activePhaseMintPrice,
      contractStatus?.coreFeeUnitMicroStx,
      contractStatus?.mintPrice
    ]
  );

  const resolveSealPostConditions = useCallback(
    (sender: string, totalChunks: number) => {
      if (collectionMintPaymentModel === 'begin') {
        // Temporary legacy compatibility (v1.1): mint price already paid at begin.
        return buildSealStxPostConditions({
          sender,
          protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
          totalChunks
        });
      }
      if (useMintPriceTotalCap) {
        const beginCap = resolveBeginSpendCapForMintPriceTotal();
        if (
          beginCap === null ||
          collectionMintPricingConfig.mintPriceMicroStx === null
        ) {
          return null;
        }
        const sealCap = collectionMintPricingConfig.mintPriceMicroStx - beginCap;
        if (sealCap < 0n) {
          return null;
        }
        return buildMintBeginStxPostConditions({
          sender,
          mintPrice: sealCap
        });
      }
      if (useMintPriceSealCap) {
        return buildMintBeginStxPostConditions({
          sender,
          mintPrice: collectionMintPricingConfig.mintPriceMicroStx
        });
      }
      return buildCollectionSealStxPostConditions({
        sender,
        mintPrice: contractStatus?.mintPrice ?? null,
        activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
        protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
        totalChunks
      });
    },
    [
      collectionMintPaymentModel,
      collectionMintPricingConfig.mintPriceMicroStx,
      collectionMintPricingConfig.mode,
      collectionMintPricingConfig.onChainMintPriceMicroStx,
      resolveBeginSpendCapForMintPriceTotal,
      useMintPriceTotalCap,
      useMintPriceSealCap,
      contractStatus?.activePhaseMintPrice,
      contractStatus?.coreFeeUnitMicroStx,
      contractStatus?.mintPrice
    ]
  );

  const resolveSingleTxSealSpendCapOverride = useCallback(() => {
    if (useMintPriceSealCap) {
      return collectionMintPricingConfig.mintPriceMicroStx;
    }
    if (useMintPriceTotalCap) {
      const beginCap = resolveBeginSpendCapForMintPriceTotal();
      if (
        beginCap === null ||
        collectionMintPricingConfig.mintPriceMicroStx === null
      ) {
        return null;
      }
      const sealCap = collectionMintPricingConfig.mintPriceMicroStx - beginCap;
      return sealCap >= 0n ? sealCap : null;
    }
    return undefined;
  }, [
    collectionMintPricingConfig.mintPriceMicroStx,
    resolveBeginSpendCapForMintPriceTotal,
    useMintPriceSealCap,
    useMintPriceTotalCap
  ]);

  const resolveSmallSingleTxSpendCap = useCallback(
    (totalChunks: number) => {
      const sealSpendCapOverride = resolveSingleTxSealSpendCapOverride();
      if (sealSpendCapOverride === null) {
        return null;
      }
      return resolveCollectionSmallSingleTxSpendCapMicroStx({
        mintPrice: contractStatus?.mintPrice ?? null,
        activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
        protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
        totalChunks,
        chargeMintPriceAtBegin,
        sealSpendCapMicroStx:
          sealSpendCapOverride === undefined ? null : sealSpendCapOverride
      });
    },
    [
      chargeMintPriceAtBegin,
      collectionMintPricingConfig.mintPriceMicroStx,
      contractStatus?.activePhaseMintPrice,
      contractStatus?.coreFeeUnitMicroStx,
      contractStatus?.mintPrice,
      resolveSingleTxSealSpendCapOverride,
      useMintPriceTotalCap,
      useMintPriceSealCap
    ]
  );

  const resolveSmallSingleTxPostConditions = useCallback(
    (sender: string, totalChunks: number) => {
      const sealSpendCapOverride = resolveSingleTxSealSpendCapOverride();
      if (sealSpendCapOverride === null) {
        return null;
      }
      return buildCollectionSmallSingleTxStxPostConditions({
        sender,
        mintPrice: contractStatus?.mintPrice ?? null,
        activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
        protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
        totalChunks,
        chargeMintPriceAtBegin,
        sealSpendCapMicroStx:
          sealSpendCapOverride === undefined ? null : sealSpendCapOverride
      });
    },
    [
      chargeMintPriceAtBegin,
      collectionMintPricingConfig.mintPriceMicroStx,
      contractStatus?.activePhaseMintPrice,
      contractStatus?.coreFeeUnitMicroStx,
      contractStatus?.mintPrice,
      resolveSingleTxSealSpendCapOverride,
      useMintPriceTotalCap,
      useMintPriceSealCap
    ]
  );

  const fetchAssetBytes = useCallback(
    async (assetId: string) => {
      if (!resolvedCollectionId) {
        throw new Error('Collection id missing.');
      }
      const cacheKey = `${resolvedCollectionId}:${assetId}`;
      const cached = readTimedCache(
        collectionAssetBytesCache,
        cacheKey,
        COLLECTION_ASSET_BYTES_CACHE_MS
      );
      if (cached) {
        return cloneBytes(cached);
      }
      const inFlight = collectionAssetBytesInFlight.get(cacheKey);
      if (inFlight) {
        return cloneBytes(await inFlight);
      }
      const loadPromise = (async () => {
        const response = await fetch(
          `/collections/${encodeURIComponent(
            resolvedCollectionId
          )}/asset-preview?assetId=${encodeURIComponent(assetId)}`,
          { cache: 'default' }
        );
        if (!response.ok) {
          const text = (await response.text())
            .slice(0, 180)
            .replace(/\s+/g, ' ')
            .trim();
          throw new Error(
            `Unable to load asset bytes (${response.status})${text ? `: ${text}` : ''}.`
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        writeTimedCache(collectionAssetBytesCache, cacheKey, bytes);
        return bytes;
      })();
      collectionAssetBytesInFlight.set(cacheKey, loadPromise);
      try {
        return cloneBytes(await loadPromise);
      } finally {
        collectionAssetBytesInFlight.delete(cacheKey);
      }
    },
    [resolvedCollectionId]
  );

  const loadCollectionSnapshot = useCallback(async () => {
    if (!normalizedCollectionKey) {
      setCollection(null);
      setAssets([]);
      setFeeGuidance(null);
      setCollectionMessage('Collection key missing from URL.');
      return;
    }
    setCollectionLoading(true);
    setCollectionMessage(null);
    try {
      const cached = readTimedCache(
        collectionSnapshotCache,
        normalizedCollectionKey,
        COLLECTION_SNAPSHOT_CACHE_MS
      );
      let snapshot: CollectionSnapshot;
      if (cached) {
        snapshot = cached;
      } else {
        const inFlight = collectionSnapshotInFlight.get(normalizedCollectionKey);
        if (inFlight) {
          snapshot = await inFlight;
        } else {
          const loadPromise = (async () => {
            const collectionResponse = await fetch(
              `/collections/${encodeURIComponent(normalizedCollectionKey)}`,
              {
                cache: 'default'
              }
            );
            const loadedCollection = await parseJsonResponse<CollectionRecord>(
              collectionResponse,
              'Collection'
            );
            const loadedCollectionId = toText(loadedCollection.id);
            if (!loadedCollectionId) {
              throw new Error('Collection record is missing an id.');
            }
            const [assetsResponse, feeGuidanceResponse] = await Promise.all([
              fetch(`/collections/${encodeURIComponent(loadedCollectionId)}/assets`, {
                cache: 'default'
              }),
              fetch(
                `/collections/${encodeURIComponent(
                  loadedCollectionId
                )}/fee-guidance`,
                {
                  cache: 'default'
                }
              )
            ]);
            const loadedAssets = await parseJsonResponse<CollectionAsset[]>(
              assetsResponse,
              'Collection assets'
            );
            let loadedFeeGuidance: CollectionMiningFeeGuidance | null = null;
            try {
              loadedFeeGuidance =
                await parseJsonResponse<CollectionMiningFeeGuidance>(
                  feeGuidanceResponse,
                  'Collection fee guidance'
                );
            } catch {
              loadedFeeGuidance = null;
            }
            const nextSnapshot = {
              collection: loadedCollection,
              assets: loadedAssets,
              feeGuidance: loadedFeeGuidance
            } satisfies CollectionSnapshot;
            writeTimedCache(
              collectionSnapshotCache,
              normalizedCollectionKey,
              nextSnapshot
            );
            return nextSnapshot;
          })();
          collectionSnapshotInFlight.set(normalizedCollectionKey, loadPromise);
          try {
            snapshot = await loadPromise;
          } finally {
            collectionSnapshotInFlight.delete(normalizedCollectionKey);
          }
        }
      }
      setCollection(snapshot.collection);
      setAssets(snapshot.assets);
      setFeeGuidance(snapshot.feeGuidance);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCollection(null);
      setAssets([]);
      setFeeGuidance(null);
      setCollectionMessage(message);
    } finally {
      setCollectionLoading(false);
    }
  }, [normalizedCollectionKey]);

  const loadContractStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!collectionContract) {
      setContractStatus(null);
      setStatusLastUpdatedAt(null);
      return null;
    }
    const silent = options?.silent ?? false;
    if (!silent) {
      setStatusLoading(true);
      setStatusMessage(null);
    }
    try {
      const network = toStacksNetwork(collectionContract.network);
      const senderAddress = walletSession.address ?? collectionContract.address;
      const readOnly = async (functionName: string) => {
        const value = await callReadOnlyFunction({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName,
          functionArgs: [],
          senderAddress,
          network
        });
        return unwrapReadOnly(value);
      };

      const [pausedCv, finalizedCv, mintPriceCv, maxSupplyCv, mintedCountCv, reservedCountCv] =
        await Promise.all([
          readOnly('is-paused'),
          readOnly('get-finalized'),
          readOnly('get-mint-price'),
          readOnly('get-max-supply'),
          readOnly('get-minted-count'),
          readOnly('get-reserved-count')
        ]);
      const coreFeeUnitMicroStx = await coreClient.getFeeUnit(senderAddress).catch(() => null);
      const activePhaseCv = await readOnly('get-active-phase');
      const activePhaseId = parseUintCv(activePhaseCv);
      let activePhaseMintPrice: bigint | null = null;
      if (activePhaseId !== null && activePhaseId > 0n) {
        const phaseCv = await callReadOnlyFunction({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName: 'get-phase',
          functionArgs: [uintCV(activePhaseId)],
          senderAddress,
          network
        });
        const phaseValue = unwrapReadOnly(phaseCv);
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

      const nextStatus = {
        paused: Boolean(cvToValue(pausedCv)),
        finalized: Boolean(cvToValue(finalizedCv)),
        mintPrice: parseUintCv(mintPriceCv),
        coreFeeUnitMicroStx,
        activePhaseId,
        activePhaseMintPrice,
        maxSupply: parseUintCv(maxSupplyCv),
        mintedCount: parseUintCv(mintedCountCv),
        reservedCount: parseUintCv(reservedCountCv)
      } satisfies ContractStatus;
      setContractStatus(nextStatus);
      setStatusMessage(null);
      setStatusLastUpdatedAt(Date.now());
      return nextStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Unable to refresh contract status: ${message}`);
      return null;
    } finally {
      if (!silent) {
        setStatusLoading(false);
      }
    }
  }, [collectionContract, coreClient, walletSession.address]);

  const syncCollectionTokenNumbers = useCallback(
    async (options?: { forceFull?: boolean; mintedCount?: bigint | null }) => {
      if (!collectionContract) {
        setCollectionTokenNumberByGlobalId({});
        setCollectionIndexCount(0);
        setCollectionIndexSyncMessage(null);
        return null;
      }
      const mintedCountValue = options?.mintedCount ?? contractStatus?.mintedCount ?? null;
      if (mintedCountValue === null) {
        return null;
      }
      const targetCount = Number(mintedCountValue);
      if (!Number.isSafeInteger(targetCount) || targetCount < 0) {
        setCollectionIndexSyncMessage(
          'Collection numbering is too large to index safely in this view.'
        );
        return null;
      }
      if (targetCount === 0) {
        setCollectionTokenNumberByGlobalId({});
        setCollectionIndexCount(0);
        setCollectionIndexSyncMessage(null);
        return {};
      }

      const needsFullSync = options?.forceFull === true || targetCount < collectionIndexCount;
      const startIndex = needsFullSync ? 0 : collectionIndexCount;
      if (startIndex >= targetCount) {
        setCollectionIndexSyncMessage(null);
        return collectionTokenNumberByGlobalId;
      }

      setCollectionIndexSyncPending(true);
      setCollectionIndexSyncMessage(null);
      try {
        const senderAddress = walletSession.address ?? collectionContract.address;
        const network = toStacksNetwork(collectionContract.network);
        const nextEntries: Record<string, number> = {};
        for (let index = startIndex; index < targetCount; index += 1) {
          const entryCv = await callReadOnlyFunction({
            contractAddress: collectionContract.address,
            contractName: collectionContract.contractName,
            functionName: 'get-minted-id',
            functionArgs: [uintCV(BigInt(index))],
            senderAddress,
            network
          });
          const tokenId = parseMintedIndexTokenId(entryCv);
          if (tokenId !== null) {
            nextEntries[tokenId.toString()] = index + 1;
          }
        }

        const nextMap =
          needsFullSync || startIndex === 0
            ? nextEntries
            : { ...collectionTokenNumberByGlobalId, ...nextEntries };
        setCollectionTokenNumberByGlobalId(nextMap);
        setCollectionIndexCount(targetCount);
        return nextMap;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCollectionIndexSyncMessage(`Unable to refresh collection numbering: ${message}`);
        return null;
      } finally {
        setCollectionIndexSyncPending(false);
      }
    },
    [
      collectionContract,
      collectionIndexCount,
      collectionTokenNumberByGlobalId,
      contractStatus?.mintedCount,
      walletSession.address
    ]
  );

  const formatTokenReference = useCallback(
    (globalTokenId: string) => {
      const localTokenNumber = collectionTokenNumberByGlobalId[globalTokenId];
      if (typeof localTokenNumber === 'number') {
        return `${collectionTitle} #${localTokenNumber}`;
      }
      return `${collectionTitle} #...`;
    },
    [collectionTitle, collectionTokenNumberByGlobalId]
  );

  const scanMintedAssets = useCallback(async () => {
    if (!resolvedCollectionId || mintableAssets.length === 0) {
      setMintedTokenIds({});
      return;
    }
    if (contractStatus?.mintedCount === 0n) {
      setMintedTokenIds({});
      return;
    }
    setMintedScanPending(true);
    const senderAddress = walletSession.address ?? coreContract.address;
    const next: Record<string, string> = {};
    const hashCorrections: Record<string, string> = {};
    try {
      const lookupTokenId = async (hashHex: string) => {
        const hashBytes = hashHexToBytes(hashHex);
        if (!hashBytes) {
          return null;
        }
        try {
          const tokenId = await coreClient.getIdByHash(hashBytes, senderAddress);
          return tokenId === null ? null : tokenId.toString();
        } catch {
          return null;
        }
      };

      for (let offset = 0; offset < mintableAssets.length; offset += MINTED_SCAN_BATCH_SIZE) {
        const batch = mintableAssets.slice(offset, offset + MINTED_SCAN_BATCH_SIZE);
        const settled = await Promise.all(
          batch.map(async (asset) => {
            const knownHashHex =
              normalizeHashHex(canonicalHashHexByAssetId[asset.asset_id]) ??
              normalizeHashHex(asset.expected_hash ?? '');
            if (knownHashHex) {
              const tokenId = await lookupTokenId(knownHashHex);
              if (tokenId) {
                return { assetId: asset.asset_id, tokenId };
              }
            }

            try {
              const rawBytes = await fetchAssetBytes(asset.asset_id);
              const computedHash = computeExpectedHash(chunkBytes(rawBytes));
              const computedHex = bytesToHex(computedHash);
              const rawShaHex = bytesToHex(sha256(rawBytes));

              if (knownHashHex && knownHashHex !== computedHex) {
                // Legacy uploads saved raw SHA-256. Auto-correct in-memory for reads.
                if (knownHashHex === rawShaHex) {
                  hashCorrections[asset.asset_id] = computedHex;
                } else {
                  return null;
                }
              }

              if (!knownHashHex) {
                hashCorrections[asset.asset_id] = computedHex;
              }

              const tokenId = await lookupTokenId(computedHex);
              if (tokenId) {
                return { assetId: asset.asset_id, tokenId };
              }
            } catch {
              return null;
            }
            return null;
          })
        );
        settled.forEach((entry) => {
          if (!entry) {
            return;
          }
          next[entry.assetId] = entry.tokenId;
        });
      }
      setMintedTokenIds(next);
      if (Object.keys(hashCorrections).length > 0) {
        setCanonicalHashHexByAssetId((current) => ({
          ...current,
          ...hashCorrections
        }));
      }
    } finally {
      setMintedScanPending(false);
    }
  }, [
    canonicalHashHexByAssetId,
    contractStatus?.mintedCount,
    coreClient,
    coreContract.address,
    fetchAssetBytes,
    mintableAssets,
    resolvedCollectionId,
    walletSession.address
  ]);

  const ensureConnectedWallet = useCallback(async () => {
    if (walletSession.address && walletSession.network) {
      return walletSession;
    }
    setWalletPending(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
      return session;
    } finally {
      setWalletPending(false);
    }
  }, [walletAdapter, walletSession]);

  const requestCollectionContractCall = useCallback(
    (
      params: {
        functionName: string;
        functionArgs: ClarityValue[];
        postConditionMode?: PostConditionMode;
        postConditions?: PostCondition[];
      },
      session: WalletSession
    ) => {
      if (!collectionContract) {
        throw new Error('Collection contract is not configured.');
      }
      if (!session.address) {
        throw new Error('Connect a wallet before minting.');
      }
      const network = session.network ?? collectionContract.network;
      return new Promise<TxPayload>((resolve, reject) => {
        showContractCall({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName: params.functionName,
          functionArgs: params.functionArgs,
          network,
          stxAddress: session.address,
          postConditionMode: params.postConditionMode ?? PostConditionMode.Deny,
          postConditions: params.postConditions,
          appDetails: {
            name: 'Xtrata Collection Mint',
            icon: XTRATA_APP_ICON_DATA_URI
          },
          onFinish: (payload) => resolve(payload as TxPayload),
          onCancel: () =>
            reject(new Error('Wallet cancelled or failed to broadcast transaction.'))
        });
      });
    },
    [collectionContract]
  );

  const getMintProgress = useCallback(
    async (
      expectedHashBytes: Uint8Array,
      session: WalletSession
    ): Promise<MintProgress> => {
      if (!collectionContract || !session.address) {
        throw new Error('Connect a wallet before minting.');
      }
      const senderAddress = session.address;
      const network = toStacksNetwork(collectionContract.network);
      const [tokenId, uploadStateResult, reservationCv] = await Promise.all([
        coreClient
          .getIdByHash(expectedHashBytes, senderAddress)
          .catch(() => null),
        coreClient
          .getUploadState(expectedHashBytes, senderAddress, senderAddress)
          .catch(() => null),
        callReadOnlyFunction({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName: 'get-reservation',
          functionArgs: [principalCV(senderAddress), bufferCV(expectedHashBytes)],
          senderAddress,
          network
        }).catch(() => null)
      ]);
      const reservationValue = reservationCv ? unwrapReadOnly(reservationCv) : null;
      const hasReservation = reservationValue?.type === ClarityType.OptionalSome;
      return {
        tokenId,
        uploadState: uploadStateResult,
        hasReservation
      };
    },
    [collectionContract, coreClient]
  );

  const checkReservationForHash = useCallback(
    async (owner: string, hashBytes: Uint8Array) => {
      if (!collectionContract) {
        return false;
      }
      const network = toStacksNetwork(collectionContract.network);
      const reservationCv = await callReadOnlyFunction({
        contractAddress: collectionContract.address,
        contractName: collectionContract.contractName,
        functionName: 'get-reservation',
        functionArgs: [principalCV(owner), bufferCV(hashBytes)],
        senderAddress: owner,
        network
      }).catch(() => null);
      return isOptionalSome(reservationCv);
    },
    [collectionContract]
  );

  const findResumableAssetForWallet = useCallback(
    async (owner: string) => {
      const resolveAsset = (assetId: string | null) => {
        if (!assetId) {
          return null;
        }
        return mintableAssets.find((asset) => asset.asset_id === assetId) ?? null;
      };

      const cached = resumableLookupCacheRef.current;
      if (cached && cached.owner === owner) {
        if (cached.promise) {
          return resolveAsset(await cached.promise);
        }
        if (Date.now() - cached.checkedAt < RESUMABLE_LOOKUP_CACHE_MS) {
          return resolveAsset(cached.assetId);
        }
      }

      const scanPromise = (async (): Promise<string | null> => {
        const candidates = mintableAssets.filter(
          (asset) =>
            !pendingMintAssetIds.includes(asset.asset_id) &&
            !mintedTokenIds[asset.asset_id]
        );
        if (candidates.length === 0) {
          return null;
        }

        const knownHashCandidates = candidates.flatMap((candidate) => {
          const knownHashHex =
            normalizeHashHex(canonicalHashHexByAssetId[candidate.asset_id]) ??
            normalizeHashHex(candidate.expected_hash ?? '');
          if (!knownHashHex) {
            return [];
          }
          const knownHashBytes = hashHexToBytes(knownHashHex);
          if (!knownHashBytes) {
            return [];
          }
          return [{ asset: candidate, hashBytes: knownHashBytes }];
        });

        const knownMatch = await findFirstMatchInBatches({
          items: knownHashCandidates,
          batchSize: RESERVATION_SCAN_BATCH_SIZE,
          predicate: async ({ hashBytes }) => checkReservationForHash(owner, hashBytes)
        });
        if (knownMatch) {
          return knownMatch.asset.asset_id;
        }

        const hashCorrections: Record<string, string> = {};
        let matchedAssetId: string | null = null;
        await findFirstMatchInBatches({
          items: candidates,
          batchSize: RESERVATION_SCAN_COMPUTE_BATCH_SIZE,
          predicate: async (candidate) => {
            try {
              const rawBytes = await fetchAssetBytes(candidate.asset_id);
              const computedHash = computeExpectedHash(chunkBytes(rawBytes));
              const computedHex = bytesToHex(computedHash);
              const rawShaHex = bytesToHex(sha256(rawBytes));
              const knownHashHex =
                normalizeHashHex(canonicalHashHexByAssetId[candidate.asset_id]) ??
                normalizeHashHex(candidate.expected_hash ?? '');

              if (knownHashHex && knownHashHex !== computedHex) {
                if (knownHashHex === rawShaHex) {
                  hashCorrections[candidate.asset_id] = computedHex;
                } else {
                  return false;
                }
              }

              if (!knownHashHex) {
                hashCorrections[candidate.asset_id] = computedHex;
              }

              if (await checkReservationForHash(owner, computedHash)) {
                matchedAssetId = candidate.asset_id;
                return true;
              }
            } catch {
              // Ignore candidate fetch/read failures while scanning for resumable mints.
            }
            return false;
          }
        });

        if (Object.keys(hashCorrections).length > 0) {
          setCanonicalHashHexByAssetId((current) => ({
            ...current,
            ...hashCorrections
          }));
        }

        return matchedAssetId;
      })();

      resumableLookupCacheRef.current = {
        owner,
        checkedAt: Date.now(),
        assetId: null,
        promise: scanPromise
      };

      try {
        const assetId = await scanPromise;
        if (resumableLookupCacheRef.current?.promise === scanPromise) {
          resumableLookupCacheRef.current = {
            owner,
            checkedAt: Date.now(),
            assetId,
            promise: null
          };
        }
        return resolveAsset(assetId);
      } catch (error) {
        if (resumableLookupCacheRef.current?.promise === scanPromise) {
          resumableLookupCacheRef.current = null;
        }
        throw error;
      }
    },
    [
      canonicalHashHexByAssetId,
      checkReservationForHash,
      fetchAssetBytes,
      mintableAssets,
      mintedTokenIds,
      pendingMintAssetIds
    ]
  );

  const waitForMintProgress = useCallback(
    async (
      expectedHashBytes: Uint8Array,
      session: WalletSession,
      statusLabel: string,
      predicate: (progress: MintProgress) => boolean
    ) => {
      for (let attempt = 1; attempt <= CHAIN_SYNC_MAX_ATTEMPTS; attempt += 1) {
        const progress = await getMintProgress(expectedHashBytes, session);
        if (predicate(progress)) {
          return progress;
        }
        setMintMessage(
          `${statusLabel} (${attempt}/${CHAIN_SYNC_MAX_ATTEMPTS})...`
        );
        await pause(CHAIN_SYNC_INTERVAL_MS);
      }
      throw new Error(
        `${statusLabel} timed out. Wait for chain confirmation, then click Resume mint.`
      );
    },
    [getMintProgress]
  );

  const mintAsset = useCallback(
    async (asset: CollectionAsset, session: WalletSession) => {
      let activeStage: 'begin' | 'upload' | 'seal' | 'single' = 'begin';
      const senderAddress = session.address;
      if (!senderAddress) {
        throw new Error('Connect a wallet before minting.');
      }
      const knownHashHex =
        normalizeHashHex(canonicalHashHexByAssetId[asset.asset_id]) ??
        normalizeHashHex(asset.expected_hash ?? '');
      const tokenUri = DEFAULT_TOKEN_URI;
      try {
        const rawBytes = await fetchAssetBytes(asset.asset_id);
        const chunks = chunkBytes(rawBytes);
        const computedHash = computeExpectedHash(chunks);
        const computedHex = bytesToHex(computedHash);
        const rawShaHex = bytesToHex(sha256(rawBytes));

        if (knownHashHex && knownHashHex !== computedHex) {
          if (knownHashHex === rawShaHex) {
            appendMintLog(
              'Legacy hash format detected for a collection item. Auto-correcting.'
            );
          } else {
            throw new Error(
              'Asset hash metadata does not match uploaded bytes. Re-upload this asset to continue.'
            );
          }
        }

        if (!knownHashHex || knownHashHex !== computedHex) {
          setCanonicalHashHexByAssetId((current) => ({
            ...current,
            [asset.asset_id]: computedHex
          }));
        }

        if (asset.total_bytes > 0 && asset.total_bytes !== rawBytes.length) {
          throw new Error('Asset byte size does not match staged metadata.');
        }
        if (asset.total_chunks > 0 && asset.total_chunks !== chunks.length) {
          throw new Error('Asset chunk count does not match staged metadata.');
        }

        const expectedHashBytes = computedHash;
        const coreContractId = `${coreContract.address}.${coreContract.contractName}`;
        let progress = await getMintProgress(expectedHashBytes, session);
        if (progress.tokenId !== null) {
          const existing = progress.tokenId.toString();
          setMintedTokenIds((current) => ({ ...current, [asset.asset_id]: existing }));
          appendMintLog(`Already minted as ${formatTokenReference(existing)}.`);
          setBeginState('done');
          setUploadState('done');
          setSealState('done');
          return existing;
        }

        const useSmallSingleTxRoute = shouldUseCollectionSmallSingleTx({
          templateVersion,
          chunkCount: chunks.length,
          hasReservation: progress.hasReservation,
          hasUploadState: progress.uploadState !== null
        });
        if (useSmallSingleTxRoute) {
          activeStage = 'single';
          setBeginState('pending');
          setUploadState('pending');
          setSealState('pending');
          appendMintLog(
            `Small-file single-tx route active (<=${SMALL_MINT_HELPER_MAX_CHUNKS} chunks).`
          );

          const singleTxSpendCap = resolveSmallSingleTxSpendCap(chunks.length);
          if (singleTxSpendCap === null) {
            throw new Error(
              'Single-tx safety cap is unavailable. Refresh on-chain status, then retry.'
            );
          }
          appendMintLog(
            collectionMintPaymentModel === 'begin'
              ? `Single-tx safety cap <= ${toMicroStxLabel(singleTxSpendCap)} (begin fee + seal protocol fee; mint price settled at begin).`
              : useMintPriceTotalCap
                ? `Single-tx safety cap <= ${toMicroStxLabel(singleTxSpendCap)} (displayed mint price includes begin + seal protocol fees).`
              : useMintPriceSealCap
                ? `Single-tx safety cap <= ${toMicroStxLabel(singleTxSpendCap)} (displayed mint price + begin anti-spam fee).`
                : `Single-tx safety cap <= ${toMicroStxLabel(singleTxSpendCap)} (mint price + begin anti-spam + seal protocol fee).`
          );

          const singleTxPostConditions = resolveSmallSingleTxPostConditions(
            senderAddress,
            chunks.length
          );
          if (!singleTxPostConditions) {
            throw new Error(
              'Single-tx wallet safety checks are unavailable. Refresh status, then retry.'
            );
          }

          setMintMessage('Approve single-transaction mint in wallet.');
          const singleTx = await requestCollectionContractCall(
            {
              functionName: 'mint-small-single-tx',
              functionArgs: [
                principalCV(coreContractId),
                bufferCV(expectedHashBytes),
                stringAsciiCV(asset.mime_type || 'application/octet-stream'),
                uintCV(BigInt(rawBytes.length)),
                listCV(chunks.map((chunk) => bufferCV(chunk))),
                stringAsciiCV(tokenUri)
              ],
              postConditionMode: PostConditionMode.Deny,
              postConditions: singleTxPostConditions
            },
            session
          );
          appendMintLog(`Single-tx mint submitted: ${singleTx.txId}`);
          progress = await waitForMintProgress(
            expectedHashBytes,
            session,
            'Waiting for single-tx mint confirmation',
            (next) => next.tokenId !== null
          );
          if (progress.tokenId === null) {
            throw new Error(
              'Single-tx mint submitted but token id is not confirmed yet. Wait for confirmation, then resume.'
            );
          }
          const tokenId = progress.tokenId.toString();
          setMintedTokenIds((current) => ({ ...current, [asset.asset_id]: tokenId }));
          setBeginState('done');
          setUploadState('done');
          setSealState('done');
          return tokenId;
        }

        const needsBegin = !progress.hasReservation || progress.uploadState === null;
        if (needsBegin) {
          const beginSpendCap = resolveCollectionBeginSpendCapMicroStx({
            mintPrice: contractStatus?.mintPrice ?? null,
            activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
            protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
            chargeMintPriceAtBegin
          });
          if (beginSpendCap !== null) {
            appendMintLog(
              chargeMintPriceAtBegin
                ? `Begin safety cap <= ${toMicroStxLabel(beginSpendCap)} (mint price + protocol begin fee).`
                : `Begin safety cap <= ${toMicroStxLabel(beginSpendCap)} (protocol anti-spam fee only).`
            );
          }
          const beginPostConditions = resolveMintBeginPostConditions(senderAddress);
          if (!beginPostConditions) {
            throw new Error(
              'Mint pricing data is unavailable for wallet safety checks. Refresh status, then retry.'
            );
          }
          setBeginState('pending');
          setMintMessage('Approve begin transaction in wallet.');
          const beginTx = await requestCollectionContractCall(
            {
              functionName: 'mint-begin',
              functionArgs: [
                principalCV(coreContractId),
                bufferCV(expectedHashBytes),
                stringAsciiCV(asset.mime_type || 'application/octet-stream'),
                uintCV(BigInt(rawBytes.length)),
                uintCV(BigInt(chunks.length))
              ],
              postConditionMode: PostConditionMode.Deny,
              postConditions: beginPostConditions
            },
            session
          );
          appendMintLog(`Begin submitted: ${beginTx.txId}`);
          progress = await waitForMintProgress(
            expectedHashBytes,
            session,
            'Waiting for begin confirmation',
            (next) => next.tokenId !== null || next.uploadState !== null
          );
          setBeginState('done');
          if (progress.tokenId !== null) {
            const tokenId = progress.tokenId.toString();
            setMintedTokenIds((current) => ({ ...current, [asset.asset_id]: tokenId }));
            setUploadState('done');
            setSealState('done');
            return tokenId;
          }
          await pauseBeforeNextTx('Next batch in');
        } else {
          setBeginState('done');
          appendMintLog('Begin already confirmed on-chain. Resuming upload.');
        }

        activeStage = 'upload';
        const onChainIndexRaw = progress.uploadState?.currentIndex ?? 0n;
        const onChainIndex = Number(onChainIndexRaw);
        if (!Number.isSafeInteger(onChainIndex) || onChainIndex < 0) {
          throw new Error('Invalid on-chain upload index. Try again in a moment.');
        }
        if (onChainIndex > chunks.length) {
          throw new Error('On-chain upload index exceeds staged chunk count.');
        }

        const remainingChunkBatches = batchChunks(
          chunks.slice(onChainIndex),
          MINT_CHUNK_BATCH_SIZE
        );
        if (remainingChunkBatches.length > 0) {
          setUploadState('pending');
          setBatchProgress({ current: 0, total: remainingChunkBatches.length });
          let committedIndex = onChainIndex;
          for (let index = 0; index < remainingChunkBatches.length; index += 1) {
            const batch = remainingChunkBatches[index];
            const targetIndex = committedIndex + batch.length;
            setBatchProgress({ current: index + 1, total: remainingChunkBatches.length });
            setMintMessage(
              `Approve chunk upload ${index + 1}/${remainingChunkBatches.length} in wallet.`
            );
            const uploadTx = await requestCollectionContractCall(
              {
                functionName: 'mint-add-chunk-batch',
                functionArgs: [
                  principalCV(coreContractId),
                  bufferCV(expectedHashBytes),
                  listCV(batch.map((chunk) => bufferCV(chunk)))
                ],
                postConditionMode: PostConditionMode.Deny
              },
              session
            );
            appendMintLog(
              `Chunk batch ${index + 1}/${remainingChunkBatches.length} submitted: ${uploadTx.txId}`
            );
            progress = await waitForMintProgress(
              expectedHashBytes,
              session,
              `Waiting for batch ${index + 1}/${remainingChunkBatches.length}`,
              (next) => {
                if (next.tokenId !== null) {
                  return true;
                }
                const currentIndex = next.uploadState?.currentIndex;
                return currentIndex ? currentIndex >= BigInt(targetIndex) : false;
              }
            );
            if (progress.tokenId !== null) {
              break;
            }
            committedIndex = Number(progress.uploadState?.currentIndex ?? BigInt(targetIndex));
            if (index < remainingChunkBatches.length - 1) {
              await pauseBeforeNextTx('Next batch in');
            }
          }
          setUploadState('done');
          setBatchProgress(null);
        } else {
          setUploadState('done');
          appendMintLog('Upload already complete on-chain. Moving to seal.');
        }

        if (progress.tokenId !== null) {
          const tokenId = progress.tokenId.toString();
          setMintedTokenIds((current) => ({ ...current, [asset.asset_id]: tokenId }));
          setSealState('done');
          return tokenId;
        }

        progress = await getMintProgress(expectedHashBytes, session);
        if (progress.tokenId !== null) {
          const tokenId = progress.tokenId.toString();
          setMintedTokenIds((current) => ({ ...current, [asset.asset_id]: tokenId }));
          setSealState('done');
          return tokenId;
        }
        if (!progress.hasReservation) {
          throw new Error(
            'Mint reservation is missing before seal. Click Resume mint to recover from chain state.'
          );
        }

        activeStage = 'seal';
        const sealPostConditions = resolveSealPostConditions(
          senderAddress,
          chunks.length
        );
        if (!sealPostConditions) {
          throw new Error(
            'Seal fee safety cap is unavailable. Refresh contract status and retry.'
          );
        }
        const sealSpendCap =
          collectionMintPaymentModel === 'begin'
            ? resolveSealSpendCapMicroStx({
                protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
                totalChunks: chunks.length
              })
            : useMintPriceTotalCap
              ? (() => {
                  const beginCap = resolveBeginSpendCapForMintPriceTotal();
                  if (
                    beginCap === null ||
                    collectionMintPricingConfig.mintPriceMicroStx === null
                  ) {
                    return null;
                  }
                  const cap = collectionMintPricingConfig.mintPriceMicroStx - beginCap;
                  return cap >= 0n ? cap : null;
                })()
            : useMintPriceSealCap
              ? collectionMintPricingConfig.mintPriceMicroStx
              : resolveCollectionSealSpendCapMicroStx({
                  mintPrice: contractStatus?.mintPrice ?? null,
                  activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
                  protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
                  totalChunks: chunks.length
                });
        if (sealSpendCap !== null) {
          appendMintLog(
            collectionMintPaymentModel === 'begin'
              ? `Seal safety cap <= ${toMicroStxLabel(sealSpendCap)} for ${chunks.length} chunk(s) (protocol seal fee only; mint price was charged at begin).`
              : useMintPriceTotalCap
                ? `Seal safety cap <= ${toMicroStxLabel(sealSpendCap)} for ${chunks.length} chunk(s) (displayed mint price includes begin + seal protocol fees).`
              : useMintPriceSealCap
                ? `Seal safety cap <= ${toMicroStxLabel(sealSpendCap)} for ${chunks.length} chunk(s) (displayed mint price includes worst-case seal fee).`
                : `Seal safety cap <= ${toMicroStxLabel(sealSpendCap)} for ${chunks.length} chunk(s) (mint price + protocol seal fee).`
          );
        }
        setSealState('pending');
        await pauseBeforeNextTx('Sealing in');
        setMintMessage('Approve seal transaction in wallet.');
        const sealTx = await requestCollectionContractCall(
          {
            functionName: 'mint-seal',
            functionArgs: [
              principalCV(coreContractId),
              bufferCV(expectedHashBytes),
              stringAsciiCV(tokenUri)
            ],
            postConditionMode: PostConditionMode.Deny,
            postConditions: sealPostConditions
          },
          session
        );
        appendMintLog(`Seal submitted: ${sealTx.txId}`);
        progress = await waitForMintProgress(
          expectedHashBytes,
          session,
          'Waiting for seal confirmation',
          (next) => next.tokenId !== null
        );
        if (progress.tokenId === null) {
          throw new Error(
            'Seal submitted but token id is not confirmed yet. Wait for confirmation, then resume.'
          );
        }
        const tokenId = progress.tokenId.toString();
        setMintedTokenIds((current) => ({ ...current, [asset.asset_id]: tokenId }));
        setSealState('done');
        return tokenId;
      } catch (error) {
        if (activeStage === 'begin') {
          setBeginState('error');
        } else if (activeStage === 'single') {
          setBeginState('error');
          setUploadState('error');
          setSealState('error');
        } else if (activeStage === 'upload') {
          setUploadState('error');
        } else {
          setSealState('error');
        }
        setBatchProgress(null);
        throw error;
      }
    },
    [
      appendMintLog,
      canonicalHashHexByAssetId,
      chargeMintPriceAtBegin,
      collectionMintPaymentModel,
      collectionMintPricingConfig.mintPriceMicroStx,
      contractStatus?.activePhaseMintPrice,
      contractStatus?.coreFeeUnitMicroStx,
      contractStatus?.mintPrice,
      coreContract.address,
      coreContract.contractName,
      fetchAssetBytes,
      formatTokenReference,
      getMintProgress,
      pauseBeforeNextTx,
      resolveSmallSingleTxPostConditions,
      resolveSmallSingleTxSpendCap,
      resolveBeginSpendCapForMintPriceTotal,
      resolveSealPostConditions,
      resolveMintBeginPostConditions,
      requestCollectionContractCall,
      templateVersion,
      useMintPriceTotalCap,
      useMintPriceSealCap,
      waitForMintProgress
    ]
  );

  const handleMintNow = useCallback(async () => {
    if (mintPending || walletPending) {
      setMintMessage('Mint is already in progress. Complete the current step first.');
      return;
    }
    if (mintUnavailableReason) {
      setMintMessage(mintUnavailableReason);
      return;
    }

    setMintPending(true);
    resetSteps();
    setMintMessage(null);
    setMintLog([]);
    let selectedAssetId: string | null = null;
    try {
      const session = await ensureConnectedWallet();
      if (!session.address || !session.network) {
        throw new Error('Connect a wallet before minting.');
      }
      if (!collectionContract) {
        throw new Error('Collection contract is not configured.');
      }
      const mismatch = getNetworkMismatch(collectionContract.network, session.network);
      if (mismatch) {
        throw new Error(`Switch wallet to ${mismatch.expected} before minting.`);
      }
      const senderAddress = session.address;

      const shuffled = shuffleAssets(mintableAssets);
      const nextMinted = { ...mintedTokenIds };
      let target: CollectionAsset | null = null;

      if (resumeAssetId) {
        const resumeTarget = mintableAssets.find((asset) => asset.asset_id === resumeAssetId);
        if (
          resumeTarget &&
          !pendingMintAssetIds.includes(resumeTarget.asset_id) &&
          !nextMinted[resumeTarget.asset_id]
        ) {
          target = resumeTarget;
          appendMintLog('Resuming previous collection mint attempt.');
        }
      }

      if (!target && shouldProbeWalletReservation) {
        setMintMessage('Checking for one of your existing reservations...');
        const reservable = await findResumableAssetForWallet(senderAddress);
        if (reservable) {
          target = reservable;
          setResumeAssetId(reservable.asset_id);
          appendMintLog(
            'Active reservation detected for this wallet. Resuming that item.'
          );
          setMintMessage('Active reservation found. Opening wallet for the next mint step.');
        } else if (remaining !== null && remaining <= 0n) {
          throw new Error(
            'The final mint slot is reserved by another wallet (or awaiting release). If this should be yours, wait for confirmations then retry, or ask admin to release the stale reservation.'
          );
        }
      }

      for (const candidate of shuffled) {
        if (target) {
          break;
        }
        if (pendingMintAssetIds.includes(candidate.asset_id)) {
          continue;
        }
        if (nextMinted[candidate.asset_id]) {
          continue;
        }
        const knownHashHex =
          normalizeHashHex(canonicalHashHexByAssetId[candidate.asset_id]) ??
          normalizeHashHex(candidate.expected_hash ?? '');
        if (knownHashHex) {
          const hashBytes = hashHexToBytes(knownHashHex);
          if (hashBytes) {
            try {
              const existingId = await coreClient.getIdByHash(hashBytes, senderAddress);
              if (existingId !== null) {
                nextMinted[candidate.asset_id] = existingId.toString();
                continue;
              }
            } catch {
              // If this lookup fails, keep trying other candidates.
            }
          }
        }
        target = candidate;
        break;
      }

      setMintedTokenIds(nextMinted);

      if (!target) {
        setMintMessage('No unminted items remain. This collection appears sold out.');
        setResumeAssetId(null);
        await loadContractStatus();
        await scanMintedAssets();
        return;
      }

      selectedAssetId = target.asset_id;
      setResumeAssetId(target.asset_id);
      setPendingMintAssetIds((current) =>
        current.includes(target.asset_id) ? current : [...current, target.asset_id]
      );
      setMintMessage('Preparing next collection item...');
      const tokenId = await mintAsset(target, session);
      const refreshedStatus = await loadContractStatus();
      const syncedIds = await syncCollectionTokenNumbers({
        forceFull: true,
        mintedCount: refreshedStatus?.mintedCount ?? null
      });
      const localTokenNumber = syncedIds ? syncedIds[tokenId] : undefined;
      if (typeof localTokenNumber === 'number') {
        setMintMessage(`Mint confirmed as ${collectionTitle} #${localTokenNumber}.`);
      } else {
        setMintMessage('Mint confirmed. Collection numbering is syncing now.');
      }
      setResumeAssetId(null);
      window.setTimeout(() => {
        void loadContractStatus();
        void syncCollectionTokenNumbers();
        void scanMintedAssets();
      }, 8_000);
    } catch (error) {
      const message = normalizeMintError(error);
      setMintMessage(message);
      appendMintLog(`Mint failed: ${message}`);
      if (selectedAssetId) {
        setResumeAssetId(selectedAssetId);
      }
    } finally {
      if (selectedAssetId) {
        setPendingMintAssetIds((current) =>
          current.filter((value) => value !== selectedAssetId)
        );
      }
      setMintPending(false);
    }
  }, [
    appendMintLog,
    canonicalHashHexByAssetId,
    collectionContract,
    contractStatus?.finalized,
    contractStatus?.paused,
    coreClient,
    ensureConnectedWallet,
    findResumableAssetForWallet,
    mintableAssets,
    loadContractStatus,
    mintAsset,
    mintPending,
    mintUnavailableReason,
    mintedTokenIds,
    normalizeMintError,
    pendingMintAssetIds,
    resetSteps,
    resumeAssetId,
    remaining,
    scanMintedAssets,
    setResumeAssetId,
    shouldProbeWalletReservation,
    syncCollectionTokenNumbers,
    walletPending
  ]);

  useEffect(() => {
    resumableLookupCacheRef.current = null;
  }, [
    canonicalHashHexByAssetId,
    contractStatus?.reservedCount,
    mintableAssets,
    mintedTokenIds,
    pendingMintAssetIds,
    resolvedCollectionId
  ]);

  useEffect(() => {
    const walletAddress = walletSession.address;
    if (!walletAddress || !shouldProbeWalletReservation) {
      return;
    }
    if (mintPending) {
      return;
    }
    if (resumeAssetId && !mintedTokenIds[resumeAssetId]) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const resumable = await findResumableAssetForWallet(walletAddress);
      if (cancelled) {
        return;
      }
      if (resumable && !mintedTokenIds[resumable.asset_id]) {
        setResumeAssetId(resumable.asset_id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    shouldProbeWalletReservation,
    findResumableAssetForWallet,
    mintPending,
    mintedTokenIds,
    resumeAssetId,
    walletSession.address
  ]);

  const handleConnectWallet = useCallback(async () => {
    setWalletPending(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
    } finally {
      setWalletPending(false);
    }
  }, [walletAdapter]);

  const handleDisconnectWallet = useCallback(async () => {
    setWalletPending(true);
    try {
      await walletAdapter.disconnect();
      setWalletSession(walletAdapter.getSession());
    } finally {
      setWalletPending(false);
    }
  }, [walletAdapter]);

  const resolveStatusRefreshIntervalMs = useCallback(() => {
    if (typeof document !== 'undefined' && document.hidden) {
      return STATUS_REFRESH_BACKGROUND_MS;
    }
    if (mintPending) {
      return STATUS_REFRESH_MINTING_MS;
    }
    return STATUS_REFRESH_ACTIVE_MS;
  }, [mintPending]);

  useEffect(() => {
    applyThemeToDocument(themeMode);
    writeThemePreference(themeMode);
  }, [themeMode]);

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

  useEffect(() => {
    void loadCollectionSnapshot();
  }, [loadCollectionSnapshot]);

  useEffect(() => {
    if (!resumeStorageKey) {
      setResumeAssetId(null);
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(resumeStorageKey);
    setResumeAssetId(stored && stored.trim().length > 0 ? stored.trim() : null);
  }, [resumeStorageKey]);

  useEffect(() => {
    if (!resumeStorageKey || typeof window === 'undefined') {
      return;
    }
    if (resumeAssetId) {
      window.localStorage.setItem(resumeStorageKey, resumeAssetId);
      return;
    }
    window.localStorage.removeItem(resumeStorageKey);
  }, [resumeAssetId, resumeStorageKey]);

  useEffect(() => {
    canonicalHashStorageLoadedRef.current = false;
    if (!canonicalHashStorageKey) {
      setCanonicalHashHexByAssetId({});
      canonicalHashStorageLoadedRef.current = true;
      return;
    }
    if (typeof window === 'undefined') {
      canonicalHashStorageLoadedRef.current = true;
      return;
    }
    const stored = window.localStorage.getItem(canonicalHashStorageKey);
    if (!stored) {
      setCanonicalHashHexByAssetId({});
      canonicalHashStorageLoadedRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const normalizedEntries = Object.entries(parsed).flatMap(([assetId, value]) => {
        const normalized = normalizeHashHex(typeof value === 'string' ? value : null);
        return normalized ? [[assetId, normalized] as const] : [];
      });
      setCanonicalHashHexByAssetId(Object.fromEntries(normalizedEntries));
    } catch {
      setCanonicalHashHexByAssetId({});
    } finally {
      canonicalHashStorageLoadedRef.current = true;
    }
  }, [canonicalHashStorageKey]);

  useEffect(() => {
    if (
      !canonicalHashStorageLoadedRef.current ||
      !canonicalHashStorageKey ||
      typeof window === 'undefined'
    ) {
      return;
    }
    const normalizedEntries = Object.entries(canonicalHashHexByAssetId).flatMap(
      ([assetId, hashHex]) => {
        const normalized = normalizeHashHex(hashHex);
        return normalized ? [[assetId, normalized] as const] : [];
      }
    );
    if (normalizedEntries.length === 0) {
      window.localStorage.removeItem(canonicalHashStorageKey);
      return;
    }
    window.localStorage.setItem(
      canonicalHashStorageKey,
      JSON.stringify(Object.fromEntries(normalizedEntries))
    );
  }, [canonicalHashHexByAssetId, canonicalHashStorageKey]);

  useEffect(() => {
    setCanonicalHashHexByAssetId({});
    setMintedTokenIds({});
    setCollectionTokenNumberByGlobalId({});
    setCollectionIndexCount(0);
    setCollectionIndexSyncPending(false);
    setCollectionIndexSyncMessage(null);
    setStatusLastUpdatedAt(null);
    setPendingMintAssetIds([]);
    setResumeAssetId(null);
    setMintLog([]);
    setMintMessage(null);
    resetSteps();
  }, [normalizedCollectionKey, resetSteps]);

  useEffect(() => {
    if (!collectionContract) {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;
    let inFlight = false;

    const clearTimer = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleNext = (delayMs?: number) => {
      clearTimer();
      if (cancelled) {
        return;
      }
      const delay = delayMs ?? resolveStatusRefreshIntervalMs();
      timerId = window.setTimeout(() => {
        void runPoll();
      }, delay);
    };

    const runPoll = async () => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        await loadContractStatus({ silent: true });
      } finally {
        inFlight = false;
        scheduleNext();
      }
    };

    const handleVisibilityOrFocus = () => {
      if (cancelled || inFlight) {
        return;
      }
      clearTimer();
      void runPoll();
    };

    void loadContractStatus();
    scheduleNext(resolveStatusRefreshIntervalMs());
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [collectionContract, loadContractStatus, resolveStatusRefreshIntervalMs]);

  useEffect(() => {
    if (!collectionContract || contractStatus?.mintedCount === null) {
      return;
    }
    void syncCollectionTokenNumbers();
  }, [collectionContract, contractStatus?.mintedCount, syncCollectionTokenNumbers]);

  useEffect(() => {
    if (!collection || !published || !collectionContract || mintableAssets.length === 0) {
      return;
    }
    void scanMintedAssets();
  }, [
    collection,
    collectionContract,
    mintableAssets.length,
    published,
    scanMintedAssets,
    contractStatus?.mintedCount
  ]);

  useEffect(() => {
    if (!resumeAssetId) {
      return;
    }
    if (mintedTokenIds[resumeAssetId]) {
      setResumeAssetId(null);
    }
  }, [mintedTokenIds, resumeAssetId]);

  const mintedCountLabel = formatCount(contractStatus?.mintedCount ?? null);
  const maxSupplyLabel = formatCount(contractStatus?.maxSupply ?? null);
  const reservedCountLabel = formatCount(contractStatus?.reservedCount ?? null);
  const remainingLabel = remaining === null ? 'Unknown' : remaining.toString();
  const statusRefreshNote = statusLastUpdatedAt
    ? `Auto-refreshing every ~6s while active (${STATUS_REFRESH_BACKGROUND_MS / 1000}s in background). Last sync ${new Date(
        statusLastUpdatedAt
      ).toLocaleTimeString()}.`
    : 'Auto-refreshing every ~6s while active. Waiting for first sync...';
  const effectiveOnChainMintPrice =
    contractStatus?.activePhaseMintPrice ?? contractStatus?.mintPrice ?? null;
  const useDisplayedMintPrice = useMintPriceSealCap || useMintPriceTotalCap;
  const displayedMintPriceMicroStx = useDisplayedMintPrice
    ? collectionMintPricingConfig.mintPriceMicroStx
    : effectiveOnChainMintPrice;
  const mintPriceLabel = toMicroStxLabel(displayedMintPriceMicroStx);
  const mintPriceDisplay = formatMicroStxWithUsd(
    displayedMintPriceMicroStx,
    usdPriceBook
  );
  const freeMint = isDisplayedCollectionMintFree({
    activePhaseMintPriceMicroStx: contractStatus?.activePhaseMintPrice ?? null,
    paymentModel: collectionMintPaymentModel,
    pricing: collectionMintPricingConfig,
    statusMintPriceMicroStx: contractStatus?.mintPrice ?? null
  });
  const statePillLabel = soldOut
    ? 'Sold out'
    : contractStatus?.finalized
      ? 'Finalized'
      : contractStatus?.paused
        ? 'Paused'
        : published
          ? 'Live'
          : humanizeStateLabel(collectionState);
  const statePillTone = soldOut
    ? 'sold-out'
    : contractStatus?.finalized
      ? 'finalized'
      : contractStatus?.paused
        ? 'paused'
        : published
          ? 'live'
          : 'unknown';
  const mintPriceTone =
    resolveCollectionMintPriceTone({
      displayedMintPriceMicroStx,
      freeMint
    });
  const mintPriceToneClass = `collection-live-page__hero-price-card--${mintPriceTone}`;
  const heroStatusLabel = soldOut ? 'Sold out' : freeMint ? 'Free mint' : null;
  const mintBeginSpendCap = resolveCollectionBeginSpendCapMicroStx({
    mintPrice: contractStatus?.mintPrice ?? null,
    activePhaseMintPrice: contractStatus?.activePhaseMintPrice ?? null,
    protocolFeeMicroStx: contractStatus?.coreFeeUnitMicroStx ?? null,
    chargeMintPriceAtBegin
  });
  const protocolFeeUnitLabel = toMicroStxLabel(contractStatus?.coreFeeUnitMicroStx ?? null);
  const fallbackMaxChunkCount = largestMintableAsset?.totalChunks ?? null;
  const fallbackMaxBytes = largestMintableAsset?.totalBytes ?? null;
  const collectionMaxChunkCount = deployPricingLock?.maxChunks ?? fallbackMaxChunkCount;
  const collectionMaxBytes = deployPricingLock?.maxBytes ?? fallbackMaxBytes;
  const estimatedUploadTransactionCount =
    collectionMaxChunkCount === null || collectionMaxChunkCount <= 0
      ? null
      : Math.max(1, Math.ceil(collectionMaxChunkCount / MINT_CHUNK_BATCH_SIZE));
  const estimatedWalletApprovals =
    estimatedUploadTransactionCount === null
      ? null
      : 2 + estimatedUploadTransactionCount;
  const supportsSingleTxRoute = supportsCollectionSmallSingleTx(templateVersion);
  const hasSingleTxEligibleAssets =
    supportsSingleTxRoute &&
    mintableAssets.some((asset) => {
      const chunkCount = resolveAssetChunkCount(asset);
      return chunkCount > 0 && chunkCount <= SMALL_MINT_HELPER_MAX_CHUNKS;
    });
  const estimatedSealFeeUnits =
    collectionMaxChunkCount === null || collectionMaxChunkCount <= 0
      ? null
      : 1 + Math.ceil(collectionMaxChunkCount / MAX_BATCH_SIZE);
  const minimumProtocolFeeTotal =
    contractStatus?.coreFeeUnitMicroStx && contractStatus.coreFeeUnitMicroStx > 0n
      ? contractStatus.coreFeeUnitMicroStx * 3n
      : null;
  const estimatedMaxProtocolFeeTotal =
    contractStatus?.coreFeeUnitMicroStx &&
    contractStatus.coreFeeUnitMicroStx > 0n &&
    estimatedSealFeeUnits !== null
      ? contractStatus.coreFeeUnitMicroStx * BigInt(1 + estimatedSealFeeUnits)
      : null;
  const sealMinProtocolFee =
    contractStatus?.coreFeeUnitMicroStx && contractStatus.coreFeeUnitMicroStx > 0n
      ? contractStatus.coreFeeUnitMicroStx * 2n
      : null;
  const exampleSealTotalForFiveStx =
    sealMinProtocolFee === null ? null : 5_000_000n + sealMinProtocolFee;
  const uploadExpiryDays = Math.round(COLLECTION_UPLOAD_EXPIRY_BLOCKS / APPROX_BLOCKS_PER_DAY);
  const collectionMaxSizeLabel =
    collectionMaxBytes && collectionMaxBytes > 0
      ? formatBytes(BigInt(collectionMaxBytes))
      : null;
  const protocolFeeRangeLabel =
    minimumProtocolFeeTotal && estimatedMaxProtocolFeeTotal
      ? minimumProtocolFeeTotal === estimatedMaxProtocolFeeTotal
        ? toMicroStxLabel(minimumProtocolFeeTotal)
        : `${toMicroStxLabel(minimumProtocolFeeTotal)} - ${toMicroStxLabel(
            estimatedMaxProtocolFeeTotal
          )}`
      : minimumProtocolFeeTotal
        ? `from ${toMicroStxLabel(minimumProtocolFeeTotal)}`
        : 'Loading...';
  const miningFeeBallparkLabel =
    feeGuidance?.available && feeGuidance.totals.highBallparkMicroStx > 0
      ? `${formatMiningFeeMicroStx(
          feeGuidance.totals.lowBallparkMicroStx
        )} - ${formatMiningFeeMicroStx(feeGuidance.totals.highBallparkMicroStx)}`
      : null;
  const miningFeeDefaultComparisonLabel =
    feeGuidance?.available && feeGuidance.totals.walletDefaultMicroStx > 0
      ? `${formatMiningFeeMicroStx(
          feeGuidance.totals.recommendedMicroStx
        )} vs wallet-default ${formatMiningFeeMicroStx(
          feeGuidance.totals.walletDefaultMicroStx
        )}`
      : null;
  const pausedStatus = contractStatus?.paused;
  const pausedLabel =
    pausedStatus === null || pausedStatus === undefined
      ? 'Unknown'
      : pausedStatus
        ? 'Yes'
        : 'No';
  const finalizedStatus = contractStatus?.finalized;
  const finalizedLabel =
    finalizedStatus === null || finalizedStatus === undefined
      ? 'Unknown'
      : finalizedStatus
        ? 'Yes'
        : 'No';
  const resumeTargetAsset = useMemo(
    () =>
      resumeAssetId
        ? mintableAssets.find((asset) => asset.asset_id === resumeAssetId) ?? null
        : null,
    [mintableAssets, resumeAssetId]
  );
  const heroMintStatusMessage = useMemo(() => {
    if (mintMessage) {
      return mintMessage;
    }
    if (networkMismatch) {
      return `Wallet is on ${networkMismatch.actual}. Switch to ${networkMismatch.expected} to mint.`;
    }
    if (!published) {
      return 'This collection is not live yet. Publishing is required before public minting.';
    }
    if (mintUnavailableReason) {
      return mintUnavailableReason;
    }
    return null;
  }, [mintMessage, mintUnavailableReason, networkMismatch, published]);
  const formattedTxDelay =
    txDelaySeconds === null ? null : txDelaySeconds.toString().padStart(2, '0');

  return (
    <div className="app collection-live-page">
      <header className="app__header collection-live-page__header">
        <div className="collection-live-page__brandbar">
          <a
            className="collection-live-page__brand"
            href="/"
            aria-label="Go to the Xtrata homepage"
          >
            <span className="collection-live-page__brand-mark">XTRATA</span>
            <span className="collection-live-page__brand-context">Live collection mint</span>
          </a>
          <a className="collection-live-page__brand-link" href="/">
            Back to homepage
          </a>
        </div>
        <WalletTopBar
          walletSession={walletSession}
          walletPending={walletPending}
          onConnect={handleConnectWallet}
          onDisconnect={handleDisconnectWallet}
        />
        <section className="collection-live-page__hero">
          <div className="collection-live-page__hero-media-column">
            <div className="collection-live-page__hero-media">
              <CollectionCoverImage
                coverImage={metadataCover}
                collectionId={resolvedCollectionId}
                fallbackCoreContractId={toText(metadata?.coreContractId)}
                fallbackUrl={fallbackCoverUrl}
                alt={`${collectionTitle} cover`}
                placeholderClassName="collection-live-page__hero-placeholder"
                emptyMessage="Cover image unavailable"
                loadingMessage="Resolving cover image..."
                errorMessage="Cover image unavailable"
                loading="eager"
                debugLabel={`live-hero:${resolvedCollectionId || collectionTitle}`}
              />
            </div>
            <div className="collection-live-page__hero-media-summary">
              <div className="collection-live-page__hero-pills">
                <span className="collection-live-page__hero-pill collection-live-page__hero-pill--ticker">
                  {collectionSymbol}
                </span>
                <span
                  className={`collection-live-page__hero-pill collection-live-page__hero-pill--state collection-live-page__hero-pill--state-${statePillTone}`}
                >
                  {statePillLabel}
                </span>
              </div>
              <div className={`collection-live-page__hero-price-card ${mintPriceToneClass}`}>
                <span className="collection-live-page__hero-price-label">Mint price</span>
                <strong>{mintPriceLabel}</strong>
                <span className="collection-live-page__hero-price-subtle">
                  {mintPriceDisplay.secondary ?? '\u00a0'}
                </span>
              </div>
              {freeMint && (
                <p className="collection-live-page__hero-media-note">
                  This price covers Xtrata protocol fees only. Collectors still pay wallet mining
                  fees, while artist, marketplace, and operator payouts stay at 0 STX.
                </p>
              )}
            </div>
          </div>
          <div className="collection-live-page__hero-copy">
            <div className="collection-live-page__title-row">
              <div className="collection-live-page__title-block">
                <p className="collection-live-page__eyebrow">Live collection mint</p>
                <h1>{collectionTitle}</h1>
              </div>
              {heroStatusLabel && (
                <div className="collection-live-page__hero-badge-slot">
                  <span
                    className={`collection-live-page__hero-banner ${
                      soldOut
                        ? 'collection-live-page__hero-banner--sold-out'
                        : 'collection-live-page__hero-banner--free-mint'
                    }`}
                  >
                    {heroStatusLabel}
                  </span>
                </div>
              )}
              <div className="collection-live-page__artist-card">
                <span className="meta-label">Artist address</span>
                <AddressLabel
                  className="collection-live-page__artist-label"
                  address={artistAddress || null}
                  network={artistNetwork}
                  fallback="Artist address unavailable"
                />
              </div>
            </div>
            <p className="collection-live-page__description">{collectionDescription}</p>
            <div className="collection-live-page__hero-stats">
              <article className="collection-live-page__hero-stat">
                <span className="meta-label">Minted / max</span>
                <strong>
                  {mintedCountLabel} / {maxSupplyLabel}
                </strong>
              </article>
              <article className="collection-live-page__hero-stat">
                <span className="meta-label">Reserved</span>
                <strong>{reservedCountLabel}</strong>
              </article>
              <article className="collection-live-page__hero-stat">
                <span className="meta-label">Remaining</span>
                <strong>{remainingLabel}</strong>
              </article>
            </div>
            <div className="collection-live-page__hero-actions">
              <button
                className="button"
                type="button"
                onClick={() => void handleMintNow()}
                disabled={mintPending || walletPending || Boolean(mintUnavailableReason)}
              >
                {mintPending
                  ? 'Minting...'
                  : mintUnavailableReason
                    ? 'Mint unavailable'
                    : resumeTargetAsset
                      ? 'Resume mint'
                      : 'Mint one now'}
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setShowMintGuide((current) => !current)}
                aria-expanded={showMintGuide}
                aria-controls="live-mint-guide"
              >
                {showMintGuide ? 'Hide mint guide' : 'How minting works'}
              </button>
            </div>
            {showMintGuide && (
              <div id="live-mint-guide" className="collection-live-page__mint-guide">
                <p className="collection-live-page__mint-guide-title">
                  {hasSingleTxEligibleAssets
                    ? `Xtrata mint flow: 1-3 wallet signatures (<=${SMALL_MINT_HELPER_MAX_CHUNKS} chunks auto-route to single-tx)`
                    : 'Xtrata mint flow: minimum 3 wallet signatures'}
                </p>
                <div className="collection-live-page__mint-guide-summary">
                  <p className="collection-live-page__mint-guide-summary-title">
                    Collection-specific values for {collectionTitle}
                  </p>
                  <ul className="collection-live-page__mint-guide-summary-list">
                    <li>Max size: {collectionMaxSizeLabel ?? 'Loading...'}</li>
                    <li>Max upload batches: {estimatedUploadTransactionCount ?? '...'}</li>
                    <li>Max total signatures: {estimatedWalletApprovals ?? '...'}</li>
                    {hasSingleTxEligibleAssets && (
                      <li>
                        Small-file route: one signature for assets up to{' '}
                        {SMALL_MINT_HELPER_MAX_CHUNKS} chunks
                      </li>
                    )}
                    <li>Protocol fee range: {protocolFeeRangeLabel}</li>
                    <li>
                      Mining fee ballpark:{' '}
                      {miningFeeBallparkLabel ?? 'Upload at least one file to estimate'}
                    </li>
                  </ul>
                </div>
                <ol className="collection-live-page__mint-guide-list">
                  <li className="collection-live-page__mint-guide-item">
                    <strong>Begin transaction</strong>
                    <span>
                      Starts your mint session and anti-spam protection. This includes one
                      protocol fee unit ({protocolFeeUnitLabel}).
                    </span>
                  </li>
                  <li className="collection-live-page__mint-guide-item">
                    <strong>Upload batch transactions</strong>
                    <span>
                      Data is inscribed here. These can require multiple signatures, but upload
                      batches do not add Xtrata protocol fees (only network mining fees). If a
                      session is interrupted, resume will continue from confirmed chunks so data is
                      not uploaded twice. With the current collection max (
                      {collectionMaxSizeLabel ?? 'loading...'}), this is typically{' '}
                      {estimatedUploadTransactionCount ?? '...'} upload signatures or fewer.
                    </span>
                    <span className="collection-live-page__mint-guide-note">
                      {hasSingleTxEligibleAssets
                        ? `Expected wallet prompts: 1 total for <=${SMALL_MINT_HELPER_MAX_CHUNKS} chunks, otherwise 3+ based on upload batches.`
                        : estimatedWalletApprovals === null
                          ? 'Expected wallet prompts: at least 3 total (begin, upload, seal).'
                          : `Expected wallet prompts for a max-size mint in this collection: up to ${estimatedWalletApprovals} total (${estimatedUploadTransactionCount} upload batch signatures).`}
                    </span>
                    {collectionMaxChunkCount !== null && (
                      <span className="collection-live-page__mint-guide-note">
                        Collection max-size estimate: {collectionMaxChunkCount} chunks
                        {collectionMaxSizeLabel ? ` (${collectionMaxSizeLabel})` : ''}.
                      </span>
                    )}
                  </li>
                  <li className="collection-live-page__mint-guide-item">
                    <strong>Seal transaction</strong>
                    <span>
                      Finalizes the mint, assigns IDs, and confirms the inscription on-chain.
                    </span>
                  </li>
                </ol>
                <p className="collection-live-page__mint-guide-note">
                  Current v1 collection mint behavior: protocol fees settle across begin + seal.
                  Minimum protocol fee is{' '}
                  {minimumProtocolFeeTotal ? toMicroStxLabel(minimumProtocolFeeTotal) : 'unknown'}
                  {sealMinProtocolFee
                    ? ` (begin ${protocolFeeUnitLabel} + seal ${toMicroStxLabel(sealMinProtocolFee)} for <=50 chunks).`
                    : '.'}
                </p>
                {estimatedMaxProtocolFeeTotal !== null &&
                  collectionMaxChunkCount !== null && (
                  <p className="collection-live-page__mint-guide-note">
                    Estimated protocol fee for a max-size mint in this collection:{' '}
                    {toMicroStxLabel(estimatedMaxProtocolFeeTotal)} total.
                  </p>
                )}
                {feeGuidance?.available && (
                  <>
                    <p className="collection-live-page__mint-guide-note">
                      Largest-file mining-fee estimate from backend:{' '}
                      {feeGuidance.largestAsset?.totalChunks.toLocaleString() ?? '0'} chunk(s) →{' '}
                      {feeGuidance.batchCount.toLocaleString()} upload batch(es).
                    </p>
                    <div className="fee-guidance-table-wrapper">
                      <table className="fee-guidance-table">
                        <thead>
                          <tr>
                            <th>Step</th>
                            <th>Tx count</th>
                            <th>Chunk count</th>
                            <th>Suggested mining fee</th>
                            <th>Wallet default</th>
                            <th>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feeGuidance.table.map((row) => (
                            <tr key={row.step}>
                              <td>{row.label}</td>
                              <td>{row.txCount.toLocaleString()}</td>
                              <td>
                                {row.chunkCount > 0 ? row.chunkCount.toLocaleString() : '—'}
                              </td>
                              <td>
                                {formatMiningFeeMicroStx(row.recommendedTotalMicroStx)}
                                {row.recommendedPerTxMicroStx !== null
                                  ? ` total (~${formatMiningFeeMicroStx(
                                      row.recommendedPerTxMicroStx
                                    )} each)`
                                  : ' total'}
                              </td>
                              <td>
                                {formatMiningFeeMicroStx(row.walletDefaultTotalMicroStx)}
                                {row.walletDefaultPerTxMicroStx !== null
                                  ? ` total (${formatMiningFeeMicroStx(
                                      row.walletDefaultPerTxMicroStx
                                    )} each)`
                                  : ''}
                              </td>
                              <td className="fee-guidance-table__note">{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {miningFeeDefaultComparisonLabel && (
                      <p className="collection-live-page__mint-guide-note">
                        Suggested mining total vs wallet defaults:{' '}
                        {miningFeeDefaultComparisonLabel}.
                      </p>
                    )}
                    {feeGuidance.uploadBatches.length > 0 && (
                      <ul className="collection-live-page__mint-guide-list">
                        {feeGuidance.uploadBatches.map((batch) => (
                          <li key={batch.label} className="collection-live-page__mint-guide-item">
                            <strong>{batch.label}</strong>
                            <span>
                              {batch.batchCount.toLocaleString()} tx · suggested{' '}
                              {formatMiningFeeMicroStx(batch.recommendedPerTxMicroStx)} each ·
                              wallet default{' '}
                              {formatMiningFeeMicroStx(batch.walletDefaultPerTxMicroStx)} each.
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {feeGuidance.warnings.map((warning) => (
                      <p key={warning} className="collection-live-page__mint-guide-note">
                        {warning}
                      </p>
                    ))}
                  </>
                )}
                <p className="collection-live-page__mint-guide-note">
                  {useMintPriceTotalCap
                    ? 'Single-tx wallet cap is locked to the displayed mint price for this collection mode (begin + seal protocol fees absorbed).'
                    : useMintPriceSealCap
                      ? 'Wallet seal cap is set to the displayed mint price for this collection mode.'
                    : `If mint price is 5 STX, wallet may currently show ${
                        exampleSealTotalForFiveStx
                          ? `${toMicroStxLabel(exampleSealTotalForFiveStx)}`
                          : '5 STX + completion fee'
                      } at seal because completion fees are added at seal.`}
                </p>
                <p className="collection-live-page__mint-guide-note">
                  Unfinished sessions can be resumed for about {uploadExpiryDays} days (
                  {COLLECTION_UPLOAD_EXPIRY_BLOCKS.toLocaleString()} blocks). After that, stale
                  uploads expire on-chain.
                </p>
              </div>
            )}
            {heroMintStatusMessage && (
              <div className="alert collection-live-page__hero-alert">
                {heroMintStatusMessage}
              </div>
            )}
          </div>
        </section>
      </header>

      <main className="app__main collection-live-page__main">
        <section className="panel app-section collection-live-page__traffic">
          <div className="panel__header">
            <div>
              <h2>Mint traffic lights</h2>
              <p>Begin, upload, and seal status for the current mint session.</p>
            </div>
          </div>
          <div className="panel__body">
            <div className="mint-steps">
              <div className={`mint-step mint-step--${beginState}`}>
                <strong>1. Begin</strong>
                <span>{formatStepStatus(beginState)}</span>
              </div>
              <div className={`mint-step mint-step--${uploadState}`}>
                <strong>2. Upload</strong>
                <span>{formatStepStatus(uploadState)}</span>
              </div>
              <div className={`mint-step mint-step--${sealState}`}>
                <strong>3. Seal</strong>
                <span>{formatStepStatus(sealState)}</span>
              </div>
              {batchProgress && (
                <div className="mint-step mint-step--pending">
                  Upload batch {batchProgress.current}/{batchProgress.total}
                </div>
              )}
              {txDelayLabel && formattedTxDelay && (
                <div className="mint-step mint-step--pending mint-step--countdown">
                  {txDelayLabel} {formattedTxDelay}s
                </div>
              )}
            </div>
            {resumeTargetAsset && !mintPending && (
              <div className="alert">
                Resume target selected. Mint continues from the last confirmed on-chain step.
              </div>
            )}
          </div>
        </section>

        <section className="panel app-section collection-live-page__gallery">
          <div className="panel__header">
            <div>
              <h2>Previously inscribed</h2>
              <p>Minted assets from this live collection across all supported file types.</p>
            </div>
          </div>
          <div className="panel__body">
            {mintedGallery.length === 0 ? (
              <p className="meta-value">
                No minted assets yet. This gallery updates as new mints are confirmed.
              </p>
            ) : (
              <div className="collection-live-page__gallery-grid">
                {mintedGallery.map((asset) => {
                  const tokenId = mintedTokenIds[asset.asset_id] ?? null;
                  const mediaKind = getMediaKind(asset.mime_type);
                  const localTokenNumber =
                    tokenId && tokenId.length > 0
                      ? collectionTokenNumberByGlobalId[tokenId]
                      : undefined;
                  const previewUrl = `/collections/${encodeURIComponent(
                    resolvedCollectionId
                  )}/asset-preview?assetId=${encodeURIComponent(asset.asset_id)}`;
                  return (
                    <article
                      key={asset.asset_id}
                      className="collection-live-page__gallery-item"
                    >
                      <div className="collection-live-page__gallery-frame">
                        {mediaKind === 'image' || mediaKind === 'svg' ? (
                          <img
                            src={previewUrl}
                            alt={`${collectionTitle} artwork`}
                            loading="lazy"
                          />
                        ) : mediaKind === 'video' ? (
                          <video src={previewUrl} controls preload="metadata" />
                        ) : mediaKind === 'audio' ? (
                          <audio src={previewUrl} controls preload="metadata" />
                        ) : mediaKind === 'html' || mediaKind === 'text' ? (
                          <iframe
                            src={previewUrl}
                            title={asset.filename ?? asset.path}
                            sandbox="allow-scripts allow-same-origin"
                          />
                        ) : (
                          <span className="collection-live-page__gallery-fallback">
                            {asset.mime_type || 'binary'}
                          </span>
                        )}
                      </div>
                      <div className="collection-live-page__gallery-meta">
                        <span className="meta-value">{collectionTitle}</span>
                        <span className="meta-label">
                          {typeof localTokenNumber === 'number'
                            ? `${collectionTitle} #${localTokenNumber}`
                            : `${collectionTitle} #...`}
                        </span>
                        <span className="meta-label">{asset.mime_type}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel app-section collection-live-page__details">
          <div className="panel__header">
            <div>
              <h2>Collection details</h2>
              <p>{statusRefreshNote}</p>
            </div>
            <div className="panel__actions">
              <label className="theme-select" htmlFor="live-theme-select">
                <span className="theme-select__label">Theme</span>
                <select
                  id="live-theme-select"
                  className="theme-select__control"
                  value={themeMode}
                  onChange={(event) => setThemeMode(coerceThemeMode(event.target.value))}
                  onInput={(event) =>
                    setThemeMode(coerceThemeMode(event.currentTarget.value))
                  }
                >
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="panel__body">
            <div className="meta-grid">
              <div>
                <span className="meta-label">Collection ID</span>
                <span className="meta-value">
                  <code>{resolvedCollectionId || 'Unknown'}</code>
                </span>
              </div>
              <div>
                <span className="meta-label">Collection slug</span>
                <span className="meta-value">
                  <code>{resolvedCollectionSlug || normalizedCollectionKey || 'Unknown'}</code>
                </span>
              </div>
              <div>
                <span className="meta-label">Paused</span>
                <span className="meta-value">{pausedLabel}</span>
              </div>
              <div>
                <span className="meta-label">Finalized</span>
                <span className="meta-value">{finalizedLabel}</span>
              </div>
              <div>
                <span className="meta-label">Protocol fee unit</span>
                <span className="meta-value">{protocolFeeUnitLabel}</span>
              </div>
              <div>
                <span className="meta-label">Protocol fee range</span>
                <span className="meta-value">{protocolFeeRangeLabel}</span>
              </div>
              <div>
                <span className="meta-label">Wallet safety</span>
                <span className="meta-value">
                  {mintBeginSpendCap === null
                    ? 'Loading protected spend cap...'
                    : collectionMintPaymentModel === 'begin'
                      ? `Deny mode caps: begin anti-spam <= ${toMicroStxLabel(
                          mintBeginSpendCap
                        )}. Upload enforces zero STX transfer. Seal <= fee-unit x (1 + ceil(chunks/50)) (mint price already charged at begin).`
                      : collectionMintPaymentModel === 'seal'
                        ? useMintPriceTotalCap
                          ? `Deny mode caps: begin anti-spam <= ${toMicroStxLabel(
                              mintBeginSpendCap
                            )}. Upload enforces zero STX transfer. Single-tx cap <= displayed mint price (begin + seal protocol fees absorbed into display pricing).`
                          : useMintPriceSealCap
                          ? `Deny mode caps: begin anti-spam <= ${toMicroStxLabel(
                              mintBeginSpendCap
                            )}. Upload enforces zero STX transfer. Seal <= displayed mint price (worst-case seal fee absorbed into display pricing).`
                          : `Deny mode caps: begin anti-spam <= ${toMicroStxLabel(
                              mintBeginSpendCap
                            )}. Upload enforces zero STX transfer. Seal <= mint price + fee-unit x (1 + ceil(chunks/50)).`
                        : `Compatibility mode caps: begin anti-spam <= ${toMicroStxLabel(
                            mintBeginSpendCap
                          )}. Upload enforces zero STX transfer. Seal <= mint price + fee-unit x (1 + ceil(chunks/50)).`}
                </span>
              </div>
              <div>
                <span className="meta-label">Collection contract</span>
                <span className="meta-value">
                  {collectionContract
                    ? `${collectionContract.address}.${collectionContract.contractName}`
                    : 'Unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Core contract</span>
                <span className="meta-value">
                  {`${coreContract.address}.${coreContract.contractName}`}
                </span>
              </div>
            </div>
            {collectionLoading && <p className="meta-value">Loading collection...</p>}
            {statusLoading && <p className="meta-value">Refreshing contract status...</p>}
            {collectionIndexSyncPending && (
              <p className="meta-value">Syncing collection numbering...</p>
            )}
            {mintedScanPending && (
              <p className="meta-value">Refreshing minted gallery...</p>
            )}
            {collectionMessage && <div className="alert">{collectionMessage}</div>}
            {statusMessage && <div className="alert">{statusMessage}</div>}
            {collectionIndexSyncMessage && <div className="alert">{collectionIndexSyncMessage}</div>}
          </div>
        </section>

        <section className="panel app-section collection-live-page__activity">
          <div className="panel__header">
            <div>
              <h2>Activity logs</h2>
              <p>Begin, upload, and seal events from this page session.</p>
            </div>
          </div>
          <div className="panel__body">
            {mintLog.length === 0 ? (
              <p className="meta-value">No mint activity yet.</p>
            ) : (
              <div className="mint-log">
                {mintLog.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="mint-log__item">
                    {entry}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
