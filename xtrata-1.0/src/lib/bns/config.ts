import type { NetworkType } from '../network/types';

const DEFAULT_EXPLORER_BASE = 'https://explorer.hiro.so';

const getEnvOverride = (network: NetworkType) => {
  const env = import.meta.env;
  if (network === 'testnet') {
    return env.VITE_STACKS_EXPLORER_BASE_TESTNET || env.VITE_STACKS_EXPLORER_BASE;
  }
  return env.VITE_STACKS_EXPLORER_BASE_MAINNET || env.VITE_STACKS_EXPLORER_BASE;
};

const getProxyBase = () => '/explorer';

const normalizeOverride = (override: string) => {
  if (override.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${override}`;
  }
  return override;
};

export const getExplorerHtmlBaseUrls = (network: NetworkType) => {
  const override = getEnvOverride(network);
  if (override) {
    return [normalizeOverride(override)];
  }
  if (import.meta.env.DEV) {
    return [getProxyBase()];
  }
  if (typeof window !== 'undefined') {
    return [`${window.location.origin}${getProxyBase()}`];
  }
  return [DEFAULT_EXPLORER_BASE];
};
