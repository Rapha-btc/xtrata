import { CHUNK_SIZE, MAX_BATCH_SIZE } from '../chunking/hash';
import type { XtrataClient } from '../contract/client';
import { getContractId } from '../contract/config';
import { logDebug, logInfo, logWarn } from '../utils/logger';
import {
  loadInscriptionFromCache,
  saveInscriptionToCache,
  saveInscriptionToTempCache,
  TEMP_CACHE_MAX_BYTES,
  TEMP_CACHE_TTL_MS
} from './cache';

export type MediaKind =
  | 'image'
  | 'svg'
  | 'audio'
  | 'video'
  | 'html'
  | 'text'
  | 'binary';

export const MAX_AUTO_PREVIEW_BYTES = 256n * 1024n;
export const MAX_TEXT_PREVIEW_BYTES = 32_768;
export const MAX_THUMBNAIL_BYTES = 2n * 1024n * 1024n;
const READ_BATCH_SIZE = 4;
const READ_CHUNK_CONCURRENCY = 4;
let batchConfigLogged = false;

const logBatchReadConfigOnce = () => {
  if (batchConfigLogged) {
    return;
  }
  batchConfigLogged = true;
  logInfo('chunk', 'Batch read config', {
    readBatchSize: Math.min(MAX_BATCH_SIZE, READ_BATCH_SIZE),
    chunkConcurrency: READ_CHUNK_CONCURRENCY
  });
};

export const normalizeMimeType = (mimeType?: string | null) =>
  mimeType ? mimeType.trim().toLowerCase() : null;

export const getMediaKind = (mimeType?: string | null): MediaKind => {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) {
    return 'binary';
  }
  if (normalized === 'image/svg+xml') {
    return 'svg';
  }
  if (normalized.startsWith('image/')) {
    return 'image';
  }
  if (normalized.startsWith('audio/')) {
    return 'audio';
  }
  if (normalized.startsWith('video/')) {
    return 'video';
  }
  if (
    normalized === 'text/html' ||
    normalized === 'application/xhtml+xml' ||
    normalized === 'application/pdf'
  ) {
    return 'html';
  }
  if (
    normalized.startsWith('text/') ||
    normalized === 'application/json' ||
    normalized === 'application/xml' ||
    normalized === 'application/javascript'
  ) {
    return 'text';
  }
  return 'binary';
};

export const isHttpUrl = (value: string) =>
  value.startsWith('http://') || value.startsWith('https://');

export const isDataUri = (value: string) => value.startsWith('data:');

export const getTotalChunks = (totalSize: bigint, chunkSize = CHUNK_SIZE) => {
  if (totalSize <= 0n) {
    return 0n;
  }
  const chunk = BigInt(chunkSize);
  return (totalSize + chunk - 1n) / chunk;
};

export const getExpectedChunkCount = (
  totalSize: bigint,
  chunkSize: number | null,
  fallbackChunkSize = CHUNK_SIZE
) => {
  if (totalSize <= 0n) {
    return 0n;
  }
  const resolved =
    chunkSize && chunkSize > 0 ? BigInt(chunkSize) : BigInt(fallbackChunkSize);
  if (resolved <= 0n) {
    return 0n;
  }
  return (totalSize + resolved - 1n) / resolved;
};

export const joinChunks = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
};

export const getTextPreview = (
  bytes: Uint8Array,
  maxBytes = MAX_TEXT_PREVIEW_BYTES
) => {
  const preview = bytes.slice(0, maxBytes);
  const text = new TextDecoder().decode(preview);
  return {
    text,
    truncated: bytes.length > maxBytes
  };
};

export const sniffMimeType = (bytes: Uint8Array) => {
  if (bytes.length < 4) {
    return null;
  }
  const signature = Array.from(bytes.slice(0, 4))
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase();
  if (signature === '1a45dfa3') {
    return 'audio/webm';
  }
  if (signature === '52494646') {
    return 'audio/wav';
  }
  if (signature === '89504e47') {
    return 'image/png';
  }
  if (signature.startsWith('ffd8ff')) {
    return 'image/jpeg';
  }
  if (signature === '47494638') {
    return 'image/gif';
  }
  if (signature === '25504446') {
    return 'application/pdf';
  }
  return null;
};

