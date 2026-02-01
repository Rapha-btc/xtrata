import { logWarn } from '../utils/logger';
import type {
  MarketActivityEvent,
  MarketIndexSnapshot,
  NftActivityEvent,
  NftIndexSnapshot
} from './types';

const DB_NAME = 'XtrataMarketCache';
const DB_VERSION = 2;
const STORE_NAME = 'market-index';
const NFT_STORE_NAME = 'nft-index';

type MarketActivityRecord = Omit<
  MarketActivityEvent,
  'listingId' | 'tokenId' | 'price' | 'fee'
> & {
  listingId: string;
  tokenId?: string;
  price?: string;
  fee?: string;
};

type MarketIndexRecord = {
  id: string;
  value: {
    contractId: string;
    events: MarketActivityRecord[];
    updatedAt: number;
  };
  timestamp: number;
};

type NftActivityRecord = Omit<NftActivityEvent, 'tokenId'> & {
  tokenId?: string;
};

type NftIndexRecord = {
  id: string;
  value: {
    assetIdentifier: string;
    events: NftActivityRecord[];
    updatedAt: number;
  };
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
      if (!db.objectStoreNames.contains(NFT_STORE_NAME)) {
        db.createObjectStore(NFT_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = () => {
      logWarn('market', 'Market cache open failed', {
        error: request.error?.message ?? 'unknown'
      });
      resolve(null);
    };
  });
  return dbPromise;
};

const serializeEvent = (event: MarketActivityEvent): MarketActivityRecord => ({
  ...event,
  listingId: event.listingId.toString(),
  tokenId: event.tokenId ? event.tokenId.toString() : undefined,
  price: event.price ? event.price.toString() : undefined,
  fee: event.fee ? event.fee.toString() : undefined
});

const parseEvent = (event: MarketActivityRecord): MarketActivityEvent => ({
  ...event,
  listingId: BigInt(event.listingId),
  tokenId: event.tokenId ? BigInt(event.tokenId) : undefined,
  price: event.price ? BigInt(event.price) : undefined,
  fee: event.fee ? BigInt(event.fee) : undefined
});

const serializeNftEvent = (event: NftActivityEvent): NftActivityRecord => ({
  ...event,
  tokenId: event.tokenId ? event.tokenId.toString() : undefined
});

const parseNftEvent = (event: NftActivityRecord): NftActivityEvent => ({
  ...event,
  tokenId: event.tokenId ? BigInt(event.tokenId) : undefined
});

export const loadMarketIndexSnapshot = async (
  contractId: string
): Promise<MarketIndexSnapshot | null> => {
  const db = await openDB();
  if (!db) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(contractId);
      req.onsuccess = () => {
        const record = req.result as MarketIndexRecord | undefined;
        if (!record?.value) {
          resolve(null);
          return;
        }
        resolve({
          contractId: record.value.contractId,
          events: record.value.events.map(parseEvent),
          updatedAt: record.value.updatedAt
        });
      };
      req.onerror = () => {
        logWarn('market', 'Market cache read failed', {
          error: req.error?.message ?? 'unknown',
          contractId
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('market', 'Market cache read threw', {
        error: error instanceof Error ? error.message : String(error),
        contractId
      });
      resolve(null);
    }
  });
};

export const saveMarketIndexSnapshot = async (
  snapshot: MarketIndexSnapshot
) => {
  const db = await openDB();
  if (!db) {
    return;
  }
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: MarketIndexRecord = {
        id: snapshot.contractId,
        value: {
          contractId: snapshot.contractId,
          events: snapshot.events.map(serializeEvent),
          updatedAt: snapshot.updatedAt
        },
        timestamp: Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        logWarn('market', 'Market cache write failed', {
          error: req.error?.message ?? 'unknown',
          contractId: snapshot.contractId
        });
        resolve();
      };
    } catch (error) {
      logWarn('market', 'Market cache write threw', {
        error: error instanceof Error ? error.message : String(error),
        contractId: snapshot.contractId
      });
      resolve();
    }
  });
};

export const loadNftIndexSnapshot = async (
  assetIdentifier: string
): Promise<NftIndexSnapshot | null> => {
  const db = await openDB();
  if (!db) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([NFT_STORE_NAME], 'readonly');
      const store = tx.objectStore(NFT_STORE_NAME);
      const req = store.get(assetIdentifier);
      req.onsuccess = () => {
        const record = req.result as NftIndexRecord | undefined;
        if (!record?.value) {
          resolve(null);
          return;
        }
        resolve({
          assetIdentifier: record.value.assetIdentifier,
          events: record.value.events.map(parseNftEvent),
          updatedAt: record.value.updatedAt
        });
      };
      req.onerror = () => {
        logWarn('market', 'NFT cache read failed', {
          error: req.error?.message ?? 'unknown',
          assetIdentifier
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('market', 'NFT cache read threw', {
        error: error instanceof Error ? error.message : String(error),
        assetIdentifier
      });
      resolve(null);
    }
  });
};

export const saveNftIndexSnapshot = async (snapshot: NftIndexSnapshot) => {
  const db = await openDB();
  if (!db) {
    return;
  }
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([NFT_STORE_NAME], 'readwrite');
      const store = tx.objectStore(NFT_STORE_NAME);
      const record: NftIndexRecord = {
        id: snapshot.assetIdentifier,
        value: {
          assetIdentifier: snapshot.assetIdentifier,
          events: snapshot.events.map(serializeNftEvent),
          updatedAt: snapshot.updatedAt
        },
        timestamp: Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        logWarn('market', 'NFT cache write failed', {
          error: req.error?.message ?? 'unknown',
          assetIdentifier: snapshot.assetIdentifier
        });
        resolve();
      };
    } catch (error) {
      logWarn('market', 'NFT cache write threw', {
        error: error instanceof Error ? error.message : String(error),
        assetIdentifier: snapshot.assetIdentifier
      });
      resolve();
    }
  });
};
