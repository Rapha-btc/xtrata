import { sha256 } from '@noble/hashes/sha256';

export const CHUNK_SIZE = 16_384;
export const MAX_BATCH_SIZE = 50;
export const MAX_UPLOAD_BATCH_SIZE = 30;
export const EMPTY_HASH = new Uint8Array(32);

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

export const batchChunks = (chunks: Uint8Array[], batchSize = MAX_UPLOAD_BATCH_SIZE) => {
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be greater than zero');
  }

  const resolvedBatchSize = Math.min(MAX_UPLOAD_BATCH_SIZE, Math.floor(batchSize));
  const batches: Uint8Array[][] = [];
  for (let offset = 0; offset < chunks.length; offset += resolvedBatchSize) {
    batches.push(chunks.slice(offset, offset + resolvedBatchSize));
  }
  return batches;
};

export const computeExpectedHash = (chunks: Uint8Array[]) => {
  let runningHash = EMPTY_HASH;
  for (const chunk of chunks) {
    runningHash = sha256(concatBytes(runningHash, chunk));
  }
  return runningHash;
};
