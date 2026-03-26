import { normalizeModuleTokenUriPath } from '../../../src/lib/viewer/module-paths';
import {
  fetchRuntimeLastTokenId,
  fetchRuntimeTokenUri,
  getRuntimeApiBases,
  parseRuntimeNetwork,
  parseRuntimeTokenId,
  resolveRuntimeContent,
  type RuntimeContractRef,
  type RuntimeEnv
} from '../lib';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cross-Origin-Resource-Policy': 'cross-origin'
};

const INDEX_CONCURRENCY = 6;
const MAX_INDEX_CACHE_ENTRIES = 8;

const GENERIC_SCRIPT_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'text/plain'
]);

type ModulePathIndex = Map<string, bigint>;

const modulePathIndexCache = new Map<string, ModulePathIndex>();

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

const getOrCreateModulePathIndex = (cacheKey: string) => {
  const cached = modulePathIndexCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const index = new Map<string, bigint>();
  modulePathIndexCache.set(cacheKey, index);
  pruneModulePathIndexCache();
  return index;
};

const normalizeComparableModulePath = (value: string) => {
  const normalized = normalizeModuleTokenUriPath(value);
  if (!normalized) {
    return null;
  }
  const segments = normalized.split('/');
  while (segments[0] === 'on-chain-modules' || segments[0] === 'workspace') {
    segments.shift();
  }
  return segments.join('/');
};

const buildTokenSearchOrder = (
  lastTokenId: bigint,
  entryTokenId: bigint | null
) => {
  const tokenIds: bigint[] = [];
  if (entryTokenId !== null && entryTokenId >= 0n && entryTokenId <= lastTokenId) {
    for (let tokenId = entryTokenId; tokenId >= 0n; tokenId -= 1n) {
      tokenIds.push(tokenId);
      if (tokenId === 0n) {
        break;
      }
    }
    for (let tokenId = entryTokenId + 1n; tokenId <= lastTokenId; tokenId += 1n) {
      tokenIds.push(tokenId);
    }
    return tokenIds;
  }
  for (let tokenId = 0n; tokenId <= lastTokenId; tokenId += 1n) {
    tokenIds.push(tokenId);
  }
  return tokenIds;
};

const resolveModuleContentType = (
  requestedPath: string,
  mimeType: string | null | undefined
) => {
  const normalizedMimeType = (mimeType ?? '').trim().toLowerCase();
  const extension =
    requestedPath.split('/').pop()?.split('.').pop()?.trim().toLowerCase() ?? '';
  if (extension === 'js' || extension === 'mjs' || extension === 'cjs') {
    if (GENERIC_SCRIPT_MIME_TYPES.has(normalizedMimeType)) {
      return 'text/javascript; charset=utf-8';
    }
  }
  if (extension === 'css' && GENERIC_SCRIPT_MIME_TYPES.has(normalizedMimeType)) {
    return 'text/css; charset=utf-8';
  }
  if (extension === 'json' || extension === 'map') {
    if (GENERIC_SCRIPT_MIME_TYPES.has(normalizedMimeType)) {
      return 'application/json; charset=utf-8';
    }
  }
  if ((extension === 'html' || extension === 'htm') && GENERIC_SCRIPT_MIME_TYPES.has(normalizedMimeType)) {
    return 'text/html; charset=utf-8';
  }
  if (extension === 'svg' && GENERIC_SCRIPT_MIME_TYPES.has(normalizedMimeType)) {
    return 'image/svg+xml';
  }
  if (extension === 'wasm' && GENERIC_SCRIPT_MIME_TYPES.has(normalizedMimeType)) {
    return 'application/wasm';
  }
  return mimeType || 'application/octet-stream';
};

const resolveModuleTokenId = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  network: string;
  contract: RuntimeContractRef;
  requestedPath: string;
  entryTokenId: bigint | null;
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
  const index = getOrCreateModulePathIndex(cacheKey);
  const comparableRequestedPath =
    normalizeComparableModulePath(params.requestedPath) ?? params.requestedPath;
  const cachedTokenId =
    index.get(params.requestedPath) ?? index.get(comparableRequestedPath);
  if (cachedTokenId !== undefined) {
    return cachedTokenId;
  }

  const tokenIds = buildTokenSearchOrder(lastTokenId, params.entryTokenId);
  let cursor = 0;
  let resolvedTokenId: bigint | null = null;
  const workerCount = Math.min(INDEX_CONCURRENCY, tokenIds.length || 1);
  const workers = Array.from({ length: workerCount }, () =>
    (async () => {
      while (resolvedTokenId === null && cursor < tokenIds.length) {
        const currentIndex = cursor;
        cursor += 1;
        const tokenId = tokenIds[currentIndex];
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
          if (!index.has(normalizedPath)) {
            index.set(normalizedPath, tokenId);
          }
          const comparablePath =
            normalizeComparableModulePath(normalizedPath) ?? normalizedPath;
          if (!index.has(comparablePath)) {
            index.set(comparablePath, tokenId);
          }
          if (
            normalizedPath === params.requestedPath ||
            comparablePath === comparableRequestedPath
          ) {
            resolvedTokenId = tokenId;
          }
        } catch (error) {
          continue;
        }
      }
    })()
  );

  await Promise.all(workers);
  return resolvedTokenId;
};

const badResponse = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: CORS_HEADERS
  });

export const onRuntimeModulesRequest = async (context: {
  request: Request;
  params: {
    network?: string;
    contractAddress?: string;
    contractName?: string;
    entryTokenId?: string;
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
  const entryTokenId = parseRuntimeTokenId(params.entryTokenId ?? null);

  try {
    const tokenId = await resolveModuleTokenId({
      env,
      apiBases,
      network,
      contract,
      requestedPath,
      entryTokenId
    });
    if (tokenId === null) {
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
      'Content-Type': resolveModuleContentType(
        requestedPath,
        resolved.meta.mimeType || 'application/octet-stream'
      ),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Xtrata-Runtime-Contract': `${resolved.contract.address}.${resolved.contract.contractName}`,
      'X-Xtrata-Runtime-Network': network,
      'X-Xtrata-Runtime-Token-Id': tokenId.toString(),
      'X-Xtrata-Runtime-Token-Uri-Path': requestedPath
    });

    return new Response(request.method === 'HEAD' ? null : resolved.bytes, {
      status: 200,
      headers
    });
  } catch (error) {
    return badResponse(
      502,
      error instanceof Error ? error.message : 'Failed to resolve module path'
    );
  }
};