export const resolveMimeType = (
  metaMimeType: string | null,
  bytes?: Uint8Array | null
) => {
  const normalized = normalizeMimeType(metaMimeType);
  if (!bytes || bytes.length === 0) {
    return normalized;
  }
  if (
    !normalized ||
    normalized === 'application/json' ||
    normalized === 'application/octet-stream'
  ) {
    return sniffMimeType(bytes) ?? normalized;
  }
  return normalized;
};

export const extractImageFromMetadata = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as { image?: unknown; properties?: unknown };
  if (typeof candidate.image === 'string') {
    return candidate.image;
  }
  const properties = candidate.properties;
  if (
    properties &&
    typeof properties === 'object' &&
    typeof (properties as { visual?: unknown }).visual === 'string'
  ) {
    return (properties as { visual: string }).visual;
  }
  return null;
};

export const isLikelyImageUrl = (value: string) => {
  const lower = value.toLowerCase().split('?')[0].split('#')[0];
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg')
  );
};

const decodeBase64 = (value: string) => {
  if (typeof atob === 'function') {
    return atob(value);
  }
  const bufferFrom = (
    globalThis as {
      Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } };
    }
  ).Buffer?.from;
  if (bufferFrom) {
    return bufferFrom(value, 'base64').toString('utf8');
  }
  return null;
};

const decodeJsonDataUri = (value: string) => {
  if (value.startsWith('data:application/json;base64,')) {
    const payload = value.split(',', 2)[1] ?? '';
    return decodeBase64(payload);
  }
  if (
    value.startsWith('data:application/json,') ||
    value.startsWith('data:application/json;utf8,')
  ) {
    try {
      return decodeURIComponent(value.split(',', 2)[1] ?? '');
    } catch (error) {
      return null;
    }
  }
  return null;
};

export const decodeTokenUriToImage = (tokenUri: string | null) => {
  if (!tokenUri) {
    return null;
  }
  if (tokenUri.startsWith('data:image/')) {
    return tokenUri;
  }
  const jsonPayload = decodeJsonDataUri(tokenUri);
  if (!jsonPayload) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonPayload);
    const image = extractImageFromMetadata(parsed);
    return image ? normalizeMediaUrl(image) : null;
  } catch (error) {
    return null;
  }
};

const normalizeMediaUrl = (value: string) => {
  if (value.startsWith('ipfs://')) {
    let path = value.slice('ipfs://'.length);
    if (path.startsWith('ipfs/')) {
      path = path.slice('ipfs/'.length);
    }
    return `https://ipfs.io/ipfs/${path}`;
  }
  if (value.startsWith('ar://')) {
    const path = value.slice('ar://'.length);
    return `https://arweave.net/${path}`;
  }
  return value;
};

const resolveTokenUriImage = (
  tokenUri: string,
  image: string | null
): string | null => {
  if (!image) {
    return null;
  }
  const trimmed = normalizeMediaUrl(image.trim());
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('data:') || isHttpUrl(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('ipfs://') || trimmed.startsWith('ar://')) {
    return trimmed;
  }
  if (isHttpUrl(tokenUri)) {
    try {
      return new URL(trimmed, tokenUri).toString();
    } catch (error) {
      return trimmed;
    }
  }
  return trimmed;
};

const TOKEN_URI_CACHE_LIMIT = 200;
const tokenUriImageCache = new Map<string, string | null>();
const tokenUriInFlight = new Map<string, Promise<string | null>>();
const tokenUriCacheLog = new Set<string>();
const tokenUriInFlightLog = new Set<string>();

const pruneTokenUriCache = () => {
  if (tokenUriImageCache.size <= TOKEN_URI_CACHE_LIMIT) {
    return;
  }
  tokenUriImageCache.clear();
};

