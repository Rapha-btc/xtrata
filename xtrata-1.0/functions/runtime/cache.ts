import type {
  RuntimeContractRef,
  RuntimeEnv,
  RuntimeNetworkType
} from './lib';

export type RuntimeCacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export type RuntimeByteRange = {
  start: number;
  end: number;
  length: number;
};

export type RuntimeContentCacheMetadata = Record<string, string>;

export type RuntimeContentCacheRecord = {
  key: string;
  layer: 'r2' | 'edge';
  body: ReadableStream<Uint8Array>;
  size: number | null;
  bodyRange?: RuntimeByteRange | null;
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: RuntimeContentCacheMetadata;
};

const RUNTIME_CONTENT_CACHE_BINDING = 'RUNTIME_CONTENT_CACHE';
export const RUNTIME_CONTENT_CACHE_PREFIX = 'runtime-content';
export const DEFAULT_RUNTIME_CONTENT_CACHE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_RUNTIME_CONTENT_CACHE_SCAN_MAX_PAGES = 64;
const EDGE_CACHE_ORIGIN = 'https://xtrata-runtime-content-cache.local';
const EDGE_METADATA_HEADERS = {
  network: 'X-Xtrata-Cache-Meta-Network',
  contractId: 'X-Xtrata-Cache-Meta-Contract-Id',
  sourceContractId: 'X-Xtrata-Cache-Meta-Source-Contract-Id',
  tokenId: 'X-Xtrata-Cache-Meta-Token-Id',
  finalHash: 'X-Xtrata-Cache-Meta-Final-Hash',
  totalSize: 'X-Xtrata-Cache-Meta-Total-Size',
  totalChunks: 'X-Xtrata-Cache-Meta-Total-Chunks',
  tokenUri: 'X-Xtrata-Cache-Meta-Token-Uri',
  moduleBaseHref: 'X-Xtrata-Cache-Meta-Module-Base-Href',
  createdAt: 'X-Xtrata-Cache-Meta-Created-At'
} as const;

export type RuntimeContentCacheWarningLevel =
  | 'ok'
  | 'warning'
  | 'critical'
  | 'exceeded'
  | 'unknown';

export type RuntimeContentCacheUsage = {
  available: boolean;
  binding: 'RUNTIME_CONTENT_CACHE' | null;
  prefix: string;
  objectCount: number;
  totalBytes: number;
  limitBytes: number;
  usageRatio: number | null;
  warningLevel: RuntimeContentCacheWarningLevel;
  warningMessage: string | null;
  scannedAll: boolean;
  pagesScanned: number;
  sampleKeys: string[];
  error: string | null;
};

export const runtimeBytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');

const isR2Bucket = (value: unknown): value is R2Bucket =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { get?: unknown }).get === 'function' &&
      typeof (value as { put?: unknown }).put === 'function'
  );

export const getRuntimeContentCacheBucket = (env: RuntimeEnv) => {
  const bucket = env[RUNTIME_CONTENT_CACHE_BINDING];
  return isR2Bucket(bucket) ? bucket : null;
};

const toPositiveInteger = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

export const getRuntimeContentCacheLimitBytes = (env: RuntimeEnv) =>
  toPositiveInteger(
    env.RUNTIME_CONTENT_CACHE_LIMIT_BYTES,
    DEFAULT_RUNTIME_CONTENT_CACHE_LIMIT_BYTES
  );

const getRuntimeContentCacheScanMaxPages = (env: RuntimeEnv) =>
  toPositiveInteger(
    env.RUNTIME_CONTENT_CACHE_SCAN_MAX_PAGES,
    DEFAULT_RUNTIME_CONTENT_CACHE_SCAN_MAX_PAGES
  );

