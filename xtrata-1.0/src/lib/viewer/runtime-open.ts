import type { NetworkType } from '../network/types';

export const RUNTIME_OPEN_WARNING_STORAGE_KEY =
  'xtrata.runtime-open-warning.v1';

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

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

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

