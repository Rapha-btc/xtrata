import { jsonResponse, badRequest, serverError } from '../../lib/utils';
import { run } from '../../lib/db';
import { getCollectionDeployReadiness } from '../../lib/collection-deploy';

const parseMetadata = (raw: unknown): Record<string, unknown> | null => {
  if (!raw) {
    return null;
  }
  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
};

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest('Collection id missing.');
  }

  if (request.method === 'POST') {
    try {
      const payload = (await request.json()) as Record<string, unknown>;
      const target = payload.state === 'published' ? 'published' : 'draft';

      if (target === 'published') {
        const readiness = await getCollectionDeployReadiness({
          env,
          collectionId
        });
        if (!readiness.ready || !readiness.collection) {
          return badRequest(readiness.reason);
        }
        const collection = readiness.collection;

        const metadata = readiness.metadata ?? parseMetadata(collection.metadata);
        const mintType =
          typeof metadata?.mintType === 'string' ? metadata.mintType : 'standard';

        await run(
          env,
          'UPDATE assets SET state = ? WHERE collection_id = ? AND expires_at IS NOT NULL AND expires_at < ? AND state = ?',
          ['expired', collectionId, Date.now(), 'draft']
        );

        const assetsCountResult = await env.DB
          .prepare(
            'SELECT COUNT(*) as total FROM assets WHERE collection_id = ? AND state NOT IN (?, ?)'
          )
          .bind(collectionId, 'expired', 'sold-out')
          .all();
        const activeAssets = Number(assetsCountResult.results?.[0]?.total ?? 0);

        if (mintType !== 'pre-inscribed' && activeAssets <= 0) {
          return badRequest(
            'Upload at least one artwork file in Step 2 before publishing.'
          );
        }
      }

      await run(env,
        'UPDATE collections SET state = ?, updated_at = ? WHERE id = ?',
        [target, Date.now(), collectionId]
      );
      const select = await env.DB
        .prepare('SELECT * FROM collections WHERE id = ?')
        .bind(collectionId)
        .all();
      const record = (select.results ?? [])[0];
      return jsonResponse(record);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'Failed to update state');
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
