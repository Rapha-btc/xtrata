import { jsonResponse, badRequest, serverError } from './lib/utils';
import { queryAll, run } from './lib/db';
import {
  canReuseCollectionSlug,
  canonicalizeManageCollectionMetadata,
  sortCollectionsForPublicDisplay,
  mergeCollectionMetadata,
  isCollectionPublicVisible,
  isCollectionPublished,
  isValidSlug,
  normalizeSlug,
  parseCollectionMetadata
} from './lib/collections';

const PUBLIC_COLLECTIONS_CACHE_CONTROL =
  'public, max-age=60, s-maxage=120, stale-while-revalidate=300';
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0';

const mapRow = (
  row: Record<string, unknown>
): Record<string, unknown> & { metadata: Record<string, unknown> | null } => ({
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
      const isPublicLiveListRequest =
        artistAddress.length === 0 &&
        !includeArchived &&
        publishedOnly &&
        publicVisibleOnly;
      const ordered = isPublicLiveListRequest
        ? sortCollectionsForPublicDisplay(filtered)
        : filtered;
      return jsonResponse(ordered, 200, {
        'Cache-Control': isPublicLiveListRequest
          ? PUBLIC_COLLECTIONS_CACHE_CONTROL
          : PRIVATE_NO_STORE_CACHE_CONTROL
      });
    } catch (error) {
      return serverError(
        error instanceof Error ? error.message : 'failed to load collections'
      );
    }
  }

  if (request.method === 'POST') {
    try {
      const payload = (await request.json()) as Record<string, unknown>;
      if (typeof payload.artistAddress !== 'string' || payload.artistAddress.trim() === '') {
        return badRequest('artistAddress is required.');
      }
      const artistAddress = payload.artistAddress.trim();
      const slugRaw = String(payload.slug ?? '');
      const slug = normalizeSlug(slugRaw);
      if (!isValidSlug(slug)) {
        return badRequest('Slug must be 3-64 lowercase alphanumeric characters or hyphens.');
      }
      const existingSlug = await queryAll(
        env,
        'SELECT * FROM collections WHERE slug = ? LIMIT 1',
        [slug]
      );
      const existingRecord = (existingSlug.results ?? [])[0] as
        | Record<string, unknown>
        | undefined;
      if (existingRecord) {
        if (
          canReuseCollectionSlug({
            incomingArtistAddress: artistAddress,
            existingArtistAddress: existingRecord.artist_address,
            contractAddress: existingRecord.contract_address,
            metadata: existingRecord.metadata,
            state: existingRecord.state
          })
        ) {
          const existingId = String(existingRecord.id ?? '').trim();
          if (!existingId) {
            return serverError('Existing slug record is missing an id.');
          }
          const now = Date.now();
          const mergedMetadata = canonicalizeManageCollectionMetadata(
            mergeCollectionMetadata(existingRecord.metadata, payload.metadata)
          );
          const metadata = mergedMetadata ? JSON.stringify(mergedMetadata) : null;
          await run(
            env,
            'UPDATE collections SET artist_address = ?, contract_address = ?, display_name = ?, metadata = ?, state = ?, updated_at = ? WHERE id = ?',
            [
              artistAddress,
              payload.contractAddress ?? null,
              payload.displayName ?? null,
              metadata,
              'draft',
              now,
              existingId
            ]
          );
          const reused = await queryAll(
            env,
            'SELECT * FROM collections WHERE id = ?',
            [existingId]
          );
          const reusedRecord = (reused.results ?? [])[0];
          return jsonResponse(
            {
              ...mapRow(reusedRecord),
              slugReused: true
            },
            200
          );
        }
        return badRequest(
          `Collection URL slug "${slug}" is already in use. Choose a different collection name.`
        );
      }
      const now = Date.now();
      const id = crypto.randomUUID();
      const metadataRecord = canonicalizeManageCollectionMetadata(payload.metadata);
      const metadata = metadataRecord ? JSON.stringify(metadataRecord) : null;
      await run(
        env,
        'INSERT INTO collections (id, slug, artist_address, contract_address, display_name, metadata, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          slug,
          artistAddress,
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
      return jsonResponse(
        {
          ...mapRow(record),
          slugReused: false
        },
        201
      );
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
