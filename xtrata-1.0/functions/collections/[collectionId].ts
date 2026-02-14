import { jsonResponse, badRequest, notFound, serverError } from '../lib/utils';
import { run } from '../lib/db';

const mapRow = (row: Record<string, unknown>) => ({
  ...row,
  metadata: row.metadata ? JSON.parse(String(row.metadata)) : null
});

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest('Collection id is required.');
  }

  if (request.method === 'GET') {
    const statement = env.DB.prepare('SELECT * FROM collections WHERE id = ?');
    const result = await statement.bind(collectionId).all();
    const record = (result.results ?? [])[0];
    if (!record) {
      return notFound('Collection not found.');
    }
    return jsonResponse(mapRow(record));
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
      const select = env.DB.prepare('SELECT * FROM collections WHERE id = ?');
      const record = (await select.bind(collectionId).all()).results?.[0];
      if (!record) {
        return notFound('Collection not found after update.');
      }
      return jsonResponse(mapRow(record));
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'failed to update collection');
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
