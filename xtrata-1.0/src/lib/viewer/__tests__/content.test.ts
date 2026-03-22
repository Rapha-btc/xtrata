import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_SIZE } from '../../chunking/hash';
import {
  decodeTokenUriToImage,
  detectWebmTrackKind,
  extractImageFromMetadata,
  IMMUTABLE_VIEWER_FETCH_CACHE_MODE,
  getFiniteAnimatedImageReplayDelayMs,
  fetchTokenImageFromUri,
  getFiniteGifReplayDelayMs,
  getExpectedChunkCount,
  getMediaKind,
  getTextPreview,
  getTotalChunks,
  isLikelyImageUrl,
  joinChunks,
  resolveMimeType,
  sniffMimeType
} from '../content';

const buildAnimatedGif = ({
  frameCount = 2,
  delayCs = 5,
  loopCount
}: {
  frameCount?: number;
  delayCs?: number;
  loopCount?: number;
}) => {
  const bytes: number[] = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, // width/height = 1x1
    0x80, 0x00, 0x00, // global color table flag + 2 entries
    0x00, 0x00, 0x00, // black
    0xff, 0xff, 0xff // white
  ];

  if (typeof loopCount === 'number') {
    bytes.push(
      0x21, 0xff, 0x0b,
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // NETSCAPE2.0
      0x03, 0x01,
      loopCount & 0xff,
      (loopCount >> 8) & 0xff,
      0x00
    );
  }

  for (let index = 0; index < frameCount; index += 1) {
    bytes.push(
      0x21, 0xf9, 0x04, 0x00,
      delayCs & 0xff,
      (delayCs >> 8) & 0xff,
      0x00, 0x00,
      0x2c,
      0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00,
      0x00,
      0x02,
      0x02, 0x4c, 0x01,
      0x00
    );
  }

  bytes.push(0x3b);
  return new Uint8Array(bytes);
};

const writeUint16BE = (value: number) => [
  (value >> 8) & 0xff,
  value & 0xff
];

const writeUint32BE = (value: number) => [
  (value >> 24) & 0xff,
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff
];

const writeUint32LE = (value: number) => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >> 24) & 0xff
];

const pushPngChunk = (target: number[], type: string, data: number[]) => {
  target.push(...writeUint32BE(data.length));
  target.push(
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3)
  );
  target.push(...data);
  target.push(0x00, 0x00, 0x00, 0x00);
};

const buildAnimatedApng = ({
  frameCount = 2,
  delayNum = 5,
  delayDen = 100,
  loopCount = 1
}: {
  frameCount?: number;
  delayNum?: number;
  delayDen?: number;
  loopCount?: number;
}) => {
  const bytes: number[] = [
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a
  ];

  pushPngChunk(bytes, 'IHDR', [
    ...writeUint32BE(1),
    ...writeUint32BE(1),
    0x08, 0x06, 0x00, 0x00, 0x00
  ]);
  pushPngChunk(bytes, 'acTL', [
    ...writeUint32BE(frameCount),
    ...writeUint32BE(loopCount)
  ]);
  for (let index = 0; index < frameCount; index += 1) {
    pushPngChunk(bytes, 'fcTL', [
      ...writeUint32BE(index),
      ...writeUint32BE(1),
      ...writeUint32BE(1),
      ...writeUint32BE(0),
      ...writeUint32BE(0),
      ...writeUint16BE(delayNum),
      ...writeUint16BE(delayDen),
      0x00,
      0x00
    ]);
  }
  pushPngChunk(bytes, 'IEND', []);
  return new Uint8Array(bytes);
};

const pushRiffChunk = (target: number[], type: string, data: number[]) => {
  target.push(
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3)
  );
  target.push(...writeUint32LE(data.length));
  target.push(...data);
  if (data.length % 2 !== 0) {
    target.push(0x00);
  }
};

