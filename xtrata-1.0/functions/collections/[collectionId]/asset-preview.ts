import {
  badRequest,
  jsonResponse,
  notFound,
  serverError
} from '../../lib/utils';
import { queryAll, type Env } from '../../lib/db';
import {
  isCollectionPublicVisible,
  isCollectionPublished,
  parseCollectionMetadata
} from '../../lib/collections';

type BucketCandidate = {
  key: 'COLLECTION_ASSETS' | 'ASSETS' | 'R2';
  bucket: unknown;
};

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isImageMimeType = (mimeType: string | null) =>
  Boolean(mimeType && mimeType.toLowerCase().startsWith('image/'));

const PUBLIC_PREVIEW_CACHE_CONTROL =
  'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';
const PRIVATE_PREVIEW_CACHE_CONTROL = 'private, no-store, max-age=0';

const resolveAssetsBucket = (env: Env) => {
  const candidates: BucketCandidate[] = [
    { key: 'COLLECTION_ASSETS', bucket: env.COLLECTION_ASSETS },
    { key: 'ASSETS', bucket: env.ASSETS },
    { key: 'R2', bucket: env.R2 }
  ];

  const active =
    candidates.find(
      (candidate) =>
        candidate.bucket &&
        typeof (candidate.bucket as { get?: unknown }).get === 'function'
    ) ?? null;

  return {
    bucket: (active?.bucket as R2Bucket | undefined) ?? null,
    binding: active?.key ?? null,
    availableBindings: candidates
      .map((candidate) => candidate.key)
      .filter((key) => env[key] != null)
  };
};

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const requestId = crypto.randomUUID();

  if (request.method !== 'GET') {
    return jsonResponse(
      { error: `Method not allowed. Request ID: ${requestId}` },
      405
    );
  }

  const collectionId = toNullableString(params?.collectionId);
  if (!collectionId) {
    return badRequest(`Collection id missing. Request ID: ${requestId}`);
  }

  const url = new URL(request.url);
  const assetId = toNullableString(url.searchParams.get('assetId'));
  if (!assetId) {
    return badRequest(`assetId query param is required. Request ID: ${requestId}`);
  }
  const purpose = toNullableString(url.searchParams.get('purpose'))?.toLowerCase();
  const coverPreviewOnly = purpose === 'cover';

  try {
    const result = await queryAll(
      env as Env,
      `SELECT
         a.asset_id,
         a.storage_key,
         a.mime_type,
         c.state as collection_state,
         c.metadata as collection_metadata
       FROM assets a
       JOIN collections c ON c.id = a.collection_id
       WHERE a.collection_id = ? AND a.asset_id = ?
       LIMIT 1`,
      [collectionId, assetId]
    );
    const row = (result.results ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) {
      return notFound('Asset not found for this collection.');
    }

    const storageKey = toNullableString(row.storage_key);
    const mimeType = toNullableString(row.mime_type);
    const shouldPublicCache =
      isCollectionPublished(row.collection_state) &&
      isCollectionPublicVisible(parseCollectionMetadata(row.collection_metadata));

    if (!storageKey) {
      return badRequest(`Asset is missing a storage key. Request ID: ${requestId}`);
    }
    if (coverPreviewOnly && !isImageMimeType(mimeType)) {
      return badRequest(
        `Selected asset is not an image and cannot be used as cover art. Request ID: ${requestId}`
      );
    }

    const resolved = resolveAssetsBucket(env as Env);
    if (!resolved.bucket) {
      return serverError(
        `Missing R2 binding for asset previews. Expected \`COLLECTION_ASSETS\` (fallback: \`ASSETS\` or \`R2\`). Available: ${
          resolved.availableBindings.length > 0
            ? resolved.availableBindings.join(', ')
            : 'none'
        }. Request ID: ${requestId}`
      );
    }

    const object = await resolved.bucket.get(storageKey);
    if (!object || !object.body) {
      return notFound('Asset content not found in storage.');
    }

    const headers = new Headers();
    headers.set(
      'Content-Type',
      object.httpMetadata?.contentType ?? mimeType ?? 'application/octet-stream'
    );
    headers.set(
      'Cache-Control',
      shouldPublicCache
        ? PUBLIC_PREVIEW_CACHE_CONTROL
        : PRIVATE_PREVIEW_CACHE_CONTROL
    );
    headers.set('X-Xtrata-Request-Id', requestId);
    headers.set('X-Xtrata-Asset-Binding', resolved.binding ?? 'unknown');

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    return serverError(
      `${error instanceof Error ? error.message : 'Failed to load asset preview'} (Request ID: ${requestId})`
    );
  }
};
