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
    if (bytes.length >= 12) {
      const riffKind = String.fromCharCode(
        bytes[8] ?? 0,
        bytes[9] ?? 0,
        bytes[10] ?? 0,
        bytes[11] ?? 0
      );
      if (riffKind === 'WEBP') {
        return 'image/webp';
      }
    }
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

const toAsciiBytes = (value: string) =>
  Uint8Array.from(value.split('').map((char) => char.charCodeAt(0)));

const indexOfBytes = (
  haystack: Uint8Array,
  needle: Uint8Array
) => {
  if (needle.length === 0 || haystack.length < needle.length) {
    return -1;
  }
  const end = haystack.length - needle.length;
  for (let offset = 0; offset <= end; offset += 1) {
    let matches = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[offset + index] !== needle[index]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return offset;
    }
  }
  return -1;
};

const WEBM_AUDIO_CODEC_MARKERS = [
  'A_OPUS',
  'A_VORBIS',
  'A_AAC',
  'A_MPEG/L3',
  'A_AC3',
  'A_EAC3',
  'A_FLAC',
  'A_PCM',
  'A_ALAC'
].map(toAsciiBytes);

const WEBM_VIDEO_CODEC_MARKERS = [
  'V_VP8',
  'V_VP9',
  'V_AV1',
  'V_THEORA',
  'V_MPEG4',
  'V_MPEGH/ISO/HEVC'
].map(toAsciiBytes);

// Detects likely media kind for WebM payloads using codec-id markers in the
// file header, allowing audio/webm-in-video containers to be treated as audio.
export const detectWebmTrackKind = (
  bytes: Uint8Array,
  maxScanBytes = 256 * 1024
): 'audio' | 'video' | null => {
  if (bytes.length === 0) {
    return null;
  }
  const scanLimit = Math.min(bytes.length, Math.max(0, maxScanBytes));
  if (scanLimit === 0) {
    return null;
  }
  const head = bytes.subarray(0, scanLimit);
  const hasVideoMarker = WEBM_VIDEO_CODEC_MARKERS.some(
    (marker) => indexOfBytes(head, marker) !== -1
  );
  const hasAudioMarker = WEBM_AUDIO_CODEC_MARKERS.some(
    (marker) => indexOfBytes(head, marker) !== -1
  );
  if (hasVideoMarker) {
    return 'video';
  }
  if (hasAudioMarker) {
    return 'audio';
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

const isGifHeader = (bytes: Uint8Array) =>
  bytes.length >= 6 &&
  bytes[0] === 0x47 &&
  bytes[1] === 0x49 &&
  bytes[2] === 0x46 &&
  bytes[3] === 0x38 &&
  (bytes[4] === 0x37 || bytes[4] === 0x39) &&
  bytes[5] === 0x61;

const skipGifSubBlocks = (bytes: Uint8Array, start: number) => {
  let cursor = start;
  while (cursor < bytes.length) {
    const blockSize = bytes[cursor] ?? 0;
    cursor += 1;
    if (blockSize === 0) {
      return cursor;
    }
    cursor += blockSize;
  }
  return bytes.length;
};

// Returns the playback duration of one finite GIF run (all loops), or null
// when the GIF already loops forever, is static, or cannot be parsed safely.
export const getFiniteGifReplayDelayMs = (bytes: Uint8Array) => {
  if (!isGifHeader(bytes) || bytes.length < 13) {
    return null;
  }
  let cursor = 13;
  const logicalDescriptorPacked = bytes[10] ?? 0;
  if ((logicalDescriptorPacked & 0x80) !== 0) {
    const globalColorTableSize = 1 << ((logicalDescriptorPacked & 0x07) + 1);
    cursor += globalColorTableSize * 3;
  }

  let currentDelayCs = 10;
  let totalDelayCs = 0;
  let frameCount = 0;
  let loopCount: number | null = null;

  while (cursor < bytes.length) {
    const blockType = bytes[cursor++];
    if (blockType === 0x3b) {
      break;
    }
    if (blockType === 0x21) {
      const extensionLabel = bytes[cursor++] ?? 0;
      if (extensionLabel === 0xf9) {
        const blockSize = bytes[cursor++] ?? 0;
        if (blockSize >= 4 && cursor + blockSize <= bytes.length) {
          const delayLo = bytes[cursor + 1] ?? 0;
          const delayHi = bytes[cursor + 2] ?? 0;
          const parsedDelay = (delayHi << 8) | delayLo;
          currentDelayCs = parsedDelay > 0 ? parsedDelay : 10;
        }
        cursor += blockSize;
        if (cursor < bytes.length && bytes[cursor] === 0x00) {
          cursor += 1;
        }
        continue;
      }
      if (extensionLabel === 0xff) {
        const appBlockSize = bytes[cursor++] ?? 0;
        const appStart = cursor;
        const appEnd = Math.min(bytes.length, cursor + appBlockSize);
        const appIdentifier = Array.from(bytes.slice(appStart, appEnd))
          .map((value) => String.fromCharCode(value))
          .join('');
        cursor = appEnd;
        const isLoopExtension =
          appIdentifier.startsWith('NETSCAPE') ||
          appIdentifier.startsWith('ANIMEXTS');
        if (isLoopExtension && cursor < bytes.length) {
          const firstSubBlockSize = bytes[cursor] ?? 0;
          const firstSubBlockStart = cursor + 1;
          if (
            firstSubBlockSize >= 3 &&
            firstSubBlockStart + firstSubBlockSize <= bytes.length &&
            bytes[firstSubBlockStart] === 0x01
          ) {
            const loopLo = bytes[firstSubBlockStart + 1] ?? 0;
            const loopHi = bytes[firstSubBlockStart + 2] ?? 0;
            loopCount = (loopHi << 8) | loopLo;
          }
        }
        cursor = skipGifSubBlocks(bytes, cursor);
        continue;
      }
      cursor = skipGifSubBlocks(bytes, cursor);
      continue;
    }
    if (blockType === 0x2c) {
      if (cursor + 9 > bytes.length) {
        break;
      }
      const localDescriptorPacked = bytes[cursor + 8] ?? 0;
      cursor += 9;
      if ((localDescriptorPacked & 0x80) !== 0) {
        const localColorTableSize = 1 << ((localDescriptorPacked & 0x07) + 1);
        cursor += localColorTableSize * 3;
      }
      if (cursor >= bytes.length) {
        break;
      }
      cursor += 1; // LZW minimum code size
      cursor = skipGifSubBlocks(bytes, cursor);
      frameCount += 1;
      totalDelayCs += currentDelayCs;
      currentDelayCs = 10;
      continue;
    }
    break;
  }

  if (frameCount < 2) {
    return null;
  }
  if (loopCount === 0) {
    return null;
  }
  const resolvedLoops = loopCount ?? 1;
  if (resolvedLoops <= 0) {
    return null;
  }
  const perLoopDurationMs = Math.max(totalDelayCs * 10, frameCount * 100);
  return perLoopDurationMs * resolvedLoops;
};

const readUint16BE = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 2 > bytes.length) {
    return null;
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
};

const readUint16LE = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 2 > bytes.length) {
    return null;
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
};