const logTokenUriOnce = (bucket: Set<string>, message: string, tokenUri: string) => {
  if (bucket.has(tokenUri)) {
    return;
  }
  bucket.add(tokenUri);
  if (bucket.size > TOKEN_URI_CACHE_LIMIT) {
    bucket.clear();
    bucket.add(tokenUri);
  }
  logDebug('token-uri', message, { tokenUri });
};

export const fetchJsonFromUrl = async (
  url: string,
  timeoutMs = 8000
): Promise<{ ok: boolean; json: Record<string, unknown> | null }> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return { ok: false, json: null };
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) {
      return { ok: true, json: { image: url } };
    }
    const text = await response.text();
    try {
      return { ok: true, json: JSON.parse(text) as Record<string, unknown> };
    } catch (error) {
      return { ok: false, json: null };
    }
  } catch (error) {
    return { ok: false, json: null };
  }
};

export const fetchTokenImageFromUri = async (tokenUri: string | null) => {
  if (!tokenUri) {
    return null;
  }
  if (tokenUriImageCache.has(tokenUri)) {
    logTokenUriOnce(tokenUriCacheLog, 'Token uri image cache hit', tokenUri);
    return tokenUriImageCache.get(tokenUri) ?? null;
  }
  const inFlight = tokenUriInFlight.get(tokenUri);
  if (inFlight) {
    logTokenUriOnce(tokenUriInFlightLog, 'Token uri image request in-flight', tokenUri);
    return inFlight;
  }

  logDebug('token-uri', 'Resolving token uri image', { tokenUri });
  const task = (async () => {
    const dataImage = decodeTokenUriToImage(tokenUri);
    if (dataImage) {
      logDebug('token-uri', 'Resolved inline token uri image');
      tokenUriImageCache.set(tokenUri, dataImage);
      pruneTokenUriCache();
      tokenUriInFlight.delete(tokenUri);
      return dataImage;
    }
    if (!isHttpUrl(tokenUri)) {
      tokenUriImageCache.set(tokenUri, null);
      pruneTokenUriCache();
      tokenUriInFlight.delete(tokenUri);
      return null;
    }
    const result = await fetchJsonFromUrl(tokenUri);
    if (!result.ok) {
      tokenUriInFlight.delete(tokenUri);
      return null;
    }
    const image = resolveTokenUriImage(
      tokenUri,
      extractImageFromMetadata(result.json)
    );
    if (image) {
      logDebug('token-uri', 'Resolved token uri image from metadata', { image });
      tokenUriImageCache.set(tokenUri, image);
      pruneTokenUriCache();
      tokenUriInFlight.delete(tokenUri);
      return image;
    }
    if (isLikelyImageUrl(tokenUri)) {
      logDebug('token-uri', 'Using token uri as image', { tokenUri });
      tokenUriImageCache.set(tokenUri, tokenUri);
      pruneTokenUriCache();
      tokenUriInFlight.delete(tokenUri);
      return tokenUri;
    }
    tokenUriImageCache.set(tokenUri, null);
    pruneTokenUriCache();
    tokenUriInFlight.delete(tokenUri);
    return null;
  })();

  tokenUriInFlight.set(tokenUri, task);
  return task;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const fetchChunkWithRetry = async (params: {
  client: XtrataClient;
  id: bigint;
  index: bigint;
  senderAddress: string;
  retries?: number;
}) => {
  const attempts = params.retries ?? 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      logDebug('chunk', 'Fetching chunk', {
        id: params.id.toString(),
        index: params.index.toString(),
        attempt
      });
      const chunk = await params.client.getChunk(
        params.id,
        params.index,
        params.senderAddress
      );
      if (!chunk || chunk.length === 0) {
        throw new Error(`Missing chunk ${params.index.toString()}`);
      }
      logDebug('chunk', 'Fetched chunk', {
        id: params.id.toString(),
        index: params.index.toString(),
        bytes: chunk.length
      });
      return chunk;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logDebug('chunk', 'Chunk fetch failed', {
        id: params.id.toString(),
        index: params.index.toString(),
        attempt,
        error: lastError.message
      });
      if (attempt < attempts) {
        await sleep(400 * Math.pow(2, attempt));
      }
    }
  }
  logWarn('chunk', 'Chunk fetch exhausted retries', {
    id: params.id.toString(),
    index: params.index.toString(),
    error: lastError?.message
  });
  throw lastError ?? new Error(`Missing chunk ${params.index.toString()}`);
};

