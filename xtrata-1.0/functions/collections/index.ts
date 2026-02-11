import { jsonResponse, badRequest, serverError } from '../lib/utils';
import { run } from '../lib/db';
import { isValidSlug, normalizeSlug } from '../lib/collections';

const mapRow = (row: Record<string, unknown>) => ({
  ...row,
  metadata: row.metadata ? JSON.parse(String(row.metadata)) : null
});

export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method === 'GET') {
    const statement = env.DB.prepare('SELECT * FROM collections ORDER BY created_at DESC');
    const result = await statement.all();
    return jsonResponse((result.results ?? []).map(mapRow));
  }

  if (request.method === 'POST') {
    try {
      const payload = (await request.json()) as Record<string, unknown>;
      const slugRaw = String(payload.slug ?? '');
      const slug = normalizeSlug(slugRaw);
      if (!isValidSlug(slug)) {
        return badRequest('Slug must be 3-64 lowercase alphanumeric characters or hyphens.');
      }
      if (typeof payload.artistAddress !== 'string' || payload.artistAddress.trim() === '') {
        return badRequest('artistAddress is required.');
      }
      const now = Date.now();
      const id = crypto.randomUUID();
      const metadata = payload.metadata ? JSON.stringify(payload.metadata) : null;
      await run(env,
        'INSERT INTO collections (id, slug, artist_address, contract_address, display_name, metadata, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, slug, payload.artistAddress.trim(), payload.contractAddress ?? null, payload.displayName ?? null, metadata, 'draft', now, now]
      );
      const statement = env.DB.prepare('SELECT * FROM collections WHERE id = ?');
      const created = await statement.bind(id).all();
      const record = (created.results ?? [])[0];
      return jsonResponse(mapRow(record), 201);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'failed to create collection');
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
