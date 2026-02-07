import type { NetworkType } from '../network/types';

const DEFAULT_BNS_BASES: Record<NetworkType, string[]> = {
  mainnet: ['https://api.bns.xyz'],
  testnet: []
};

const getEnvOverride = (network: NetworkType) => {
  const env = import.meta.env;
  if (network === 'mainnet') {
    return env.VITE_BNS_API_MAINNET || env.VITE_BNS_API_BASE;
  }
  return env.VITE_BNS_API_TESTNET || env.VITE_BNS_API_BASE;
};

const getProxyBase = () => '/bns';

const normalizeOverride = (override: string) => {
  if (override.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${override}`;
  }
  return override;
};

export const getBnsHubBaseUrls = (network: NetworkType) => {
  const override = getEnvOverride(network);
  if (override) {
    return [normalizeOverride(override)];
  }
  const defaults = DEFAULT_BNS_BASES[network];
  if (defaults.length === 0) {
    return [];
  }
  if (import.meta.env.DEV) {
    return [getProxyBase()];
  }
  if (typeof window !== 'undefined') {
    return [
      `${window.location.origin}${getProxyBase()}`,
      ...defaults
    ];
  }
  return defaults;
};
