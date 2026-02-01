import { StacksMainnet, StacksTestnet } from '@stacks/network';
import type { StacksNetwork } from '@stacks/network';
import { getApiBaseUrl } from './config';
import type { NetworkType } from './types';

export const toStacksNetwork = (
  network: NetworkType,
  apiBaseUrl?: string
): StacksNetwork => {
  const url = apiBaseUrl ?? getApiBaseUrl(network);
  return network === 'mainnet'
    ? new StacksMainnet({ url })
    : new StacksTestnet({ url });
};
