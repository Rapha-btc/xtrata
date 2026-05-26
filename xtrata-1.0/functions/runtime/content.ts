import { buildRuntimeModuleBaseHref } from '../../src/lib/viewer/module-paths';
import {
  buildRuntimeContentCacheKey,
  getRuntimeContractId,
  hasRuntimeContentCache,
  readRuntimeContentCache,
  runtimeBytesToHex,
  writeRuntimeContentCache,
  type RuntimeCacheStatus
} from './cache';
import {
  fetchRuntimeTokenUri,
  getRuntimeReadConfig,
  getRuntimeApiBases,
  parseRuntimeContractRef,
  parseRuntimeNetwork,
  parseRuntimeTokenId,
  resolveRuntimeMeta,
  resolveRuntimeContentStream,
  type RuntimeEnv
} from './lib';

const RUNTIME_CONTENT_BUILD = 'stream-v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Expose-Headers': [
    'Content-Type',
    'Content-Length',
    'ETag',
    'Server-Timing',
    'X-Xtrata-Runtime-Cache',
    'X-Xtrata-Runtime-Build',
    'X-Xtrata-Runtime-Contract',
    'X-Xtrata-Runtime-Source-Contract',
    'X-Xtrata-Runtime-Network',
    'X-Xtrata-Runtime-Token-Uri',
    'X-Xtrata-Runtime-Module-Base',
    'X-Xtrata-Runtime-Final-Hash',
    'X-Xtrata-Runtime-Total-Size',
    'X-Xtrata-Runtime-Total-Chunks',
    'X-Xtrata-Runtime-Response-Mode',
    'X-Xtrata-Runtime-Read-Batch-Size',
    'X-Xtrata-Runtime-Read-Concurrency',
    'X-Xtrata-Runtime-Read-Retries',
    'X-Xtrata-Runtime-Prepared-Ms'
  ].join(', '),
  'Cross-Origin-Resource-Policy': 'cross-origin'
};

const asJsonError = (status: number, message: string, detail?: string) =>
  new Response(
    JSON.stringify({
      error: message,
      detail: detail || null
    }),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );

const buildRuntimeContentHeaders = (params: {
  mimeType: string;
  cacheStatus: RuntimeCacheStatus;
  network: string;
  contractId: string;
  sourceContractId: string;
  tokenUri: string;
  moduleBaseHref: string;
  finalHash: string;
  totalSize: bigint;
  totalChunks: bigint;
  contentLength: number | null;
  responseMode: 'cache' | 'head' | 'stream';
  readBatchSize?: number;
  readConcurrency?: number;
  readRetries?: number;
  preparedMs?: number;
}) => {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'Content-Type': params.mimeType,
    'Cache-Control': params.finalHash
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff',
    'X-Xtrata-Runtime-Cache': params.cacheStatus,
    'X-Xtrata-Runtime-Build': RUNTIME_CONTENT_BUILD,
    'X-Xtrata-Runtime-Contract': params.contractId,
    'X-Xtrata-Runtime-Source-Contract': params.sourceContractId,
    'X-Xtrata-Runtime-Network': params.network,
    'X-Xtrata-Runtime-Token-Uri': params.tokenUri,
    'X-Xtrata-Runtime-Module-Base': params.moduleBaseHref,
    'X-Xtrata-Runtime-Final-Hash': params.finalHash,
    'X-Xtrata-Runtime-Total-Size': params.totalSize.toString(),
    'X-Xtrata-Runtime-Total-Chunks': params.totalChunks.toString(),
    'X-Xtrata-Runtime-Response-Mode': params.responseMode
  };
  if (typeof params.readBatchSize === 'number') {
    headers['X-Xtrata-Runtime-Read-Batch-Size'] = params.readBatchSize.toString();
  }
  if (typeof params.readConcurrency === 'number') {
    headers['X-Xtrata-Runtime-Read-Concurrency'] = params.readConcurrency.toString();
  }
  if (typeof params.readRetries === 'number') {
    headers['X-Xtrata-Runtime-Read-Retries'] = params.readRetries.toString();
  }
  if (typeof params.preparedMs === 'number') {
    headers['X-Xtrata-Runtime-Prepared-Ms'] = params.preparedMs.toFixed(1);
    headers['Server-Timing'] = `runtime_prepare;dur=${params.preparedMs.toFixed(1)}`;
  }
  if (params.finalHash) {
    headers.ETag = `"${params.finalHash}"`;
  }
  if (typeof params.contentLength === 'number' && params.contentLength >= 0) {
    headers['Content-Length'] = params.contentLength.toString();
  }
  return headers;
};

