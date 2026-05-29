import { buildRuntimeModuleBaseHref } from '../../src/lib/viewer/module-paths';
import {
  buildRuntimeContentCacheKey,
  getRuntimeContractId,
  hasRuntimeContentCache,
  readRuntimeContentCache,
  runtimeBytesToHex,
  writeRuntimeContentCache,
  type RuntimeByteRange,
  type RuntimeCacheStatus
} from './cache';
import {
  fetchRuntimeTokenUri,
  getRuntimeReadConfig,
  getRuntimeApiBases,
  parseRuntimeContractRef,
  parseRuntimeNetwork,
  parseRuntimeTokenId,
  resolveRuntimeContent,
  resolveRuntimeMeta,
  resolveRuntimeContentStream,
  type RuntimeEnv
} from './lib';

const RUNTIME_CONTENT_BUILD = 'stream-v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, range, if-range',
  'Access-Control-Expose-Headers': [
    'Content-Type',
    'Content-Length',
    'Accept-Ranges',
    'Content-Range',
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

type RuntimeMediaKindHint = 'audio' | '';

const parseRuntimeMediaKindHint = (url: URL): RuntimeMediaKindHint => {
  const raw =
    url.searchParams.get('mediaKind') ||
    url.searchParams.get('kind') ||
    url.searchParams.get('as') ||
    '';
  return raw.trim().toLowerCase() === 'audio' ? 'audio' : '';
};

const normalizeRuntimeContentMimeType = (
  mimeType: string | null | undefined,
  mediaKind: RuntimeMediaKindHint
) => {
  const raw = String(mimeType || '').trim();
  const fallback = raw || 'application/octet-stream';
  if (mediaKind !== 'audio') {
    return fallback;
  }

  const normalized = fallback.toLowerCase();
  if (normalized.startsWith('audio/')) {
    return fallback;
  }
  if (normalized === 'application/octet-stream') {
    return 'audio/webm; codecs=opus';
  }
  if (normalized === 'video/webm' || normalized.startsWith('video/webm;')) {
    return fallback.replace(/^video\/webm/i, 'audio/webm');
  }
  return fallback;
};

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
  contentRange?: string;
  responseMode: 'cache' | 'head' | 'range' | 'stream';
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
  if (params.totalSize <= BigInt(Number.MAX_SAFE_INTEGER)) {
    headers['Accept-Ranges'] = 'bytes';
  }
  if (params.contentRange) {
    headers['Content-Range'] = params.contentRange;
    headers.Vary = 'Range';
  }
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

type ParsedRange =
  | { status: 'none' }
  | { status: 'valid'; range: RuntimeByteRange; contentRange: string }
  | { status: 'unsatisfiable'; contentRange: string };

const parseRuntimeRange = (
  headerValue: string | null,
  totalSize: bigint
): ParsedRange => {
  if (!headerValue) {
    return { status: 'none' };
  }
  if (totalSize < 0n || totalSize > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      status: 'unsatisfiable',
      contentRange: 'bytes */*'
    };
  }
  const total = Number(totalSize);
  const normalized = headerValue.trim();
  const prefix = 'bytes=';
  if (!normalized.toLowerCase().startsWith(prefix) || normalized.includes(',')) {
    return {
      status: 'unsatisfiable',
      contentRange: `bytes */${total}`
    };
  }

  const spec = normalized.slice(prefix.length).trim();
  const separator = spec.indexOf('-');
  if (separator < 0) {
    return {
      status: 'unsatisfiable',
      contentRange: `bytes */${total}`
    };
  }

  const startPart = spec.slice(0, separator).trim();
  const endPart = spec.slice(separator + 1).trim();
  const isDigits = (value: string) => /^\d+$/.test(value);
  let start: number;
  let end: number;

  if (!startPart) {
    if (!isDigits(endPart)) {
      return {
        status: 'unsatisfiable',
        contentRange: `bytes */${total}`
      };
    }
    const suffixLength = Number.parseInt(endPart, 10);
    if (suffixLength <= 0 || total === 0) {
      return {
        status: 'unsatisfiable',
        contentRange: `bytes */${total}`
      };
    }
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    if (!isDigits(startPart) || (endPart && !isDigits(endPart))) {
      return {
        status: 'unsatisfiable',
        contentRange: `bytes */${total}`
      };
    }
    start = Number.parseInt(startPart, 10);
    end = endPart ? Number.parseInt(endPart, 10) : total - 1;
    if (start >= total || start > end || total === 0) {
      return {
        status: 'unsatisfiable',
        contentRange: `bytes */${total}`
      };
    }
    end = Math.min(end, total - 1);
  }

  const length = end - start + 1;
  return {
    status: 'valid',
    range: {
      start,
      end,
      length
    },
    contentRange: `bytes ${start}-${end}/${total}`
  };
};

