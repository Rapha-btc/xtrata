import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryAllMock } = vi.hoisted(() => ({
  queryAllMock: vi.fn()
}));

vi.mock('../../lib/db', () => ({
  queryAll: queryAllMock
}));

import { onRequest } from '../../collections/[collectionId]/asset-preview';

describe('asset-preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryAllMock.mockResolvedValue({
      results: [
        {
          asset_id: 'asset-1',
          storage_key: 'col-1/asset-1',
          mime_type: 'text/html',
          collection_state: 'published',
          collection_metadata: JSON.stringify({
            collectionPage: { showOnPublicPage: true }
          })
        }
      ]
    });
  });

  it('serves non-image assets for general preview and mint byte fetch paths', async () => {
    const bucket = {
      get: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode('<html><body>ok</body></html>'),
        httpMetadata: { contentType: 'text/html' }
      })
    };
    const response = await onRequest({
      request: new Request(
        'https://xtrata.xyz/collections/col-1/asset-preview?assetId=asset-1'
      ),
      env: { COLLECTION_ASSETS: bucket },
      params: { collectionId: 'col-1' }
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(await response.text()).toContain('<html>');
    expect(bucket.get).toHaveBeenCalledWith('col-1/asset-1');
  });

  it('keeps cover-art guard for non-image assets when purpose=cover', async () => {
    const response = await onRequest({
      request: new Request(
        'https://xtrata.xyz/collections/col-1/asset-preview?assetId=asset-1&purpose=cover'
      ),
      env: {},
      params: { collectionId: 'col-1' }
    } as any);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain(
      'Selected asset is not an image and cannot be used as cover art'
    );
  });
});
