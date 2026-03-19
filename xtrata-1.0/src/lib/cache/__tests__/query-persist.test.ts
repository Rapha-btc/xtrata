import { describe, expect, it } from 'vitest';
import { getQueryCacheTtlMs, shouldPersistQuery } from '../query-persist';

describe('query cache persistence', () => {
  it('persists viewer token summaries with a TTL', () => {
    const ttl = getQueryCacheTtlMs(['viewer', 'contract-id', 'token', '42']);
    expect(ttl).toBeGreaterThan(0);
    expect(shouldPersistQuery(['viewer', 'contract-id', 'token', '42'])).toBe(true);
  });

  it('persists last-token-id queries with a TTL', () => {
    const ttl = getQueryCacheTtlMs(['viewer', 'contract-id', 'last-token-id']);
    expect(ttl).toBeGreaterThan(0);
  });

  it('persists admin status queries with a TTL', () => {
    const ttl = getQueryCacheTtlMs(['contract-admin', 'contract-id']);
    expect(ttl).toBeGreaterThan(0);
  });

  it('persists USD pricing snapshots with a TTL', () => {
    const ttl = getQueryCacheTtlMs(['pricing', 'usd-spot']);
    expect(ttl).toBeGreaterThan(0);
    expect(shouldPersistQuery(['pricing', 'usd-spot'])).toBe(true);
  });

  it('skips unrelated queries', () => {
    expect(getQueryCacheTtlMs(['market', 'activity'])).toBeNull();
    expect(shouldPersistQuery(['market', 'activity'])).toBe(false);
  });
});