const readUint24LE = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 3 > bytes.length) {
    return null;
  }
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
};

const readUint32BE = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  return (
    (bytes[offset] * 0x1000000) +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
};

const readUint32LE = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    (bytes[offset + 3] * 0x1000000)
  );
};

const isPngHeader = (bytes: Uint8Array) =>
  bytes.length >= 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47 &&
  bytes[4] === 0x0d &&
  bytes[5] === 0x0a &&
  bytes[6] === 0x1a &&
  bytes[7] === 0x0a;

const getChunkType = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
};

// Returns one finite APNG run duration (all loops), or null for static/looping
// forever payloads or malformed chunk layouts.
const getFiniteApngReplayDelayMs = (bytes: Uint8Array) => {
  if (!isPngHeader(bytes)) {
    return null;
  }
  let cursor = 8;
  let hasAnimationControl = false;
  let loopCount: number | null = null;
  let declaredFrameCount: number | null = null;
  let parsedFrameCount = 0;
  let totalFrameDurationMs = 0;

  while (cursor + 8 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, cursor);
    const chunkType = getChunkType(bytes, cursor + 4);
    if (chunkLength === null || chunkType === null) {
      break;
    }
    const dataStart = cursor + 8;
    const dataEnd = dataStart + chunkLength;
    const nextChunk = dataEnd + 4;
    if (dataEnd > bytes.length || nextChunk > bytes.length) {
      break;
    }

    if (chunkType === 'acTL' && chunkLength >= 8) {
      hasAnimationControl = true;
      declaredFrameCount = readUint32BE(bytes, dataStart);
      loopCount = readUint32BE(bytes, dataStart + 4);
    } else if (chunkType === 'fcTL' && chunkLength >= 26) {
      parsedFrameCount += 1;
      const delayNum = readUint16BE(bytes, dataStart + 20) ?? 0;
      const delayDen = readUint16BE(bytes, dataStart + 22) ?? 100;
      const resolvedDen = delayDen === 0 ? 100 : delayDen;
      const frameDurationMs =
        delayNum > 0
          ? Math.max(10, Math.round((delayNum * 1000) / resolvedDen))
          : 100;
      totalFrameDurationMs += frameDurationMs;
    }

    cursor = nextChunk;
    if (chunkType === 'IEND') {
      break;
    }
  }

  const resolvedFrameCount = Math.max(declaredFrameCount ?? 0, parsedFrameCount);
  if (!hasAnimationControl || resolvedFrameCount < 2) {
    return null;
  }
  if (loopCount === 0) {
    return null;
  }
  const resolvedLoops = loopCount ?? 1;
  if (resolvedLoops <= 0) {
    return null;
  }
  const perLoopDurationMs = Math.max(
    totalFrameDurationMs,
    resolvedFrameCount * 10
  );
  return perLoopDurationMs * resolvedLoops;
};