const buildAnimatedWebp = ({
  frameCount = 2,
  frameDurationMs = 120,
  loopCount = 1
}: {
  frameCount?: number;
  frameDurationMs?: number;
  loopCount?: number;
}) => {
  const chunks: number[] = [];
  pushRiffChunk(chunks, 'ANIM', [
    0x00, 0x00, 0x00, 0x00,
    loopCount & 0xff,
    (loopCount >> 8) & 0xff
  ]);
  for (let index = 0; index < frameCount; index += 1) {
    pushRiffChunk(chunks, 'ANMF', [
      0x00, 0x00, 0x00, // x
      0x00, 0x00, 0x00, // y
      0x00, 0x00, 0x00, // width - 1
      0x00, 0x00, 0x00, // height - 1
      frameDurationMs & 0xff,
      (frameDurationMs >> 8) & 0xff,
      (frameDurationMs >> 16) & 0xff,
      0x00 // flags
    ]);
  }
  const riffSize = 4 + chunks.length;
  const bytes: number[] = [
    0x52, 0x49, 0x46, 0x46, // RIFF
    ...writeUint32LE(riffSize),
    0x57, 0x45, 0x42, 0x50, // WEBP
    ...chunks
  ];
  return new Uint8Array(bytes);
};

describe('viewer content helpers', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('classifies media kinds', () => {
    expect(getMediaKind('image/png')).toBe('image');
    expect(getMediaKind('image/svg+xml')).toBe('svg');
    expect(getMediaKind('audio/mpeg')).toBe('audio');
    expect(getMediaKind('video/mp4')).toBe('video');
    expect(getMediaKind('text/html')).toBe('html');
    expect(getMediaKind('application/json')).toBe('text');
    expect(getMediaKind(null)).toBe('binary');
  });

  it('calculates total chunks', () => {
    const size = BigInt(CHUNK_SIZE);
    expect(getTotalChunks(0n)).toBe(0n);
    expect(getTotalChunks(1n)).toBe(1n);
    expect(getTotalChunks(size)).toBe(1n);
    expect(getTotalChunks(size + 1n)).toBe(2n);
  });

  it('computes expected chunk counts from actual chunk sizes', () => {
    expect(getExpectedChunkCount(0n, 10)).toBe(0n);
    expect(getExpectedChunkCount(100n, 10)).toBe(10n);
    expect(getExpectedChunkCount(101n, 10)).toBe(11n);
  });

  it('joins chunks in order', () => {
    const combined = joinChunks([
      new Uint8Array([1, 2]),
      new Uint8Array([3])
    ]);
    expect(Array.from(combined)).toEqual([1, 2, 3]);
  });

  it('returns text previews with truncation flags', () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('hello world');
    const preview = getTextPreview(bytes, 5);
    expect(preview.text).toBe('hello');
    expect(preview.truncated).toBe(true);
  });

  it('sniffs mime types for common headers', () => {
    expect(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(
      'image/png'
    );
    expect(
      sniffMimeType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x0, 0x0, 0x0, 0x0, 0x57, 0x45, 0x42, 0x50
        ])
      )
    ).toBe('image/webp');
    expect(sniffMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(
      'application/pdf'
    );
    expect(sniffMimeType(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBeNull();
  });

  it('resolves mime type from payload sniffing when needed', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(resolveMimeType('application/octet-stream', bytes)).toBe('image/png');
    expect(resolveMimeType('image/png', bytes)).toBe('image/png');
  });

  it('computes finite gif replay durations', () => {
    const finiteGif = buildAnimatedGif({ frameCount: 2, delayCs: 5, loopCount: 2 });
    const singleRunGif = buildAnimatedGif({ frameCount: 2, delayCs: 5 });
    const infiniteGif = buildAnimatedGif({ frameCount: 2, delayCs: 5, loopCount: 0 });
    const staticGif = buildAnimatedGif({ frameCount: 1, delayCs: 5, loopCount: 1 });

    expect(getFiniteGifReplayDelayMs(finiteGif)).toBe(400);
    expect(getFiniteGifReplayDelayMs(singleRunGif)).toBe(200);
    expect(getFiniteGifReplayDelayMs(infiniteGif)).toBeNull();
    expect(getFiniteGifReplayDelayMs(staticGif)).toBeNull();
  });

  it('computes finite animated replay durations for APNG and WebP', () => {
    const finiteApng = buildAnimatedApng({
      frameCount: 2,
      delayNum: 5,
      delayDen: 100,
      loopCount: 2
    });
    const finiteWebp = buildAnimatedWebp({
      frameCount: 2,
      frameDurationMs: 120,
      loopCount: 2
    });

    expect(
      getFiniteAnimatedImageReplayDelayMs(finiteApng, 'image/png')
    ).toBe(200);
    expect(
      getFiniteAnimatedImageReplayDelayMs(finiteWebp, 'image/webp')
    ).toBe(480);
  });

  it('returns null for infinite or static animated image payloads', () => {
    const infiniteApng = buildAnimatedApng({
      frameCount: 2,
      delayNum: 10,
      delayDen: 100,
      loopCount: 0
    });
    const staticApng = buildAnimatedApng({
      frameCount: 1,
      delayNum: 10,
      delayDen: 100,
      loopCount: 1
    });
    const infiniteWebp = buildAnimatedWebp({
      frameCount: 2,
      frameDurationMs: 100,
      loopCount: 0
    });
    const staticWebp = buildAnimatedWebp({
      frameCount: 1,
      frameDurationMs: 100,
      loopCount: 1
    });

    expect(
      getFiniteAnimatedImageReplayDelayMs(infiniteApng, 'image/png')
    ).toBeNull();
    expect(
      getFiniteAnimatedImageReplayDelayMs(staticApng, 'image/png')
    ).toBeNull();
    expect(
      getFiniteAnimatedImageReplayDelayMs(infiniteWebp, 'image/webp')
    ).toBeNull();
    expect(
      getFiniteAnimatedImageReplayDelayMs(staticWebp, 'image/webp')
    ).toBeNull();
  });

  it('detects webm audio/video codec markers from header bytes', () => {
    const audioBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x41, 0x5f, 0x4f, 0x50, 0x55, 0x53]); // A_OPUS
    const videoBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x56, 0x5f, 0x56, 0x50, 0x39]); // V_VP9
    const mixedBytes = new Uint8Array([
      0x41, 0x5f, 0x4f, 0x50, 0x55, 0x53, // A_OPUS
      0x56, 0x5f, 0x56, 0x50, 0x38 // V_VP8
    ]);

    expect(detectWebmTrackKind(audioBytes)).toBe('audio');
    expect(detectWebmTrackKind(videoBytes)).toBe('video');
    expect(detectWebmTrackKind(mixedBytes)).toBe('video');
    expect(detectWebmTrackKind(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBeNull();
  });

  it('extracts image URIs from metadata', () => {
    expect(extractImageFromMetadata({ image: 'data:image/png;base64,AA==' })).toBe(
      'data:image/png;base64,AA=='
    );
    expect(extractImageFromMetadata({ properties: { visual: 'https://img' } })).toBe(
      'https://img'
    );
    expect(extractImageFromMetadata({})).toBeNull();
  });

  it('decodes token-uri JSON data URIs', () => {
    const json = JSON.stringify({ image: 'data:image/png;base64,AA==' });
    const bufferFrom = (globalThis as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } })
      .Buffer?.from;
    const encoded = bufferFrom
      ? bufferFrom(json, 'utf8').toString('base64')
      : '';
    const tokenUri = `data:application/json;base64,${encoded}`;
    expect(decodeTokenUriToImage(tokenUri)).toBe('data:image/png;base64,AA==');
  });

  it('normalizes ipfs token-uri images to a gateway url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ image: 'ipfs://bafy123/cover.png' })
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const uri = 'https://example.com/metadata.json';
    const image = await fetchTokenImageFromUri(uri);
    expect(image).toBe('https://ipfs.io/ipfs/bafy123/cover.png');
    expect(fetchMock).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({
        cache: IMMUTABLE_VIEWER_FETCH_CACHE_MODE,
        redirect: 'follow'
      })
    );
  });

  it('detects likely image urls', () => {
    expect(isLikelyImageUrl('https://example.com/image.png')).toBe(true);
    expect(isLikelyImageUrl('https://example.com/asset.jpg?x=1')).toBe(true);
    expect(isLikelyImageUrl('https://example.com/metadata.json')).toBe(false);
  });

  it('caches token-uri fetch results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ image: 'https://example.com/image.png' })
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const uri = 'https://example.com/meta.json';
    const first = await fetchTokenImageFromUri(uri);
    const second = await fetchTokenImageFromUri(uri);
    expect(first).toBe('https://example.com/image.png');
    expect(second).toBe('https://example.com/image.png');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({
        cache: IMMUTABLE_VIEWER_FETCH_CACHE_MODE,
        redirect: 'follow'
      })
    );
  });

  it('resolves relative token-uri images against the metadata url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ image: 'images/cover.png' })
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const uri = 'https://example.com/metadata/asset.json';
    const image = await fetchTokenImageFromUri(uri);
    expect(image).toBe('https://example.com/metadata/images/cover.png');
  });
});
