import type { NetworkType } from './types';

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

const getEnvOverride = (network: NetworkType) => {
  const env = import.meta.env;
  return network === 'mainnet'
    ? env.VITE_STACKS_API_MAINNET
    : env.VITE_STACKS_API_TESTNET;
};

const getProxyBase = (network: NetworkType) => `/hiro/${network}`;

const normalizeOverride = (override: string) => {
  if (override.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${override}`;
  }
  return override;
};

export const getApiBaseUrl = (network: NetworkType) => {
  return getApiBaseUrls(network)[0];
};

export const getApiBaseUrls = (network: NetworkType) => {
  const override = getEnvOverride(network);
  if (override) {
    return [normalizeOverride(override)];
  }
  if (import.meta.env.DEV) {
    return [getProxyBase(network)];
  }
  const bases = DEFAULT_API_BASES[network];
  if (typeof window !== 'undefined') {
    const proxyBase = `${window.location.origin}${getProxyBase(network)}`;
    return [proxyBase, ...bases.filter((base) => !base.includes('hiro.so'))];
  }
  return bases;
};
