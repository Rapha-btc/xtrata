import { normalizeModuleTokenUriPath } from '../../../../../../src/lib/viewer/module-paths';
import {
  fetchRuntimeLastTokenId,
  fetchRuntimeTokenUri,
  getRuntimeApiBases,
  parseRuntimeNetwork,
  resolveRuntimeContent,
  type RuntimeContractRef,
  type RuntimeEnv
} from '../../../../lib';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cross-Origin-Resource-Policy': 'cross-origin'
};

const INDEX_CONCURRENCY = 6;
const MAX_INDEX_CACHE_ENTRIES = 8;

type ModulePathIndex = Map<string, bigint>;

const modulePathIndexCache = new Map<string, ModulePathIndex>();
const modulePathIndexInFlight = new Map<string, Promise<ModulePathIndex>>();

const toPathString = (value?: string | string[]) =>
  Array.isArray(value) ? value.join('/') : value || '';

const pruneModulePathIndexCache = () => {
  while (modulePathIndexCache.size > MAX_INDEX_CACHE_ENTRIES) {
    const firstKey = modulePathIndexCache.keys().next().value;
    if (!firstKey) {
      return;
    }
    modulePathIndexCache.delete(firstKey);
  }
};

const buildIndexCacheKey = (params: {
  network: string;
  contract: RuntimeContractRef;
  lastTokenId: bigint;
}) =>
  `${params.network}:${params.contract.address}.${params.contract.contractName}:${params.lastTokenId.toString()}`;

const buildModulePathIndex = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  network: string;
  contract: RuntimeContractRef;
}) => {
  const lastTokenId = await fetchRuntimeLastTokenId({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract
  });
  const cacheKey = buildIndexCacheKey({
    network: params.network,
    contract: params.contract,
    lastTokenId
  });
  const cached = modulePathIndexCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const inFlight = modulePathIndexInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    const index = new Map<string, bigint>();
    const tokenIds = Array.from(
      { length: Number(lastTokenId + 1n) },
      (_, tokenId) => BigInt(tokenId)
    );
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(INDEX_CONCURRENCY, tokenIds.length || 1) },
      () =>
        (async () => {
          while (cursor < tokenIds.length) {
            const current = cursor;
            cursor += 1;
            const tokenId = tokenIds[current];
            try {
              const tokenUri = await fetchRuntimeTokenUri({
                env: params.env,
                apiBases: params.apiBases,
                contract: params.contract,
                tokenId
              });
              const normalizedPath = normalizeModuleTokenUriPath(tokenUri);
              if (!normalizedPath) {
                continue;
              }
              // Later token ids win so republished modules can replace older paths.
              index.set(normalizedPath, tokenId);
            } catch (error) {
              continue;
            }
          }
        })()
    );
    await Promise.all(workers);
    modulePathIndexCache.set(cacheKey, index);
    pruneModulePathIndexCache();
    return index;
  })().finally(() => {
    modulePathIndexInFlight.delete(cacheKey);
  });

  modulePathIndexInFlight.set(cacheKey, task);
  return task;
};

const badResponse = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: CORS_HEADERS
  });

export const onRequest = async (context: {
  request: Request;
  params: {
    network?: string;
    contractAddress?: string;
    contractName?: string;
    path?: string | string[];
  };
  env: RuntimeEnv;
}) => {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return badResponse(405, 'Method not allowed');
  }

  const network = parseRuntimeNetwork(params.network ?? 'mainnet');
  const contractAddress = params.contractAddress?.trim() ?? '';
  const contractName = params.contractName?.trim() ?? '';
  if (!contractAddress || !contractName) {
    return badResponse(400, 'Invalid contract parameters');
  }
  const requestedPath = normalizeModuleTokenUriPath(toPathString(params.path), {
    decodeSegments: true
  });
  if (!requestedPath) {
    return badResponse(400, 'Invalid module path');
  }

  const apiBases = getRuntimeApiBases(network, env);
  if (apiBases.length === 0) {
    return badResponse(500, 'No API base URLs configured for runtime modules');
  }

  const contract: RuntimeContractRef = {
    address: contractAddress,
    contractName
  };

  try {
    const index = await buildModulePathIndex({
      env,
      apiBases,
      network,
      contract
    });
    const tokenId = index.get(requestedPath);
    if (tokenId === undefined) {
      return badResponse(404, 'Module path not found');
    }

    const resolved = await resolveRuntimeContent({
      env,
      apiBases,
      tokenId,
      primaryContract: contract,
      fallbackContract: null
    });

    const headers = new Headers({
      ...CORS_HEADERS,
      'Content-Type': resolved.meta.mimeType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Xtrata-Runtime-Contract': `${resolved.contract.address}.${resolved.contract.contractName}`,
      'X-Xtrata-Runtime-Network': network,
      'X-Xtrata-Runtime-Token-Id': tokenId.toString(),
      'X-Xtrata-Runtime-Token-Uri-Path': requestedPath
    });

    return new Response(
      request.method === 'HEAD' ? null : resolved.bytes,
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    return badResponse(
      502,
      error instanceof Error ? error.message : 'Failed to resolve module path'
    );
  }
};
