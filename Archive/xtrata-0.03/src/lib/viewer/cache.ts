import { logDebug, logInfo, logWarn } from '../utils/logger';

const DB_NAME = 'XtrataCache';
const DB_VERSION = 4;
const STORE_NAME = 'inscriptions';
const TEMP_STORE_NAME = 'inscription-temp';
const PREVIEW_STORE_NAME = 'inscription-previews';
const THUMBNAIL_STORE_NAME = 'inscription-thumbnails';
export const TEMP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const TEMP_CACHE_MAX_BYTES = 25 * 1024 * 1024;
export const THUMBNAIL_CACHE_LIMIT = 1000;

type CacheValue = {
  data: Uint8Array;
  mimeType?: string | null;
};

type CacheRecord = {
  id: string;
  value: CacheValue;
  timestamp: number;
};

type TempCacheRecord = CacheRecord & {
  expiresAt: number;
};

type PreviewValue = {
  data: Uint8Array;
  mimeType?: string | null;
  chunks: number;
  totalChunks: number;
  totalSize: number;
  chunkSize: number;
};

type PreviewRecord = {
  id: string;
  value: PreviewValue;
  timestamp: number;
};

export type ThumbnailValue = {
  data: Uint8Array;
  mimeType?: string | null;
  width: number;
  height: number;
};

