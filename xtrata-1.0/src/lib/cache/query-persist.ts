import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { logDebug, logWarn } from '../utils/logger';

const DB_NAME = 'XtrataQueryCache';
const DB_VERSION = 1;
const STORE_NAME = 'query-cache';

const PERSIST_DEBOUNCE_MS = 500;

type PersistedQueryRecord = {
  key: string;
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
  storedAt: number;
  ttlMs: number;
};

const isIndexedDbAvailable = () =>
  typeof indexedDB !== 'undefined' && indexedDB !== null;

const openDB = () => {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = () => {
      logWarn('cache', 'Query cache IndexedDB open failed', {
        error: request.error?.message ?? 'unknown'
      });
      resolve(null);
    };
  });
};

const buildKey = (queryKey: QueryKey) => JSON.stringify(queryKey ?? []);

export const getQueryCacheTtlMs = (queryKey: QueryKey) => {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return null;
  }
  const parts = queryKey.map((entry) => String(entry ?? ''));
  if (parts[0] === 'viewer' && parts.includes('token')) {
    return 60 * 60 * 1000;
  }
  if (parts[0] === 'viewer' && parts.includes('last-token-id')) {
    return 60 * 1000;
  }
  if (parts[0] === 'contract-admin') {
    return 30 * 1000;
  }
  if (parts[0] === 'pricing' && parts[1] === 'usd-spot') {
    return 5 * 60 * 1000;
  }
  return null;
};

export const shouldPersistQuery = (queryKey: QueryKey) =>
  getQueryCacheTtlMs(queryKey) !== null;

const loadAllRecords = async () => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(STORE_NAME)) {
    return [] as PersistedQueryRecord[];
  }
  return new Promise<PersistedQueryRecord[]>((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = Array.isArray(req.result)
          ? (req.result as PersistedQueryRecord[])
          : [];
        resolve(records);
      };
      req.onerror = () => {
        logWarn('cache', 'Query cache load failed', {
          error: req.error?.message ?? 'unknown'
        });
        resolve([]);
      };
    } catch (error) {
      logWarn('cache', 'Query cache load threw', {
        error: error instanceof Error ? error.message : String(error)
      });
      resolve([]);
    }
  });
};

const saveRecords = async (records: PersistedQueryRecord[]) => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(STORE_NAME) || records.length === 0) {
    return;
  }
  try {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    records.forEach((record) => store.put(record));
  } catch (error) {
    logWarn('cache', 'Query cache save failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

const deleteRecords = async (keys: string[]) => {
  const db = await openDB();
  if (!db || !db.objectStoreNames.contains(STORE_NAME) || keys.length === 0) {
    return;
  }
  try {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    keys.forEach((key) => store.delete(key));
  } catch (error) {
    logWarn('cache', 'Query cache prune failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export const hydrateQueryCache = async (queryClient: QueryClient) => {
  if (typeof window === 'undefined') {
    return;
  }
  const records = await loadAllRecords();
  if (records.length === 0) {
    return;
  }
  const now = Date.now();
  const expired: string[] = [];
  records.forEach((record) => {
    if (now - record.storedAt > record.ttlMs) {
      expired.push(record.key);
      return;
    }
    queryClient.setQueryData(record.queryKey, record.data);
  });
  if (expired.length > 0) {
    void deleteRecords(expired);
  }
  logDebug('cache', 'Query cache hydrated', {
    count: records.length - expired.length
  });
};

export const setupQueryCachePersistence = (queryClient: QueryClient) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const pending = new Map<string, PersistedQueryRecord>();
  let timer: number | null = null;

  const flush = () => {
    timer = null;
    const records = Array.from(pending.values());
    pending.clear();
    void saveRecords(records);
  };

  const scheduleFlush = () => {
    if (timer !== null) {
      return;
    }
    timer = window.setTimeout(flush, PERSIST_DEBOUNCE_MS);
  };

  const cache = queryClient.getQueryCache();
  const unsubscribe = cache.subscribe((event) => {
    const query = event?.query;
    if (!query) {
      return;
    }
    const ttlMs = getQueryCacheTtlMs(query.queryKey);
    if (ttlMs === null) {
      return;
    }
    const data = query.state.data;
    if (data === undefined) {
      return;
    }
    const key = buildKey(query.queryKey);
    pending.set(key, {
      key,
      queryKey: query.queryKey,
      data,
      updatedAt: query.state.dataUpdatedAt,
      storedAt: Date.now(),
      ttlMs
    });
    scheduleFlush();
  });

  return () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    unsubscribe();
  };
};