export const onRequest = async (context: {
  request: Request;
  env: RuntimeEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
}) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return asJsonError(405, 'Method not allowed.');
  }
  const startedAt = performance.now();

  const url = new URL(request.url);
  const contractId = parseRuntimeContractRef(url.searchParams.get('contractId'));
  const fallbackContractId = parseRuntimeContractRef(
    url.searchParams.get('fallbackContractId')
  );
  const tokenId = parseRuntimeTokenId(url.searchParams.get('tokenId'));
  const network = parseRuntimeNetwork(url.searchParams.get('network'));

  if (!contractId) {
    return asJsonError(400, 'Invalid contractId parameter.');
  }
  if (tokenId === null || tokenId < 0n) {
    return asJsonError(400, 'Invalid tokenId parameter.');
  }

  const apiBases = getRuntimeApiBases(network, env);
  if (apiBases.length === 0) {
    return asJsonError(500, 'No API base URLs configured for runtime content.');
  }
  const readConfig = getRuntimeReadConfig(env);

  try {
    const resolvedMeta = await resolveRuntimeMeta({
      env,
      apiBases,
      tokenId,
      primaryContract: contractId,
      fallbackContract: fallbackContractId
    });
    const finalHash = runtimeBytesToHex(resolvedMeta.meta.finalHash);
    const cacheKey =
      resolvedMeta.meta.sealed && finalHash
        ? buildRuntimeContentCacheKey({
            network,
            contract: resolvedMeta.contract,
            tokenId,
            finalHash: resolvedMeta.meta.finalHash
          })
        : null;
    const cacheEnabled = hasRuntimeContentCache(env);
    const cached = await readRuntimeContentCache(env, cacheKey);
    if (cached) {
      const sourceContractId =
        cached.customMetadata?.sourceContractId ??
        getRuntimeContractId(resolvedMeta.contract);
      const headers = buildRuntimeContentHeaders({
        mimeType:
          resolvedMeta.meta.mimeType ||
          cached.httpMetadata?.contentType ||
          'application/octet-stream',
        cacheStatus: 'HIT',
        network,
        contractId: getRuntimeContractId(resolvedMeta.contract),
        sourceContractId,
        tokenUri: cached.customMetadata?.tokenUri ?? '',
        moduleBaseHref: cached.customMetadata?.moduleBaseHref ?? '',
        finalHash,
        totalSize: resolvedMeta.meta.totalSize,
        totalChunks: resolvedMeta.meta.totalChunks,
        contentLength: cached.size,
        responseMode: request.method === 'HEAD' ? 'head' : 'cache',
        readBatchSize: readConfig.batchSize,
        readConcurrency: readConfig.concurrency,
        readRetries: readConfig.retries,
        preparedMs: performance.now() - startedAt
      });
      return new Response(request.method === 'HEAD' ? null : cached.body, {
        status: 200,
        headers
      });
    }

    if (request.method === 'HEAD') {
      const resolvedContractId = getRuntimeContractId(resolvedMeta.contract);
      return new Response(null, {
        status: 200,
        headers: buildRuntimeContentHeaders({
          mimeType: resolvedMeta.meta.mimeType || 'application/octet-stream',
          cacheStatus: cacheEnabled ? 'MISS' : 'BYPASS',
          network,
          contractId: resolvedContractId,
          sourceContractId: resolvedContractId,
          tokenUri: '',
          moduleBaseHref: '',
          finalHash,
          totalSize: resolvedMeta.meta.totalSize,
          totalChunks: resolvedMeta.meta.totalChunks,
          contentLength:
            resolvedMeta.meta.totalSize <= BigInt(Number.MAX_SAFE_INTEGER)
              ? Number(resolvedMeta.meta.totalSize)
              : null,
          responseMode: 'head',
          readBatchSize: readConfig.batchSize,
          readConcurrency: readConfig.concurrency,
          readRetries: readConfig.retries,
          preparedMs: performance.now() - startedAt
        })
      });
    }

    const cacheContractId = getRuntimeContractId(resolvedMeta.contract);
    let tokenUri: string | null = null;
    let moduleBaseHref: string | null = null;
    const resolved = await resolveRuntimeContentStream({
      env,
      apiBases,
      tokenId,
      primaryContract: contractId,
      fallbackContract: fallbackContractId,
      resolvedMeta,
      onComplete: async (bytes, streamContext) => {
        const streamFinalHash = runtimeBytesToHex(streamContext.meta.finalHash);
        const streamSourceContractId = getRuntimeContractId(streamContext.contract);
        const streamModuleBaseHref = buildRuntimeModuleBaseHref({
          network,
          contractId: streamSourceContractId,
          tokenUriPath: tokenUri,
          entryTokenId: tokenId
        });
        const shouldWriteCache = Boolean(
          cacheKey && streamContext.meta.sealed && streamFinalHash === finalHash
        );
        if (!shouldWriteCache) {
          return false;
        }
        return writeRuntimeContentCache({
          env,
          key: cacheKey,
          bytes,
          mimeType: streamContext.meta.mimeType || 'application/octet-stream',
          metadata: {
            network,
            contractId: cacheContractId,
            sourceContractId: streamSourceContractId,
            tokenId: tokenId.toString(),
            finalHash: streamFinalHash,
            totalSize: streamContext.meta.totalSize.toString(),
            totalChunks: streamContext.meta.totalChunks.toString(),
            tokenUri: tokenUri ?? '',
            moduleBaseHref: streamModuleBaseHref ?? '',
            createdAt: new Date().toISOString()
          }
        }).catch(() => false);
      }
    });
    try {
      tokenUri = await fetchRuntimeTokenUri({
        env,
        apiBases,
        contract: resolved.contract,
        tokenId
      });
    } catch {
      tokenUri = null;
    }
    const resolvedContractId = getRuntimeContractId(resolved.contract);
    const resolvedFinalHash = runtimeBytesToHex(resolved.meta.finalHash);
    moduleBaseHref = buildRuntimeModuleBaseHref({
      network,
      contractId: resolvedContractId,
      tokenUriPath: tokenUri,
      entryTokenId: tokenId
    });

    return new Response(resolved.stream, {
      status: 200,
      headers: buildRuntimeContentHeaders({
        mimeType: resolved.meta.mimeType || 'application/octet-stream',
        cacheStatus: cacheEnabled ? 'MISS' : 'BYPASS',
        network,
        contractId: cacheContractId,
        sourceContractId: resolvedContractId,
        tokenUri: tokenUri ?? '',
        moduleBaseHref: moduleBaseHref ?? '',
        finalHash: resolvedFinalHash,
        totalSize: resolved.meta.totalSize,
        totalChunks: resolved.meta.totalChunks,
        contentLength: resolved.contentLength,
        responseMode: 'stream',
        readBatchSize: readConfig.batchSize,
        readConcurrency: readConfig.concurrency,
        readRetries: readConfig.retries,
        preparedMs: performance.now() - startedAt
      })
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return asJsonError(502, 'Failed to reconstruct runtime content.', detail);
  }
};
