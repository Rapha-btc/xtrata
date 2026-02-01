import { logWarn } from '../utils/logger';

export type MintAttempt = {
  contractId: string;
  expectedHashHex: string;
  fileName: string | null;
  mimeType: string;
  totalBytes: number;
  totalChunks: number;
  batchSize: number;
  tokenUri: string | null;
  updatedAt: number;
};

type MintAttemptRecord = {
  id: string;
  value: MintAttempt;
  timestamp: number;
};

const DB_NAME = 'XtrataMint';
const DB_VERSION = 1;
const STORE_NAME = 'mint-attempts';
const STORAGE_PREFIX = 'xtrata.mint.attempt.';

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
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = () => {
      logWarn('mint', 'Mint cache IndexedDB open failed', {
        error: request.error?.message ?? 'unknown'
      });
      resolve(null);
    };
  });
  return dbPromise;
};

const buildKey = (contractId: string) => `${STORAGE_PREFIX}${contractId}`;

const loadFromStorage = (contractId: string): MintAttempt | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  const raw = window.localStorage.getItem(buildKey(contractId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as MintAttempt;
  } catch (error) {
    return null;
  }
};

const saveToStorage = (attempt: MintAttempt) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(buildKey(attempt.contractId), JSON.stringify(attempt));
  } catch (error) {
    // Ignore storage write failures.
  }
};

const clearFromStorage = (contractId: string) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.removeItem(buildKey(contractId));
};

export const loadMintAttempt = async (contractId: string): Promise<MintAttempt | null> => {
  const db = await openDB();
  if (!db) {
    return loadFromStorage(contractId);
  }
  const key = buildKey(contractId);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as MintAttemptRecord | undefined;
        resolve(record?.value ?? null);
      };
      req.onerror = () => {
        resolve(loadFromStorage(contractId));
      };
    } catch (error) {
      resolve(loadFromStorage(contractId));
    }
  });
};

export const saveMintAttempt = async (attempt: MintAttempt): Promise<void> => {
  const db = await openDB();
  if (!db) {
    saveToStorage(attempt);
    return;
  }
  const key = buildKey(attempt.contractId);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: MintAttemptRecord = {
        id: key,
        value: attempt,
        timestamp: Date.now()
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        saveToStorage(attempt);
        resolve();
      };
    } catch (error) {
      saveToStorage(attempt);
      resolve();
    }
  });
};

export const clearMintAttempt = async (contractId: string): Promise<void> => {
  const db = await openDB();
  if (!db) {
    clearFromStorage(contractId);
    return;
  }
  const key = buildKey(contractId);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        clearFromStorage(contractId);
        resolve();
      };
    } catch (error) {
      clearFromStorage(contractId);
      resolve();
    }
  });
};
