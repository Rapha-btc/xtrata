import type { NetworkType } from '../network/types';

export const RUNTIME_OPEN_WARNING_STORAGE_KEY =
  'xtrata.runtime-open-warning.v1';
export const RUNTIME_WALLET_BRIDGE_TOKEN_STORAGE_KEY =
  'xtrata.runtime-wallet-bridge.tokens.v1';
export const RUNTIME_WALLET_BRIDGE_TOKEN_PARAM = 'walletBridgeToken';

const RUNTIME_WALLET_BRIDGE_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

const EXECUTABLE_RUNTIME_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml'
]);

export const normalizeRuntimeMimeType = (mimeType?: string | null) =>
  typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';

export const isExecutableRuntimeMimeType = (mimeType?: string | null) =>
  EXECUTABLE_RUNTIME_MIME_TYPES.has(normalizeRuntimeMimeType(mimeType));

export const buildRuntimeOpenUrl = (params: {
  contractId: string;
  tokenId: bigint;
  network: NetworkType;
  fallbackContractId?: string | null;
  sourceUrl?: string | null;
}) => {
  const search = new URLSearchParams();
  search.set('contractId', params.contractId);
  search.set('tokenId', params.tokenId.toString());
  search.set('network', params.network);
  if (params.fallbackContractId) {
    search.set('fallbackContractId', params.fallbackContractId);
  }
  if (params.sourceUrl) {
    search.set('source', params.sourceUrl);
  }
  return `/runtime/?${search.toString()}`;
};

export const createRuntimeWalletBridgeToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  const time = Date.now().toString(36);
  return `${time}-${random}`;
};

const hasUriScheme = (value: string) => /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);

export const appendRuntimeWalletBridgeToken = (runtimeUrl: string, token: string) => {
  if (!runtimeUrl || !token) {
    return runtimeUrl;
  }
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://xtrata.local';
  try {
    const url = new URL(runtimeUrl, base);
    url.searchParams.set(RUNTIME_WALLET_BRIDGE_TOKEN_PARAM, token);
    if (hasUriScheme(runtimeUrl)) {
      return url.toString();
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    return runtimeUrl;
  }
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type RuntimeWalletBridgeTokenMap = Record<string, number>;

const safeGet = (storage: StorageLike | null | undefined, key: string) => {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeSet = (storage: StorageLike | null | undefined, key: string, value: string) => {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch (error) {
    return;
  }
};

export const shouldShowRuntimeOpenWarning = (
  storage: StorageLike | null | undefined
) => safeGet(storage, RUNTIME_OPEN_WARNING_STORAGE_KEY) !== '1';

export const markRuntimeOpenWarningShown = (
  storage: StorageLike | null | undefined
) => {
  safeSet(storage, RUNTIME_OPEN_WARNING_STORAGE_KEY, '1');
};

const safeNow = () => Date.now();

const readWalletBridgeTokens = (
  storage: StorageLike | null | undefined
): RuntimeWalletBridgeTokenMap => {
  const raw = safeGet(storage, RUNTIME_WALLET_BRIDGE_TOKEN_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as RuntimeWalletBridgeTokenMap;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch (error) {
    return {};
  }
};

const writeWalletBridgeTokens = (
  storage: StorageLike | null | undefined,
  value: RuntimeWalletBridgeTokenMap
) => {
  safeSet(storage, RUNTIME_WALLET_BRIDGE_TOKEN_STORAGE_KEY, JSON.stringify(value));
};

const pruneWalletBridgeTokens = (
  tokens: RuntimeWalletBridgeTokenMap,
  nowMs: number
) => {
  let changed = false;
  Object.keys(tokens).forEach((token) => {
    const expiry = Number(tokens[token]);
    if (!Number.isFinite(expiry) || expiry <= nowMs) {
      delete tokens[token];
      changed = true;
    }
  });
  return changed;
};

export const registerRuntimeWalletBridgeToken = (
  storage: StorageLike | null | undefined,
  token: string,
  ttlMs = RUNTIME_WALLET_BRIDGE_TOKEN_TTL_MS
) => {
  const trimmed = token.trim();
  if (!trimmed) {
    return;
  }
  const nowMs = safeNow();
  const records = readWalletBridgeTokens(storage);
  pruneWalletBridgeTokens(records, nowMs);
  records[trimmed] = nowMs + Math.max(30_000, ttlMs);
  writeWalletBridgeTokens(storage, records);
};

export const isRuntimeWalletBridgeTokenValid = (
  storage: StorageLike | null | undefined,
  token: string
) => {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }
  const nowMs = safeNow();
  const records = readWalletBridgeTokens(storage);
  const wasPruned = pruneWalletBridgeTokens(records, nowMs);
  const expiry = Number(records[trimmed]);
  const valid = Number.isFinite(expiry) && expiry > nowMs;
  if (wasPruned || !valid) {
    if (!valid && trimmed in records) {
      delete records[trimmed];
    }
    writeWalletBridgeTokens(storage, records);
  }
  return valid;
};
