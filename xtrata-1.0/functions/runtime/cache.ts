import type {
  RuntimeContractRef,
  RuntimeEnv,
  RuntimeNetworkType
} from './lib';

export type RuntimeCacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export type RuntimeContentCacheMetadata = Record<string, string>;

export type RuntimeContentCacheRecord = {
  key: string;
  body: ReadableStream<Uint8Array>;
  size: number | null;
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: RuntimeContentCacheMetadata;
};

const RUNTIME_CONTENT_CACHE_BINDING = 'RUNTIME_CONTENT_CACHE';
const RUNTIME_CONTENT_CACHE_PREFIX = 'runtime-content';

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
  key: string | null
): Promise<RuntimeContentCacheRecord | null> => {
  const bucket = getRuntimeContentCacheBucket(env);
  if (!bucket || !key) {
    return null;
  }
  const object = await bucket.get(key);
  if (!object?.body) {
    return null;
  }
  return {
    key,
    body: object.body,
    size: typeof object.size === 'number' ? object.size : null,
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata
  };
};

export const writeRuntimeContentCache = async (params: {
  env: RuntimeEnv;
  key: string | null;
  bytes: Uint8Array;
  mimeType: string;
  metadata: RuntimeContentCacheMetadata;
}) => {
  const bucket = getRuntimeContentCacheBucket(params.env);
  if (!bucket || !params.key) {
    return false;
  }
  await bucket.put(params.key, params.bytes, {
    httpMetadata: {
      contentType: params.mimeType
    },
    customMetadata: params.metadata
  });
  return true;
};
