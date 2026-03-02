import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryAllMock } = vi.hoisted(() => ({
  queryAllMock: vi.fn()
}));

vi.mock('../../lib/db', () => ({
  queryAll: queryAllMock
}));

import { onRequest as feeGuidanceOnRequest } from '../../collections/[collectionId]/fee-guidance';

const parseJson = async <T,>(response: Response) => {
  return (await response.json()) as T;
};

describe('collections fee guidance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns chunk-based guidance using the largest staged asset', async () => {
    queryAllMock.mockImplementation(async (_env: unknown, query: string) => {
      if (query.includes('FROM collections WHERE id = ?')) {
        return {
          results: [
            {
              id: 'col-1',
              slug: 'my-drop',
              state: 'draft',
              metadata: JSON.stringify({
                collectionPage: { showOnPublicPage: false }
              })
            }
          ]
        };
      }
      if (query.includes('FROM assets') && query.includes('ORDER BY')) {
        return {
          results: [
            {
              asset_id: 'asset-2',
              path: '02/large.png',
              filename: 'large.png',
              total_bytes: 450_000,
              total_chunks: 31,
              state: 'draft'
            }
          ]
        };
      }
      if (query.includes('COUNT(*) as total')) {
        return {
          results: [{ total: 2, active_total: 2 }]
        };
      }
      throw new Error(`Unhandled query in test: ${query}`);
    });

    const response = await feeGuidanceOnRequest({
      request: new Request('https://example.test/collections/col-1/fee-guidance'),
      env: {},
      params: { collectionId: 'col-1' }
    } as any);
    const payload = await parseJson<{
      collectionId: string;
      largestAsset: { assetId: string | null; totalChunks: number } | null;
      available: boolean;
      batchCount: number;
      warnings: string[];
      assetCounts: { total: number; active: number };
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.collectionId).toBe('col-1');
    expect(payload.assetCounts).toEqual({ total: 2, active: 2 });
    expect(payload.largestAsset?.assetId).toBe('asset-2');
    expect(payload.largestAsset?.totalChunks).toBe(31);
    expect(payload.available).toBe(true);
    expect(payload.batchCount).toBe(2);
    expect(payload.warnings.length).toBeGreaterThan(0);
  });

  it('falls back to slug lookup when id match is not found', async () => {
    queryAllMock.mockImplementation(async (_env: unknown, query: string, binds: unknown[]) => {
      if (query.includes('FROM collections WHERE id = ?')) {
        return { results: [] };
      }
      if (query.includes('FROM collections WHERE slug = ?')) {
        expect(binds[0]).toBe('mint-drop');
        return {
          results: [
            {
              id: 'col-slug',
              slug: 'mint-drop',
              state: 'published',
              metadata: JSON.stringify({
                collectionPage: { showOnPublicPage: true }
              })
            }
          ]
        };
      }
      if (query.includes('FROM assets') && query.includes('ORDER BY')) {
        return {
          results: [
            {
              asset_id: 'asset-1',
              path: '01/test.png',
              filename: 'test.png',
              total_bytes: 100_000,
              total_chunks: 1,
              state: 'draft'
            }
          ]
        };
      }
      if (query.includes('COUNT(*) as total')) {
        return {
          results: [{ total: 1, active_total: 1 }]
        };
      }
      throw new Error(`Unhandled query in test: ${query}`);
    });

    const response = await feeGuidanceOnRequest({
      request: new Request('https://example.test/collections/mint-drop/fee-guidance'),
      env: {},
      params: { collectionId: 'mint-drop' }
    } as any);
    const payload = await parseJson<{ collectionId: string; available: boolean }>(response);

    expect(response.status).toBe(200);
    expect(payload.collectionId).toBe('col-slug');
    expect(payload.available).toBe(true);
  });

  it('returns 404 when the collection does not exist', async () => {
    queryAllMock.mockResolvedValue({ results: [] });
    const response = await feeGuidanceOnRequest({
      request: new Request('https://example.test/collections/missing/fee-guidance'),
      env: {},
      params: { collectionId: 'missing' }
    } as any);
    const payload = await parseJson<{ error: string }>(response);

    expect(response.status).toBe(404);
    expect(payload.error.toLowerCase()).toContain('not found');
  });
});
