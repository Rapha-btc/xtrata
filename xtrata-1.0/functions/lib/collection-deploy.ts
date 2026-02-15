import { queryAll, type Env } from './db';

type CollectionRow = Record<string, unknown>;

type QueryResult = {
  results?: Array<Record<string, unknown>>;
};

type HiroTxResponse = {
  tx_status?: unknown;
};

export type CollectionDeployReadiness = {
  ready: boolean;
  reason: string;
  collection: CollectionRow | null;
  metadata: Record<string, unknown> | null;
  deployTxId: string | null;
  deployTxStatus: string | null;
  network: 'mainnet' | 'testnet' | null;
};

type ReadinessParams = {
  env: Env;
  collectionId: string;
  fetcher?: typeof fetch;
  queryAllImpl?: (
    env: Env,
    query: string,
    binds?: Array<unknown>
  ) => Promise<QueryResult>;
};

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseMetadata = (value: unknown) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const normalizeTxId = (value: string) =>
  value.startsWith('0x') ? value : `0x${value}`;

const inferNetworkFromPrincipal = (value?: string | null): 'mainnet' | 'testnet' | null => {
  if (!value) {
    return null;
  }
  const principal = value.split('.')[0]?.trim().toUpperCase() ?? '';
  if (principal.startsWith('SP') || principal.startsWith('SM')) {
    return 'mainnet';
  }
  if (principal.startsWith('ST') || principal.startsWith('SN')) {
    return 'testnet';
  }
  return null;
};

const resolveNetworkOrder = (params: {
  contractAddress?: string | null;
  coreContractId?: string | null;
}) => {
  const inferredFromCore = inferNetworkFromPrincipal(params.coreContractId);
  const inferredFromAddress = inferNetworkFromPrincipal(params.contractAddress);
  const inferred = inferredFromCore ?? inferredFromAddress;
  if (inferred === 'testnet') {
    return ['testnet', 'mainnet'] as const;
  }
  return ['mainnet', 'testnet'] as const;
};

const hiroBaseByNetwork = (network: 'mainnet' | 'testnet') =>
  network === 'testnet'
    ? 'https://api.testnet.hiro.so'
    : 'https://api.mainnet.hiro.so';

export async function getCollectionDeployReadiness(
  params: ReadinessParams
): Promise<CollectionDeployReadiness> {
  const fetcher = params.fetcher ?? fetch;
  const queryAllImpl = params.queryAllImpl ?? queryAll;
  const collectionId = params.collectionId.trim();
  if (!collectionId) {
    return {
      ready: false,
      reason: 'Collection id missing.',
      collection: null,
      metadata: null,
      deployTxId: null,
      deployTxStatus: null,
      network: null
    };
  }

  const collectionResult = await queryAllImpl(
    params.env,
    'SELECT * FROM collections WHERE id = ?',
    [collectionId]
  );
  const collection = (collectionResult.results?.[0] as CollectionRow | undefined) ?? null;

  if (!collection) {
    return {
      ready: false,
      reason: 'Collection not found.',
      collection: null,
      metadata: null,
      deployTxId: null,
      deployTxStatus: null,
      network: null
    };
  }

  const contractAddress = toNullableString(collection.contract_address);
  if (!contractAddress) {
    return {
      ready: false,
      reason: 'Deploy the collection contract before uploading artwork.',
      collection,
      metadata: parseMetadata(collection.metadata),
      deployTxId: null,
      deployTxStatus: null,
      network: null
    };
  }

  const metadata = parseMetadata(collection.metadata);
  const deployTxId = toNullableString(metadata?.deployTxId);
  if (!deployTxId) {
    return {
      ready: false,
      reason:
        'Deployment transaction is not recorded yet. Retry deployment and wait for wallet submission.',
      collection,
      metadata,
      deployTxId: null,
      deployTxStatus: null,
      network: null
    };
  }

  const networkOrder = resolveNetworkOrder({
    contractAddress,
    coreContractId: toNullableString(metadata?.coreContractId)
  });
  const apiKey = toNullableString(params.env.HIRO_API_KEY) ?? toNullableString(params.env.VITE_HIRO_API_KEY);
  const txId = normalizeTxId(deployTxId);

  for (const network of networkOrder) {
    const url = `${hiroBaseByNetwork(network)}/extended/v1/tx/${txId}`;
    const headers = new Headers();
    if (apiKey) {
      headers.set('x-hiro-api-key', apiKey);
      headers.set('x-api-key', apiKey);
    }

    const response = await fetcher(url, { headers });
    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      return {
        ready: false,
        reason: `Unable to verify deployment on Hiro (${response.status}). Try again shortly.`,
        collection,
        metadata,
        deployTxId: txId,
        deployTxStatus: null,
        network
      };
    }

    const payload = (await response.json()) as HiroTxResponse;
    const txStatus = toNullableString(payload.tx_status);
    if (!txStatus) {
      return {
        ready: false,
        reason: 'Deployment status is unavailable from Hiro. Try again shortly.',
        collection,
        metadata,
        deployTxId: txId,
        deployTxStatus: null,
        network
      };
    }

    if (txStatus === 'success') {
      return {
        ready: true,
        reason: 'Deployment confirmed.',
        collection,
        metadata,
        deployTxId: txId,
        deployTxStatus: txStatus,
        network
      };
    }

    return {
      ready: false,
      reason: `Deployment transaction status is "${txStatus}". Upload unlocks after success.`,
      collection,
      metadata,
      deployTxId: txId,
      deployTxStatus: txStatus,
      network
    };
  }

  return {
    ready: false,
    reason: 'Deployment transaction is not indexed yet. Wait for confirmation, then retry.',
    collection,
    metadata,
    deployTxId: txId,
    deployTxStatus: null,
    network: networkOrder[0]
  };
}
