import { badRequest, jsonResponse, notFound, serverError } from '../../lib/utils';
import { queryAll } from '../../lib/db';
import {
  isCollectionPublicVisible,
  isCollectionPublished,
  parseCollectionMetadata
} from '../../lib/collections';
import { buildMiningFeeGuidance } from '../../lib/fee-guidance';

const PUBLIC_COLLECTION_CACHE_CONTROL =
  'public, max-age=60, s-maxage=120, stale-while-revalidate=300';
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0';

type DbRow = Record<string, unknown>;

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNonNegativeNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const loadCollectionByIdentifier = async (
  env: Record<string, unknown>,
  identifier: string
) => {
  const normalized = identifier.trim();
  if (!normalized) {
    return null;
  }
  const byId = await queryAll(env, 'SELECT * FROM collections WHERE id = ?', [normalized]);
  const idMatch = (byId.results ?? [])[0] as DbRow | undefined;
  if (idMatch) {
    return idMatch;
  }
  const bySlug = await queryAll(env, 'SELECT * FROM collections WHERE slug = ?', [normalized]);
  return ((bySlug.results ?? [])[0] as DbRow | undefined) ?? null;
};

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const collectionIdentifier = params?.collectionId?.trim() ?? '';
  if (!collectionIdentifier) {
    return badRequest('Collection id or slug is required.');
  }

  try {
    const collection = await loadCollectionByIdentifier(env, collectionIdentifier);
    if (!collection) {
      return notFound('Collection not found.');
    }
    const collectionId = toNullableString(collection.id);
    if (!collectionId) {
      return serverError('Collection record is missing an id.');
    }

    const largestAssetResult = await queryAll(
      env,
      `SELECT asset_id, path, filename, total_bytes, total_chunks, state
       FROM assets
       WHERE collection_id = ?
         AND LOWER(COALESCE(state, 'draft')) != 'expired'
       ORDER BY COALESCE(total_bytes, 0) DESC, COALESCE(total_chunks, 0) DESC, created_at ASC
       LIMIT 1`,
      [collectionId]
    );
    const largestAsset = (largestAssetResult.results?.[0] as DbRow | undefined) ?? null;

    const assetTotalsResult = await queryAll(
      env,
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(state, 'draft')) != 'expired' THEN 1 ELSE 0 END), 0) as active_total
       FROM assets
       WHERE collection_id = ?`,
      [collectionId]
    );

    const guidance = buildMiningFeeGuidance({
      largestChunkCount: largestAsset?.total_chunks ?? 0
    });

    const metadata = parseCollectionMetadata(collection.metadata);
    const shouldPublicCache =
      isCollectionPublished(collection.state) && isCollectionPublicVisible(metadata);

    return jsonResponse(
      {
        collectionId,
        collectionSlug: toNullableString(collection.slug),
        largestAsset: largestAsset
          ? {
              assetId: toNullableString(largestAsset.asset_id),
              path: toNullableString(largestAsset.path),
              filename: toNullableString(largestAsset.filename),
              state: toNullableString(largestAsset.state),
              totalBytes: toNonNegativeNumber(largestAsset.total_bytes),
              totalChunks: toNonNegativeNumber(largestAsset.total_chunks)
            }
          : null,
        assetCounts: {
          total: toNonNegativeNumber(assetTotalsResult.results?.[0]?.total),
          active: toNonNegativeNumber(assetTotalsResult.results?.[0]?.active_total)
        },
        generatedAt: Date.now(),
        ...guidance
      },
      200,
      {
        'Cache-Control': shouldPublicCache
          ? PUBLIC_COLLECTION_CACHE_CONTROL
          : PRIVATE_NO_STORE_CACHE_CONTROL
      }
    );
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'Failed to build fee guidance'
    );
  }
};
