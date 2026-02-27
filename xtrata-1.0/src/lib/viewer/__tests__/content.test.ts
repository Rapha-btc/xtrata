import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_SIZE } from '../../chunking/hash';
import {
  decodeTokenUriToImage,
  detectWebmTrackKind,
  extractImageFromMetadata,
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
