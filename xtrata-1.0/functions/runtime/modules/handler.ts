import { normalizeModuleTokenUriPath } from '../../../src/lib/viewer/module-paths';
import {
  fetchRuntimeDependencies,
  fetchRuntimeLastTokenId,
  fetchRuntimeTokenUri,
  getRuntimeApiBases,
  parseRuntimeNetwork,
  parseRuntimeTokenId,
  resolveRuntimeContent,
  type RuntimeContractRef,
  type RuntimeEnv
} from '../lib';
import {
  isTransformableRuntimeModulePath,
  transformRuntimeModuleSource
} from './source-transform';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cross-Origin-Resource-Policy': 'cross-origin'
};

const INDEX_CONCURRENCY = 1;
const MAX_INDEX_CACHE_ENTRIES = 8;
const PRIMARY_DESCENT_WINDOW = 128n;
const PRIMARY_ASCENT_WINDOW = 24n;
const TOKEN_URI_READ_RETRIES = 3;

const GENERIC_SCRIPT_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'text/plain'
]);
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

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

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
  const appendRange = (
    output: bigint[],
    start: bigint,
    end: bigint,
    step: bigint
  ) => {
    if (step === 0n) {
      return;
    }
    if (step > 0n) {
      for (let tokenId = start; tokenId <= end; tokenId += step) {
        output.push(tokenId);
      }
      return;
    }
    for (let tokenId = start; tokenId >= end; tokenId += step) {
      output.push(tokenId);
      if (tokenId === end) {
        break;
      }
    }
  };

  const dedupe = (values: bigint[]) => {
    const seen = new Set<string>();
    const output: bigint[] = [];
    for (const value of values) {
      const key = value.toString();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(value);
    }
    return output;
  };

  if (entryTokenId !== null && entryTokenId >= 0n && entryTokenId <= lastTokenId) {
    const tokenIds: bigint[] = [];
    const descentFloor =
      entryTokenId > PRIMARY_DESCENT_WINDOW ? entryTokenId - PRIMARY_DESCENT_WINDOW : 0n;
    appendRange(tokenIds, entryTokenId, descentFloor, -1n);

    const ascentCeiling =
      entryTokenId + PRIMARY_ASCENT_WINDOW < lastTokenId
        ? entryTokenId + PRIMARY_ASCENT_WINDOW
        : lastTokenId;
    if (entryTokenId + 1n <= ascentCeiling) {
      appendRange(tokenIds, entryTokenId + 1n, ascentCeiling, 1n);
    }

    if (descentFloor > 0n) {
      appendRange(tokenIds, descentFloor - 1n, 0n, -1n);
    }
    if (ascentCeiling < lastTokenId) {
      appendRange(tokenIds, ascentCeiling + 1n, lastTokenId, 1n);
    }
    return dedupe(tokenIds);
  }

  const tokenIds: bigint[] = [];
  appendRange(tokenIds, 0n, lastTokenId, 1n);
  return tokenIds;
};

