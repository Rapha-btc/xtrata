import { deserializeCV, listCV, serializeCV, uintCV } from '@stacks/transactions';
import {
  reconstructXtrataInscription,
  type ReconstructionDiagnostics,
  type ReconstructionSource
} from '../../packages/xtrata-reconstruction/src/index';
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
import { applyHiroApiKey, getHiroApiKeys, shouldRetryWithNextHiroKey } from '../lib/hiro-keys';

export type RuntimeEnv = Record<string, unknown>;

export type RuntimeNetworkType = 'mainnet' | 'testnet';

export type RuntimeContractRef = {
  address: string;
  contractName: string;
};

const CHUNK_FALLBACK_SIZE = 16384n;
const RUNTIME_MAX_READ_BATCH_SIZE = 30;
const DEFAULT_RUNTIME_READ_BATCH_SIZE = RUNTIME_MAX_READ_BATCH_SIZE;
const DEFAULT_RUNTIME_CHUNK_CONCURRENCY = 4;
const DEFAULT_RUNTIME_CHUNK_RETRIES = 2;

const MAINNET_BASES = ['https://api.mainnet.hiro.so', 'https://stacks-node-api.mainnet.stacks.co'];

const TESTNET_BASES = ['https://api.testnet.hiro.so', 'https://stacks-node-api.testnet.stacks.co'];

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

const asError = (value: unknown) => (value instanceof Error ? value : new Error(String(value)));

export type RuntimeUpstreamRequestTracker = {
  attempts: number;
};

export const createRuntimeUpstreamRequestTracker = (): RuntimeUpstreamRequestTracker => ({
  attempts: 0
});

export const isCloudflareSubrequestQuotaError = (error: unknown) => {
  const message = asError(error).message.toLowerCase();
  return (
    (message.includes('subrequest') &&
      (message.includes('too many') ||
        message.includes('limit') ||
        message.includes('quota') ||
        message.includes('exceed'))) ||
    message.includes('worker exceeded resource limits')
  );
};

export const parseRuntimeNetwork = (value: string | null) => {
  const normalized = String(value || 'mainnet')
    .trim()
    .toLowerCase();
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

export const getRuntimeApiBases = (network: RuntimeNetworkType, env: RuntimeEnv) => {
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

export const isSameRuntimeContract = (left: RuntimeContractRef, right: RuntimeContractRef) =>
  left.address === right.address && left.contractName === right.contractName;

export const callRuntimeReadOnly = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  functionName: string;
  functionArgs: string[];
  senderAddress: string;
  upstreamTracker?: RuntimeUpstreamRequestTracker;
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
    const keyCandidates = base.includes('hiro.so') && hiroKeys.length > 0 ? hiroKeys : [null];

    for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex += 1) {
      const keyCandidate = keyCandidates[keyIndex];
      const hasNextKey = keyIndex < keyCandidates.length - 1;
      try {
        const headers = new Headers({
          'Content-Type': 'application/json'
        });
        applyHiroApiKey(headers, keyCandidate);

        if (params.upstreamTracker) {
          params.upstreamTracker.attempts += 1;
        }
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
          const cause = body && body.cause ? String(body.cause) : 'Invalid read-only response.';
          throw new Error(cause);
        }

        return deserializeCV(body.result);
      } catch (error) {
        lastError = asError(error);
        if (isCloudflareSubrequestQuotaError(error)) {
          throw lastError;
        }
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
  upstreamTracker?: RuntimeUpstreamRequestTracker;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-inscription-meta',
    functionArgs: [encodeUintArg(params.tokenId)],
    senderAddress: params.contract.address,
    upstreamTracker: params.upstreamTracker
  });
  return parseGetInscriptionMeta(value);
};

export const fetchRuntimeChunk = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  index: bigint;
  upstreamTracker?: RuntimeUpstreamRequestTracker;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-chunk',
    functionArgs: [encodeUintArg(params.tokenId), encodeUintArg(params.index)],
    senderAddress: params.contract.address,
    upstreamTracker: params.upstreamTracker
  });
  return parseGetChunk(value);
};

export const fetchRuntimeChunkBatch = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  indexes: bigint[];
  upstreamTracker?: RuntimeUpstreamRequestTracker;
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
    senderAddress: params.contract.address,
    upstreamTracker: params.upstreamTracker
  });
  return parseGetChunkBatch(value);
};

export const fetchRuntimeLastTokenId = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  upstreamTracker?: RuntimeUpstreamRequestTracker;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-last-token-id',
    functionArgs: [],
    senderAddress: params.contract.address,
    upstreamTracker: params.upstreamTracker
  });
  return parseGetLastTokenId(value);
};

export const fetchRuntimeTokenUri = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  upstreamTracker?: RuntimeUpstreamRequestTracker;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-token-uri',
    functionArgs: [encodeUintArg(params.tokenId)],
    senderAddress: params.contract.address,
    upstreamTracker: params.upstreamTracker
  });
  return parseGetTokenUri(value);
};

