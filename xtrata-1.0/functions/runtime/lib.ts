import { deserializeCV, listCV, serializeCV, uintCV } from '@stacks/transactions';
import {
  parseGetDependencies,
  parseGetChunk,
  parseGetChunkBatch,
  parseGetInscriptionMeta,
  parseGetLastTokenId,
  parseGetTokenUri
} from '../../src/lib/protocol/parsers';
import type { InscriptionMeta } from '../../src/lib/protocol/types';
import { parseRuntimeModuleContractId } from '../../src/lib/viewer/module-paths';
import {
  applyHiroApiKey,
  getHiroApiKeys,
  shouldRetryWithNextHiroKey
} from '../lib/hiro-keys';

export type RuntimeEnv = Record<string, unknown>;

export type RuntimeNetworkType = 'mainnet' | 'testnet';

export type RuntimeContractRef = {
  address: string;
  contractName: string;
};

const CHUNK_FALLBACK_SIZE = 16384n;
const CONTRACT_MAX_BATCH_SIZE = 50;
const DEFAULT_RUNTIME_READ_BATCH_SIZE = 8;
const DEFAULT_RUNTIME_CHUNK_CONCURRENCY = 4;
const DEFAULT_RUNTIME_CHUNK_RETRIES = 2;

const MAINNET_BASES = [
  'https://api.mainnet.hiro.so',
  'https://stacks-node-api.mainnet.stacks.co'
];

const TESTNET_BASES = [
  'https://api.testnet.hiro.so',
  'https://stacks-node-api.testnet.stacks.co'
];

const sanitizeBase = (value: string) => value.trim().replace(/\/+$/, '');

const dedupeBases = (values: string[]) => {
  const output: string[] = [];
  for (const value of values) {
    const normalized = sanitizeBase(value);
    if (!normalized || output.includes(normalized)) {
      continue;
    }
    output.push(normalized);
  }
  return output;
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');

const encodeUintArg = (value: bigint) => `0x${bytesToHex(serializeCV(uintCV(value)))}`;

const encodeUintListArg = (values: bigint[]) =>
  `0x${bytesToHex(serializeCV(listCV(values.map((value) => uintCV(value)))))}`;

const asError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));

export const parseRuntimeNetwork = (value: string | null) => {
  const normalized = String(value || 'mainnet').trim().toLowerCase();
  return normalized === 'testnet' ? 'testnet' : 'mainnet';
};

export const parseRuntimeContractRef = (
  value: string | null | undefined
): RuntimeContractRef | null => parseRuntimeModuleContractId(value);

export const parseRuntimeTokenId = (value: string | null) => {
  if (!value || !/^\d+$/.test(value.trim())) {
    return null;
  }
  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
};

export const getRuntimeApiBases = (
  network: RuntimeNetworkType,
  env: RuntimeEnv
) => {
  const configured =
    network === 'mainnet'
      ? [
          env.ARCADE_HIRO_API_BASE_MAINNET,
          env.HIRO_API_BASE_MAINNET,
          env.VITE_STACKS_API_MAINNET,
          env.VITE_HIRO_API_MAINNET
        ]
      : [
          env.ARCADE_HIRO_API_BASE_TESTNET,
          env.HIRO_API_BASE_TESTNET,
          env.VITE_STACKS_API_TESTNET,
          env.VITE_HIRO_API_TESTNET
        ];
  const defaults = network === 'mainnet' ? MAINNET_BASES : TESTNET_BASES;
  return dedupeBases(
    configured
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .concat(defaults)
  );
};

export const isSameRuntimeContract = (
  left: RuntimeContractRef,
  right: RuntimeContractRef
) => left.address === right.address && left.contractName === right.contractName;

