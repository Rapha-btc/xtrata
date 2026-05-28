import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../collections/health';

const createDb = () => ({
  prepare: vi.fn((query: string) => ({
    all: vi.fn(async () => {
      const table = query.includes('FROM collections')
        ? 'collections'
        : query.includes('FROM assets')
          ? 'assets'
          : 'reservations';
      return {
        results: [
          {
            total: table === 'collections' ? 2 : table === 'assets' ? 3 : 4
          }
        ]
      };
    })
  }))
});

describe('/collections/health', () => {
  it('returns runtime cache usage warnings with database health', async () => {
    const list = vi.fn(async () => ({
      objects: [{ key: 'runtime-content/mainnet/demo/1/abc123', size: 8 }],
      truncated: false
    }));
    const response = await onRequest({
      request: new Request('https://xtrata.xyz/collections/health'),
      env: {
        DB: createDb(),
        RUNTIME_CONTENT_CACHE_LIMIT_BYTES: '10',
        RUNTIME_CONTENT_CACHE: {
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          list,
          getUploadUrl: vi.fn()
        }
      }
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.collectionsCount).toBe(2);
    expect(payload.assetsCount).toBe(3);
    expect(payload.reservationsCount).toBe(4);
    expect(payload.runtimeCache.totalBytes).toBe(8);
    expect(payload.runtimeCache.limitBytes).toBe(10);
    expect(payload.runtimeCache.warningLevel).toBe('warning');
    expect(payload.runtimeCache.warningMessage).toContain('80%');
    expect(list).toHaveBeenCalledWith({ prefix: 'runtime-content/' });
  });
});
