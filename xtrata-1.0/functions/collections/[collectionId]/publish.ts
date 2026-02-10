import { jsonResponse, badRequest, serverError } from '../../../lib/utils';
import { run } from '../../../lib/db';

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest('Collection id missing.');
  }

  if (request.method === 'POST') {
    try {
      const payload = (await request.json()) as Record<string, unknown>;
      const target = payload.state === 'published' ? 'published' : 'draft';
      await run(env,
        'UPDATE collections SET state = ?, updated_at = ? WHERE id = ?',
        [target, Date.now(), collectionId]
      );
      const select = await env.DB.prepare('SELECT * FROM collections WHERE id = ?').all(collectionId);
      const record = (select.results ?? [])[0];
      return jsonResponse(record);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'Failed to update state');
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