export type ThumbnailRecord = {
  id: string;
  value: ThumbnailValue;
  timestamp: number;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

const isIndexedDbAvailable = () =>
  typeof indexedDB !== 'undefined' && indexedDB !== null;

const openDB = () => {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TEMP_STORE_NAME)) {
        db.createObjectStore(TEMP_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
        db.createObjectStore(PREVIEW_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        db.createObjectStore(THUMBNAIL_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = () => {
      logWarn('cache', 'IndexedDB open failed', {
        error: request.error?.message ?? 'unknown'
      });
      resolve(null);
    };
  });
  return dbPromise;
};

export const buildInscriptionCacheKey = (contractId: string, id: bigint) =>
  `inscription-data:${contractId}:${id.toString()}`;

export const buildInscriptionTempCacheKey = (contractId: string, id: bigint) =>
  `inscription-temp:${contractId}:${id.toString()}`;

export const buildInscriptionPreviewCacheKey = (contractId: string, id: bigint) =>
  `inscription-preview:${contractId}:${id.toString()}`;

export const buildInscriptionThumbnailCacheKey = (contractId: string, id: bigint) =>
  `inscription-thumb:${contractId}:${id.toString()}`;

export const loadInscriptionFromCache = async (
  contractId: string,
  id: bigint
): Promise<CacheValue | null> => {
  const db = await openDB();
  if (!db) {
    return null;
  }
  const key = buildInscriptionCacheKey(contractId, id);
  const primary = await new Promise<CacheValue | null>((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as CacheRecord | undefined;
        if (record?.value?.data) {
          logInfo('cache', 'Cache hit', {
            id: id.toString(),
            contractId
          });
          resolve(record.value);
          return;
        }
        logDebug('cache', 'Cache miss', { id: id.toString(), contractId });
        resolve(null);
      };
      req.onerror = () => {
        logWarn('cache', 'Cache read failed', {
          error: req.error?.message ?? 'unknown',
          id: id.toString(),
          contractId
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('cache', 'Cache read threw', {
        error: error instanceof Error ? error.message : String(error),
        id: id.toString(),
        contractId
      });
      resolve(null);
    }
  });
  if (primary) {
    return primary;
  }
  return loadInscriptionTempFromCache(contractId, id);
};

export const loadInscriptionTempFromCache = async (
  contractId: string,
  id: bigint
): Promise<CacheValue | null> => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(TEMP_STORE_NAME)) {
    return null;
  }
  const key = buildInscriptionTempCacheKey(contractId, id);
  return new Promise<CacheValue | null>((resolve) => {
    try {
      const tx = db.transaction([TEMP_STORE_NAME], 'readwrite');
      const store = tx.objectStore(TEMP_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as TempCacheRecord | undefined;
        if (record?.value?.data) {
          if (record.expiresAt <= Date.now()) {
            store.delete(key);
            logDebug('cache', 'Temp cache expired', {
              id: id.toString(),
              contractId
            });
            resolve(null);
            return;
          }
          logInfo('cache', 'Temp cache hit', {
            id: id.toString(),
            contractId
          });
          resolve(record.value);
          return;
        }
        logDebug('cache', 'Temp cache miss', { id: id.toString(), contractId });
        resolve(null);
      };
      req.onerror = () => {
        logWarn('cache', 'Temp cache read failed', {
          error: req.error?.message ?? 'unknown',
          id: id.toString(),
          contractId
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('cache', 'Temp cache read threw', {
        error: error instanceof Error ? error.message : String(error),
        id: id.toString(),
        contractId
      });
      resolve(null);
    }
  });
};

export const loadInscriptionPreviewFromCache = async (
  contractId: string,
  id: bigint
): Promise<PreviewValue | null> => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
    return null;
  }
  const key = buildInscriptionPreviewCacheKey(contractId, id);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([PREVIEW_STORE_NAME], 'readonly');
      const store = tx.objectStore(PREVIEW_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as PreviewRecord | undefined;
        if (record?.value?.data) {
          logDebug('cache', 'Preview cache hit', {
            id: id.toString(),
            contractId
          });
          resolve(record.value);
          return;
        }
        logDebug('cache', 'Preview cache miss', { id: id.toString(), contractId });
        resolve(null);
      };
      req.onerror = () => {
        logWarn('cache', 'Preview cache read failed', {
          error: req.error?.message ?? 'unknown',
          id: id.toString(),
          contractId
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('cache', 'Preview cache read threw', {
        error: error instanceof Error ? error.message : String(error),
        id: id.toString(),
        contractId
      });
      resolve(null);
    }
  });
};

export const loadInscriptionThumbnailFromCache = async (
  contractId: string,
  id: bigint
): Promise<ThumbnailValue | null> => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
    return null;
  }
  const key = buildInscriptionThumbnailCacheKey(contractId, id);
  return new Promise<ThumbnailValue | null>((resolve) => {
    try {
      const tx = db.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
      const store = tx.objectStore(THUMBNAIL_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as ThumbnailRecord | undefined;
        if (record?.value?.data) {
          record.timestamp = Date.now();
          store.put(record);
          logDebug('cache', 'Thumbnail cache hit', {
            id: id.toString(),
            contractId
          });
          resolve(record.value);
          return;
        }
        logDebug('cache', 'Thumbnail cache miss', { id: id.toString(), contractId });
        resolve(null);
      };
      req.onerror = () => {
        logWarn('cache', 'Thumbnail cache read failed', {
          error: req.error?.message ?? 'unknown',
          id: id.toString(),
          contractId
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('cache', 'Thumbnail cache read threw', {
        error: error instanceof Error ? error.message : String(error),
        id: id.toString(),
        contractId
      });
      resolve(null);
    }
  });
};

export const loadInscriptionThumbnailRecord = async (
  contractId: string,
  id: bigint
): Promise<ThumbnailRecord | null> => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
    return null;
  }
  const key = buildInscriptionThumbnailCacheKey(contractId, id);
  return new Promise<ThumbnailRecord | null>((resolve) => {
    try {
      const tx = db.transaction([THUMBNAIL_STORE_NAME], 'readonly');
      const store = tx.objectStore(THUMBNAIL_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as ThumbnailRecord | undefined;
        if (record?.value?.data) {
          resolve(record);
          return;
        }
        resolve(null);
      };
      req.onerror = () => {
        logWarn('cache', 'Thumbnail record read failed', {
          error: req.error?.message ?? 'unknown',
          id: id.toString(),
          contractId
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('cache', 'Thumbnail record read threw', {
        error: error instanceof Error ? error.message : String(error),
        id: id.toString(),
        contractId
      });
      resolve(null);
    }
  });
};

export const saveInscriptionToCache = async (
  contractId: string,
  id: bigint,
  data: Uint8Array,
  mimeType?: string | null
) => {
  const db = await openDB();
  if (!db) {
    return;
  }
  const key = buildInscriptionCacheKey(contractId, id);
  const record: CacheRecord = {
    id: key,
    value: { data, mimeType },
    timestamp: Date.now()
  };
  try {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    logInfo('cache', 'Cached inscription', {
      id: id.toString(),
      contractId,
      bytes: data.length,
      mimeType: mimeType ?? null
    });
  } catch (error) {
    logWarn('cache', 'Cache write failed', {
      error: error instanceof Error ? error.message : String(error),
      id: id.toString(),
      contractId
    });
  }
};

export const saveInscriptionToTempCache = async (
  contractId: string,
  id: bigint,
  data: Uint8Array,
  mimeType?: string | null,
  ttlMs = TEMP_CACHE_TTL_MS
) => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(TEMP_STORE_NAME)) {
    return;
  }
  const key = buildInscriptionTempCacheKey(contractId, id);
  const record: TempCacheRecord = {
    id: key,
    value: { data, mimeType },
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs
  };
  try {
    const tx = db.transaction([TEMP_STORE_NAME], 'readwrite');
    const store = tx.objectStore(TEMP_STORE_NAME);
    store.put(record);
    logInfo('cache', 'Cached inscription (temp)', {
      id: id.toString(),
      contractId,
      bytes: data.length,
      mimeType: mimeType ?? null,
      ttlHours: Math.round(ttlMs / 3_600_000)
    });
  } catch (error) {
    logWarn('cache', 'Temp cache write failed', {
      error: error instanceof Error ? error.message : String(error),
      id: id.toString(),
      contractId
    });
  }
};

export const saveInscriptionPreviewToCache = async (
  contractId: string,
  id: bigint,
  data: Uint8Array,
  meta: {
    mimeType?: string | null;
    chunks: number;
    totalChunks: number;
    totalSize: number;
    chunkSize: number;
  }
) => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
    return;
  }
  const key = buildInscriptionPreviewCacheKey(contractId, id);
  const record: PreviewRecord = {
    id: key,
    value: {
      data,
      mimeType: meta.mimeType ?? null,
      chunks: meta.chunks,
      totalChunks: meta.totalChunks,
      totalSize: meta.totalSize,
      chunkSize: meta.chunkSize
    },
    timestamp: Date.now()
  };
  try {
    const tx = db.transaction([PREVIEW_STORE_NAME], 'readwrite');
    const store = tx.objectStore(PREVIEW_STORE_NAME);
    store.put(record);
    logInfo('cache', 'Cached preview inscription', {
      id: id.toString(),
      contractId,
      bytes: data.length,
      chunks: meta.chunks
    });
  } catch (error) {
    logWarn('cache', 'Preview cache write failed', {
      error: error instanceof Error ? error.message : String(error),
      id: id.toString(),
      contractId
    });
  }
};

