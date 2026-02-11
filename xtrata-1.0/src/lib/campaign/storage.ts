import { logWarn } from '../utils/logger';
import type { CampaignAsset, CampaignDraft } from './types';

const DRAFTS_STORAGE_KEY = 'xtrata.campaign.drafts';
const DB_NAME = 'XtrataCampaignAssets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

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
      logWarn('campaign', 'Campaign asset store open failed', {
        error: request.error?.message ?? 'unknown'
      });
      resolve(null);
    };
  });
  return dbPromise;
};

const safeParse = (raw: string | null): CampaignDraft[] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as CampaignDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

export const loadCampaignDrafts = (): CampaignDraft[] => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  return safeParse(window.localStorage.getItem(DRAFTS_STORAGE_KEY));
};

export const saveCampaignDrafts = (drafts: CampaignDraft[]) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
};

const generateAssetId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `asset-${Math.random().toString(36).slice(2, 10)}`;
};

type StoredAsset = CampaignAsset & {
  blob: Blob;
};

export const storeCampaignAsset = async (
  file: File
): Promise<CampaignAsset | null> => {
  const db = await openDB();
  if (!db) {
    return null;
  }
  const asset: CampaignAsset = {
    id: generateAssetId(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now()
  };
  const record: StoredAsset = {
    ...asset,
    blob: file
  };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(asset);
      req.onerror = () => {
        logWarn('campaign', 'Campaign asset save failed', {
          error: req.error?.message ?? 'unknown'
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('campaign', 'Campaign asset save failed', {
        error: error instanceof Error ? error.message : 'unknown'
      });
      resolve(null);
    }
  });
};

export const loadCampaignAssetBlob = async (
  id: string
): Promise<Blob | null> => {
  const db = await openDB();
  if (!db) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as StoredAsset | undefined;
        resolve(record?.blob ?? null);
      };
      req.onerror = () => {
        logWarn('campaign', 'Campaign asset load failed', {
          error: req.error?.message ?? 'unknown'
        });
        resolve(null);
      };
    } catch (error) {
      logWarn('campaign', 'Campaign asset load failed', {
        error: error instanceof Error ? error.message : 'unknown'
      });
      resolve(null);
    }
  });
};

export const deleteCampaignAsset = async (id: string): Promise<boolean> => {
  const db = await openDB();
  if (!db) {
    return false;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        logWarn('campaign', 'Campaign asset delete failed', {
          error: req.error?.message ?? 'unknown'
        });
        resolve(false);
      };
    } catch (error) {
      logWarn('campaign', 'Campaign asset delete failed', {
        error: error instanceof Error ? error.message : 'unknown'
      });
      resolve(false);
    }
  });
};
