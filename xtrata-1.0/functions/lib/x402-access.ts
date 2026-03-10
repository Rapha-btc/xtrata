import {
  deserializeCV,
  principalCV,
  serializeCV,
  uintCV,
  validateStacksAddress,
  type ClarityValue
} from '@stacks/transactions';
import { parseHasEntitlement } from '../../src/lib/commerce/parsers';
import { parseGetVault, parseHasPremiumAccess } from '../../src/lib/vault/parsers';
import { applyHiroApiKey, getHiroApiKeys, shouldRetryWithNextHiroKey } from './hiro-keys';
import {
  getX402ContractId,
  type X402AccessGrantMode,
  type X402ContractRef,
  type X402Network,
  type X402PremiumRouteConfig
} from './x402-config';

type RuntimeEnv = Record<string, string | undefined>;

type X402TxState = {
  status: 'pending' | 'success' | 'failed';
  rawStatus: string;
};

export type X402AccessResolution = {
  unlocked: boolean;
  mode: X402AccessGrantMode | null;
  verifiedAt: number;
  txState: X402TxState | null;
};

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
  const deduped: string[] = [];
  values.forEach((value) => {
    const normalized = sanitizeBase(value);
    if (!normalized || deduped.includes(normalized)) {
      return;
    }
    deduped.push(normalized);
  });
  return deduped;
};

const getApiBases = (network: X402Network, env: RuntimeEnv) => {
  const configured =
    network === 'mainnet'
      ? [
          env.HIRO_API_BASE_MAINNET,
          env.VITE_STACKS_API_MAINNET,
          env.VITE_HIRO_API_MAINNET
        ]
      : [
          env.HIRO_API_BASE_TESTNET,
          env.VITE_STACKS_API_TESTNET,
          env.VITE_HIRO_API_TESTNET
        ];
  return dedupeBases(
    configured
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .concat(network === 'mainnet' ? MAINNET_BASES : TESTNET_BASES)
  );
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');

const encodeArg = (value: ClarityValue) => `0x${bytesToHex(serializeCV(value))}`;

const normalizeAddress = (value: string) => value.trim().toUpperCase();

export const normalizeX402TxId = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(normalized) ? normalized.toLowerCase() : null;
};

export const isValidX402Address = (value: string | null | undefined) =>
  typeof value === 'string' && validateStacksAddress(value.trim());

const callReadOnly = async (params: {
  env: RuntimeEnv;
  contract: X402ContractRef;
  functionName: string;
  functionArgs: ClarityValue[];
  senderAddress?: string;
}) => {
  const apiBases = getApiBases(params.contract.network, params.env);
  const hiroKeys = getHiroApiKeys(params.env);
  let lastError: Error | null = null;

  for (const base of apiBases) {
    const endpoint =
      `${base}/v2/contracts/call-read/` +
      `${params.contract.address}/` +
      `${params.contract.contractName}/` +
      `${params.functionName}`;
    const keyCandidates = base.includes('hiro.so') && hiroKeys.length > 0 ? hiroKeys : [null];

    for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex += 1) {
      const apiKey = keyCandidates[keyIndex];
      const hasNextKey = keyIndex < keyCandidates.length - 1;
      try {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        applyHiroApiKey(headers, apiKey);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sender: params.senderAddress ?? params.contract.address,
            arguments: params.functionArgs.map(encodeArg)
          })
        });

        if (!response.ok) {
          lastError = new Error(`Read-only call failed with HTTP ${response.status}.`);
          if (hasNextKey && shouldRetryWithNextHiroKey(response.status)) {
            continue;
          }
          break;
        }

        const body = await response.json();
        if (!body || body.okay !== true || typeof body.result !== 'string') {
          const cause = body && typeof body.cause === 'string' ? body.cause : 'Invalid read-only response.';
          throw new Error(cause);
        }

        return deserializeCV(body.result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        break;
      }
    }
  }

  throw lastError ?? new Error('Read-only call failed.');
};

const fetchTxState = async (params: {
  env: RuntimeEnv;
  network: X402Network;
  txId: string;
}): Promise<X402TxState> => {
  const apiBases = getApiBases(params.network, params.env);
  const hiroKeys = getHiroApiKeys(params.env);
  let lastError: Error | null = null;

  for (const base of apiBases) {
    const endpoint = `${base}/extended/v1/tx/${params.txId}`;
    const keyCandidates = base.includes('hiro.so') && hiroKeys.length > 0 ? hiroKeys : [null];

    for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex += 1) {
      const apiKey = keyCandidates[keyIndex];
      const hasNextKey = keyIndex < keyCandidates.length - 1;
      try {
        const headers = new Headers();
        applyHiroApiKey(headers, apiKey);
        const response = await fetch(endpoint, { headers });
        if (response.status === 404) {
          return {
            status: 'pending',
            rawStatus: 'not_found'
          };
        }
        if (!response.ok) {
          lastError = new Error(`Transaction lookup failed with HTTP ${response.status}.`);
          if (hasNextKey && shouldRetryWithNextHiroKey(response.status)) {
            continue;
          }
          break;
        }

        const body = await response.json();
        const rawStatus =
          body && typeof body.tx_status === 'string' ? body.tx_status : 'unknown';
        const normalized = rawStatus.toLowerCase();
        if (normalized.startsWith('pending')) {
          return { status: 'pending', rawStatus };
        }
        if (normalized === 'success') {
          return { status: 'success', rawStatus };
        }
        return { status: 'failed', rawStatus };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        break;
      }
    }
  }

  throw lastError ?? new Error('Transaction lookup failed.');
};

