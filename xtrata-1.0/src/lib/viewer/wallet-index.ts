import { getApiBaseUrls } from '../network/config';
import type { NetworkType } from '../network/types';
import { DEFAULT_NFT_ASSET_NAME } from '../contract/post-conditions';

const HOLDINGS_PAGE_LIMIT = 200;
const DEFAULT_MAX_IDS = 2000;
const HOLDINGS_CACHE_MAX_AGE_MS = 15 * 60_000;
const HOLDINGS_RATE_LIMIT_BACKOFF_MS = 3 * 60_000;

type HiroHoldingValue =
  | string
  | {
      repr?: string;
      hex?: string;
    }
  | null
  | undefined;

type HiroHoldingItem = {
  asset_identifier?: string;
  value?: HiroHoldingValue;
  token_id?: string | number;
};

type HiroHoldingsResponse = {
  results?: HiroHoldingItem[];
  total?: number;
};

const isHiroCompatibleBase = (baseUrl: string) =>
  baseUrl.includes('hiro.so') || baseUrl.includes('/hiro/');

const parseUintFromString = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('u')) {
    const raw = trimmed.slice(1);
    if (/^\d+$/.test(raw)) {
      return BigInt(raw);
    }
  }
  if (/^\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  return null;
};

const parseTokenIdFromHolding = (item: HiroHoldingItem) => {
  const directTokenId = item.token_id;
  if (typeof directTokenId === 'number' && Number.isFinite(directTokenId)) {
    return BigInt(Math.trunc(directTokenId));
  }
  if (typeof directTokenId === 'string') {
    const parsed = parseUintFromString(directTokenId);
    if (parsed !== null) {
      return parsed;
    }
  }
  const rawValue = item.value;
  if (typeof rawValue === 'string') {
    return parseUintFromString(rawValue);
  }
  if (rawValue && typeof rawValue === 'object') {
    return parseUintFromString(rawValue.repr);
  }
  return null;
};

const parseContractIdFromAssetIdentifier = (
  assetIdentifier: string | null | undefined
) => {
  if (!assetIdentifier) {
    return null;
  }
  const markerIndex = assetIdentifier.indexOf('::');
  if (markerIndex <= 0) {
    return null;
  }
  return assetIdentifier.slice(0, markerIndex);
};

const sortBigIntAsc = (left: bigint, right: bigint) =>
  left < right ? -1 : left > right ? 1 : 0;

const shouldTryFallback = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('too many requests') ||
    lower.includes('rate limit') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('cors') ||
    lower.includes('access-control-allow-origin')
  );
};

const isRateLimitError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('too many requests') ||
    lower.includes('rate limit')
  );
};

const walletHoldingsBackoffUntil = new Map<string, number>();
const walletHoldingsSnapshots = new Map<
  string,
  {
    updatedAt: number;
    snapshot: WalletHoldingsIndex;
  }
>();

const toWalletHoldingsSnapshotKey = (params: {
  network: NetworkType;
  walletAddress: string;
  contractIds: string[];
  maxIds: number;
  assetName: string;
}) =>
  [
    params.network,
    params.walletAddress.trim().toUpperCase(),
    params.assetName,
    params.maxIds.toString(),
    ...params.contractIds
  ].join('|');

const loadWalletHoldingsSnapshot = (
  key: string,
  maxAgeMs = HOLDINGS_CACHE_MAX_AGE_MS
) => {
  const record = walletHoldingsSnapshots.get(key);
  if (!record) {
    return null;
  }
  if (Date.now() - record.updatedAt > maxAgeMs) {
    walletHoldingsSnapshots.delete(key);
    return null;
  }
  return record.snapshot;
};

const saveWalletHoldingsSnapshot = (key: string, snapshot: WalletHoldingsIndex) => {
  walletHoldingsSnapshots.set(key, {
    updatedAt: Date.now(),
    snapshot
  });
};

export type WalletHoldingsIndex = {
  tokenIds: bigint[];
  sourceBase: string;
};

