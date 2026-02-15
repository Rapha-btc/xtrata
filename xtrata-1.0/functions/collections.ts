import { jsonResponse, badRequest, serverError } from './lib/utils';
import { queryAll, run } from './lib/db';
import { isValidSlug, normalizeSlug } from './lib/collections';

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

export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const artistAddress = url.searchParams.get('artistAddress')?.trim() ?? '';
      const result =
        artistAddress.length > 0
          ? await queryAll(
              env,
              'SELECT * FROM collections WHERE UPPER(artist_address) = UPPER(?) ORDER BY created_at DESC',
              [artistAddress]
            )
          : await queryAll(env, 'SELECT * FROM collections ORDER BY created_at DESC');
      return jsonResponse((result.results ?? []).map(mapRow));
    } catch (error) {
      return serverError(
        error instanceof Error ? error.message : 'failed to load collections'
      );
    }
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
      await run(
        env,
        'INSERT INTO collections (id, slug, artist_address, contract_address, display_name, metadata, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          slug,
          payload.artistAddress.trim(),
          payload.contractAddress ?? null,
          payload.displayName ?? null,
          metadata,
          'draft',
          now,
          now
        ]
      );
      const created = await queryAll(
        env,
        'SELECT * FROM collections WHERE id = ?',
        [id]
      );
      const record = (created.results ?? [])[0];
      return jsonResponse(mapRow(record), 201);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'failed to create collection');
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