const buildRuntimeContentCacheUsage = (params: {
  available: boolean;
  totalBytes: number;
  objectCount: number;
  limitBytes: number;
  scannedAll: boolean;
  pagesScanned: number;
  sampleKeys: string[];
  error: string | null;
}): RuntimeContentCacheUsage => {
  const prefix = `${RUNTIME_CONTENT_CACHE_PREFIX}/`;
  const usageRatio =
    params.limitBytes > 0 ? params.totalBytes / params.limitBytes : null;
  let warningLevel: RuntimeContentCacheWarningLevel = 'ok';
  let warningMessage: string | null = null;

  if (!params.available) {
    warningLevel = 'unknown';
    warningMessage =
      'Runtime inscription cache storage is not configured, so usage cannot be measured.';
  } else if (params.error) {
    warningLevel = 'unknown';
    warningMessage = `Runtime inscription cache usage check failed: ${params.error}`;
  } else if (!params.scannedAll) {
    warningLevel = 'warning';
    warningMessage =
      'Runtime inscription cache scan was partial; actual usage may be higher than reported.';
  } else if (usageRatio !== null && usageRatio >= 1) {
    warningLevel = 'exceeded';
    warningMessage =
      'Runtime inscription cache is at or over the reserved storage budget.';
  } else if (usageRatio !== null && usageRatio >= 0.95) {
    warningLevel = 'critical';
    warningMessage =
      'Runtime inscription cache is above 95% of the reserved storage budget.';
  } else if (usageRatio !== null && usageRatio >= 0.8) {
    warningLevel = 'warning';
    warningMessage =
      'Runtime inscription cache is above 80% of the reserved storage budget.';
  }

  return {
    available: params.available,
    binding: params.available ? RUNTIME_CONTENT_CACHE_BINDING : null,
    prefix,
    objectCount: params.objectCount,
    totalBytes: params.totalBytes,
    limitBytes: params.limitBytes,
    usageRatio,
    warningLevel,
    warningMessage,
    scannedAll: params.scannedAll,
    pagesScanned: params.pagesScanned,
    sampleKeys: params.sampleKeys,
    error: params.error
  };
};

export const inspectRuntimeContentCacheUsage = async (
  env: RuntimeEnv
): Promise<RuntimeContentCacheUsage> => {
  const limitBytes = getRuntimeContentCacheLimitBytes(env);
  const bucket = getRuntimeContentCacheBucket(env);
  if (!bucket || typeof bucket.list !== 'function') {
    return buildRuntimeContentCacheUsage({
      available: false,
      totalBytes: 0,
      objectCount: 0,
      limitBytes,
      scannedAll: true,
      pagesScanned: 0,
      sampleKeys: [],
      error: null
    });
  }

  const prefix = `${RUNTIME_CONTENT_CACHE_PREFIX}/`;
  const maxPages = getRuntimeContentCacheScanMaxPages(env);
  const sampleKeys: string[] = [];
  let totalBytes = 0;
  let objectCount = 0;
  let pagesScanned = 0;
  let cursor: string | undefined;
  let truncated = false;

  try {
    do {
      pagesScanned += 1;
      const page = await bucket.list(cursor ? { prefix, cursor } : { prefix });
      for (const object of page.objects) {
        objectCount += 1;
        totalBytes += object.size ?? 0;
        if (sampleKeys.length < 8) {
          sampleKeys.push(object.key);
        }
      }
      cursor = page.cursor || undefined;
      truncated = Boolean(page.truncated);
    } while (truncated && cursor && pagesScanned < maxPages);

    return buildRuntimeContentCacheUsage({
      available: true,
      totalBytes,
      objectCount,
      limitBytes,
      scannedAll: !truncated,
      pagesScanned,
      sampleKeys,
      error: null
    });
  } catch (error) {
    return buildRuntimeContentCacheUsage({
      available: true,
      totalBytes,
      objectCount,
      limitBytes,
      scannedAll: false,
      pagesScanned,
      sampleKeys,
      error: error instanceof Error ? error.message : 'R2 list failed'
    });
  }
};

const getRuntimeEdgeCache = () => {
  const maybeCaches = (globalThis as {
    caches?: {
      default?: Cache;
    };
  }).caches;
  return maybeCaches?.default ?? null;
};

const buildRuntimeEdgeCacheRequest = (key: string) =>
  new Request(`${EDGE_CACHE_ORIGIN}/${key}`, {
    method: 'GET'
  });

const getEdgeCacheMetadata = (headers: Headers): RuntimeContentCacheMetadata => {
  const metadata: RuntimeContentCacheMetadata = {};
  for (const [key, headerName] of Object.entries(EDGE_METADATA_HEADERS)) {
    const value = headers.get(headerName);
    if (value !== null) {
      metadata[key] = value;
    }
  }
  return metadata;
};

export const hasRuntimeContentCache = (env: RuntimeEnv) =>
  Boolean(getRuntimeContentCacheBucket(env) || getRuntimeEdgeCache());

export const getRuntimeContractId = (contract: RuntimeContractRef) =>
  `${contract.address}.${contract.contractName}`;

export const buildRuntimeContentCacheKey = (params: {
  network: RuntimeNetworkType;
  contract: RuntimeContractRef;
  tokenId: bigint;
  finalHash: Uint8Array;
}) => {
  const finalHash = runtimeBytesToHex(params.finalHash);
  if (!finalHash) {
    return null;
  }
  const contractId = getRuntimeContractId(params.contract);
  return [
    RUNTIME_CONTENT_CACHE_PREFIX,
    params.network,
    encodeURIComponent(contractId),
    params.tokenId.toString(),
    finalHash
  ].join('/');
};

