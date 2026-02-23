import { badRequest, jsonResponse, serverError } from '../../lib/utils';
import { getCollectionDeployReadiness } from '../../lib/collection-deploy';
import {
  canStageUploadsBeforeDeploy,
  isCollectionUploadsLocked
} from '../../lib/collections';

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

type BindingCapability = {
  key: string;
  present: boolean;
  supportsSignedUrl: boolean;
  supportsPut: boolean;
  supportsList: boolean;
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
    bucket: (active?.bucket as UploadBucket | undefined) ?? null,
    capabilities: candidates.map<BindingCapability>(({ key, bucket }) => {
      const candidate = bucket as UploadBucket | undefined;
      return {
        key,
        present: Boolean(bucket && typeof bucket === 'object'),
        supportsSignedUrl: Boolean(
          candidate && typeof candidate.getUploadUrl === 'function'
        ),
        supportsPut: Boolean(candidate && typeof candidate.put === 'function'),
        supportsList: Boolean(
          candidate &&
            typeof (candidate as { list?: unknown }).list === 'function'
        )
      };
    })
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
  const collectionState = String(readiness.collection?.state ?? 'draft')
    .trim()
    .toLowerCase();
  const contractAddress = String(readiness.collection?.contract_address ?? '')
    .trim();
  const predeployUploadsAllowed = canStageUploadsBeforeDeploy({
    contractAddress,
    state: collectionState
  });
  if (!readiness.ready && !predeployUploadsAllowed) {
    return { ok: false as const, reason: readiness.reason };
  }
  if (isCollectionUploadsLocked(collectionState)) {
    return {
      ok: false as const,
      reason: `Uploads are locked while collection state is "${collectionState}".`
    };
  }
  return { ok: true as const };
};

const summarizeCapabilities = (capabilities: BindingCapability[]) =>
  capabilities
    .map((item) => {
      const methods: string[] = [];
      if (item.supportsSignedUrl) {
        methods.push('getUploadUrl');
      }
      if (item.supportsPut) {
        methods.push('put');
      }
      if (item.supportsList) {
        methods.push('list');
      }
      const methodLabel = methods.length > 0 ? methods.join('|') : 'none';
      return `${item.key}:present=${item.present ? 'yes' : 'no'}:methods=${methodLabel}`;
    })
    .join('; ');

const logDebug = (
  requestId: string,
  phase: string,
  details: Record<string, unknown>
) => {
  console.log(`[collections/upload-url][${requestId}] ${phase}`, details);
};

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const requestId = crypto.randomUUID();
  const collectionId = params?.collectionId?.trim();
  const startedAt = Date.now();
  const requestEnv = env as Record<string, unknown>;

  logDebug(requestId, 'request.received', {
    method: request.method,
    collectionId: collectionId || null,
    path: new URL(request.url).pathname
  });

  if (!collectionId) {
    logDebug(requestId, 'request.invalid', { reason: 'collection id required' });
    return badRequest(`collection id required. Request ID: ${requestId}`);
  }

  try {
    const readiness = await ensureReadiness({
      env: requestEnv,
      collectionId
    });
    logDebug(requestId, 'readiness.checked', {
      ready: readiness.ok,
      reason: readiness.ok ? null : readiness.reason
    });
    if (!readiness.ok) {
      return badRequest(`${readiness.reason} (Request ID: ${requestId})`);
    }

    const { bucket, binding, capabilities } = resolveUploadBucket(requestEnv);
    logDebug(requestId, 'binding.resolved', {
      selectedBinding: binding,
      capabilities
    });
    if (!bucket) {
      return serverError(
        `Missing R2 binding. Configure bucket binding \`COLLECTION_ASSETS\` for this Pages environment (avoid reserved \`ASSETS\`). Available bindings: ${
          availableBindingKeys(requestEnv) || 'none'
        }. Capability snapshot: ${summarizeCapabilities(capabilities)}. Request ID: ${requestId}`
      );
    }

    if (request.method === 'PUT') {
      if (typeof bucket.put !== 'function') {
        return serverError(
          `Upload endpoint is missing bucket.put support on binding \`${binding ?? 'unknown'}\`. Capability snapshot: ${summarizeCapabilities(
            capabilities
          )}. Request ID: ${requestId}`
        );
      }
      const url = new URL(request.url);
      const key = url.searchParams.get('key')?.trim() ?? '';
      if (!key) {
        return badRequest(`Missing upload key. Request ID: ${requestId}`);
      }
      if (!key.startsWith(`${collectionId}/`)) {
        return badRequest(
          `Upload key does not match collection prefix. Request ID: ${requestId}`
        );
      }
      const contentType = request.headers.get('content-type')?.trim() ?? '';
      const body = await request.arrayBuffer();
      if (body.byteLength === 0) {
        return badRequest(`Upload body is empty. Request ID: ${requestId}`);
      }

      logDebug(requestId, 'upload.put.start', {
        key,
        contentType: contentType || null,
        byteLength: body.byteLength,
        binding
      });
      await bucket.put(key, body, {
        httpMetadata: contentType ? { contentType } : undefined
      });
      const durationMs = Date.now() - startedAt;
      logDebug(requestId, 'upload.put.complete', {
        key,
        durationMs
      });
      return jsonResponse({
        ok: true,
        key,
        mode: 'direct',
        binding,
        requestId,
        durationMs
      });
    }

    if (request.method !== 'GET') {
      return jsonResponse(
        { error: `Method not allowed. Request ID: ${requestId}` },
        405
      );
    }

    const key = `${collectionId}/${crypto.randomUUID()}`;

    if (typeof bucket.getUploadUrl === 'function') {
      const uploadUrl = await bucket.getUploadUrl({
        method: 'PUT',
        key,
        expires: 60 * 5
      });
      const durationMs = Date.now() - startedAt;
      logDebug(requestId, 'upload.token.created', {
        mode: 'signed',
        key,
        binding,
        durationMs
      });
      return jsonResponse({
        uploadUrl,
        key,
        mode: 'signed',
        binding,
        requestId,
        durationMs,
        bindingCapabilities: capabilities
      });
    }

    if (typeof bucket.put === 'function') {
      const uploadUrl = `/collections/${collectionId}/upload-url?key=${encodeURIComponent(
        key
      )}`;
      const durationMs = Date.now() - startedAt;
      logDebug(requestId, 'upload.token.created', {
        mode: 'direct',
        key,
        binding,
        durationMs
      });
      return jsonResponse({
        uploadUrl,
        key,
        mode: 'direct',
        binding,
        requestId,
        durationMs,
        bindingCapabilities: capabilities
      });
    }

    return serverError(
      `R2 binding \`${binding ?? 'unknown'}\` is present but does not support upload methods. Capability snapshot: ${summarizeCapabilities(
        capabilities
      )}. Request ID: ${requestId}`
    );
  } catch (error) {
    logDebug(requestId, 'request.error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null
    });
    return serverError(
      `${
        error instanceof Error ? error.message : 'Failed to create upload URL'
      } (Request ID: ${requestId})`
    );
  }
};
