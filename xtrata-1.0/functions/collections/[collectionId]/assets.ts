import { jsonResponse, badRequest, serverError } from '../../lib/utils';
import { run } from '../../lib/db';
import { staysWithinLimit } from '../../lib/collections';

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest('Collection id missing.');
  }

  if (request.method === 'GET') {
    await run(
      env,
      'UPDATE assets SET state = ? WHERE collection_id = ? AND expires_at IS NOT NULL AND expires_at < ? AND state = ?',
      ['expired', collectionId, Date.now(), 'draft']
    );
    const statement = env.DB.prepare(
      'SELECT * FROM assets WHERE collection_id = ? ORDER BY created_at DESC'
    );
    const result = await statement.bind(collectionId).all();
    return jsonResponse(result.results ?? []);
  }

  if (request.method === 'POST') {
    try {
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
      const limitBytes = Number(env.MAX_COLLECTION_STORAGE_BYTES ?? 500 * 1024 * 1024);
      const sumStatement = env.DB.prepare(
        'SELECT COALESCE(SUM(total_bytes), 0) as total FROM assets WHERE collection_id = ? AND state != ?'
      );
      const aggregate = await sumStatement.bind(collectionId, 'sold-out').all();
      const currentBytes = Number(aggregate.results?.[0]?.total ?? 0);
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
      const inserted = await env.DB
        .prepare('SELECT * FROM assets WHERE asset_id = ?')
        .bind(assetId)
        .all();
      const row = (inserted.results ?? [])[0];
      return jsonResponse(row, 201);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'Failed to add asset');
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
