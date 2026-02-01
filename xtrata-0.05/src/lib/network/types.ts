export type NetworkType = 'mainnet' | 'testnet';

export const NETWORKS: NetworkType[] = ['mainnet', 'testnet'];

export const isNetworkType = (value: string): value is NetworkType =>
  value === 'mainnet' || value === 'testnet';