export const loadWalletHoldingsIndex = async (params: {
  network: NetworkType;
  walletAddress: string;
  contractIds: string[];
  maxIds?: number;
  assetName?: string;
  apiBaseUrls?: string[];
  fetchImpl?: typeof fetch;
}): Promise<WalletHoldingsIndex | null> => {
  const fetchImpl = params.fetchImpl ?? fetch;
  const normalizedContracts = Array.from(
    new Set(
      params.contractIds
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  ).sort();
  if (normalizedContracts.length === 0) {
    return null;
  }
  const maxIds = Math.max(1, params.maxIds ?? DEFAULT_MAX_IDS);
  const assetName = params.assetName ?? DEFAULT_NFT_ASSET_NAME;
  const snapshotKey = toWalletHoldingsSnapshotKey({
    network: params.network,
    walletAddress: params.walletAddress,
    contractIds: normalizedContracts,
    maxIds,
    assetName
  });
  const backoffUntil = walletHoldingsBackoffUntil.get(snapshotKey) ?? 0;
  if (backoffUntil > Date.now()) {
    const cached = loadWalletHoldingsSnapshot(snapshotKey);
    if (cached) {
      return cached;
    }
    return null;
  }
  const baseUrls = (
    params.apiBaseUrls ?? getApiBaseUrls(params.network)
  ).filter(isHiroCompatibleBase);
  if (baseUrls.length === 0) {
    return null;
  }
  const assetIdentifiers = normalizedContracts
    .map((contractId) => `${contractId}::${assetName}`)
    .join(',');
  const allowedContracts = new Set(normalizedContracts);
  let lastError: unknown = null;

  for (let index = 0; index < baseUrls.length; index += 1) {
    const baseUrl = baseUrls[index];
    try {
      const tokenIdSet = new Set<string>();
      let offset = 0;
      while (tokenIdSet.size < maxIds) {
        const url =
          `${baseUrl}/extended/v1/tokens/nft/holdings` +
          `?principal=${encodeURIComponent(params.walletAddress)}` +
          `&asset_identifiers=${encodeURIComponent(assetIdentifiers)}` +
          `&limit=${HOLDINGS_PAGE_LIMIT}` +
          `&offset=${offset}` +
          `&unanchored=true`;
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new Error(`Wallet holdings fetch failed (${response.status})`);
        }
        const json = (await response.json()) as HiroHoldingsResponse;
        const results = Array.isArray(json.results) ? json.results : [];
        for (const item of results) {
          const contractId = parseContractIdFromAssetIdentifier(
            item.asset_identifier
          );
          if (contractId && !allowedContracts.has(contractId)) {
            continue;
          }
          const tokenId = parseTokenIdFromHolding(item);
          if (tokenId === null) {
            continue;
          }
          tokenIdSet.add(tokenId.toString());
          if (tokenIdSet.size >= maxIds) {
            break;
          }
        }
        const total =
          typeof json.total === 'number' && Number.isFinite(json.total)
            ? Math.max(0, Math.trunc(json.total))
            : null;
        if (results.length < HOLDINGS_PAGE_LIMIT) {
          break;
        }
        offset += results.length;
        if (total !== null && offset >= total) {
          break;
        }
      }
      const snapshot = {
        tokenIds: Array.from(tokenIdSet, (value) => BigInt(value)).sort(
          sortBigIntAsc
        ),
        sourceBase: baseUrl
      };
      saveWalletHoldingsSnapshot(snapshotKey, snapshot);
      return snapshot;
    } catch (error) {
      lastError = error;
      const hasFallback = index < baseUrls.length - 1;
      if (hasFallback && shouldTryFallback(error)) {
        continue;
      }
      break;
    }
  }

  if (lastError) {
    if (isRateLimitError(lastError)) {
      walletHoldingsBackoffUntil.set(
        snapshotKey,
        Date.now() + HOLDINGS_RATE_LIMIT_BACKOFF_MS
      );
    }
    const cached = loadWalletHoldingsSnapshot(snapshotKey);
    if (cached) {
      return cached;
    }
    return null;
  }
  return null;
};

export const __testing = {
  resetWalletHoldingsIndexState() {
    walletHoldingsBackoffUntil.clear();
    walletHoldingsSnapshots.clear();
  }
};
