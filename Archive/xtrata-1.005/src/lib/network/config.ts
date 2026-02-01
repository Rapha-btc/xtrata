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

export const getApiBaseUrl = (network: NetworkType) => {
  return getApiBaseUrls(network)[0];
};

export const getApiBaseUrls = (network: NetworkType) => {
  const override = getEnvOverride(network);
  if (override) {
    return [override];
  }
  if (import.meta.env.DEV) {
    return [getProxyBase(network)];
  }
  return DEFAULT_API_BASES[network];
};