const fetchChunkBatchWithRetry = async (params: {
  client: XtrataClient;
  id: bigint;
  indexes: bigint[];
  senderAddress: string;
  retries?: number;
}) => {
  if (params.indexes.length === 0) {
    return [] as { index: bigint; chunk: Uint8Array | null }[];
  }
  const attempts = params.retries ?? 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      logDebug('chunk', 'Fetching chunk batch', {
        id: params.id.toString(),
        count: params.indexes.length,
        start: params.indexes[0]?.toString(),
        end: params.indexes[params.indexes.length - 1]?.toString(),
        attempt
      });
      const batch = await params.client.getChunkBatch(
        params.id,
        params.indexes,
        params.senderAddress
      );
      if (batch.length !== params.indexes.length) {
        logWarn('chunk', 'Chunk batch length mismatch', {
          id: params.id.toString(),
          expected: params.indexes.length,
          actual: batch.length
        });
      }
      logDebug('chunk', 'Fetched chunk batch', {
        id: params.id.toString(),
        count: batch.length
      });
      return params.indexes.map((index, idx) => ({
        index,
        chunk: batch[idx] ?? null
      }));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logDebug('chunk', 'Chunk batch fetch failed', {
        id: params.id.toString(),
        attempt,
        error: lastError.message
      });
      if (attempt < attempts) {
        await sleep(400 * Math.pow(2, attempt));
      }
    }
  }
  logWarn('chunk', 'Chunk batch fetch exhausted retries', {
    id: params.id.toString(),
    error: lastError?.message
  });
  throw lastError ?? new Error(`Missing chunk batch for ${params.id.toString()}`);
};

const fetchChunksWithConcurrency = async (params: {
  client: XtrataClient;
  id: bigint;
  indexes: bigint[];
  senderAddress: string;
  concurrency?: number;
}) => {
  const results = new Map<bigint, Uint8Array>();
  if (params.indexes.length === 0) {
    return results;
  }
  const concurrency = Math.max(
    1,
    Math.min(params.concurrency ?? READ_CHUNK_CONCURRENCY, params.indexes.length)
  );
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= params.indexes.length) {
        return;
      }
      const index = params.indexes[current];
      const chunk = await fetchChunkWithRetry({
        client: params.client,
        id: params.id,
        index,
        senderAddress: params.senderAddress
      });
      results.set(index, chunk);
    }
  });
  await Promise.all(workers);
  return results;
};

