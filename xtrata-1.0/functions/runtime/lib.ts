import { deserializeCV, serializeCV, uintCV } from '@stacks/transactions';
import {
  parseGetDependencies,
  parseGetChunk,
  parseGetInscriptionMeta,
  parseGetLastTokenId,
  parseGetTokenUri
} from '../../src/lib/protocol/parsers';
import { parseRuntimeModuleContractId } from '../../src/lib/viewer/module-paths';
import {
  applyHiroApiKey,
  getHiroApiKeys,
  shouldRetryWithNextHiroKey
} from '../lib/hiro-keys';

export type RuntimeEnv = Record<string, string | undefined>;

export type RuntimeNetworkType = 'mainnet' | 'testnet';

export type RuntimeContractRef = {
  address: string;
  contractName: string;
};

const CHUNK_FALLBACK_SIZE = 16384n;

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
  } catch (error) {
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
    params.firstChunkLength > 0
      ? BigInt(params.firstChunkLength)
      : CHUNK_FALLBACK_SIZE;
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

export const resolveRuntimeContent = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: RuntimeContractRef;
  fallbackContract: RuntimeContractRef | null;
}) => {
  let primaryMeta = null;
  let primaryMetaError: Error | null = null;
  try {
    primaryMeta = await fetchRuntimeMeta({
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
    const fallbackMeta = await fetchRuntimeMeta({
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

  let firstChunk: Uint8Array | null = null;
  let firstChunkError: Error | null = null;
  try {
    firstChunk = await fetchRuntimeChunk({
      env: params.env,
      apiBases: params.apiBases,
      contract: activeContract,
      tokenId: params.tokenId,
      index: 0n
    });
  } catch (error) {
    firstChunkError = asError(error);
  }

  if (
    (!firstChunk || firstChunk.length === 0) &&
    params.fallbackContract &&
    !isSameRuntimeContract(activeContract, params.fallbackContract)
  ) {
    const fallbackMeta = await fetchRuntimeMeta({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.fallbackContract,
      tokenId: params.tokenId
    });
    if (fallbackMeta) {
      activeContract = params.fallbackContract;
      activeMeta = fallbackMeta;
      try {
        firstChunk = await fetchRuntimeChunk({
          env: params.env,
          apiBases: params.apiBases,
          contract: activeContract,
          tokenId: params.tokenId,
          index: 0n
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

  const chunks: Uint8Array[] = [firstChunk];
  const expectedCountNumber = Number(expectedChunks);
  for (let index = 1; index < expectedCountNumber; index += 1) {
    const chunk = await fetchRuntimeChunk({
      env: params.env,
      apiBases: params.apiBases,
      contract: activeContract,
      tokenId: params.tokenId,
      index: BigInt(index)
    });
    if (!chunk || chunk.length === 0) {
      throw new Error(`Missing chunk ${index.toString()}.`);
    }
    chunks.push(chunk);
  }

  return {
    contract: activeContract,
    meta: activeMeta,
    bytes: combineChunks(chunks)
  };
};