const pruneThumbnailCache = async (
  store: IDBObjectStore,
  contractId: string
) => {
  const req = store.getAll();
  return new Promise<void>((resolve) => {
    req.onsuccess = () => {
      const records = req.result as ThumbnailRecord[];
      if (records.length <= THUMBNAIL_CACHE_LIMIT) {
        resolve();
        return;
      }
      records.sort((a, b) => a.timestamp - b.timestamp);
      const excess = records.length - THUMBNAIL_CACHE_LIMIT;
      const toDelete = records.slice(0, excess);
      for (const record of toDelete) {
        store.delete(record.id);
      }
      logInfo('cache', 'Pruned thumbnail cache', {
        contractId,
        removed: toDelete.length,
        remaining: records.length - toDelete.length
      });
      resolve();
    };
    req.onerror = () => {
      logWarn('cache', 'Thumbnail cache prune failed', {
        contractId,
        error: req.error?.message ?? 'unknown'
      });
      resolve();
    };
  });
};

export const saveInscriptionThumbnailToCache = async (
  contractId: string,
  id: bigint,
  data: Uint8Array,
  meta: {
    mimeType?: string | null;
    width: number;
    height: number;
  }
) => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
    return;
  }
  const key = buildInscriptionThumbnailCacheKey(contractId, id);
  const record: ThumbnailRecord = {
    id: key,
    value: {
      data,
      mimeType: meta.mimeType ?? null,
      width: meta.width,
      height: meta.height
    },
    timestamp: Date.now()
  };
  try {
    const tx = db.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
    const store = tx.objectStore(THUMBNAIL_STORE_NAME);
    store.put(record);
    void pruneThumbnailCache(store, contractId);
    logInfo('cache', 'Cached thumbnail', {
      id: id.toString(),
      contractId,
      bytes: data.length
    });
  } catch (error) {
    logWarn('cache', 'Thumbnail cache write failed', {
      error: error instanceof Error ? error.message : String(error),
      id: id.toString(),
      contractId
    });
  }
};

export const deleteInscriptionThumbnailFromCache = async (
  contractId: string,
  id: bigint
) => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
    return;
  }
  const key = buildInscriptionThumbnailCacheKey(contractId, id);
  try {
    const tx = db.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
    const store = tx.objectStore(THUMBNAIL_STORE_NAME);
    store.delete(key);
    logInfo('cache', 'Deleted thumbnail cache entry', {
      id: id.toString(),
      contractId
    });
  } catch (error) {
    logWarn('cache', 'Thumbnail cache delete failed', {
      error: error instanceof Error ? error.message : String(error),
      id: id.toString(),
      contractId
    });
  }
};

export const clearInscriptionCache = async () => {
  const db = await openDB();
  if (!db) {
    return { cleared: false, reason: 'unavailable' as const };
  }
  return new Promise<{ cleared: boolean; reason?: string }>((resolve) => {
    try {
      const stores = [STORE_NAME];
      if (db.objectStoreNames.contains(TEMP_STORE_NAME)) {
        stores.push(TEMP_STORE_NAME);
      }
      if (db.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
        stores.push(PREVIEW_STORE_NAME);
      }
      if (db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        stores.push(THUMBNAIL_STORE_NAME);
      }
      const tx = db.transaction(stores, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      if (tx.objectStoreNames.contains(TEMP_STORE_NAME)) {
        const tempStore = tx.objectStore(TEMP_STORE_NAME);
        tempStore.clear();
      }
      if (tx.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
        const previewStore = tx.objectStore(PREVIEW_STORE_NAME);
        previewStore.clear();
      }
      if (tx.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        const thumbStore = tx.objectStore(THUMBNAIL_STORE_NAME);
        thumbStore.clear();
      }
      req.onsuccess = () => {
        logInfo('cache', 'Cleared inscription cache');
      };
      req.onerror = () => {
        logWarn('cache', 'Cache clear failed', {
          error: req.error?.message ?? 'unknown'
        });
      };
      tx.oncomplete = () => resolve({ cleared: true });
      tx.onerror = () => {
        resolve({
          cleared: false,
          reason: req.error?.message ?? 'transaction failed'
        });
      };
    } catch (error) {
      logWarn('cache', 'Cache clear threw', {
        error: error instanceof Error ? error.message : String(error)
      });
      resolve({ cleared: false, reason: 'exception' });
    }
  });
};
