import { StacksMainnet, StacksTestnet } from '@stacks/network';
import type { StacksNetwork } from '@stacks/network';
import type { NetworkType } from './types.js';

export const NETWORKS: NetworkType[] = ['mainnet', 'testnet'];

const MAINNET_PREFIXES = ['SP', 'SM'];
const TESTNET_PREFIXES = ['ST', 'SN'];

export type NetworkMismatch = {
  expected: NetworkType;
  actual: NetworkType;
};

const DEFAULT_API_BASES: Record<NetworkType, string[]> = {
  mainnet: [
    'https://stacks-node-api.mainnet.stacks.co',
    'https://api.mainnet.hiro.so'
  ],
  testnet: [
    'https://stacks-node-api.testnet.stacks.co',
    'https://api.testnet.hiro.so'
  ]
};

export const isNetworkType = (value: string): value is NetworkType =>
  value === 'mainnet' || value === 'testnet';

export const getNetworkFromAddress = (principal: string): NetworkType | null => {
  const [address] = principal.split('.');
  if (!address || address.length < 2) {
    return null;
  }
  const prefix = address.slice(0, 2).toUpperCase();
  if (MAINNET_PREFIXES.includes(prefix)) {
    return 'mainnet';
  }
  if (TESTNET_PREFIXES.includes(prefix)) {
    return 'testnet';
  }
  return null;
};

export const isNetworkMatch = (
  expected: NetworkType,
  actual?: NetworkType | null
) => {
  if (!actual) {
    return false;
  }
  return expected === actual;
};

export const getNetworkMismatch = (
  expected: NetworkType,
  actual?: NetworkType | null
): NetworkMismatch | null => {
  if (!actual || expected === actual) {
    return null;
  }
  return { expected, actual };
};

const getProxyBase = (network: NetworkType) => `/hiro/${network}`;

const normalizeOverride = (override: string) => {
  if (override.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${override}`;
  }
  return override;
};

const getRuntimeEnv = (): Record<string, string | boolean | undefined> => {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  }).env;
  return env ?? {};
};

const getEnvOverride = (network: NetworkType) => {
  const env = getRuntimeEnv();
  return network === 'mainnet'
    ? (env.VITE_STACKS_API_MAINNET as string | undefined)
    : (env.VITE_STACKS_API_TESTNET as string | undefined);
};

export const getApiBaseUrls = (network: NetworkType) => {
  const override = getEnvOverride(network);
  if (override) {
    return [normalizeOverride(override)];
  }
  const env = getRuntimeEnv();
  if (env.DEV) {
    return [getProxyBase(network)];
  }
  const bases = DEFAULT_API_BASES[network];
  if (typeof window !== 'undefined') {
    const proxyBase = `${window.location.origin}${getProxyBase(network)}`;
    return [proxyBase, ...bases.filter((base) => !base.includes('hiro.so'))];
  }
  return bases;
};

export const getApiBaseUrl = (network: NetworkType) => getApiBaseUrls(network)[0];

export const toStacksNetwork = (
  network: NetworkType,
  apiBaseUrl?: string
): StacksNetwork => {
  const url = apiBaseUrl ?? getApiBaseUrl(network);
  return network === 'mainnet'
    ? new StacksMainnet({ url })
    : new StacksTestnet({ url });
};
