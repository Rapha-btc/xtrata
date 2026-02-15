import { badRequest, jsonResponse, serverError } from '../../lib/utils';
import { getCollectionDeployReadiness } from '../../lib/collection-deploy';

type UploadBucket = {
  getUploadUrl?: (options: {
    method: 'PUT' | 'POST';
    key: string;
    expires?: number;
  }) => Promise<string>;
  put?: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    }
  ) => Promise<unknown>;
};

const resolveUploadBucket = (env: Record<string, unknown>) => {
  const candidates: Array<{ key: string; bucket: unknown }> = [
    { key: 'COLLECTION_ASSETS', bucket: env.COLLECTION_ASSETS },
    { key: 'ASSETS', bucket: env.ASSETS },
    { key: 'R2', bucket: env.R2 }
  ];

  const active = candidates.find(({ bucket }) => {
    if (!bucket || typeof bucket !== 'object') {
      return false;
    }
    const candidate = bucket as UploadBucket;
    return (
      typeof candidate.getUploadUrl === 'function' ||
      typeof candidate.put === 'function'
    );
  });

  return {
    binding: active?.key ?? null,
    bucket: (active?.bucket as UploadBucket | undefined) ?? null
  };
};

const availableBindingKeys = (env: Record<string, unknown>) =>
  Object.keys(env)
    .filter((key) => key.trim().length > 0)
    .sort()
    .join(', ');

const ensureReadiness = async (params: {
  env: Record<string, unknown>;
  collectionId: string;
}) => {
  const readiness = await getCollectionDeployReadiness({
    env: params.env as any,
    collectionId: params.collectionId
  });
  if (!readiness.ready) {
    return { ok: false as const, reason: readiness.reason };
  }
  return { ok: true as const };
};

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const collectionId = params?.collectionId?.trim();
  if (!collectionId) {
    return badRequest('collection id required');
  }

  try {
    const readiness = await ensureReadiness({
      env: env as Record<string, unknown>,
      collectionId
    });
    if (!readiness.ok) {
      return badRequest(readiness.reason);
    }

    const { bucket, binding } = resolveUploadBucket(env as Record<string, unknown>);
    if (!bucket) {
      return serverError(
        `Missing R2 binding. Configure bucket binding \`COLLECTION_ASSETS\` for this Pages environment (avoid reserved \`ASSETS\`). Available bindings: ${
          availableBindingKeys(env as Record<string, unknown>) || 'none'
        }`
      );
    }

    if (request.method === 'PUT') {
      if (typeof bucket.put !== 'function') {
        return serverError(
          `Upload endpoint is missing bucket.put support on binding \`${binding ?? 'unknown'}\`.`
        );
      }
      const url = new URL(request.url);
      const key = url.searchParams.get('key')?.trim() ?? '';
      if (!key) {
        return badRequest('Missing upload key.');
      }
      if (!key.startsWith(`${collectionId}/`)) {
        return badRequest('Upload key does not match collection prefix.');
      }
      const contentType = request.headers.get('content-type')?.trim() ?? '';
      const body = await request.arrayBuffer();
      if (body.byteLength === 0) {
        return badRequest('Upload body is empty.');
      }

      await bucket.put(key, body, {
        httpMetadata: contentType ? { contentType } : undefined
      });
      return jsonResponse({ ok: true, key, mode: 'direct' });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const key = `${collectionId}/${crypto.randomUUID()}`;

    if (typeof bucket.getUploadUrl === 'function') {
      const uploadUrl = await bucket.getUploadUrl({
        method: 'PUT',
        key,
        expires: 60 * 5
      });
      return jsonResponse({ uploadUrl, key, mode: 'signed', binding });
    }

    if (typeof bucket.put === 'function') {
      const uploadUrl = `/collections/${collectionId}/upload-url?key=${encodeURIComponent(
        key
      )}`;
      return jsonResponse({ uploadUrl, key, mode: 'direct', binding });
    }

    return serverError(
      `R2 binding \`${binding ?? 'unknown'}\` is present but does not support upload methods.`
    );
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'Failed to create upload URL'
    );
  }
};
