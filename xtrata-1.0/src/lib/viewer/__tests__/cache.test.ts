import { describe, expect, it } from 'vitest';
import {
  buildInscriptionCacheKey,
  buildInscriptionTempCacheKey,
  buildInscriptionPreviewCacheKey,
  buildInscriptionThumbnailCacheKey,
  buildTokenSummaryCacheKey,
  clearInscriptionCache,
  STREAM_TEMP_CACHE_MAX_BYTES,
  TEMP_CACHE_MAX_BYTES,
  TEMP_CACHE_TTL_MS,
  THUMBNAIL_CACHE_KEY_VERSION,
  THUMBNAIL_CACHE_LIMIT
} from '../cache';

describe('viewer cache', () => {
  it('builds cache keys with contract id and token id', () => {
    const key = buildInscriptionCacheKey('SP123.fake-contract', 42n);
    expect(key).toBe('inscription-data:SP123.fake-contract:42');
  });

  it('differentiates ids and contracts', () => {
    const first = buildInscriptionCacheKey('SP123.fake-contract', 1n);
    const second = buildInscriptionCacheKey('SP123.fake-contract', 2n);
    const third = buildInscriptionCacheKey('SP456.other-contract', 1n);
    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
  });

  it('builds preview cache keys with contract id and token id', () => {
    const key = buildInscriptionPreviewCacheKey('SP123.fake-contract', 42n);
    expect(key).toBe('inscription-preview:SP123.fake-contract:42');
  });

  it('builds temp cache keys with contract id and token id', () => {
    const key = buildInscriptionTempCacheKey('SP123.fake-contract', 42n);
    expect(key).toBe('inscription-temp:SP123.fake-contract:42');
  });

  it('versions thumbnail cache keys so stale resized blobs are regenerated', () => {
    const key = buildInscriptionThumbnailCacheKey('SP123.fake-contract', 42n);
    expect(key).toBe(
      `inscription-thumb:${THUMBNAIL_CACHE_KEY_VERSION}:SP123.fake-contract:42`
    );
  });

  it('builds token summary cache keys with contract id and token id', () => {
    const key = buildTokenSummaryCacheKey('SP123.fake-contract', 42n);
    expect(key).toBe('token-summary:SP123.fake-contract:42');
  });

  it('reports unavailable when indexedDB is missing', async () => {
    const result = await clearInscriptionCache();
    expect(result.cleared).toBe(false);
    expect(result.reason).toBe('unavailable');
  });

  it('extends media retention and thumbnail capacity for return visits', () => {
    expect(TEMP_CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(THUMBNAIL_CACHE_LIMIT).toBe(4000);
    expect(STREAM_TEMP_CACHE_MAX_BYTES).toBeGreaterThan(TEMP_CACHE_MAX_BYTES);
  });
});
