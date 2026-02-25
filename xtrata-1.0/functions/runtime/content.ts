import { deserializeCV, serializeCV, uintCV } from '@stacks/transactions';
import { parseGetChunk, parseGetInscriptionMeta } from '../../src/lib/protocol/parsers';
import { applyHiroApiKey, getHiroApiKeys, shouldRetryWithNextHiroKey } from '../lib/hiro-keys';

type RuntimeEnv = Record<string, string | undefined>;

type NetworkType = 'mainnet' | 'testnet';

type ContractRef = {
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

const sanitizeBase = (value: string) => value.trim().replace(/\/+$/, '');

const dedupeBases = (values: string[]) => {
  const out: string[] = [];
  values.forEach((value) => {
    const normalized = sanitizeBase(value);
    if (!normalized) {
      return;
    }
    if (out.includes(normalized)) {
      return;
    }
    out.push(normalized);
  });
  return out;
};

const getApiBases = (network: NetworkType, env: RuntimeEnv) => {
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

const parseNetwork = (value: string | null): NetworkType => {
  const normalized = String(value || 'mainnet').trim().toLowerCase();
  return normalized === 'testnet' ? 'testnet' : 'mainnet';
};

const parseContractId = (value: string | null): ContractRef | null => {
  if (!value) {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot >= raw.length - 1) {
    return null;
  }
  const address = raw.slice(0, dot).trim();
  const contractName = raw.slice(dot + 1).trim();
  if (!address || !contractName) {
    return null;
  }
  return { address, contractName };
};

const parseTokenId = (value: string | null) => {
  if (!value || !/^\d+$/.test(value.trim())) {
    return null;
  }
  try {
    return BigInt(value.trim());
  } catch (error) {
    return null;
  }
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');

const encodeUintArg = (value: bigint) => `0x${bytesToHex(serializeCV(uintCV(value)))}`;

const asError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));

const isSameContract = (left: ContractRef, right: ContractRef) =>
  left.address === right.address && left.contractName === right.contractName;

const callReadOnly = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: ContractRef;
  functionName: string;
  functionArgs: string[];
  senderAddress: string;
}) => {
  const { env, apiBases } = params;
  const hiroKeys = getHiroApiKeys(env);
  let lastError: Error | null = null;

  for (let i = 0; i < apiBases.length; i += 1) {
    const base = apiBases[i];
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
          const cause = body && body.cause ? String(body.cause) : 'Invalid read-only response.';
          throw new Error(cause);
        }

        return deserializeCV(body.result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        break;
      }
    }
  }

  throw lastError || new Error('Read-only call failed.');
};

const fetchMeta = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: ContractRef;
  tokenId: bigint;
}) => {
  const value = await callReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-inscription-meta',
    functionArgs: [encodeUintArg(params.tokenId)],
    senderAddress: params.contract.address
  });
  return parseGetInscriptionMeta(value);
};

const fetchChunk = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  contract: ContractRef;
  tokenId: bigint;
  index: bigint;
}) => {
  const value = await callReadOnly({
    env: params.env,
    apiBases: params.apiBases,
    contract: params.contract,
    functionName: 'get-chunk',
    functionArgs: [encodeUintArg(params.tokenId), encodeUintArg(params.index)],
    senderAddress: params.contract.address
  });
  return parseGetChunk(value);
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
  chunks.forEach((chunk) => {
    combined.set(chunk, offset);
    offset += chunk.length;
  });
  return combined;
};

const resolveContent = async (params: {
  env: RuntimeEnv;
  apiBases: string[];
  tokenId: bigint;
  primaryContract: ContractRef;
  fallbackContract: ContractRef | null;
}) => {
  let primaryMeta = null;
  let primaryMetaError: Error | null = null;
  try {
    primaryMeta = await fetchMeta({
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
    !isSameContract(params.primaryContract, params.fallbackContract)
  ) {
    const fallbackMeta = await fetchMeta({
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
    firstChunk = await fetchChunk({
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
    !isSameContract(activeContract, params.fallbackContract)
  ) {
    const fallbackMeta = await fetchMeta({
      env: params.env,
      apiBases: params.apiBases,
      contract: params.fallbackContract,
      tokenId: params.tokenId
    });
    if (fallbackMeta) {
      activeContract = params.fallbackContract;
      activeMeta = fallbackMeta;
      try {
        firstChunk = await fetchChunk({
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
    const chunk = await fetchChunk({
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

  const bytes = combineChunks(chunks);
  return {
    contract: activeContract,
    meta: activeMeta,
    bytes
  };
};

export const onRequest = async (context: {
  request: Request;
  env: RuntimeEnv;
}) => {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return asJsonError(405, 'Method not allowed.');
  }

  const url = new URL(request.url);
  const contractId = parseContractId(url.searchParams.get('contractId'));
  const fallbackContractId = parseContractId(url.searchParams.get('fallbackContractId'));
  const tokenId = parseTokenId(url.searchParams.get('tokenId'));
  const network = parseNetwork(url.searchParams.get('network'));

  if (!contractId) {
    return asJsonError(400, 'Invalid contractId parameter.');
  }
  if (tokenId === null || tokenId < 0n) {
    return asJsonError(400, 'Invalid tokenId parameter.');
  }

  const apiBases = getApiBases(network, env);
  if (apiBases.length === 0) {
    return asJsonError(500, 'No API base URLs configured for runtime content.');
  }

  try {
    const resolved = await resolveContent({
      env,
      apiBases,
      tokenId,
      primaryContract: contractId,
      fallbackContract: fallbackContractId
    });

    return new Response(resolved.bytes, {
      status: 200,
      headers: {
        'Content-Type': resolved.meta.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'X-Xtrata-Runtime-Contract': `${resolved.contract.address}.${resolved.contract.contractName}`,
        'X-Xtrata-Runtime-Network': network
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return asJsonError(502, 'Failed to reconstruct runtime content.', detail);
  }
};