const fetchIndexedTokenUri = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
}) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < TOKEN_URI_READ_RETRIES; attempt += 1) {
    try {
      return await fetchRuntimeTokenUri({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.contract,
        tokenId: params.tokenId
      });
    } catch (error) {
      lastError = error;
      if (attempt < TOKEN_URI_READ_RETRIES - 1) {
        await wait(80 * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

const buildCanonicalModuleUrl = (params: {
  requestUrl: string;
  network: string;
  contract: RuntimeContractRef;
  tokenId: bigint;
  requestedPath: string;
}) => {
  const url = new URL(params.requestUrl);
  url.pathname =
    `/runtime/modules/${encodeURIComponent(params.network)}` +
    `/${encodeURIComponent(params.contract.address)}` +
    `/${encodeURIComponent(params.contract.contractName)}` +
    `/${encodeURIComponent(params.tokenId.toString())}` +
    `/${params.requestedPath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
  return url.toString();
};

const indexResolvedModulePath = (params: {
  index: ModulePathIndex;
  tokenId: bigint;
  tokenUri: string | null | undefined;
}) => {
  const normalizedPath = normalizeModuleTokenUriPath(params.tokenUri);
  if (!normalizedPath) {
    return null;
  }
  if (!params.index.has(normalizedPath)) {
    params.index.set(normalizedPath, params.tokenId);
  }
  const comparablePath =
    normalizeComparableModulePath(normalizedPath) ?? normalizedPath;
  if (!params.index.has(comparablePath)) {
    params.index.set(comparablePath, params.tokenId);
  }
  return {
    normalizedPath,
    comparablePath
  };
};

const resolveModuleTokenIdFromDependencies = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  requestedPath: string;
  entryTokenId: bigint;
  index: ModulePathIndex;
}) => {
  const comparableRequestedPath =
    normalizeComparableModulePath(params.requestedPath) ?? params.requestedPath;
  const dependencyIds = await fetchRuntimeDependencies({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    tokenId: params.entryTokenId
  });
  const candidateIds: bigint[] = [];
  const seen = new Set<string>();
  for (const tokenId of [params.entryTokenId, ...dependencyIds]) {
    const key = tokenId.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidateIds.push(tokenId);
  }

  for (const tokenId of candidateIds) {
    const tokenUri = await fetchIndexedTokenUri({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.contract,
      tokenId
    });
    const indexed = indexResolvedModulePath({
      index: params.index,
      tokenId,
      tokenUri
    });
    if (!indexed) {
      continue;
    }
    if (
      indexed.normalizedPath === params.requestedPath ||
      indexed.comparablePath === comparableRequestedPath
    ) {
      return tokenId;
    }
  }

  return null;
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
  if (params.entryTokenId !== null) {
    try {
      const dependencyResolved = await resolveModuleTokenIdFromDependencies({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.contract,
        requestedPath: params.requestedPath,
        entryTokenId: params.entryTokenId,
        index
      });
      if (dependencyResolved !== null) {
        return dependencyResolved;
      }
    } catch (error) {
      // Fall through to the broader token-uri scan when dependency reads fail.
    }
  }

  const tokenIds = buildTokenSearchOrder(lastTokenId, params.entryTokenId);
  let cursor = 0;
  let resolvedTokenId: bigint | null = null;
  let failures = 0;
  const workerCount = Math.min(INDEX_CONCURRENCY, tokenIds.length || 1);
  const workers = Array.from({ length: workerCount }, () =>
    (async () => {
      while (resolvedTokenId === null && cursor < tokenIds.length) {
        const currentIndex = cursor;
        cursor += 1;
        const tokenId = tokenIds[currentIndex];
        try {
          const tokenUri = await fetchIndexedTokenUri({
            env: params.env,
            apiBases: params.apiBases,
            contract: params.contract,
            tokenId
          });
          const indexed = indexResolvedModulePath({
            index,
            tokenId,
            tokenUri
          });
          if (!indexed) {
            continue;
          }
          if (
            indexed.normalizedPath === params.requestedPath ||
            indexed.comparablePath === comparableRequestedPath
          ) {
            resolvedTokenId = tokenId;
          }
        } catch (error) {
          failures += 1;
          continue;
        }
      }
    })()
  );

  await Promise.all(workers);
  if (resolvedTokenId === null && failures > 0) {
    throw new Error('Module path lookup failed during token-uri reads.');
  }
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
    if (entryTokenId !== null && entryTokenId !== tokenId) {
      const redirectUrl = buildCanonicalModuleUrl({
        requestUrl: request.url,
        network,
        contract,
        tokenId,
        requestedPath
      });
      return new Response(null, {
        status: 307,
        headers: {
          ...CORS_HEADERS,
          Location: redirectUrl,
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    const resolved = await resolveRuntimeContent({
      env,
      apiBases,
      tokenId,
      primaryContract: contract,
      fallbackContract: null
    });
    const contentType = resolveModuleContentType(
      requestedPath,
      resolved.meta.mimeType || 'application/octet-stream'
    );
    let body = resolved.bytes;
    let transformedSource = false;
    if (isTransformableRuntimeModulePath(requestedPath)) {
      const rewritten = transformRuntimeModuleSource(textDecoder.decode(resolved.bytes));
      if (rewritten.changed) {
        body = textEncoder.encode(rewritten.source);
        transformedSource = true;
      }
    }

    const headers = new Headers({
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Xtrata-Runtime-Contract': `${resolved.contract.address}.${resolved.contract.contractName}`,
      'X-Xtrata-Runtime-Network': network,
      'X-Xtrata-Runtime-Token-Id': tokenId.toString(),
      'X-Xtrata-Runtime-Token-Uri-Path': requestedPath
    });
    if (transformedSource) {
      headers.set('X-Xtrata-Runtime-Source-Transform', 'relative-runtime-urls');
    }

    return new Response(request.method === 'HEAD' ? null : body, {
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
