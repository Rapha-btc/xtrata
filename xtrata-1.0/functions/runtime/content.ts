import { buildRuntimeModuleBaseHref } from '../../src/lib/viewer/module-paths';
import {
  buildRuntimeContentCacheKey,
  getRuntimeContentCacheBucket,
  getRuntimeContractId,
  readRuntimeContentCache,
  runtimeBytesToHex,
  writeRuntimeContentCache,
  type RuntimeCacheStatus
} from './cache';
import {
  fetchRuntimeTokenUri,
  getRuntimeApiBases,
  parseRuntimeContractRef,
  parseRuntimeNetwork,
  parseRuntimeTokenId,
  resolveRuntimeMeta,
  resolveRuntimeContent,
  type RuntimeEnv
} from './lib';

const asJsonError = (status: number, message: string, detail?: string) =>
  new Response(
    JSON.stringify({
      error: message,
      detail: detail || null
    }),
    {
      status,
      headers: {
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
}) => {
  const headers: Record<string, string> = {
    'Content-Type': params.mimeType,
    'Cache-Control': params.finalHash
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff',
    'X-Xtrata-Runtime-Cache': params.cacheStatus,
    'X-Xtrata-Runtime-Contract': params.contractId,
    'X-Xtrata-Runtime-Source-Contract': params.sourceContractId,
    'X-Xtrata-Runtime-Network': params.network,
    'X-Xtrata-Runtime-Token-Uri': params.tokenUri,
    'X-Xtrata-Runtime-Module-Base': params.moduleBaseHref,
    'X-Xtrata-Runtime-Final-Hash': params.finalHash,
    'X-Xtrata-Runtime-Total-Size': params.totalSize.toString(),
    'X-Xtrata-Runtime-Total-Chunks': params.totalChunks.toString()
  };
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

  if (request.method !== 'GET') {
    return asJsonError(405, 'Method not allowed.');
  }

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
    const cacheEnabled = Boolean(getRuntimeContentCacheBucket(env));
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
        contentLength: cached.size
      });
      return new Response(cached.body, {
        status: 200,
        headers
      });
    }

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
    const cacheContractId = getRuntimeContractId(resolvedMeta.contract);
    const resolvedFinalHash = runtimeBytesToHex(resolved.meta.finalHash);
    const moduleBaseHref = buildRuntimeModuleBaseHref({
      network,
      contractId: resolvedContractId,
      tokenUriPath: tokenUri,
      entryTokenId: tokenId
    });
    const shouldWriteCache = Boolean(
      cacheKey && resolved.meta.sealed && resolvedFinalHash === finalHash
    );
    if (shouldWriteCache) {
      const cacheWrite = writeRuntimeContentCache({
        env,
        key: cacheKey,
        bytes: resolved.bytes,
        mimeType: resolved.meta.mimeType || 'application/octet-stream',
        metadata: {
          network,
          contractId: cacheContractId,
          sourceContractId: resolvedContractId,
          tokenId: tokenId.toString(),
          finalHash: resolvedFinalHash,
          totalSize: resolved.meta.totalSize.toString(),
          totalChunks: resolved.meta.totalChunks.toString(),
          tokenUri: tokenUri ?? '',
          moduleBaseHref: moduleBaseHref ?? '',
          createdAt: new Date().toISOString()
        }
      }).catch(() => false);
      if (context.waitUntil) {
        context.waitUntil(cacheWrite);
      } else {
        await cacheWrite;
      }
    }

    return new Response(resolved.bytes, {
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
        contentLength: resolved.bytes.length
      })
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return asJsonError(502, 'Failed to reconstruct runtime content.', detail);
  }
};
