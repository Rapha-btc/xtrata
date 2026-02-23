import { jsonResponse, badRequest, serverError } from './lib/utils';
import { queryAll, run } from './lib/db';
import {
  isCollectionPublicVisible,
  isCollectionPublished,
  isValidSlug,
  normalizeSlug,
  parseCollectionMetadata
} from './lib/collections';

const mapRow = (row: Record<string, unknown>) => ({
  ...row,
  metadata: parseCollectionMetadata(row.metadata)
});

export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const artistAddress = url.searchParams.get('artistAddress')?.trim() ?? '';
      const includeArchivedParam =
        url.searchParams.get('includeArchived')?.trim().toLowerCase() ?? '';
      const includeArchived =
        includeArchivedParam === '1' ||
        includeArchivedParam === 'true' ||
        includeArchivedParam === 'yes';
      const publishedOnlyParam =
        url.searchParams.get('publishedOnly')?.trim().toLowerCase() ?? '';
      const publishedOnly =
        publishedOnlyParam === '1' ||
        publishedOnlyParam === 'true' ||
        publishedOnlyParam === 'yes';
      const publicVisibleOnlyParam =
        url.searchParams.get('publicVisibleOnly')?.trim().toLowerCase() ?? '';
      const publicVisibleOnly =
        publicVisibleOnlyParam === '1' ||
        publicVisibleOnlyParam === 'true' ||
        publicVisibleOnlyParam === 'yes';
      const result =
        artistAddress.length > 0
          ? await queryAll(
              env,
              includeArchived
                ? 'SELECT * FROM collections WHERE UPPER(artist_address) = UPPER(?) ORDER BY created_at DESC'
                : "SELECT * FROM collections WHERE UPPER(artist_address) = UPPER(?) AND LOWER(COALESCE(state, 'draft')) != 'archived' ORDER BY created_at DESC",
              [artistAddress]
            )
          : await queryAll(
              env,
              includeArchived
                ? 'SELECT * FROM collections ORDER BY created_at DESC'
                : "SELECT * FROM collections WHERE LOWER(COALESCE(state, 'draft')) != 'archived' ORDER BY created_at DESC"
            );
      const rows = (result.results ?? []).map(mapRow);
      const filtered = rows.filter((row) => {
        if (publishedOnly && !isCollectionPublished(row.state)) {
          return false;
        }
        if (publicVisibleOnly && !isCollectionPublicVisible(row.metadata)) {
          return false;
        }
        return true;
      });
      return jsonResponse(filtered);
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
      const existingSlug = await queryAll(
        env,
        'SELECT id FROM collections WHERE slug = ? LIMIT 1',
        [slug]
      );
      if ((existingSlug.results ?? []).length > 0) {
        return badRequest(
          `Collection URL slug "${slug}" is already in use. Choose a different collection name.`
        );
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
      const message = error instanceof Error ? error.message : 'failed to create collection';
      if (/collections\.slug|UNIQUE constraint failed: collections\.slug/i.test(message)) {
        return badRequest(
          'Collection URL slug is already in use. Choose a different collection name.'
        );
      }
      return serverError(message);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