const hasCommerceAccess = async (
  env: RuntimeEnv,
  route: X402PremiumRouteConfig,
  address: string
) => {
  if (!route.commerce) {
    return false;
  }
  const value = await callReadOnly({
    env,
    contract: route.commerce.contract,
    functionName: 'has-entitlement',
    functionArgs: [uintCV(route.assetId), principalCV(address)]
  });
  return parseHasEntitlement(value);
};

const hasVaultAccess = async (
  env: RuntimeEnv,
  route: X402PremiumRouteConfig,
  address: string
) => {
  if (!route.vault) {
    return false;
  }
  const accessValue = await callReadOnly({
    env,
    contract: route.vault.contract,
    functionName: 'has-premium-access',
    functionArgs: [uintCV(route.vault.assetId), principalCV(address)]
  });
  const unlocked = parseHasPremiumAccess(accessValue);
  if (!unlocked) {
    return false;
  }
  if (route.vault.minimumTier <= 1n) {
    return true;
  }
  if (route.vault.vaultId === undefined) {
    return false;
  }
  const vaultValue = await callReadOnly({
    env,
    contract: route.vault.contract,
    functionName: 'get-vault',
    functionArgs: [uintCV(route.vault.vaultId)]
  });
  const vault = parseGetVault(vaultValue);
  if (!vault) {
    return false;
  }
  return (
    vault.assetId === route.vault.assetId &&
    normalizeAddress(vault.owner) === normalizeAddress(address) &&
    vault.tier >= route.vault.minimumTier
  );
};

export const resolveX402Access = async (params: {
  env: RuntimeEnv;
  route: X402PremiumRouteConfig;
  address: string;
  txId?: string | null;
}): Promise<X402AccessResolution> => {
  const verifiedAt = Date.now();
  const txId = normalizeX402TxId(params.txId ?? null);
  let txState: X402TxState | null = null;

  if (txId) {
    txState = await fetchTxState({
      env: params.env,
      network: params.route.contract.network,
      txId
    });
    if (txState.status === 'pending' || txState.status === 'failed') {
      return {
        unlocked: false,
        mode: null,
        verifiedAt,
        txState
      };
    }
  }

  if (
    (params.route.accessMode === 'commerce' || params.route.accessMode === 'either') &&
    (await hasCommerceAccess(params.env, params.route, params.address))
  ) {
    return {
      unlocked: true,
      mode: 'commerce',
      verifiedAt,
      txState
    };
  }

  if (
    (params.route.accessMode === 'vault' || params.route.accessMode === 'either') &&
    (await hasVaultAccess(params.env, params.route, params.address))
  ) {
    return {
      unlocked: true,
      mode: 'vault',
      verifiedAt,
      txState
    };
  }

  return {
    unlocked: false,
    mode: params.route.accessMode === 'either' ? null : params.route.accessMode,
    verifiedAt,
    txState
  };
};

export const buildX402PaymentRequiredPayload = (route: X402PremiumRouteConfig) => {
  const payload: Record<string, unknown> = {
    error: 'payment_required',
    slug: route.slug,
    title: route.title,
    assetId: route.assetId.toString(),
    accessMode: route.accessMode,
    sessionUrl: '/demo/x402/session',
    statusUrl: `/demo/x402/status?slug=${encodeURIComponent(route.slug)}`,
    premiumUrl: `/demo/premium/${encodeURIComponent(route.slug)}`,
    message: 'Unlock on-chain access and then request a short-lived premium session.'
  };

  if (route.commerce) {
    payload.commerce = {
      contractId: getX402ContractId(route.commerce.contract),
      listingId: route.commerce.listingId.toString(),
      assetId: route.assetId.toString(),
      price: {
        amount: route.commerce.price.toString(),
        symbol: route.commerce.symbol,
        decimals: route.commerce.decimals
      }
    };
  }

  if (route.vault) {
    payload.vault = {
      contractId: getX402ContractId(route.vault.contract),
      assetId: route.vault.assetId.toString(),
      minimumTier: route.vault.minimumTier.toString(),
      vaultId: route.vault.vaultId?.toString() ?? null
    };
  }

  return payload;
};
