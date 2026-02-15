import { jsonResponse, badRequest, notFound, serverError } from '../lib/utils';
import { queryAll, run } from '../lib/db';
import { getCollectionDeployReadiness } from '../lib/collection-deploy';

const parseMetadata = (value: unknown) => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const mapRow = (row: Record<string, unknown>) => ({
  ...row,
  metadata: parseMetadata(row.metadata)
});

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

const chunkValues = <T>(values: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const deleteBucketPrefix = async (bucket: R2Bucket, prefix: string) => {
  let removed = 0;
  let cursor: string | undefined = undefined;
  while (true) {
    const listed = await bucket.list({
      prefix,
      cursor
    });
    const keys = listed.objects.map((object) => object.key).filter(Boolean);
    if (keys.length > 0) {
      await bucket.delete(keys);
      removed += keys.length;
    }
    if (!listed.truncated) {
      break;
    }
    cursor = listed.cursor;
  }
  return removed;
};

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest('Collection id is required.');
  }

  if (request.method === 'GET') {
    try {
      const result = await queryAll(
        env,
        'SELECT * FROM collections WHERE id = ?',
        [collectionId]
      );
      const record = (result.results ?? [])[0];
      if (!record) {
        return notFound('Collection not found.');
      }
      return jsonResponse(mapRow(record));
    } catch (error) {
      return serverError(
        error instanceof Error ? error.message : 'failed to load collection'
      );
    }
  }

  if (request.method === 'PATCH') {
    try {
      const payload = (await request.json()) as Record<string, unknown>;
      const updates: string[] = [];
      const binds: unknown[] = [];
      if (typeof payload.displayName === 'string') {
        updates.push('display_name = ?');
        binds.push(payload.displayName.trim());
      }
      if (typeof payload.artistAddress === 'string') {
        updates.push('artist_address = ?');
        binds.push(payload.artistAddress.trim());
      }
      if (typeof payload.contractAddress === 'string') {
        updates.push('contract_address = ?');
        binds.push(payload.contractAddress.trim());
      }
      if (payload.metadata) {
        updates.push('metadata = ?');
        binds.push(JSON.stringify(payload.metadata));
      }
      if (typeof payload.state === 'string') {
        updates.push('state = ?');
        binds.push(payload.state);
      }
      if (updates.length === 0) {
        return badRequest('No updatable fields provided.');
      }
      binds.push(Date.now());
      binds.push(collectionId);
      const query = `UPDATE collections SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`;
      await run(env, query, binds);
      const updated = await queryAll(
        env,
        'SELECT * FROM collections WHERE id = ?',
        [collectionId]
      );
      const record = updated.results?.[0];
      if (!record) {
        return notFound('Collection not found after update.');
      }
      return jsonResponse(mapRow(record));
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'failed to update collection');
    }
  }

  if (request.method === 'DELETE') {
    try {
      const existing = await queryAll(
        env,
        'SELECT * FROM collections WHERE id = ?',
        [collectionId]
      );
      const record = existing.results?.[0] as Record<string, unknown> | undefined;
      if (!record) {
        return notFound('Collection not found.');
      }

      const state = String(record.state ?? '')
        .trim()
        .toLowerCase();
      if (state === 'published') {
        return badRequest(
          'Published (live) collections cannot be deleted from manager history.'
        );
      }
      if (state !== 'archived') {
        return badRequest(
          'Archive this draft first, then run permanent delete.'
        );
      }

      const readiness = await getCollectionDeployReadiness({
        env,
        collectionId
      });
      if (readiness.ready) {
        return badRequest(
          'This collection has a confirmed on-chain deployment and cannot be deleted.'
        );
      }

      const assetsCountResult = await queryAll(
        env,
        'SELECT COUNT(*) as total FROM assets WHERE collection_id = ?',
        [collectionId]
      );
      const reservationsCountResult = await queryAll(
        env,
        'SELECT COUNT(*) as total FROM reservations WHERE collection_id = ?',
        [collectionId]
      );
      const assetsCount = Number(assetsCountResult.results?.[0]?.total ?? 0);
      const reservationsCount = Number(
        reservationsCountResult.results?.[0]?.total ?? 0
      );

      let removedBucketObjects = 0;
      const bucket = resolveAssetsBucket(env as Record<string, unknown>);
      if (bucket) {
        const keyRows = await queryAll(
          env,
          'SELECT storage_key FROM assets WHERE collection_id = ? AND storage_key IS NOT NULL AND TRIM(storage_key) != ?',
          [collectionId, '']
        );
        const dbKeys = Array.from(
          new Set(
            (keyRows.results ?? [])
              .map((row) => toNullableString(row.storage_key))
              .filter((value): value is string => value !== null)
          )
        );

        for (const chunk of chunkValues(dbKeys, 1000)) {
          await bucket.delete(chunk);
          removedBucketObjects += chunk.length;
        }

        removedBucketObjects += await deleteBucketPrefix(
          bucket,
          `${collectionId}/`
        );
      }

      await run(env, 'DELETE FROM reservations WHERE collection_id = ?', [
        collectionId
      ]);
      await run(env, 'DELETE FROM assets WHERE collection_id = ?', [
        collectionId
      ]);
      await run(env, 'DELETE FROM collections WHERE id = ?', [collectionId]);

      return jsonResponse({
        deleted: true,
        id: collectionId,
        removed: {
          assets: assetsCount,
          reservations: reservationsCount,
          bucketObjects: removedBucketObjects
        }
      });
    } catch (error) {
      return serverError(
        error instanceof Error ? error.message : 'failed to delete collection'
      );
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
