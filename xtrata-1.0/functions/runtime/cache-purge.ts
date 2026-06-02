import {
  buildRuntimeContentCacheKey,
  deleteRuntimeContentCache,
  runtimeBytesToHex
} from './cache';
import {
  createRuntimeUpstreamRequestTracker,
  getRuntimeApiBases,
  parseRuntimeContractRef,
  parseRuntimeNetwork,
  parseRuntimeTokenId,
  resolveRuntimeMeta,
  type RuntimeEnv
} from './lib';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Cache-Control': 'no-store'
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });

const getConfiguredToken = (env: RuntimeEnv) => {
  const value = env.RUNTIME_CACHE_ADMIN_TOKEN;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getBearerToken = (request: Request) => {
  const value = request.headers.get('Authorization')?.trim() ?? '';
  const prefix = 'Bearer ';
  return value.startsWith(prefix) ? value.slice(prefix.length).trim() : null;
};

const getAuthorizationError = (request: Request, env: RuntimeEnv) => {
  const configuredToken = getConfiguredToken(env);
  if (!configuredToken) {
    return jsonResponse(503, {
      error: 'Runtime cache purge is not configured.'
    });
  }

  if (getBearerToken(request) !== configuredToken) {
    return jsonResponse(401, {
      error: 'Unauthorized.'
    });
  }

  return null;
};

export const onRequest: PagesFunction = async ({ request, env }) => {
  const runtimeEnv = env as RuntimeEnv;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, {
      error: 'Method not allowed.'
    });
  }

  const authorizationError = getAuthorizationError(request, runtimeEnv);
  if (authorizationError) {
    return authorizationError;
  }

  const url = new URL(request.url);
  const network = parseRuntimeNetwork(url.searchParams.get('network'));
  const contract = parseRuntimeContractRef(url.searchParams.get('contractId'));
  const fallbackContract = parseRuntimeContractRef(url.searchParams.get('fallbackContractId'));
  const tokenId = parseRuntimeTokenId(url.searchParams.get('tokenId'));

  if (!contract) {
    return jsonResponse(400, {
      error: 'Invalid contractId parameter.'
    });
  }
  if (tokenId === null || tokenId < 0n) {
    return jsonResponse(400, {
      error: 'Invalid tokenId parameter.'
    });
  }

  const apiBases = getRuntimeApiBases(network, runtimeEnv);
  const upstreamTracker = createRuntimeUpstreamRequestTracker();

  try {
    const resolvedMeta = await resolveRuntimeMeta({
      env: runtimeEnv,
      apiBases,
      tokenId,
      primaryContract: contract,
      fallbackContract,
      upstreamTracker
    });
    const cacheKey = buildRuntimeContentCacheKey({
      network,
      contract: resolvedMeta.contract,
      tokenId,
      finalHash: resolvedMeta.meta.finalHash
    });
    const deleted = await deleteRuntimeContentCache(runtimeEnv, cacheKey);

    return jsonResponse(200, {
      ok: true,
      network,
      contractId: `${resolvedMeta.contract.address}.${resolvedMeta.contract.contractName}`,
      tokenId: tokenId.toString(),
      finalHash: runtimeBytesToHex(resolvedMeta.meta.finalHash),
      key: deleted.key,
      r2Deleted: deleted.r2Deleted,
      edgeDeleted: deleted.edgeDeleted,
      upstreamRequests: upstreamTracker.attempts
    });
  } catch (error) {
    return jsonResponse(500, {
      error: 'Runtime cache purge failed.',
      detail: error instanceof Error ? error.message : String(error),
      upstreamRequests: upstreamTracker.attempts
    });
  }
};