export const fetchRuntimeDependencies = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  upstreamTracker?: RuntimeUpstreamRequestTracker;
}) => {
  const value = await callRuntimeReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-dependencies',
    functionArgs: [encodeUintArg(params.tokenId)],
    senderAddress: params.contract.address,
    upstreamTracker: params.upstreamTracker
  });
  return parseGetDependencies(value);
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
    RUNTIME_MAX_READ_BATCH_SIZE
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

const formatRuntimeContractId = (contract: RuntimeContractRef) =>
  `${contract.address}.${contract.contractName}`;

export type RuntimeResolvedMeta = {
  contract: RuntimeContractRef;
  meta: InscriptionMeta;
};

export type RuntimeReconstructionDiagnostics = ReconstructionDiagnostics & {
  upstreamRequests: number;
};

export const syncRuntimeUpstreamRequests = (
  diagnostics: ReconstructionDiagnostics,
  upstreamTracker: RuntimeUpstreamRequestTracker
) => {
  const runtimeDiagnostics = diagnostics as RuntimeReconstructionDiagnostics;
  runtimeDiagnostics.upstreamRequests = upstreamTracker.attempts;
  return runtimeDiagnostics;
};

const attachRuntimeDiagnosticsToError = (
  error: unknown,
  diagnostics: RuntimeReconstructionDiagnostics
) => {
  if (error && typeof error === 'object') {
    (error as { diagnostics?: RuntimeReconstructionDiagnostics }).diagnostics = diagnostics;
  }
};

export type RuntimeResolvedContent = {
  contract: RuntimeContractRef;
  meta: InscriptionMeta;
  bytes: Uint8Array;
  diagnostics: RuntimeReconstructionDiagnostics;
};

export type RuntimeStreamCompleteContext = {
  contract: RuntimeContractRef;
  meta: InscriptionMeta;
  diagnostics: RuntimeReconstructionDiagnostics;
};

export type RuntimeContentReader = {
  fetchMeta?: typeof fetchRuntimeMeta;
  fetchChunk?: typeof fetchRuntimeChunk;
  fetchChunkBatch?: typeof fetchRuntimeChunkBatch;
};

type ResolvedRuntimeContentReader = Required<RuntimeContentReader>;

const getRuntimeContentReader = (reader?: RuntimeContentReader): ResolvedRuntimeContentReader => ({
  fetchMeta: reader?.fetchMeta ?? fetchRuntimeMeta,
  fetchChunk: reader?.fetchChunk ?? fetchRuntimeChunk,
  fetchChunkBatch: reader?.fetchChunkBatch ?? fetchRuntimeChunkBatch
});

const buildRuntimeReconstructionSource = (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  read: ResolvedRuntimeContentReader;
  retries: number;
  upstreamTracker: RuntimeUpstreamRequestTracker;
  metaOverride?: InscriptionMeta | null;
  metaBySourceId?: Map<string, InscriptionMeta>;
}): ReconstructionSource => ({
  sourceId: formatRuntimeContractId(params.contract),
  readers: {
    getInscriptionMeta: async (tokenId) => {
      const meta =
        params.metaOverride ??
        (await params.read.fetchMeta({
          env: params.env,
          apiBases: params.apiBases,
          contract: params.contract,
          tokenId,
          upstreamTracker: params.upstreamTracker
        }));
      if (meta) {
        params.metaBySourceId?.set(formatRuntimeContractId(params.contract), meta);
      }
      return meta;
    },
    getChunk: (tokenId, index) =>
      fetchRuntimeChunkWithRetry({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.contract,
        tokenId,
        index,
        retries: params.retries,
        upstreamTracker: params.upstreamTracker,
        read: params.read
      }),
    getChunkBatch: async (tokenId, indexes) => {
      const entries = await fetchRuntimeChunkBatchWithRetry({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.contract,
        tokenId,
        indexes,
        retries: params.retries,
        upstreamTracker: params.upstreamTracker,
        read: params.read
      });
      return entries.map((entry) => entry.chunk);
    },
    getDependencies: async () => []
  }
});

const buildRuntimeReconstructionSources = (params: {
  env: RuntimeEnv;
  apiBases: string[];
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
  read: ResolvedRuntimeContentReader;
  retries: number;
  upstreamTracker: RuntimeUpstreamRequestTracker;
  resolvedMeta?: RuntimeResolvedMeta;
  metaBySourceId?: Map<string, InscriptionMeta>;
}) => {
  const getMetaOverride = (contract: RuntimeContractRef) =>
    params.resolvedMeta && isSameRuntimeContract(params.resolvedMeta.contract, contract)
      ? params.resolvedMeta.meta
      : null;
  const sources = [
    buildRuntimeReconstructionSource({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.primaryContract,
      read: params.read,
      retries: params.retries,
      upstreamTracker: params.upstreamTracker,
      metaOverride: getMetaOverride(params.primaryContract),
      metaBySourceId: params.metaBySourceId
    })
  ];
  if (
    params.fallbackContract &&
    !isSameRuntimeContract(params.primaryContract, params.fallbackContract)
  ) {
    sources.push(
      buildRuntimeReconstructionSource({
        env: params.env,
        apiBases: params.apiBases,
        contract: params.fallbackContract,
        read: params.read,
        retries: params.retries,
        upstreamTracker: params.upstreamTracker,
        metaOverride: getMetaOverride(params.fallbackContract),
        metaBySourceId: params.metaBySourceId
      })
    );
  }
  return sources;
};

