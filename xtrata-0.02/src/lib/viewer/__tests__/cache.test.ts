import { describe, expect, it } from 'vitest';
import {
  buildInscriptionCacheKey,
  buildInscriptionTempCacheKey,
  buildInscriptionPreviewCacheKey,
  clearInscriptionCache
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

  it('reports unavailable when indexedDB is missing', async () => {
    const result = await clearInscriptionCache();
    expect(result.cleared).toBe(false);
    expect(result.reason).toBe('unavailable');
  });
});