const isWebpHeader = (bytes: Uint8Array) =>
  bytes.length >= 12 &&
  bytes[0] === 0x52 &&
  bytes[1] === 0x49 &&
  bytes[2] === 0x46 &&
  bytes[3] === 0x46 &&
  bytes[8] === 0x57 &&
  bytes[9] === 0x45 &&
  bytes[10] === 0x42 &&
  bytes[11] === 0x50;

// Returns one finite animated WebP run duration (all loops), or null for
// static/infinite payloads or malformed RIFF chunk structure.
const getFiniteWebpReplayDelayMs = (bytes: Uint8Array) => {
  if (!isWebpHeader(bytes)) {
    return null;
  }
  let cursor = 12;
  let hasAnimationChunk = false;
  let loopCount: number | null = null;
  let frameCount = 0;
  let totalFrameDurationMs = 0;

  while (cursor + 8 <= bytes.length) {
    const chunkType = getChunkType(bytes, cursor);
    const chunkLength = readUint32LE(bytes, cursor + 4);
    if (chunkType === null || chunkLength === null) {
      break;
    }
    const dataStart = cursor + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > bytes.length) {
      break;
    }

    if (chunkType === 'ANIM' && chunkLength >= 6) {
      hasAnimationChunk = true;
      loopCount = readUint16LE(bytes, dataStart + 4);
    } else if (chunkType === 'ANMF' && chunkLength >= 16) {
      frameCount += 1;
      const frameDurationMs = readUint24LE(bytes, dataStart + 12) ?? 0;
      totalFrameDurationMs += frameDurationMs > 0 ? frameDurationMs : 100;
    }

    const paddedLength = chunkLength + (chunkLength % 2);
    cursor = dataStart + paddedLength;
  }

  if (!hasAnimationChunk || frameCount < 2) {
    return null;
  }
  if (loopCount === 0) {
    return null;
  }
  const resolvedLoops = loopCount ?? 1;
  if (resolvedLoops <= 0) {
    return null;
  }
  const perLoopDurationMs = Math.max(totalFrameDurationMs, frameCount * 10);
  return perLoopDurationMs * resolvedLoops;
};

