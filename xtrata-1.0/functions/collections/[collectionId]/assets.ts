import { jsonResponse, badRequest, notFound, serverError } from '../../lib/utils';
import { queryAll, run } from '../../lib/db';
import {
  canStageUploadsBeforeDeploy,
  isCollectionPublicVisible,
  isCollectionPublished,
  isCollectionUploadsLocked,
  parseCollectionMetadata,
  staysWithinLimit,
  stripDeployPricingLockFromMetadata
} from '../../lib/collections';
import { getCollectionDeployReadiness } from '../../lib/collection-deploy';

const logAssetDebug = (
  requestId: string,
  phase: string,
  details: Record<string, unknown>
) => {
  console.log(`[collections/assets][${requestId}] ${phase}`, details);
};

const PUBLIC_ASSETS_CACHE_CONTROL =
  'public, max-age=120, s-maxage=300, stale-while-revalidate=600';
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0';

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveAssetsBucket = (env: Record<string, unknown>) =>
  (env.COLLECTION_ASSETS as R2Bucket | undefined) ??
  (env.ASSETS as R2Bucket | undefined) ??
  (env.R2 as R2Bucket | undefined) ??
  null;

const clearDeployPricingLock = async (params: {
  env: Parameters<typeof run>[0];
  collectionId: string;
  metadata: unknown;
  requestId: string;
}) => {
  const result = stripDeployPricingLockFromMetadata(params.metadata);
  if (!result.changed || !result.metadata) {
    return false;
  }
  await run(
    params.env,
    'UPDATE collections SET metadata = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(result.metadata), Date.now(), params.collectionId]
  );
  logAssetDebug(params.requestId, 'pricing-lock.cleared', {
    collectionId: params.collectionId
  });
  return true;
};

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const requestId = crypto.randomUUID();
  const collectionId = params?.collectionId;
  logAssetDebug(requestId, 'request.received', {
    method: request.method,
    collectionId: collectionId ?? null
  });
  if (!collectionId) {
    return badRequest('Collection id missing.');
  }

  if (request.method === 'GET') {
    try {
      const collectionResult = await queryAll(
        env,
        'SELECT state, metadata FROM collections WHERE id = ? LIMIT 1',
        [collectionId]
      );
      const collectionRow = (collectionResult.results ?? [])[0] as
        | Record<string, unknown>
        | undefined;
      const isPublicCollection =
        collectionRow !== undefined &&
        isCollectionPublished(collectionRow.state) &&
        isCollectionPublicVisible(parseCollectionMetadata(collectionRow.metadata));
      if (!isPublicCollection) {
        await run(
          env,
          'UPDATE assets SET state = ? WHERE collection_id = ? AND expires_at IS NOT NULL AND expires_at < ? AND state = ?',
          ['expired', collectionId, Date.now(), 'draft']
        );
      }
      const result = await queryAll(
        env,
        'SELECT * FROM assets WHERE collection_id = ? ORDER BY created_at DESC',
        [collectionId]
      );
      return jsonResponse(result.results ?? [], 200, {
        'Cache-Control': isPublicCollection
          ? PUBLIC_ASSETS_CACHE_CONTROL
          : PRIVATE_NO_STORE_CACHE_CONTROL
      });
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'Failed to load assets');
    }
  }

  if (request.method === 'POST') {
    try {
      const readiness = await getCollectionDeployReadiness({
        env,
        collectionId
      });
      const contractAddress = String(readiness.collection?.contract_address ?? '')
        .trim();
      logAssetDebug(requestId, 'readiness.checked', {
        ready: readiness.ready,
        reason: readiness.ready ? null : readiness.reason,
        contractAddress: contractAddress || null
      });
      const collectionState = String(readiness.collection?.state ?? 'draft')
        .trim()
        .toLowerCase();
      const predeployUploadsAllowed = canStageUploadsBeforeDeploy({
        contractAddress,
        state: collectionState
      });
      if (!readiness.ready && !predeployUploadsAllowed) {
        return badRequest(readiness.reason);
      }
      if (isCollectionUploadsLocked(collectionState)) {
        return badRequest(
          `Uploads are locked while collection state is "${collectionState}".`
        );
      }

      const payload = (await request.json()) as Record<string, unknown>;
      const path = String(payload.path ?? '').trim();
      if (!path) {
        return badRequest('path is required.');
      }
      const storageKey = String(payload.storageKey ?? '').trim();
      if (!storageKey) {
        return badRequest('storageKey is required.');
      }
      const mimeType = String(payload.mimeType ?? 'application/octet-stream');
      const totalBytes = Number(payload.totalBytes ?? 0);
      const totalChunks = Number(payload.totalChunks ?? 0);
      const expectedHash = String(payload.expectedHash ?? '');
      logAssetDebug(requestId, 'payload.received', {
        path,
        totalBytes,
        totalChunks,
        mimeType,
        hasStorageKey: storageKey.length > 0,
        expectedHashLength: expectedHash.length
      });
      const limitBytes = Number(env.MAX_COLLECTION_STORAGE_BYTES ?? 500 * 1024 * 1024);
      const aggregate = await queryAll(
        env,
        'SELECT COALESCE(SUM(total_bytes), 0) as total FROM assets WHERE collection_id = ? AND state != ?',
        [collectionId, 'sold-out']
      );
      const currentBytes = Number(aggregate.results?.[0]?.total ?? 0);
      logAssetDebug(requestId, 'storage.limit.checked', {
        currentBytes,
        incomingBytes: totalBytes,
        limitBytes
      });
      if (!staysWithinLimit(currentBytes, totalBytes, limitBytes)) {
        return badRequest(
          `Collection storage limit exceeded. Limit: ${(limitBytes / (1024 * 1024)).toFixed(0)} MB.`
        );
      }
      const ttlMs = Number(env.COLLECTION_ASSET_TTL_MS ?? 3 * 24 * 60 * 60 * 1000);
      const expiresAt = Date.now() + ttlMs;
      const assetId = crypto.randomUUID();
      await run(
        env,
        `INSERT INTO assets (asset_id, collection_id, path, filename, mime_type, total_bytes, total_chunks, expected_hash, storage_key, edition_cap, state, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          collectionId,
          path,
          payload.filename ?? null,
          mimeType,
          totalBytes,
          totalChunks,
          expectedHash,
          storageKey,
          payload.editionCap ?? null,
          'draft',
          expiresAt,
          Date.now(),
          Date.now()
        ]
      );
      const inserted = await queryAll(
        env,
        'SELECT * FROM assets WHERE asset_id = ?',
        [assetId]
      );
      const row = (inserted.results ?? [])[0];
      await clearDeployPricingLock({
        env,
        collectionId,
        metadata: readiness.collection?.metadata,
        requestId
      });
      logAssetDebug(requestId, 'asset.inserted', {
        assetId,
        collectionId,
        storageKey
      });
      return jsonResponse(row, 201);
    } catch (error) {
      logAssetDebug(requestId, 'request.error', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null
      });
      return serverError(
        `${
          error instanceof Error ? error.message : 'Failed to add asset'
        } (Request ID: ${requestId})`
      );
    }
  }

  if (request.method === 'DELETE') {
    try {
      const assetId = new URL(request.url).searchParams.get('assetId')?.trim() ?? '';
      if (!assetId) {
        return badRequest('assetId is required.');
      }

      const collectionResult = await queryAll(
        env,
        'SELECT state, metadata FROM collections WHERE id = ? LIMIT 1',
        [collectionId]
      );
      const collectionRow = (collectionResult.results ?? [])[0] as
        | Record<string, unknown>
        | undefined;
      if (!collectionRow) {
        return notFound('Collection not found.');
      }

      const collectionState = String(collectionRow.state ?? 'draft')
        .trim()
        .toLowerCase();
      if (isCollectionUploadsLocked(collectionState)) {
        return badRequest(
          `Uploads are locked while collection state is "${collectionState}".`
        );
      }

      const assetResult = await queryAll(
        env,
        'SELECT * FROM assets WHERE collection_id = ? AND asset_id = ? LIMIT 1',
        [collectionId, assetId]
      );
      const assetRow = (assetResult.results ?? [])[0] as
        | Record<string, unknown>
        | undefined;
      if (!assetRow) {
        return notFound('Asset not found.');
      }

      const assetState = String(assetRow.state ?? 'draft')
        .trim()
        .toLowerCase();
      if (assetState === 'sold-out') {
        return badRequest('Minted assets cannot be removed from staging.');
      }

      const reservationCountResult = await queryAll(
        env,
        'SELECT COUNT(*) as total FROM reservations WHERE collection_id = ? AND asset_id = ?',
        [collectionId, assetId]
      );
      const reservationCount = Number(
        reservationCountResult.results?.[0]?.total ?? 0
      );
      if (reservationCount > 0) {
        return badRequest(
          'This asset has reservation history and cannot be removed from staging.'
        );
      }

      const pricingLockCleared = await clearDeployPricingLock({
        env,
        collectionId,
        metadata: collectionRow.metadata,
        requestId
      });

      await run(env, 'DELETE FROM assets WHERE collection_id = ? AND asset_id = ?', [
        collectionId,
        assetId
      ]);

      const storageKey = toNullableString(assetRow.storage_key);
      let storageObjectDeleted = false;
      if (storageKey) {
        const remainingRefsResult = await queryAll(
          env,
          'SELECT COUNT(*) as total FROM assets WHERE storage_key = ?',
          [storageKey]
        );
        const remainingRefs = Number(remainingRefsResult.results?.[0]?.total ?? 0);
        if (remainingRefs <= 0) {
          const bucket = resolveAssetsBucket(env as Record<string, unknown>);
          if (bucket) {
            try {
              await bucket.delete(storageKey);
              storageObjectDeleted = true;
            } catch (error) {
              logAssetDebug(requestId, 'storage.delete.error', {
                assetId,
                storageKey,
                message: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }
      }

      logAssetDebug(requestId, 'asset.deleted', {
        assetId,
        collectionId,
        pricingLockCleared,
        storageObjectDeleted
      });

      return jsonResponse({
        deleted: true,
        assetId,
        pricingLockCleared,
        storageObjectDeleted
      });
    } catch (error) {
      logAssetDebug(requestId, 'request.error', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null
      });
      return serverError(
        `${
          error instanceof Error ? error.message : 'Failed to remove asset'
        } (Request ID: ${requestId})`
      );
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
