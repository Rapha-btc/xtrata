import { sha256 } from '@noble/hashes/sha256';
import {
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  type PostCondition
} from '@stacks/transactions';

export const CHUNK_SIZE = 16_384;
export const MAX_BATCH_SIZE = 50;
export const MAX_SMALL_MINT_CHUNKS = 30;
export const EMPTY_HASH = new Uint8Array(32);

export const DEFAULT_BATCH_SIZE = Math.min(30, MAX_BATCH_SIZE);
export const TX_DELAY_SECONDS = 5;
export const DEFAULT_TOKEN_URI =
  'https://xvgh3sbdkivby4blejmripeiyjuvji3d4tycym6hgaxalescegjq.arweave.net/vUx9yCNSKhxwKyJZFDyIwmlUo2Pk8CwzxzAuBZJCIZM';
export const MAX_TOKEN_URI_LENGTH = 256;
export const MAX_MIME_LENGTH = 64;

const concatBytes = (left: Uint8Array, right: Uint8Array) => {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
};

export const chunkBytes = (data: Uint8Array, chunkSize = CHUNK_SIZE) => {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be greater than zero');
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    chunks.push(data.slice(offset, offset + chunkSize));
  }
  return chunks;
};

export const batchChunks = (chunks: Uint8Array[], batchSize = MAX_BATCH_SIZE) => {
  if (batchSize <= 0) {
    throw new Error('batchSize must be greater than zero');
  }
  const batches: Uint8Array[][] = [];
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    batches.push(chunks.slice(offset, offset + batchSize));
  }
  return batches;
};

export const computeExpectedHash = (chunks: Uint8Array[]) => {
  let runningHash = EMPTY_HASH;
  for (const chunk of chunks) {
    runningHash = new Uint8Array(sha256(concatBytes(runningHash, chunk)));
  }
  return runningHash;
};

export const MICROSTX_PER_STX = 1_000_000;
export const DEFAULT_FEE_UNIT_MICROSTX = 100_000;

export type FeeSchedule = {
  model: 'fee-unit';
  feeUnitMicroStx: number;
};

export type FeeEstimate = {
  beginMicroStx: number;
  sealMicroStx: number;
  totalMicroStx: number;
  feeBatches: number;
};

export type BatchFeeEstimate = {
  itemCount: number;
  beginMicroStx: number;
  sealMicroStx: number;
  totalMicroStx: number;
  feeBatches: number;
};

const normalizeMicroStx = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return DEFAULT_FEE_UNIT_MICROSTX;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_FEE_UNIT_MICROSTX;
  }
  return Math.round(value);
};

const normalizeTotalChunks = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
};

export const getFeeSchedule = (feeUnitMicroStx?: number | null): FeeSchedule => ({
  model: 'fee-unit',
  feeUnitMicroStx: normalizeMicroStx(feeUnitMicroStx)
});

export const estimateContractFees = (params: {
  schedule: FeeSchedule;
  totalChunks: number;
}): FeeEstimate => {
  const totalChunks = normalizeTotalChunks(params.totalChunks);
  const feeUnitMicroStx = params.schedule.feeUnitMicroStx;
  const feeBatches = totalChunks > 0 ? Math.ceil(totalChunks / MAX_BATCH_SIZE) : 0;
  const sealMicroStx = totalChunks > 0 ? feeUnitMicroStx * (1 + feeBatches) : 0;
  const beginMicroStx = feeUnitMicroStx;
  return {
    beginMicroStx,
    sealMicroStx,
    totalMicroStx: beginMicroStx + sealMicroStx,
    feeBatches
  };
};

export const estimateBatchContractFees = (params: {
  schedule: FeeSchedule;
  totalChunks: number[];
}): BatchFeeEstimate => {
  const items = params.totalChunks.map((count) =>
    estimateContractFees({ schedule: params.schedule, totalChunks: count })
  );
  const beginMicroStx = items.reduce((sum, item) => sum + item.beginMicroStx, 0);
  const sealMicroStx = items.reduce((sum, item) => sum + item.sealMicroStx, 0);
  const feeBatches = items.reduce((sum, item) => sum + item.feeBatches, 0);
  return {
    itemCount: items.length,
    beginMicroStx,
    sealMicroStx,
    totalMicroStx: beginMicroStx + sealMicroStx,
    feeBatches
  };
};

export const formatMicroStx = (value: number) =>
  `${(value / MICROSTX_PER_STX).toFixed(6)} STX`;

type MintBeginSpendCapParams = {
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  additionalCapMicroStx?: bigint | null;
};

export const resolveMintBeginSpendCapMicroStx = (
  params: MintBeginSpendCapParams
) => {
  const baseCap = params.activePhaseMintPrice ?? params.mintPrice ?? null;
  if (baseCap === null || baseCap < 0n) {
    return null;
  }
  if (params.additionalCapMicroStx === null || params.additionalCapMicroStx === undefined) {
    return baseCap;
  }
  if (params.additionalCapMicroStx <= 0n) {
    return null;
  }
  return params.additionalCapMicroStx < baseCap
    ? params.additionalCapMicroStx
    : baseCap;
};

type CollectionBeginSpendCapParams = MintBeginSpendCapParams & {
  protocolFeeMicroStx: bigint | null;
};

export const resolveCollectionBeginSpendCapMicroStx = (
  params: CollectionBeginSpendCapParams
) => {
  const mintCap = resolveMintBeginSpendCapMicroStx(params);
  if (mintCap === null) {
    return null;
  }
  const protocolFee = params.protocolFeeMicroStx;
  if (protocolFee === null || protocolFee < 0n) {
    return null;
  }
  return mintCap + protocolFee;
};

