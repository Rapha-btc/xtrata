import { logWarn } from '../utils/logger';

const DB_NAME = 'XtrataRelationshipIndex';
const DB_VERSION = 1;
const CHILD_STORE_NAME = 'child-dependencies';
const PARENT_STORE_NAME = 'parent-children';
const CURSOR_STORE_NAME = 'sync-cursors';

type ChildDependenciesRecord = {
  key: string;
  contractId: string;
  childId: string;
  parentIds: string[];
  updatedAt: number;
};

type ParentChildrenRecord = {
  key: string;
  contractId: string;
  parentId: string;
  childIds: string[];
  updatedAt: number;
};

type RelationshipSyncCursorRecord = {
  contractId: string;
  nextMintedIndex: string;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

const isIndexedDbAvailable = () =>
  typeof indexedDB !== 'undefined' && indexedDB !== null;

const sortIdStrings = (left: string, right: string) => {
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};

const normalizeIdStrings = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort(sortIdStrings);

const normalizeBigIntIds = (values: bigint[]) =>
  normalizeIdStrings(values.map((value) => value.toString()));

const parseIdStrings = (values: string[] | null | undefined): bigint[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const parsed: bigint[] = [];
  values.forEach((value) => {
    try {
      parsed.push(BigInt(value));
    } catch {
      // skip invalid ids
    }
  });
  return parsed.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
};

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
      if (!db.objectStoreNames.contains(CHILD_STORE_NAME)) {
        db.createObjectStore(CHILD_STORE_NAME, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(PARENT_STORE_NAME)) {
        db.createObjectStore(PARENT_STORE_NAME, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(CURSOR_STORE_NAME)) {
        db.createObjectStore(CURSOR_STORE_NAME, { keyPath: 'contractId' });
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = () => {
      logWarn('viewer-relationships', 'Relationship index DB open failed', {
        error: request.error?.message ?? 'unknown'
      });
      resolve(null);
    };
  });
  return dbPromise;
};

const readRecord = async <T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
) => {
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve((req.result as T | undefined) ?? null);
      };
      req.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
};

const writeRecord = async <T>(
  db: IDBDatabase,
  storeName: string,
  record: T
) => {
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.objectStore(storeName).put(record);
    } catch {
      resolve();
    }
  });
};

const deleteRecord = async (
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
) => {
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.objectStore(storeName).delete(key);
    } catch {
      resolve();
    }
  });
};

export const buildRelationshipChildKey = (contractId: string, childId: bigint) =>
  `${contractId}:${childId.toString()}`;

export const buildRelationshipParentKey = (
  contractId: string,
  parentId: bigint
) => `${contractId}:${parentId.toString()}`;

export const loadRelationshipParents = async (params: {
  contractId: string;
  childId: bigint;
}): Promise<bigint[]> => {
  const db = await openDB();
  if (!db) {
    return [];
  }
  const key = buildRelationshipChildKey(params.contractId, params.childId);
  const record = await readRecord<ChildDependenciesRecord>(
    db,
    CHILD_STORE_NAME,
    key
  );
  return parseIdStrings(record?.parentIds);
};

export const loadRelationshipChildren = async (params: {
  contractId: string;
  parentId: bigint;
}): Promise<bigint[]> => {
  const db = await openDB();
  if (!db) {
    return [];
  }
  const key = buildRelationshipParentKey(params.contractId, params.parentId);
  const record = await readRecord<ParentChildrenRecord>(
    db,
    PARENT_STORE_NAME,
    key
  );
  return parseIdStrings(record?.childIds);
};

const addParentChildLink = async (params: {
  db: IDBDatabase;
  contractId: string;
  parentId: string;
  childId: string;
}) => {
  const parentIdBigInt = BigInt(params.parentId);
  const key = buildRelationshipParentKey(params.contractId, parentIdBigInt);
  const existing = await readRecord<ParentChildrenRecord>(
    params.db,
    PARENT_STORE_NAME,
    key
  );
  const childIds = normalizeIdStrings([
    ...(existing?.childIds ?? []),
    params.childId
  ]);
  const nextRecord: ParentChildrenRecord = {
    key,
    contractId: params.contractId,
    parentId: params.parentId,
    childIds,
    updatedAt: Date.now()
  };
  await writeRecord(params.db, PARENT_STORE_NAME, nextRecord);
};

const removeParentChildLink = async (params: {
  db: IDBDatabase;
  contractId: string;
  parentId: string;
  childId: string;
}) => {
  const parentIdBigInt = BigInt(params.parentId);
  const key = buildRelationshipParentKey(params.contractId, parentIdBigInt);
  const existing = await readRecord<ParentChildrenRecord>(
    params.db,
    PARENT_STORE_NAME,
    key
  );
  if (!existing) {
    return;
  }
  const childIds = normalizeIdStrings(
    existing.childIds.filter((id) => id !== params.childId)
  );
  if (childIds.length === 0) {
    await deleteRecord(params.db, PARENT_STORE_NAME, key);
    return;
  }
  await writeRecord(params.db, PARENT_STORE_NAME, {
    ...existing,
    childIds,
    updatedAt: Date.now()
  });
};

export const saveRelationshipChildDependencies = async (params: {
  contractId: string;
  childId: bigint;
  parentIds: bigint[];
}) => {
  const db = await openDB();
  if (!db) {
    return;
  }
  const childKey = buildRelationshipChildKey(params.contractId, params.childId);
  const childId = params.childId.toString();
  const nextParentIds = normalizeBigIntIds(params.parentIds);
  const existing = await readRecord<ChildDependenciesRecord>(
    db,
    CHILD_STORE_NAME,
    childKey
  );
  const previousParentIds = normalizeIdStrings(existing?.parentIds ?? []);
  const nextParentSet = new Set(nextParentIds);

  for (const previousParent of previousParentIds) {
    if (!nextParentSet.has(previousParent)) {
      await removeParentChildLink({
        db,
        contractId: params.contractId,
        parentId: previousParent,
        childId
      });
    }
  }

  for (const nextParent of nextParentIds) {
    await addParentChildLink({
      db,
      contractId: params.contractId,
      parentId: nextParent,
      childId
    });
  }

  const childRecord: ChildDependenciesRecord = {
    key: childKey,
    contractId: params.contractId,
    childId,
    parentIds: nextParentIds,
    updatedAt: Date.now()
  };
  await writeRecord(db, CHILD_STORE_NAME, childRecord);
};

export const loadRelationshipSyncCursor = async (contractId: string) => {
  const db = await openDB();
  if (!db) {
    return 0n;
  }
  const record = await readRecord<RelationshipSyncCursorRecord>(
    db,
    CURSOR_STORE_NAME,
    contractId
  );
  if (!record) {
    return 0n;
  }
  try {
    return BigInt(record.nextMintedIndex);
  } catch {
    return 0n;
  }
};

export const saveRelationshipSyncCursor = async (params: {
  contractId: string;
  nextMintedIndex: bigint;
}) => {
  const db = await openDB();
  if (!db) {
    return;
  }
  const record: RelationshipSyncCursorRecord = {
    contractId: params.contractId,
    nextMintedIndex: params.nextMintedIndex.toString(),
    updatedAt: Date.now()
  };
  await writeRecord(db, CURSOR_STORE_NAME, record);
};