const fetchRemainingChunksWithBatch = async (params: {
  client: XtrataClient;
  id: bigint;
  senderAddress: string;
  totalCount: number;
}) => {
  const chunkMap = new Map<bigint, Uint8Array>();
  const missing: bigint[] = [];
  let batchSize = Math.min(MAX_BATCH_SIZE, READ_BATCH_SIZE);
  let offset = 1;
  logInfo('chunk', 'Batch read plan', {
    id: params.id.toString(),
    totalChunks: params.totalCount,
    batchSize,
    chunkConcurrency: READ_CHUNK_CONCURRENCY
  });
  while (offset < params.totalCount) {
    if (batchSize <= 1) {
      const remaining: bigint[] = [];
      for (let index = offset; index < params.totalCount; index += 1) {
        remaining.push(BigInt(index));
      }
      logWarn('chunk', 'Batch reads disabled; using per-chunk fetch', {
        id: params.id.toString(),
        remaining: remaining.length
      });
      const results = await fetchChunksWithConcurrency({
        client: params.client,
        id: params.id,
        indexes: remaining,
        senderAddress: params.senderAddress
      });
      for (const [index, chunk] of results.entries()) {
        chunkMap.set(index, chunk);
      }
      break;
    }

    const batchIndexes: bigint[] = [];
    for (let index = offset; index < params.totalCount; index += 1) {
      batchIndexes.push(BigInt(index));
      if (batchIndexes.length >= batchSize) {
        offset = index + 1;
        break;
      }
      offset = index + 1;
    }

    let entries: { index: bigint; chunk: Uint8Array | null }[];
    try {
      entries = await fetchChunkBatchWithRetry({
        client: params.client,
        id: params.id,
        indexes: batchIndexes,
        senderAddress: params.senderAddress
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const costExceeded = message.toLowerCase().includes('costbalanceexceeded');
      if (costExceeded && batchSize > 1) {
        const nextBatchSize = Math.max(1, Math.floor(batchSize / 2));
        logWarn('chunk', 'Reducing batch size after cost error', {
          id: params.id.toString(),
          batchSize,
          nextBatchSize
        });
        batchSize = nextBatchSize;
        offset = Math.max(1, offset - batchIndexes.length);
        continue;
      }
      logWarn('chunk', 'Batch read failed; falling back to per-chunk fetch', {
        id: params.id.toString(),
        batchSize: batchIndexes.length,
        error: message
      });
      const results = await fetchChunksWithConcurrency({
        client: params.client,
        id: params.id,
        indexes: batchIndexes,
        senderAddress: params.senderAddress
      });
      for (const [index, chunk] of results.entries()) {
        chunkMap.set(index, chunk);
      }
      continue;
    }

    for (const entry of entries) {
      if (entry.chunk && entry.chunk.length > 0) {
        chunkMap.set(entry.index, entry.chunk);
      } else {
        missing.push(entry.index);
      }
    }
  }

  if (missing.length > 0) {
    logWarn('chunk', 'Batch missing chunks, retrying individually', {
      id: params.id.toString(),
      missing: missing.map((entry) => entry.toString())
    });
    const results = await fetchChunksWithConcurrency({
      client: params.client,
      id: params.id,
      indexes: missing,
      senderAddress: params.senderAddress
    });
    for (const [index, chunk] of results.entries()) {
      chunkMap.set(index, chunk);
    }
  }

  const ordered: Uint8Array[] = [];
  for (let index = 1; index < params.totalCount; index += 1) {
    const chunk = chunkMap.get(BigInt(index));
    if (!chunk) {
      throw new Error(`Missing chunk ${index.toString()}`);
    }
    ordered.push(chunk);
  }
  return ordered;
};

export const fetchOnChainContent = async (params: {
  client: XtrataClient;
  id: bigint;
  senderAddress: string;
  totalSize: bigint;
  mimeType?: string | null;
}) => {
  if (params.totalSize <= 0n) {
    return new Uint8Array();
  }
  const totalSizeNumber = Number(params.totalSize);
  if (!Number.isSafeInteger(totalSizeNumber)) {
    throw new Error('Inscription too large to render in browser');
  }
  const contractId = getContractId(params.client.contract);
  const cached = await loadInscriptionFromCache(contractId, params.id);
  if (cached?.data && cached.data.length > 0) {
    if (cached.data.length >= totalSizeNumber) {
      logInfo('chunk', 'Selected fetch mode', {
        contractId,
        id: params.id.toString(),
        fetchMode: 'cache',
        speed: 'FAST',
        contractMode: params.client.supportsChunkBatchRead ? 'batch' : 'chunk',
        contractSpeed: params.client.supportsChunkBatchRead ? 'FAST' : 'SLOW'
      });
      return cached.data.length === totalSizeNumber
        ? cached.data
        : cached.data.slice(0, totalSizeNumber);
    }
    logWarn('cache', 'Cached inscription smaller than expected', {
      id: params.id.toString(),
      contractId,
      expectedBytes: totalSizeNumber,
      cachedBytes: cached.data.length
    });
  }
  logInfo('chunk', 'Fetching on-chain content', {
    id: params.id.toString(),
    totalSize: totalSizeNumber,
    sender: params.senderAddress
  });
  const firstChunk = await fetchChunkWithRetry({
    client: params.client,
    id: params.id,
    index: 0n,
    senderAddress: params.senderAddress
  });

  const expectedChunks = getExpectedChunkCount(
    params.totalSize,
    firstChunk.length
  );
  const expectedCountNumber = Number(expectedChunks);
  logDebug('chunk', 'Chunk plan', {
    id: params.id.toString(),
    chunkSize: firstChunk.length,
    expectedChunks: expectedCountNumber
  });

  const chunks: Uint8Array[] = [firstChunk];
  if (Number.isSafeInteger(expectedCountNumber) && expectedCountNumber > 1) {
    const fetchMode = params.client.supportsChunkBatchRead ? 'batch' : 'chunk';
    if (params.client.supportsChunkBatchRead) {
      logBatchReadConfigOnce();
    }
    logInfo('chunk', 'Selected fetch mode', {
      contractId,
      id: params.id.toString(),
      fetchMode,
      speed: fetchMode === 'batch' ? 'FAST' : 'SLOW',
      contractMode: params.client.supportsChunkBatchRead ? 'batch' : 'chunk',
      contractSpeed: params.client.supportsChunkBatchRead ? 'FAST' : 'SLOW',
      readBatchSize: params.client.supportsChunkBatchRead
        ? Math.min(MAX_BATCH_SIZE, READ_BATCH_SIZE)
        : null,
      chunkConcurrency: params.client.supportsChunkBatchRead
        ? READ_CHUNK_CONCURRENCY
        : null,
      expectedChunks: expectedCountNumber
    });
    if (params.client.supportsChunkBatchRead) {
      const readBatchSize = Math.min(MAX_BATCH_SIZE, READ_BATCH_SIZE);
      const remaining = await fetchRemainingChunksWithBatch({
        client: params.client,
        id: params.id,
        senderAddress: params.senderAddress,
        totalCount: expectedCountNumber
      });
      chunks.push(...remaining);
    } else {
      const indices = Array.from(
        { length: expectedCountNumber - 1 },
        (_, index) => BigInt(index + 1)
      );
      const remaining = await Promise.all(
        indices.map((index) =>
          fetchChunkWithRetry({
            client: params.client,
            id: params.id,
            index,
            senderAddress: params.senderAddress
          })
        )
      );
      chunks.push(...remaining);
    }
  } else {
    logInfo('chunk', 'Selected fetch mode', {
      contractId,
      id: params.id.toString(),
      fetchMode: 'single',
      speed: 'FAST',
      contractMode: params.client.supportsChunkBatchRead ? 'batch' : 'chunk',
      contractSpeed: params.client.supportsChunkBatchRead ? 'FAST' : 'SLOW',
      expectedChunks: expectedCountNumber
    });
    logWarn('chunk', 'Falling back to sequential chunk fetch', {
      id: params.id.toString(),
      totalSize: totalSizeNumber
    });
    let totalBytes = firstChunk.length;
    let index = 1n;
    while (totalBytes < totalSizeNumber) {
      const chunk = await fetchChunkWithRetry({
        client: params.client,
        id: params.id,
        index,
        senderAddress: params.senderAddress
      });
      chunks.push(chunk);
      totalBytes += chunk.length;
      index += 1n;
    }
  }

  const combined = joinChunks(chunks);
  const trimmed =
    combined.length > totalSizeNumber
      ? combined.slice(0, totalSizeNumber)
      : combined;
  const mediaKind = getMediaKind(params.mimeType ?? null);
  const shouldTempCache =
    (mediaKind === 'audio' || mediaKind === 'video') &&
    totalSizeNumber > Number(MAX_AUTO_PREVIEW_BYTES) &&
    totalSizeNumber <= TEMP_CACHE_MAX_BYTES;
  if (shouldTempCache) {
    await saveInscriptionToTempCache(
      contractId,
      params.id,
      trimmed,
      params.mimeType ?? null,
      TEMP_CACHE_TTL_MS
    );
  } else {
    await saveInscriptionToCache(
      contractId,
      params.id,
      trimmed,
      params.mimeType ?? null
    );
  }
  logInfo('chunk', 'Reconstructed content', {
    id: params.id.toString(),
    bytes: combined.length,
    trimmed: combined.length > totalSizeNumber
  });
  return trimmed;
};