const shouldHonorRange = (request: Request, finalHash: string) => {
  const ifRange = request.headers.get('If-Range')?.trim();
  if (!ifRange || !finalHash) {
    return true;
  }
  return ifRange === finalHash || ifRange === `"${finalHash}"`;
};

const sliceBytes = (bytes: Uint8Array, range: RuntimeByteRange) =>
  bytes.slice(range.start, range.end + 1);

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
  const mediaKind = parseRuntimeMediaKindHint(url);
  const getResponseMimeType = (
    ...candidates: Array<string | null | undefined>
  ) =>
    normalizeRuntimeContentMimeType(
      candidates.find((candidate) => String(candidate || '').trim()) ||
        'application/octet-stream',
      mediaKind
    );

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
    const requestedRange = shouldHonorRange(request, finalHash)
      ? parseRuntimeRange(request.headers.get('Range'), resolvedMeta.meta.totalSize)
      : ({ status: 'none' } as const);
    const range = requestedRange.status === 'valid' ? requestedRange.range : null;

    if (requestedRange.status === 'unsatisfiable') {
      const resolvedContractId = getRuntimeContractId(resolvedMeta.contract);
      return new Response(null, {
        status: 416,
        headers: buildRuntimeContentHeaders({
          mimeType: getResponseMimeType(resolvedMeta.meta.mimeType),
          cacheStatus: cacheEnabled ? 'MISS' : 'BYPASS',
          network,
          contractId: resolvedContractId,
          sourceContractId: resolvedContractId,
          tokenUri: '',
          moduleBaseHref: '',
          finalHash,
          totalSize: resolvedMeta.meta.totalSize,
          totalChunks: resolvedMeta.meta.totalChunks,
          contentLength: 0,
          contentRange: requestedRange.contentRange,
          responseMode: 'range',
          readBatchSize: readConfig.batchSize,
          readConcurrency: readConfig.concurrency,
          readRetries: readConfig.retries,
          preparedMs: performance.now() - startedAt
        })
      });
    }

    const cached = await readRuntimeContentCache(env, cacheKey, range);
    if (cached) {
      const sourceContractId =
        cached.customMetadata?.sourceContractId ?? getRuntimeContractId(resolvedMeta.contract);
      const rangeContentLength =
        requestedRange.status === 'valid' ? requestedRange.range.length : null;
      const headers = buildRuntimeContentHeaders({
        mimeType: getResponseMimeType(
          resolvedMeta.meta.mimeType,
          cached.httpMetadata?.contentType
        ),
        cacheStatus: 'HIT',
        network,
        contractId: getRuntimeContractId(resolvedMeta.contract),
        sourceContractId,
        tokenUri: cached.customMetadata?.tokenUri ?? '',
        moduleBaseHref: cached.customMetadata?.moduleBaseHref ?? '',
        finalHash,
        totalSize: resolvedMeta.meta.totalSize,
        totalChunks: resolvedMeta.meta.totalChunks,
        contentLength: rangeContentLength ?? cached.size,
        contentRange:
          requestedRange.status === 'valid'
            ? requestedRange.contentRange
            : undefined,
        responseMode:
          request.method === 'HEAD'
            ? 'head'
            : requestedRange.status === 'valid'
              ? 'range'
              : 'cache',
        readBatchSize: readConfig.batchSize,
        readConcurrency: readConfig.concurrency,
        readRetries: readConfig.retries,
        preparedMs: performance.now() - startedAt
      });
      return new Response(request.method === 'HEAD' ? null : cached.body, {
        status: requestedRange.status === 'valid' ? 206 : 200,
        headers
      });
    }

    if (request.method === 'HEAD') {
      const resolvedContractId = getRuntimeContractId(resolvedMeta.contract);
      return new Response(null, {
        status: requestedRange.status === 'valid' ? 206 : 200,
        headers: buildRuntimeContentHeaders({
          mimeType: getResponseMimeType(resolvedMeta.meta.mimeType),
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
            requestedRange.status === 'valid'
              ? requestedRange.range.length
              : resolvedMeta.meta.totalSize <= BigInt(Number.MAX_SAFE_INTEGER)
                ? Number(resolvedMeta.meta.totalSize)
                : null,
          contentRange:
            requestedRange.status === 'valid'
              ? requestedRange.contentRange
              : undefined,
          responseMode: 'head',
          readBatchSize: readConfig.batchSize,
          readConcurrency: readConfig.concurrency,
          readRetries: readConfig.retries,
          preparedMs: performance.now() - startedAt
        })
      });
    }

    const cacheContractId = getRuntimeContractId(resolvedMeta.contract);
    if (requestedRange.status === 'valid') {
      const resolved = await resolveRuntimeContent({
        env,
        apiBases,
        tokenId,
        primaryContract: contractId,
        fallbackContract: fallbackContractId,
        resolvedMeta
      });
      let tokenUri: string | null = null;
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
      const moduleBaseHref = buildRuntimeModuleBaseHref({
        network,
        contractId: resolvedContractId,
        tokenUriPath: tokenUri,
        entryTokenId: tokenId
      });
      if (cacheKey && resolved.meta.sealed && resolvedFinalHash === finalHash) {
        const cacheWrite = writeRuntimeContentCache({
          env,
          key: cacheKey,
          bytes: resolved.bytes,
          mimeType: getResponseMimeType(resolved.meta.mimeType),
          metadata: {
            network,
            contractId: cacheContractId,
            sourceContractId: resolvedContractId,
            tokenId: tokenId.toString(),
            finalHash: resolvedFinalHash,
            totalSize: resolved.meta.totalSize.toString(),
            totalChunks: resolved.meta.totalChunks.toString(),
            tokenUri: tokenUri ?? '',
            moduleBaseHref,
            createdAt: new Date().toISOString()
          }
        }).catch(() => false);
        if (context.waitUntil) {
          context.waitUntil(cacheWrite);
        } else {
          await cacheWrite;
        }
      }
      return new Response(sliceBytes(resolved.bytes, requestedRange.range), {
        status: 206,
        headers: buildRuntimeContentHeaders({
          mimeType: getResponseMimeType(resolved.meta.mimeType),
          cacheStatus: cacheEnabled ? 'MISS' : 'BYPASS',
          network,
          contractId: cacheContractId,
          sourceContractId: resolvedContractId,
          tokenUri: tokenUri ?? '',
          moduleBaseHref,
          finalHash: resolvedFinalHash,
          totalSize: resolved.meta.totalSize,
          totalChunks: resolved.meta.totalChunks,
          contentLength: requestedRange.range.length,
          contentRange: requestedRange.contentRange,
          responseMode: 'range',
          readBatchSize: readConfig.batchSize,
          readConcurrency: readConfig.concurrency,
          readRetries: readConfig.retries,
          preparedMs: performance.now() - startedAt
        })
      });
    }

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
          mimeType: getResponseMimeType(streamContext.meta.mimeType),
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
        mimeType: getResponseMimeType(resolved.meta.mimeType),
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
