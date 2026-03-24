import { useQuery } from '@tanstack/react-query';
import { validateStacksAddress } from '@stacks/transactions';
import type { NetworkType } from '../network/types';
import { getNetworkFromAddress } from '../network/guard';
import { normalizeBnsName } from './helpers';
import { resolveBnsAddress, resolveBnsNames } from './resolver';

const BNS_QUERY_STALE_MS = 60 * 60 * 1000;
const BNS_QUERY_GC_MS = 6 * 60 * 60 * 1000;
const BNS_QUERY_KEY_VERSION = 'v2';

export const useBnsNames = (params: {
  address: string | null | undefined;
  network?: NetworkType | null;
  enabled?: boolean;
}) => {
  const trimmed = params.address?.trim() ?? '';
  const isValidAddress = !!trimmed && validateStacksAddress(trimmed);
  const resolvedNetwork =
    params.network ?? (isValidAddress ? getNetworkFromAddress(trimmed) : null);
  const enabled =
    (params.enabled ?? true) && isValidAddress && !!resolvedNetwork;

  return useQuery({
    queryKey: ['bns', BNS_QUERY_KEY_VERSION, 'address', resolvedNetwork, trimmed],
    enabled,
    queryFn: ({ signal }) =>
      resolveBnsNames({
        address: trimmed,
        network: resolvedNetwork!,
        signal
      }),
    staleTime: BNS_QUERY_STALE_MS,
    gcTime: BNS_QUERY_GC_MS,
    retry: false
  });
};

export const useBnsAddress = (params: {
  name: string | null | undefined;
  network: NetworkType | null | undefined;
  enabled?: boolean;
}) => {
  const normalizedName = normalizeBnsName(params.name);
  const enabled =
    (params.enabled ?? true) && !!normalizedName && !!params.network;

  return useQuery({
    queryKey: ['bns', BNS_QUERY_KEY_VERSION, 'name', params.network, normalizedName],
    enabled,
    queryFn: ({ signal }) =>
      resolveBnsAddress({
        name: normalizedName!,
        network: params.network!,
        signal
      }),
    staleTime: BNS_QUERY_STALE_MS,
    gcTime: BNS_QUERY_GC_MS,
    retry: false
  });
};