type SealSpendCapParams = {
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

const toPositiveChunkCount = (value: number | bigint | null) => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'bigint') {
    return value > 0n ? value : null;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return BigInt(value);
};

const toPositiveProtocolFee = (value: bigint | null) => {
  if (value === null || value <= 0n) {
    return null;
  }
  return value;
};

export const resolveSealSpendCapMicroStx = (params: SealSpendCapParams) => {
  const feeUnit = toPositiveProtocolFee(params.protocolFeeMicroStx);
  const totalChunks = toPositiveChunkCount(params.totalChunks);
  if (feeUnit === null || totalChunks === null) {
    return null;
  }
  const chunkBatchSize = BigInt(MAX_BATCH_SIZE);
  const feeBatches = (totalChunks + chunkBatchSize - 1n) / chunkBatchSize;
  return feeUnit * (1n + feeBatches);
};

type SmallMintSingleTxSpendCapParams = {
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

export const resolveSmallMintSingleTxSpendCapMicroStx = (
  params: SmallMintSingleTxSpendCapParams
) => {
  const beginFee = toPositiveProtocolFee(params.protocolFeeMicroStx);
  const sealFee = resolveSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (beginFee === null || sealFee === null) {
    return null;
  }
  return beginFee + sealFee;
};

type BatchSealSpendCapParams = {
  protocolFeeMicroStx: bigint | null;
  totalChunks: Array<number | bigint>;
};

export const resolveBatchSealSpendCapMicroStx = (
  params: BatchSealSpendCapParams
) => {
  const feeUnit = toPositiveProtocolFee(params.protocolFeeMicroStx);
  if (feeUnit === null) {
    return null;
  }
  let total = 0n;
  for (const totalChunks of params.totalChunks) {
    const itemCap = resolveSealSpendCapMicroStx({
      protocolFeeMicroStx: feeUnit,
      totalChunks
    });
    if (itemCap === null) {
      return null;
    }
    total += itemCap;
  }
  return total;
};

type MintBeginPostConditionParams = MintBeginSpendCapParams & {
  sender?: string | null;
};

export const buildMintBeginStxPostConditions = (
  params: MintBeginPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const cap = resolveMintBeginSpendCapMicroStx(params);
  if (cap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(sender, FungibleConditionCode.LessEqual, cap)
  ];
};

type ProtocolFeePostConditionParams = {
  sender?: string | null;
  protocolFeeMicroStx: bigint | null;
};

export const buildProtocolFeeStxPostConditions = (
  params: ProtocolFeePostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const protocolFee = params.protocolFeeMicroStx;
  if (protocolFee === null || protocolFee <= 0n) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      protocolFee
    )
  ];
};

type SealPostConditionParams = {
  sender?: string | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

export const buildSealStxPostConditions = (
  params: SealPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const sealCap = resolveSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (sealCap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      sealCap
    )
  ];
};

type SmallMintSingleTxPostConditionParams = {
  sender?: string | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

export const buildSmallMintSingleTxStxPostConditions = (
  params: SmallMintSingleTxPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const spendCap = resolveSmallMintSingleTxSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (spendCap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      spendCap
    )
  ];
};

type BatchSealPostConditionParams = {
  sender?: string | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: Array<number | bigint>;
};

export const buildBatchSealStxPostConditions = (
  params: BatchSealPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const sealCap = resolveBatchSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (sealCap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      sealCap
    )
  ];
};

const TOKEN_PATTERN = /^\d+$/;
const SPLIT_PATTERN = /[,\s]+/;

export type DependencyParseResult = {
  ids: bigint[];
  invalidTokens: string[];
};

export type DependencyValidation = {
  ok: boolean;
  reason?: string;
};

export function parseDependencyInput(raw: string): DependencyParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ids: [], invalidTokens: [] };
  }

  const tokens = trimmed.split(SPLIT_PATTERN).filter(Boolean);
  const ids: bigint[] = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    if (TOKEN_PATTERN.test(token)) {
      ids.push(BigInt(token));
    } else {
      invalidTokens.push(token);
    }
  }

  return { ids, invalidTokens };
}

export function normalizeDependencyIds(ids: bigint[]): bigint[] {
  const unique = Array.from(new Set(ids));
  unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return unique;
}

export function mergeDependencySources(...sources: bigint[][]): bigint[] {
  const merged: bigint[] = [];
  for (const source of sources) {
    merged.push(...source);
  }
  return normalizeDependencyIds(merged);
}

export function validateDependencyIds(ids: bigint[]): DependencyValidation {
  if (ids.length > 50) {
    return { ok: false, reason: 'max-50' };
  }
  for (const id of ids) {
    if (id < 0n) {
      return { ok: false, reason: 'negative-id' };
    }
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: 'duplicate-ids' };
  }
  return { ok: true };
}

export function toDependencyStrings(ids: bigint[]): string[] {
  return ids.map((id) => id.toString());
}

export function fromDependencyStrings(ids: string[]): bigint[] {
  const parsed: bigint[] = [];
  for (const token of ids) {
    if (TOKEN_PATTERN.test(token)) {
      parsed.push(BigInt(token));
    }
  }
  return normalizeDependencyIds(parsed);
}

export type MintAttempt = {
  contractId: string;
  expectedHashHex: string;
  fileName: string | null;
  mimeType: string;
  totalBytes: number;
  totalChunks: number;
  batchSize: number;
  tokenUri: string | null;
  dependencyIds?: string[];
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
  } catch {
    return null;
  }
};

const saveToStorage = (attempt: MintAttempt) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(buildKey(attempt.contractId), JSON.stringify(attempt));
  } catch {
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
    } catch {
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
    } catch {
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
    } catch {
      clearFromStorage(contractId);
      resolve();
    }
  });
};