const parseRuntimeContractId = (sourceId: string | null): RuntimeContractRef | null => {
  if (!sourceId) {
    return null;
  }
  return parseRuntimeContractRef(sourceId);
};

const fetchRuntimeChunkWithRetry = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: RuntimeContractRef;
  tokenId: bigint;
  index: bigint;
  retries: number;
  upstreamTracker: RuntimeUpstreamRequestTracker;
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
      if (isCloudflareSubrequestQuotaError(error)) {
        throw lastError;
      }
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
  upstreamTracker: RuntimeUpstreamRequestTracker;
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
      if (isCloudflareSubrequestQuotaError(error)) {
        throw lastError;
      }
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

export const resolveRuntimeMeta = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
  upstreamTracker?: RuntimeUpstreamRequestTracker;
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
      tokenId: params.tokenId,
      upstreamTracker: params.upstreamTracker
    });
  } catch (error) {
    primaryMetaError = asError(error);
    if (isCloudflareSubrequestQuotaError(error)) {
      throw primaryMetaError;
    }
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
      tokenId: params.tokenId,
      upstreamTracker: params.upstreamTracker
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

export const resolveRuntimeContent = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
  resolvedMeta?: RuntimeResolvedMeta;
  upstreamTracker?: RuntimeUpstreamRequestTracker;
  read?: RuntimeContentReader;
}): Promise<RuntimeResolvedContent> => {
  const read = getRuntimeContentReader(params.read);
  const readConfig = getRuntimeReadConfig(params.env);
  const upstreamTracker = params.upstreamTracker ?? createRuntimeUpstreamRequestTracker();
  const metaBySourceId = new Map<string, InscriptionMeta>();
  if (params.resolvedMeta) {
    metaBySourceId.set(
      formatRuntimeContractId(params.resolvedMeta.contract),
      params.resolvedMeta.meta
    );
  }
  const sources = buildRuntimeReconstructionSources({
    env: params.env,
    apiBases: params.apiBases,
    primaryContract: params.primaryContract,
    fallbackContract: params.fallbackContract,
    read,
    retries: readConfig.retries,
    upstreamTracker,
    resolvedMeta: params.resolvedMeta,
    metaBySourceId
  });

  let result: Awaited<ReturnType<typeof reconstructXtrataInscription>>;
  try {
    result = await reconstructXtrataInscription({
      tokenId: params.tokenId,
      sources,
      strict: true,
      batchSize: readConfig.batchSize,
      concurrency: readConfig.concurrency,
      isTerminalReadError: isCloudflareSubrequestQuotaError,
      maxNodes: 1
    });
  } catch (error) {
    const diagnostics = (error as { diagnostics?: ReconstructionDiagnostics }).diagnostics;
    if (diagnostics) {
      attachRuntimeDiagnosticsToError(error, syncRuntimeUpstreamRequests(diagnostics, upstreamTracker));
    }
    throw error;
  }
  const diagnostics = syncRuntimeUpstreamRequests(result.diagnostics, upstreamTracker);

  const metaSourceId = diagnostics.metaSourceId;
  const meta = metaSourceId ? metaBySourceId.get(metaSourceId) : null;
  if (!meta) {
    throw new Error('Reconstruction metadata was not retained by runtime reader.');
  }
  const contract =
    parseRuntimeContractId(diagnostics.chunkSourceId) ??
    parseRuntimeContractId(diagnostics.metaSourceId) ??
    params.resolvedMeta?.contract ??
    params.primaryContract;

  return {
    contract,
    meta,
    bytes: result.bytes,
    diagnostics
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
  const resolved = await resolveRuntimeContent(params);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          controller.enqueue(resolved.bytes);
          if (params.onComplete) {
            await params.onComplete(resolved.bytes, {
              contract: resolved.contract,
              meta: resolved.meta,
              diagnostics: resolved.diagnostics
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
    contract: resolved.contract,
    meta: resolved.meta,
    stream,
    contentLength: resolved.bytes.length,
    firstChunkLength: Math.min(resolved.bytes.length, Number(CHUNK_FALLBACK_SIZE)),
    expectedChunks: Number(resolved.meta.totalChunks),
    diagnostics: resolved.diagnostics
  };
};