export const callRuntimeReadOnly = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  functionName: string;
  functionArgs: string[];
  senderAddress: string;
}) => {
  const { env, apiBases } = params;
  const hiroKeys = getHiroApiKeys(env);
  let lastError: Error | null = null;

  for (const base of apiBases) {
    const endpoint =
      `${base}/v2/contracts/call-read/` +
      `${params.contract.address}/` +
      `${params.contract.contractName}/` +
      `${params.functionName}`;
    const keyCandidates =
      base.includes('hiro.so') && hiroKeys.length > 0 ? hiroKeys : [null];

    for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex += 1) {
      const keyCandidate = keyCandidates[keyIndex];
      const hasNextKey = keyIndex < keyCandidates.length - 1;
      try {
        const headers = new Headers({
          'Content-Type': 'application/json'
        });
        applyHiroApiKey(headers, keyCandidate);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sender: params.senderAddress,
            arguments: params.functionArgs
          })
        });

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status} from ${base}`);
          if (hasNextKey && shouldRetryWithNextHiroKey(response.status)) {
            continue;
          }
          break;
        }

        const body = await response.json();
        if (!body || body.okay !== true || typeof body.result !== 'string') {
          const cause =
            body && body.cause ? String(body.cause) : 'Invalid read-only response.';
          throw new Error(cause);
        }

        return deserializeCV(body.result);
      } catch (error) {
        lastError = asError(error);
        break;
      }
    }
  }

  throw lastError || new Error('Read-only call failed.');
};

export const fetchRuntimeMeta = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-inscription-meta',
    functionArgs: [encodeUintArg(params.tokenId)],
    senderAddress: params.contract.address
  });
  return parseGetInscriptionMeta(value);
};

export const fetchRuntimeChunk = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  index: bigint;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-chunk',
    functionArgs: [encodeUintArg(params.tokenId), encodeUintArg(params.index)],
    senderAddress: params.contract.address
  });
  return parseGetChunk(value);
};

export const fetchRuntimeChunkBatch = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  indexes: bigint[];
}) => {
  if (params.indexes.length === 0) {
    return [] as Array<Uint8Array | null>;
  }
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-chunk-batch',
    functionArgs: [encodeUintArg(params.tokenId), encodeUintListArg(params.indexes)],
    senderAddress: params.contract.address
  });
  return parseGetChunkBatch(value);
};

export const fetchRuntimeLastTokenId = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-last-token-id',
    functionArgs: [],
    senderAddress: params.contract.address
  });
  return parseGetLastTokenId(value);
};

export const fetchRuntimeTokenUri = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-token-uri',
    functionArgs: [encodeUintArg(params.tokenId)],
    senderAddress: params.contract.address
  });
  return parseGetTokenUri(value);
};

export const fetchRuntimeDependencies = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-dependencies',
    functionArgs: [encodeUintArg(params.tokenId)],
    senderAddress: params.contract.address
  });
  return parseGetDependencies(value);
};

const getExpectedChunkCount = (params: {
  declaredTotalChunks: bigint;
  totalSize: bigint;
  firstChunkLength: number;
}) => {
  if (params.declaredTotalChunks > 0n) {
    return params.declaredTotalChunks;
  }
  if (params.totalSize <= 0n) {
    return 0n;
  }
  const chunkSize =
    params.firstChunkLength > 0 ? BigInt(params.firstChunkLength) : CHUNK_FALLBACK_SIZE;
  return (params.totalSize + chunkSize - 1n) / chunkSize;
};

const combineChunks = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
};

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parsePositiveInteger = (value: unknown, fallback: number, max: number) => {
  const parsed =
    typeof value === 'string' && value.trim().length > 0
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(max, parsed));
};

const parseNonNegativeInteger = (value: unknown, fallback: number, max: number) => {
  const parsed =
    typeof value === 'string' && value.trim().length > 0
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.max(0, Math.min(max, parsed));
};

export const getRuntimeReadConfig = (env: RuntimeEnv) => ({
  batchSize: parsePositiveInteger(
    env.RUNTIME_CONTENT_READ_BATCH_SIZE,
    DEFAULT_RUNTIME_READ_BATCH_SIZE,
    CONTRACT_MAX_BATCH_SIZE
  ),
  concurrency: parsePositiveInteger(
    env.RUNTIME_CONTENT_READ_CONCURRENCY,
    DEFAULT_RUNTIME_CHUNK_CONCURRENCY,
    8
  ),
  retries: parseNonNegativeInteger(
    env.RUNTIME_CONTENT_READ_RETRIES,
    DEFAULT_RUNTIME_CHUNK_RETRIES,
    5
  )
});

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isCostBalanceExceeded = (error: unknown) =>
  getErrorMessage(error).toLowerCase().includes('costbalanceexceeded');

export type RuntimeResolvedMeta = {
  contract: RuntimeContractRef;
  meta: InscriptionMeta;
};

export type RuntimeResolvedContent = {
  contract: RuntimeContractRef;
  meta: InscriptionMeta;
  bytes: Uint8Array;
};

export type RuntimeStreamCompleteContext = {
  contract: RuntimeContractRef;
  meta: InscriptionMeta;
};

export type RuntimeContentReader = {
  fetchMeta?: typeof fetchRuntimeMeta;
  fetchChunk?: typeof fetchRuntimeChunk;
  fetchChunkBatch?: typeof fetchRuntimeChunkBatch;
};

type ResolvedRuntimeContentReader = Required<RuntimeContentReader>;

const getRuntimeContentReader = (
  reader?: RuntimeContentReader
): ResolvedRuntimeContentReader => ({
  fetchMeta: reader?.fetchMeta ?? fetchRuntimeMeta,
  fetchChunk: reader?.fetchChunk ?? fetchRuntimeChunk,
  fetchChunkBatch: reader?.fetchChunkBatch ?? fetchRuntimeChunkBatch
});

const fetchRuntimeChunkWithRetry = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  index: bigint;
  retries: number;
  read: ResolvedRuntimeContentReader;
}) => {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= params.retries; attempt += 1) {
    try {
      const chunk = await params.read.fetchChunk(params);
      if (!chunk || chunk.length === 0) {
        throw new Error(`Missing chunk ${params.index.toString()}.`);
      }
      return chunk;
    } catch (error) {
      lastError = asError(error);
      if (isCostBalanceExceeded(error)) {
        break;
      }
      if (attempt < params.retries) {
        await wait(150 * Math.pow(2, attempt));
      }
    }
  }
  throw lastError || new Error(`Missing chunk ${params.index.toString()}.`);
};

const fetchRuntimeChunkBatchWithRetry = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  indexes: bigint[];
  retries: number;
  read: ResolvedRuntimeContentReader;
}) => {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= params.retries; attempt += 1) {
    try {
      const batch = await params.read.fetchChunkBatch(params);
      return params.indexes.map((index, position) => ({
        index,
        chunk: batch[position] ?? null
      }));
    } catch (error) {
      lastError = asError(error);
      if (isCostBalanceExceeded(error)) {
        break;
      }
      if (attempt < params.retries) {
        await wait(150 * Math.pow(2, attempt));
      }
    }
  }
  throw lastError || new Error('Missing chunk batch.');
};

const fetchRuntimeChunksWithConcurrency = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  indexes: bigint[];
  concurrency: number;
  retries: number;
  read: ResolvedRuntimeContentReader;
}) => {
  const results = new Map<bigint, Uint8Array>();
  if (params.indexes.length === 0) {
    return results;
  }
  const concurrency = Math.max(1, Math.min(params.concurrency, params.indexes.length));
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= params.indexes.length) {
        return;
      }
      const index = params.indexes[current];
      const chunk = await fetchRuntimeChunkWithRetry({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.contract,
        tokenId: params.tokenId,
        index,
        retries: params.retries,
        read: params.read
      });
      results.set(index, chunk);
    }
  });
  await Promise.all(workers);
  return results;
};

const buildRuntimeIndexBatches = (indexes: bigint[], batchSize: number) => {
  const batches: bigint[][] = [];
  for (let offset = 0; offset < indexes.length; offset += batchSize) {
    batches.push(indexes.slice(offset, offset + batchSize));
  }
  return batches;
};

const fetchRuntimeChunkBatchesWithConcurrency = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  batches: bigint[][];
  concurrency: number;
  retries: number;
  read: ResolvedRuntimeContentReader;
}) => {
  const chunkMap = new Map<bigint, Uint8Array>();
  const unresolved = new Set<bigint>();
  let costExceeded = false;

  if (params.batches.length === 0) {
    return {
      chunkMap,
      unresolved: [] as bigint[],
      costExceeded
    };
  }

  const concurrency = Math.max(1, Math.min(params.concurrency, params.batches.length));
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= params.batches.length) {
        return;
      }

      const batch = params.batches[current];
      try {
        const entries = await fetchRuntimeChunkBatchWithRetry({
          env: params.env,
          apiBases: params.apiBases,
          contract: params.contract,
          tokenId: params.tokenId,
          indexes: batch,
          retries: params.retries,
          read: params.read
        });
        for (const entry of entries) {
          if (entry.chunk && entry.chunk.length > 0) {
            chunkMap.set(entry.index, entry.chunk);
          } else {
            unresolved.add(entry.index);
          }
        }
      } catch (error) {
        if (isCostBalanceExceeded(error)) {
          costExceeded = true;
        }
        for (const index of batch) {
          unresolved.add(index);
        }
      }
    }
  });
  await Promise.all(workers);

  return {
    chunkMap,
    unresolved: Array.from(unresolved).sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0
    ),
    costExceeded
  };
};

const fetchRemainingRuntimeChunks = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  totalCount: number;
  read: ResolvedRuntimeContentReader;
}) => {
  const config = getRuntimeReadConfig(params.env);
  const chunkMap = new Map<bigint, Uint8Array>();
  const unresolved = new Set<bigint>();
  let batchSize = config.batchSize;
  const remainingIndexes = Array.from(
    { length: Math.max(0, params.totalCount - 1) },
    (_, index) => BigInt(index + 1)
  );

  while (batchSize > 1 && remainingIndexes.length > 0) {
    const batches = buildRuntimeIndexBatches(remainingIndexes, batchSize);
    const [probeBatch, ...remainingBatches] = batches;
    try {
      const entries = await fetchRuntimeChunkBatchWithRetry({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.contract,
        tokenId: params.tokenId,
        indexes: probeBatch,
        retries: config.retries,
        read: params.read
      });
      for (const entry of entries) {
        if (entry.chunk && entry.chunk.length > 0) {
          chunkMap.set(entry.index, entry.chunk);
        } else {
          unresolved.add(entry.index);
        }
      }
    } catch (error) {
      if (isCostBalanceExceeded(error) && batchSize > 1) {
        const nextBatchSize = Math.max(1, Math.floor(batchSize / 2));
        if (nextBatchSize < batchSize) {
          batchSize = nextBatchSize;
          chunkMap.clear();
          unresolved.clear();
          continue;
        }
      }
      for (const index of remainingIndexes) {
        unresolved.add(index);
      }
      break;
    }

    const result = await fetchRuntimeChunkBatchesWithConcurrency({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.contract,
      tokenId: params.tokenId,
      batches: remainingBatches,
      concurrency: config.concurrency,
      retries: config.retries,
      read: params.read
    });

    if (result.costExceeded && batchSize > 1) {
      const nextBatchSize = Math.max(1, Math.floor(batchSize / 2));
      if (nextBatchSize < batchSize) {
        batchSize = nextBatchSize;
        chunkMap.clear();
        unresolved.clear();
        continue;
      }
    }

    for (const [index, chunk] of result.chunkMap.entries()) {
      chunkMap.set(index, chunk);
    }
    for (const index of result.unresolved) {
      unresolved.add(index);
    }
    break;
  }

  if (batchSize <= 1 && chunkMap.size === 0 && unresolved.size === 0) {
    for (const index of remainingIndexes) {
      unresolved.add(index);
    }
  }

  if (unresolved.size > 0) {
    const results = await fetchRuntimeChunksWithConcurrency({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.contract,
      tokenId: params.tokenId,
      indexes: Array.from(unresolved).sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0
      ),
      concurrency: config.concurrency,
      retries: config.retries,
      read: params.read
    });
    for (const [index, chunk] of results.entries()) {
      chunkMap.set(index, chunk);
    }
  }

  const ordered: Uint8Array[] = [];
  for (let index = 1; index < params.totalCount; index += 1) {
    const chunk = chunkMap.get(BigInt(index));
    if (!chunk || chunk.length === 0) {
      throw new Error(`Missing chunk ${index.toString()}.`);
    }
    ordered.push(chunk);
  }
  return ordered;
};

const streamRemainingRuntimeChunks = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  totalCount: number;
  read: ResolvedRuntimeContentReader;
  onChunk: (chunk: Uint8Array, index: bigint) => void;
}) => {
  const config = getRuntimeReadConfig(params.env);
  const pending = new Map<bigint, Uint8Array>();
  const unresolved = new Set<bigint>();
  let batchSize = config.batchSize;
  let nextToEmit = 1n;
  const remainingIndexes = Array.from(
    { length: Math.max(0, params.totalCount - 1) },
    (_, index) => BigInt(index + 1)
  );

  const emitAvailable = () => {
    while (pending.has(nextToEmit)) {
      const chunk = pending.get(nextToEmit);
      pending.delete(nextToEmit);
      if (!chunk || chunk.length === 0) {
        throw new Error(`Missing chunk ${nextToEmit.toString()}.`);
      }
      params.onChunk(chunk, nextToEmit);
      nextToEmit += 1n;
    }
  };

  const addEntries = (entries: Array<{ index: bigint; chunk: Uint8Array | null }>) => {
    for (const entry of entries) {
      if (entry.chunk && entry.chunk.length > 0) {
        pending.set(entry.index, entry.chunk);
      } else {
        unresolved.add(entry.index);
      }
    }
    emitAvailable();
  };

  while (batchSize > 1 && remainingIndexes.length > 0) {
    const batches = buildRuntimeIndexBatches(remainingIndexes, batchSize);
    const [probeBatch, ...remainingBatches] = batches;
    try {
      const entries = await fetchRuntimeChunkBatchWithRetry({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.contract,
        tokenId: params.tokenId,
        indexes: probeBatch,
        retries: config.retries,
        read: params.read
      });
      addEntries(entries);
    } catch (error) {
      if (isCostBalanceExceeded(error) && batchSize > 1) {
        const nextBatchSize = Math.max(1, Math.floor(batchSize / 2));
        if (nextBatchSize < batchSize) {
          batchSize = nextBatchSize;
          pending.clear();
          unresolved.clear();
          nextToEmit = 1n;
          continue;
        }
      }
      for (const index of remainingIndexes) {
        unresolved.add(index);
      }
      break;
    }

    let costExceeded = false;
    if (remainingBatches.length > 0) {
      let cursor = 0;
      const workerCount = Math.max(1, Math.min(config.concurrency, remainingBatches.length));
      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const current = cursor;
          cursor += 1;
          if (current >= remainingBatches.length) {
            return;
          }
          const batch = remainingBatches[current];
          try {
            const entries = await fetchRuntimeChunkBatchWithRetry({
              env: params.env,
              apiBases: params.apiBases,
              contract: params.contract,
              tokenId: params.tokenId,
              indexes: batch,
              retries: config.retries,
              read: params.read
            });
            addEntries(entries);
          } catch (error) {
            if (isCostBalanceExceeded(error)) {
              costExceeded = true;
            }
            for (const index of batch) {
              unresolved.add(index);
            }
          }
        }
      });
      await Promise.all(workers);
    }

    if (costExceeded && batchSize > 1 && nextToEmit === 1n) {
      const nextBatchSize = Math.max(1, Math.floor(batchSize / 2));
      if (nextBatchSize < batchSize) {
        batchSize = nextBatchSize;
        pending.clear();
        unresolved.clear();
        continue;
      }
    }
    break;
  }

  if (batchSize <= 1 && pending.size === 0 && unresolved.size === 0) {
    for (const index of remainingIndexes) {
      unresolved.add(index);
    }
  }

  if (unresolved.size > 0) {
    const results = await fetchRuntimeChunksWithConcurrency({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.contract,
      tokenId: params.tokenId,
      indexes: Array.from(unresolved).sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0
      ),
      concurrency: config.concurrency,
      retries: config.retries,
      read: params.read
    });
    for (const [index, chunk] of results.entries()) {
      pending.set(index, chunk);
    }
    emitAvailable();
  }

  const finalExpected = BigInt(params.totalCount);
  if (nextToEmit !== finalExpected) {
    throw new Error(`Missing chunk ${nextToEmit.toString()}.`);
  }
};

export const resolveRuntimeMeta = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
  read?: RuntimeContentReader;
}): Promise<RuntimeResolvedMeta> => {
  const read = getRuntimeContentReader(params.read);
  let primaryMeta = null;
  let primaryMetaError: Error | null = null;
  try {
    primaryMeta = await read.fetchMeta({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.primaryContract,
      tokenId: params.tokenId
    });
  } catch (error) {
    primaryMetaError = asError(error);
  }

  let activeContract = params.primaryContract;
  let activeMeta = primaryMeta;

  if (
    !activeMeta &&
    params.fallbackContract &&
    !isSameRuntimeContract(params.primaryContract, params.fallbackContract)
  ) {
    const fallbackMeta = await read.fetchMeta({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.fallbackContract,
      tokenId: params.tokenId
    });
    if (fallbackMeta) {
      activeContract = params.fallbackContract;
      activeMeta = fallbackMeta;
    }
  }

  if (!activeMeta) {
    throw primaryMetaError || new Error('Inscription metadata not found.');
  }

  return {
    contract: activeContract,
    meta: activeMeta
  };
};

const resolveRuntimeContentPlan = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
  resolvedMeta?: RuntimeResolvedMeta;
  read?: RuntimeContentReader;
}) => {
  const read = getRuntimeContentReader(params.read);
  const resolvedMeta =
    params.resolvedMeta ??
    (await resolveRuntimeMeta({
      env: params.env,
      apiBases: params.apiBases,
      tokenId: params.tokenId,
      primaryContract: params.primaryContract,
      fallbackContract: params.fallbackContract,
      read
    }));

  let activeContract = resolvedMeta.contract;
  let activeMeta = resolvedMeta.meta;
  let firstChunk: Uint8Array | null = null;
  let firstChunkError: Error | null = null;
  const readConfig = getRuntimeReadConfig(params.env);
  try {
    firstChunk = await fetchRuntimeChunkWithRetry({
      env: params.env,
      apiBases: params.apiBases,
      contract: activeContract,
      tokenId: params.tokenId,
      index: 0n,
      retries: readConfig.retries,
      read
    });
  } catch (error) {
    firstChunkError = asError(error);
  }

  if (
    (!firstChunk || firstChunk.length === 0) &&
    params.fallbackContract &&
    !isSameRuntimeContract(activeContract, params.fallbackContract)
  ) {
    const fallbackMeta = await read.fetchMeta({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.fallbackContract,
      tokenId: params.tokenId
    });
    if (fallbackMeta) {
      activeContract = params.fallbackContract;
      activeMeta = fallbackMeta;
      try {
        firstChunk = await fetchRuntimeChunkWithRetry({
          env: params.env,
          apiBases: params.apiBases,
          contract: activeContract,
          tokenId: params.tokenId,
          index: 0n,
          retries: readConfig.retries,
          read
        });
      } catch (error) {
        firstChunkError = asError(error);
      }
    }
  }

  if (!firstChunk || firstChunk.length === 0) {
    throw firstChunkError || new Error('Inscription chunk 0 is missing.');
  }

  const expectedChunks = getExpectedChunkCount({
    declaredTotalChunks: activeMeta.totalChunks,
    totalSize: activeMeta.totalSize,
    firstChunkLength: firstChunk.length
  });

  if (expectedChunks > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Chunk count exceeds runtime limit.');
  }

  const expectedCountNumber = Number(expectedChunks);

  if (activeMeta.totalSize > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Inscription size exceeds runtime limit.');
  }
  const expectedBytes = Number(activeMeta.totalSize);

  return {
    contract: activeContract,
    meta: activeMeta,
    firstChunk,
    expectedCountNumber,
    expectedBytes,
    read
  };
};

export const resolveRuntimeContent = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
  resolvedMeta?: RuntimeResolvedMeta;
  read?: RuntimeContentReader;
}): Promise<RuntimeResolvedContent> => {
  const plan = await resolveRuntimeContentPlan(params);
  const chunks: Uint8Array[] = [plan.firstChunk];

  if (plan.expectedCountNumber > 1) {
    const remaining = await fetchRemainingRuntimeChunks({
      env: params.env,
      apiBases: params.apiBases,
      contract: plan.contract,
      tokenId: params.tokenId,
      totalCount: plan.expectedCountNumber,
      read: plan.read
    });
    chunks.push(...remaining);
  }

  let bytes = combineChunks(chunks);
  if (bytes.length < plan.expectedBytes) {
    throw new Error(
      `Reconstructed content is shorter than expected (${bytes.length}/${plan.expectedBytes}).`
    );
  }
  if (bytes.length > plan.expectedBytes) {
    bytes = bytes.slice(0, plan.expectedBytes);
  }

  return {
    contract: plan.contract,
    meta: plan.meta,
    bytes
  };
};

export const resolveRuntimeContentStream = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
  resolvedMeta?: RuntimeResolvedMeta;
  read?: RuntimeContentReader;
  onComplete?: (
    bytes: Uint8Array,
    context: RuntimeStreamCompleteContext
  ) => Promise<unknown> | unknown;
}) => {
  const plan = await resolveRuntimeContentPlan(params);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const completedChunks: Uint8Array[] = [];
        let emittedBytes = 0;
        const emitChunk = (chunk: Uint8Array) => {
          if (emittedBytes >= plan.expectedBytes) {
            return;
          }
          const remainingBytes = plan.expectedBytes - emittedBytes;
          const output =
            chunk.length > remainingBytes ? chunk.slice(0, remainingBytes) : chunk;
          if (output.length === 0) {
            return;
          }
          completedChunks.push(output);
          emittedBytes += output.length;
          controller.enqueue(output);
        };

        try {
          emitChunk(plan.firstChunk);
          if (plan.expectedCountNumber > 1) {
            await streamRemainingRuntimeChunks({
              env: params.env,
              apiBases: params.apiBases,
              contract: plan.contract,
              tokenId: params.tokenId,
              totalCount: plan.expectedCountNumber,
              read: plan.read,
              onChunk: emitChunk
            });
          }
          if (emittedBytes < plan.expectedBytes) {
            throw new Error(
              `Streamed content is shorter than expected (${emittedBytes}/${plan.expectedBytes}).`
            );
          }
          if (params.onComplete) {
            await params.onComplete(combineChunks(completedChunks), {
              contract: plan.contract,
              meta: plan.meta
            });
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      })();
    }
  });

  return {
    contract: plan.contract,
    meta: plan.meta,
    stream,
    contentLength: plan.expectedBytes,
    firstChunkLength: plan.firstChunk.length,
    expectedChunks: plan.expectedCountNumber
  };
};