export const readRuntimeContentCache = async (
  env: RuntimeEnv,
  key: string | null,
  range?: RuntimeByteRange | null
): Promise<RuntimeContentCacheRecord | null> => {
  if (!key) {
    return null;
  }
  const bucket = getRuntimeContentCacheBucket(env);
  if (bucket) {
    const object = range
      ? await bucket.get(key, {
          range: {
            offset: range.start,
            length: range.length
          }
        })
      : await bucket.get(key);
    if (object?.body) {
      return {
        key,
        layer: 'r2',
        body: object.body,
        size: typeof object.size === 'number' ? object.size : null,
        bodyRange: range ?? null,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata
      };
    }
  }

  const edgeCache = getRuntimeEdgeCache();
  if (!edgeCache) {
    return null;
  }
  const response = await edgeCache.match(buildRuntimeEdgeCacheRequest(key));
  if (!response?.body) {
    return null;
  }
  const contentLength = response.headers.get('Content-Length');
  const parsedContentLength =
    contentLength === null ? Number.NaN : Number.parseInt(contentLength, 10);
  const body = range ? sliceRuntimeStream(response.body, range) : response.body;
  return {
    key,
    layer: 'edge',
    body,
    size: Number.isFinite(parsedContentLength) ? parsedContentLength : null,
    bodyRange: range ?? null,
    httpMetadata: {
      contentType: response.headers.get('Content-Type') ?? undefined
    },
    customMetadata: getEdgeCacheMetadata(response.headers)
  };
};

export const deleteRuntimeContentCache = async (env: RuntimeEnv, key: string | null) => {
  if (!key) {
    return {
      key: null,
      r2Deleted: false,
      edgeDeleted: false
    };
  }

  let r2Deleted = false;
  const bucket = getRuntimeContentCacheBucket(env);
  if (bucket) {
    await bucket.delete(key);
    r2Deleted = true;
  }

  let edgeDeleted = false;
  const edgeCache = getRuntimeEdgeCache();
  if (edgeCache) {
    edgeDeleted = await edgeCache.delete(buildRuntimeEdgeCacheRequest(key));
  }

  return {
    key,
    r2Deleted,
    edgeDeleted
  };
};

const sliceRuntimeStream = (
  stream: ReadableStream<Uint8Array>,
  range: RuntimeByteRange
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = stream.getReader();
      void (async () => {
        let cursor = 0;
        let remaining = range.length;
        try {
          while (remaining > 0) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            const chunkStart = cursor;
            const chunkEnd = cursor + value.length - 1;
            cursor += value.length;
            if (chunkEnd < range.start) {
              continue;
            }
            const offset = Math.max(0, range.start - chunkStart);
            const output = value.slice(offset, offset + remaining);
            if (output.length > 0) {
              controller.enqueue(output);
              remaining -= output.length;
            }
          }
          if (remaining > 0) {
            throw new Error('Cached range body ended before the requested range.');
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          if (remaining <= 0) {
            await reader.cancel().catch(() => undefined);
          }
        }
      })();
    }
  });

export const writeRuntimeContentCache = async (params: {
  env: RuntimeEnv;
  key: string | null;
  bytes: Uint8Array;
  mimeType: string;
  metadata: RuntimeContentCacheMetadata;
}) => {
  if (!params.key) {
    return false;
  }
  let wrote = false;
  let lastError: unknown = null;
  const bucket = getRuntimeContentCacheBucket(params.env);
  if (bucket) {
    try {
      await bucket.put(params.key, params.bytes, {
        httpMetadata: {
          contentType: params.mimeType
        },
        customMetadata: params.metadata
      });
      wrote = true;
    } catch (error) {
      lastError = error;
    }
  }

  const edgeCache = getRuntimeEdgeCache();
  if (edgeCache) {
    try {
      const headers = new Headers({
        'Content-Type': params.mimeType,
        'Content-Length': params.bytes.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      if (params.metadata.finalHash) {
        headers.set('ETag', `"${params.metadata.finalHash}"`);
      }
      for (const [key, headerName] of Object.entries(EDGE_METADATA_HEADERS)) {
        const value = params.metadata[key];
        if (value !== undefined) {
          headers.set(headerName, value);
        }
      }
      await edgeCache.put(
        buildRuntimeEdgeCacheRequest(params.key),
        new Response(params.bytes, {
          status: 200,
          headers
        })
      );
      wrote = true;
    } catch (error) {
      lastError = error;
    }
  }

  if (!wrote && lastError) {
    throw lastError;
  }
  return wrote;
};
