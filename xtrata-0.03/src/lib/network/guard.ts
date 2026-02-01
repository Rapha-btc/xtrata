import type { NetworkType } from './types';

const MAINNET_PREFIXES = ['SP', 'SM'];
const TESTNET_PREFIXES = ['ST', 'SN'];

export type NetworkMismatch = {
  expected: NetworkType;
  actual: NetworkType;
};

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
  contractNetwork: NetworkType,
  walletNetwork?: NetworkType | null
) => {
  if (!walletNetwork) {
    return false;
  }
  return contractNetwork === walletNetwork;
};

export const getNetworkMismatch = (
  contractNetwork: NetworkType,
  walletNetwork?: NetworkType | null
): NetworkMismatch | null => {
  if (!walletNetwork) {
    return null;
  }
  if (contractNetwork === walletNetwork) {
    return null;
  }
  return { expected: contractNetwork, actual: walletNetwork };
};
