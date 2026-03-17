import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  runMock,
  queryAllMock,
  getCollectionDeployReadinessMock
} = vi.hoisted(() => ({
  runMock: vi.fn(),
  queryAllMock: vi.fn(),
  getCollectionDeployReadinessMock: vi.fn()
}));

vi.mock('../../lib/db', () => ({
  run: runMock,
  queryAll: queryAllMock
}));

vi.mock('../../lib/collection-deploy', () => ({
  getCollectionDeployReadiness: getCollectionDeployReadinessMock
}));

import { onRequest as assetsOnRequest } from '../../collections/[collectionId]/assets';
import { onRequest as readinessOnRequest } from '../../collections/[collectionId]/readiness';
import { onRequest as uploadUrlOnRequest } from '../../collections/[collectionId]/upload-url';

type CollectionRow = {
  id: string;
  state: string;
  contract_address: string | null;
  metadata: string | null;
};

const collectionId = 'col-1';

const parseJson = async <T>(response: Response) => {
  return (await response.json()) as T;
};

describe('collection staging integration flow', () => {
  let collectionRow: CollectionRow;
  let insertedAssets: Array<Record<string, unknown>>;
  let reservations: Array<Record<string, unknown>>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    insertedAssets = [];
    reservations = [];
    collectionRow = {
      id: collectionId,
      state: 'draft',
      contract_address: null,
      metadata: JSON.stringify({
        collection: { name: 'Flow Test' },
        deployPricingLock: {
          version: 'v1',
          lockedAt: '2026-02-23T00:00:00.000Z',
          assetCount: 3,
          maxChunks: 120,
          maxBytes: 900_000,
          totalBytes: 1_500_000
        }
      })
    };

    getCollectionDeployReadinessMock.mockImplementation(async () => ({
      ready: collectionRow.state === 'published',
      reason: collectionRow.state === 'published'
        ? 'Deployment confirmed.'
        : collectionRow.contract_address
          ? 'Deployment transaction status is "pending". Upload unlocks after success.'
          : 'Deploy the collection contract before uploading artwork.',
      collection: {
        id: collectionRow.id,
        state: collectionRow.state,
        contract_address: collectionRow.contract_address,
        metadata: collectionRow.metadata
      },
      metadata: collectionRow.metadata ? JSON.parse(collectionRow.metadata) : null,
      deployTxId: collectionRow.contract_address ? '0xdeadbeef' : null,
      deployTxStatus: collectionRow.state === 'published' ? 'success' : collectionRow.contract_address ? 'pending' : null,
      network: null
    }));

    runMock.mockImplementation(async (_env: unknown, query: string, binds: unknown[]) => {
      if (query.startsWith('INSERT INTO assets')) {
        const row = {
          asset_id: binds[0],
          collection_id: binds[1],
          path: binds[2],
          filename: binds[3],
          mime_type: binds[4],
          total_bytes: binds[5],
          total_chunks: binds[6],
          expected_hash: binds[7],
          storage_key: binds[8],
          edition_cap: binds[9],
          state: binds[10],
          expires_at: binds[11],
          created_at: binds[12],
          updated_at: binds[13]
        };
        insertedAssets.push(row);
        return {};
      }
      if (query.startsWith('UPDATE collections SET metadata = ?')) {
        collectionRow.metadata = String(binds[0]);
        return {};
      }
      if (query.startsWith('UPDATE assets SET state = ?')) {
        return {};
      }
      if (query.startsWith('DELETE FROM assets WHERE collection_id = ? AND asset_id = ?')) {
        insertedAssets = insertedAssets.filter(
          (row) => !(row.collection_id === binds[0] && row.asset_id === binds[1])
        );
        return {};
      }
      throw new Error(`Unhandled run query in test: ${query}`);
    });

    queryAllMock.mockImplementation(async (_env: unknown, query: string, binds: unknown[]) => {
      if (query.includes('SELECT state, metadata FROM collections WHERE id = ? LIMIT 1')) {
        return {
          results: [
            {
              state: collectionRow.state,
              metadata: collectionRow.metadata
            }
          ]
        };
      }
      if (query.includes('SELECT COALESCE(SUM(total_bytes), 0) as total FROM assets')) {
        const total = insertedAssets.reduce(
          (sum, row) => sum + Number(row.total_bytes ?? 0),
          0
        );
        return { results: [{ total }] };
      }
      if (query.includes('SELECT * FROM assets WHERE collection_id = ? AND asset_id = ?')) {
        const collectionIdFilter = binds[0];
        const assetId = binds[1];
        const row = insertedAssets.find(
          (item) =>
            item.collection_id === collectionIdFilter && item.asset_id === assetId
        );
        return { results: row ? [row] : [] };
      }
      if (query.includes('SELECT * FROM assets WHERE asset_id = ?')) {
        const assetId = binds[0];
        const row = insertedAssets.find((item) => item.asset_id === assetId);
        return { results: row ? [row] : [] };
      }
      if (query.includes('SELECT COUNT(*) as total FROM reservations WHERE collection_id = ? AND asset_id = ?')) {
        const collectionIdFilter = binds[0];
        const assetId = binds[1];
        const total = reservations.filter(
          (row) =>
            row.collection_id === collectionIdFilter && row.asset_id === assetId
        ).length;
        return { results: [{ total }] };
      }
      if (query.includes('SELECT COUNT(*) as total FROM assets WHERE storage_key = ?')) {
        const storageKey = binds[0];
        const total = insertedAssets.filter(
          (row) => row.storage_key === storageKey
        ).length;
        return { results: [{ total }] };
      }
      if (query.includes('SELECT * FROM assets WHERE collection_id = ?')) {
        return { results: insertedAssets.filter((row) => row.collection_id === binds[0]) };
      }
      throw new Error(`Unhandled queryAll query in test: ${query}`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('allows predeploy upload flow and clears pricing lock after first staged asset', async () => {
    const readinessBefore = await readinessOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/readiness`),
      env: {},
      params: { collectionId }
    } as any);
    const readinessPayload = await parseJson<{
      ready: boolean;
      deployReady: boolean;
      predeployUploadsReady: boolean;
      uploadsLocked: boolean;
    }>(readinessBefore);
    expect(readinessBefore.status).toBe(200);
    expect(readinessPayload.ready).toBe(true);
    expect(readinessPayload.deployReady).toBe(false);
    expect(readinessPayload.predeployUploadsReady).toBe(true);
    expect(readinessPayload.uploadsLocked).toBe(false);

    const signedBucket = {
      getUploadUrl: vi.fn().mockResolvedValue('https://upload.test/signed'),
      put: vi.fn()
    };
    const uploadTokenResponse = await uploadUrlOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/upload-url`),
      env: { COLLECTION_ASSETS: signedBucket },
      params: { collectionId }
    } as any);
    const uploadTokenPayload = await parseJson<{
      key: string;
      mode: string;
      uploadUrl: string;
    }>(uploadTokenResponse);
    expect(uploadTokenResponse.status).toBe(200);
    expect(uploadTokenPayload.mode).toBe('signed');
    expect(uploadTokenPayload.key.startsWith(`${collectionId}/`)).toBe(true);
    expect(uploadTokenPayload.uploadUrl).toBe('https://upload.test/signed');

    const assetResponse = await assetsOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '01/test.png',
          filename: 'test.png',
          mimeType: 'image/png',
          totalBytes: 1024,
          totalChunks: 1,
          expectedHash: '0xabc',
          storageKey: uploadTokenPayload.key
        })
      }),
      env: { MAX_COLLECTION_STORAGE_BYTES: 10 * 1024 * 1024 },
      params: { collectionId }
    } as any);
    const assetPayload = await parseJson<{ asset_id: string }>(assetResponse);
    expect(assetResponse.status).toBe(201);
    expect(assetPayload.asset_id).toBeTruthy();

    const metadataAfter = collectionRow.metadata ? JSON.parse(collectionRow.metadata) : null;
    expect(metadataAfter).toBeTruthy();
    expect(metadataAfter.deployPricingLock).toBeUndefined();
    expect(metadataAfter.collection).toEqual({ name: 'Flow Test' });

    expect(
      runMock.mock.calls.some(
        (call) =>
          typeof call[1] === 'string' &&
          call[1].startsWith('UPDATE collections SET metadata = ?')
      )
    ).toBe(true);
  });

  it('removes a staged asset, clears pricing lock, and deletes the unique storage object', async () => {
    const storageKey = `${collectionId}/asset-a`;
    const assetResponse = await assetsOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '01/remove-me.png',
          filename: 'remove-me.png',
          mimeType: 'image/png',
          totalBytes: 2048,
          totalChunks: 2,
          expectedHash: '0xdef',
          storageKey
        })
      }),
      env: { MAX_COLLECTION_STORAGE_BYTES: 10 * 1024 * 1024 },
      params: { collectionId }
    } as any);
    const assetPayload = await parseJson<{ asset_id: string }>(assetResponse);
    expect(assetResponse.status).toBe(201);

    collectionRow.metadata = JSON.stringify({
      collection: { name: 'Flow Test' },
      deployPricingLock: {
        version: 'v1',
        lockedAt: '2026-02-24T00:00:00.000Z',
        assetCount: 1,
        maxChunks: 2,
        maxBytes: 2048,
        totalBytes: 2048
      }
    });

    const bucketDeleteMock = vi.fn().mockResolvedValue(undefined);
    const deleteResponse = await assetsOnRequest({
      request: new Request(
        `https://example.test/collections/${collectionId}/assets?assetId=${assetPayload.asset_id}`,
        { method: 'DELETE' }
      ),
      env: {
        COLLECTION_ASSETS: {
          delete: bucketDeleteMock
        }
      },
      params: { collectionId }
    } as any);
    const deletePayload = await parseJson<{
      deleted: boolean;
      assetId: string;
      pricingLockCleared: boolean;
      storageObjectDeleted: boolean;
    }>(deleteResponse);

    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.deleted).toBe(true);
    expect(deletePayload.assetId).toBe(assetPayload.asset_id);
    expect(deletePayload.pricingLockCleared).toBe(true);
    expect(deletePayload.storageObjectDeleted).toBe(true);
    expect(insertedAssets).toEqual([]);
    expect(bucketDeleteMock).toHaveBeenCalledWith(storageKey);

    const metadataAfter = collectionRow.metadata ? JSON.parse(collectionRow.metadata) : null;
    expect(metadataAfter).toEqual({
      collection: { name: 'Flow Test' }
    });
  });

  it('blocks staged asset removal when reservation rows already exist', async () => {
    const assetResponse = await assetsOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '01/reserved.png',
          filename: 'reserved.png',
          mimeType: 'image/png',
          totalBytes: 1024,
          totalChunks: 1,
          expectedHash: '0x123',
          storageKey: `${collectionId}/reserved`
        })
      }),
      env: { MAX_COLLECTION_STORAGE_BYTES: 10 * 1024 * 1024 },
      params: { collectionId }
    } as any);
    const assetPayload = await parseJson<{ asset_id: string }>(assetResponse);
    expect(assetResponse.status).toBe(201);

    reservations.push({
      reservation_id: 'res-1',
      collection_id: collectionId,
      asset_id: assetPayload.asset_id
    });

    collectionRow.metadata = JSON.stringify({
      collection: { name: 'Flow Test' },
      deployPricingLock: {
        version: 'v1',
        lockedAt: '2026-02-24T00:00:00.000Z',
        assetCount: 1,
        maxChunks: 1,
        maxBytes: 1024,
        totalBytes: 1024
      }
    });

    const bucketDeleteMock = vi.fn().mockResolvedValue(undefined);
    const deleteResponse = await assetsOnRequest({
      request: new Request(
        `https://example.test/collections/${collectionId}/assets?assetId=${assetPayload.asset_id}`,
        { method: 'DELETE' }
      ),
      env: {
        COLLECTION_ASSETS: {
          delete: bucketDeleteMock
        }
      },
      params: { collectionId }
    } as any);
    const deletePayload = await parseJson<{ error: string }>(deleteResponse);

    expect(deleteResponse.status).toBe(400);
    expect(deletePayload.error.toLowerCase()).toContain('reservation history');
    expect(insertedAssets).toHaveLength(1);
    expect(bucketDeleteMock).not.toHaveBeenCalled();

    const metadataAfter = collectionRow.metadata ? JSON.parse(collectionRow.metadata) : null;
    expect(metadataAfter?.deployPricingLock).toBeTruthy();
  });

  it('blocks upload endpoints when collection state is locked', async () => {
    collectionRow.state = 'published';

    const readinessResponse = await readinessOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/readiness`),
      env: {},
      params: { collectionId }
    } as any);
    const readinessPayload = await parseJson<{
      ready: boolean;
      uploadsLocked: boolean;
      reason: string;
    }>(readinessResponse);
    expect(readinessPayload.ready).toBe(false);
    expect(readinessPayload.uploadsLocked).toBe(true);
    expect(readinessPayload.reason.toLowerCase()).toContain('locked');

    const uploadUrlResponse = await uploadUrlOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/upload-url`),
      env: {
        COLLECTION_ASSETS: {
          getUploadUrl: vi.fn().mockResolvedValue('https://upload.test/signed')
        }
      },
      params: { collectionId }
    } as any);
    expect(uploadUrlResponse.status).toBe(400);
    const uploadUrlPayload = await parseJson<{ error: string }>(uploadUrlResponse);
    expect(uploadUrlPayload.error.toLowerCase()).toContain('locked');

    const assetResponse = await assetsOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '01/test.png',
          filename: 'test.png',
          mimeType: 'image/png',
          totalBytes: 1024,
          totalChunks: 1,
          expectedHash: '0xabc',
          storageKey: `${collectionId}/abc`
        })
      }),
      env: { MAX_COLLECTION_STORAGE_BYTES: 10 * 1024 * 1024 },
      params: { collectionId }
    } as any);
    expect(assetResponse.status).toBe(400);
    const assetPayload = await parseJson<{ error: string }>(assetResponse);
    expect(assetPayload.error.toLowerCase()).toContain('locked');

    insertedAssets.push({
      asset_id: 'asset-locked',
      collection_id: collectionId,
      path: '01/locked.png',
      filename: 'locked.png',
      mime_type: 'image/png',
      total_bytes: 1024,
      total_chunks: 1,
      expected_hash: '0xlocked',
      storage_key: `${collectionId}/locked`,
      edition_cap: null,
      state: 'draft',
      expires_at: Date.now() + 1000,
      created_at: Date.now(),
      updated_at: Date.now()
    });

    const deleteResponse = await assetsOnRequest({
      request: new Request(
        `https://example.test/collections/${collectionId}/assets?assetId=asset-locked`,
        { method: 'DELETE' }
      ),
      env: {},
      params: { collectionId }
    } as any);
    expect(deleteResponse.status).toBe(400);
    const deletePayload = await parseJson<{ error: string }>(deleteResponse);
    expect(deletePayload.error.toLowerCase()).toContain('locked');
  });

  it('blocks uploads when contract exists but deployment is not yet successful', async () => {
    collectionRow.contract_address = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
    collectionRow.state = 'draft';

    const readinessResponse = await readinessOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/readiness`),
      env: {},
      params: { collectionId }
    } as any);
    const readinessPayload = await parseJson<{
      ready: boolean;
      deployReady: boolean;
      predeployUploadsReady: boolean;
      uploadsLocked: boolean;
      reason: string;
    }>(readinessResponse);
    expect(readinessResponse.status).toBe(200);
    expect(readinessPayload.ready).toBe(false);
    expect(readinessPayload.deployReady).toBe(false);
    expect(readinessPayload.predeployUploadsReady).toBe(false);
    expect(readinessPayload.uploadsLocked).toBe(false);
    expect(readinessPayload.reason.toLowerCase()).toContain('pending');

    const uploadUrlResponse = await uploadUrlOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/upload-url`),
      env: {
        COLLECTION_ASSETS: {
          getUploadUrl: vi.fn().mockResolvedValue('https://upload.test/signed')
        }
      },
      params: { collectionId }
    } as any);
    expect(uploadUrlResponse.status).toBe(400);
    const uploadUrlPayload = await parseJson<{ error: string }>(uploadUrlResponse);
    expect(uploadUrlPayload.error.toLowerCase()).toContain('pending');

    const assetResponse = await assetsOnRequest({
      request: new Request(`https://example.test/collections/${collectionId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '01/test.png',
          filename: 'test.png',
          mimeType: 'image/png',
          totalBytes: 1024,
          totalChunks: 1,
          expectedHash: '0xabc',
          storageKey: `${collectionId}/abc`
        })
      }),
      env: { MAX_COLLECTION_STORAGE_BYTES: 10 * 1024 * 1024 },
      params: { collectionId }
    } as any);
    expect(assetResponse.status).toBe(400);
    const assetPayload = await parseJson<{ error: string }>(assetResponse);
    expect(assetPayload.error.toLowerCase()).toContain('pending');
  });
});