// Returns playback duration of one finite animated-image run (all loops), or
// null for static/infinite animations and non-animated payloads.
export const getFiniteAnimatedImageReplayDelayMs = (
  bytes: Uint8Array,
  mimeType?: string | null
) => {
  if (!bytes || bytes.length === 0) {
    return null;
  }
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (normalizedMimeType === 'image/gif') {
    return getFiniteGifReplayDelayMs(bytes);
  }
  if (normalizedMimeType === 'image/apng' || normalizedMimeType === 'image/png') {
    return getFiniteApngReplayDelayMs(bytes);
  }
  if (normalizedMimeType === 'image/webp') {
    return getFiniteWebpReplayDelayMs(bytes);
  }

  const sniffedMimeType = sniffMimeType(bytes);
  if (sniffedMimeType === 'image/gif') {
    return getFiniteGifReplayDelayMs(bytes);
  }
  if (sniffedMimeType === 'image/png') {
    return getFiniteApngReplayDelayMs(bytes);
  }
  if (sniffedMimeType === 'image/webp') {
    return getFiniteWebpReplayDelayMs(bytes);
  }
  return null;
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
export const IMMUTABLE_VIEWER_FETCH_CACHE_MODE: RequestCache = 'force-cache';
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
      cache: IMMUTABLE_VIEWER_FETCH_CACHE_MODE,
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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isMissingChunkError = (error: unknown) =>
  getErrorMessage(error).toLowerCase().includes('missing chunk');

const fetchChunkWithRetry = async (params: {
  client: XtrataClient;
  id: bigint;
  index: bigint;
  senderAddress: string;
  retries?: number;
}) => {
  const contractId = getContractId(params.client.contract);
  const attempts = params.retries ?? 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      logDebug('chunk', 'Fetching chunk', {
        contractId,
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
        contractId,
        id: params.id.toString(),
        index: params.index.toString(),
        bytes: chunk.length
      });
      return chunk;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logDebug('chunk', 'Chunk fetch failed', {
        contractId,
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
    contractId,
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
  const contractId = getContractId(params.client.contract);
  if (params.indexes.length === 0) {
    return [] as { index: bigint; chunk: Uint8Array | null }[];
  }
  const attempts = params.retries ?? 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      logDebug('chunk', 'Fetching chunk batch', {
        contractId,
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
          contractId,
          id: params.id.toString(),
          expected: params.indexes.length,
          actual: batch.length
        });
      }
      logDebug('chunk', 'Fetched chunk batch', {
        contractId,
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
        contractId,
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
    contractId,
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
  fallbackClient?: XtrataClient | null;
  cacheContractId?: string;
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
  const primaryContractId = getContractId(params.client.contract);
  const fallbackClient = params.fallbackClient ?? null;
  const fallbackContractId = fallbackClient
    ? getContractId(fallbackClient.contract)
    : null;
  const cacheContractId = params.cacheContractId ?? primaryContractId;
  const cached = await loadInscriptionFromCache(cacheContractId, params.id);
  if (cached?.data && cached.data.length > 0) {
    if (cached.data.length >= totalSizeNumber) {
      logInfo('chunk', 'Selected fetch mode', {
        contractId: cacheContractId,
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
      contractId: cacheContractId,
      expectedBytes: totalSizeNumber,
      cachedBytes: cached.data.length
    });
  }
  logInfo('chunk', 'Fetching on-chain content', {
    id: params.id.toString(),
    primaryContractId,
    fallbackContractId,
    cacheContractId,
    totalSize: totalSizeNumber,
    sender: params.senderAddress
  });
  let activeClient = params.client;
  let chunkSourceContractId = primaryContractId;
  let firstChunk: Uint8Array;
  try {
    firstChunk = await fetchChunkWithRetry({
      client: params.client,
      id: params.id,
      index: 0n,
      senderAddress: params.senderAddress
    });
  } catch (error) {
    if (!fallbackClient || !isMissingChunkError(error)) {
      throw error;
    }
    logWarn('chunk', 'Primary chunk read failed; attempting fallback source', {
      id: params.id.toString(),
      primaryContractId,
      fallbackContractId,
      error: getErrorMessage(error)
    });
    firstChunk = await fetchChunkWithRetry({
      client: fallbackClient,
      id: params.id,
      index: 0n,
      senderAddress: params.senderAddress
    });
    activeClient = fallbackClient;
    chunkSourceContractId = fallbackContractId ?? primaryContractId;
    logInfo('chunk', 'Using fallback chunk source contract', {
      id: params.id.toString(),
      primaryContractId,
      chunkSourceContractId,
      cacheContractId
    });
  }

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
    const fetchMode = activeClient.supportsChunkBatchRead ? 'batch' : 'chunk';
    if (activeClient.supportsChunkBatchRead) {
      logBatchReadConfigOnce();
    }
    logInfo('chunk', 'Selected fetch mode', {
      contractId: cacheContractId,
      chunkSourceContractId,
      id: params.id.toString(),
      fetchMode,
      speed: fetchMode === 'batch' ? 'FAST' : 'SLOW',
      contractMode: activeClient.supportsChunkBatchRead ? 'batch' : 'chunk',
      contractSpeed: activeClient.supportsChunkBatchRead ? 'FAST' : 'SLOW',
      readBatchSize: activeClient.supportsChunkBatchRead
        ? Math.min(MAX_BATCH_SIZE, READ_BATCH_SIZE)
        : null,
      chunkConcurrency: activeClient.supportsChunkBatchRead
        ? READ_CHUNK_CONCURRENCY
        : null,
      expectedChunks: expectedCountNumber
    });
    if (activeClient.supportsChunkBatchRead) {
      const remaining = await fetchRemainingChunksWithBatch({
        client: activeClient,
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
            client: activeClient,
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
      contractId: cacheContractId,
      chunkSourceContractId,
      id: params.id.toString(),
      fetchMode: 'single',
      speed: 'FAST',
      contractMode: activeClient.supportsChunkBatchRead ? 'batch' : 'chunk',
      contractSpeed: activeClient.supportsChunkBatchRead ? 'FAST' : 'SLOW',
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
        client: activeClient,
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
  if (combined.length < totalSizeNumber) {
    logWarn('chunk', 'Reconstructed content shorter than expected', {
      id: params.id.toString(),
      expectedBytes: totalSizeNumber,
      actualBytes: combined.length
    });
  }
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
      cacheContractId,
      params.id,
      trimmed,
      params.mimeType ?? null,
      TEMP_CACHE_TTL_MS
    );
  } else {
    await saveInscriptionToCache(
      cacheContractId,
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
