import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getContractId } from '../contract/config';
import type { XtrataClient } from '../contract/client';
import type { TokenSummary } from './types';
import { buildTokenRange } from './model';

export const getViewerKey = (contractId: string) => ['viewer', contractId];
export const getLastTokenIdKey = (contractId: string) => [
  ...getViewerKey(contractId),
  'last-token-id'
];
export const getTokenSummaryKey = (contractId: string, id: bigint) => [
  ...getViewerKey(contractId),
  'token',
  id.toString()
];
export const getDependenciesKey = (contractId: string, id: bigint) => [
  ...getViewerKey(contractId),
  'dependencies',
  id.toString()
];
export const getChunkKey = (
  contractId: string,
  id: bigint,
  index: bigint
) => [...getViewerKey(contractId), 'chunk', id.toString(), index.toString()];
export const getTokenContentKey = (contractId: string, id: bigint) => [
  ...getViewerKey(contractId),
  'content',
  id.toString()
];

const safeRead = async <T>(
  reader: () => Promise<T>,
  fallback: T
): Promise<T> => {
  try {
    return await reader();
  } catch (error) {
    return fallback;
  }
};

export const fetchTokenSummary = async (params: {
  client: XtrataClient;
  id: bigint;
  senderAddress: string;
}): Promise<TokenSummary> => {
  const [meta, tokenUri] = await Promise.all([
    safeRead(
      () => params.client.getInscriptionMeta(params.id, params.senderAddress),
      null
    ),
    safeRead(
      () => params.client.getTokenUri(params.id, params.senderAddress),
      null
    )
  ]);

  const owner =
    meta?.owner ??
    (await safeRead(
      () => params.client.getOwner(params.id, params.senderAddress),
      null
    ));

  const shouldFetchSvg =
    meta?.mimeType?.toLowerCase() === 'image/svg+xml';
  const svgDataUri = shouldFetchSvg
    ? await safeRead(
        () => params.client.getSvgDataUri(params.id, params.senderAddress),
        null
      )
    : null;

  return {
    id: params.id,
    meta,
    tokenUri,
    owner: owner ?? meta?.owner ?? null,
    svgDataUri
  };
};

export const useLastTokenId = (params: {
  client: XtrataClient;
  senderAddress: string;
  enabled?: boolean;
}) => {
  const contractId = getContractId(params.client.contract);
  return useQuery({
    queryKey: getLastTokenIdKey(contractId),
    queryFn: () => params.client.getLastTokenId(params.senderAddress),
    enabled: (params.enabled ?? true) && params.senderAddress.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });
};

export const useTokenSummaries = (params: {
  client: XtrataClient;
  senderAddress: string;
  lastTokenId?: bigint;
  tokenIds?: bigint[];
  enabled?: boolean;
}) => {
  const contractId = getContractId(params.client.contract);
  const isEnabled = params.enabled ?? true;
  const tokenIds = useMemo(() => {
    if (params.tokenIds) {
      return params.tokenIds;
    }
    if (params.lastTokenId === undefined) {
      return [];
    }
    return buildTokenRange(params.lastTokenId);
  }, [params.lastTokenId, params.tokenIds]);

  const tokenQueries = useQueries({
    queries: tokenIds.map((id) => ({
      queryKey: getTokenSummaryKey(contractId, id),
      queryFn: () =>
        fetchTokenSummary({
          client: params.client,
          id,
          senderAddress: params.senderAddress
        }),
      enabled: isEnabled && params.senderAddress.length > 0 && tokenIds.length > 0,
      staleTime: 300_000,
      refetchOnWindowFocus: false
    }))
  });

  return {
    tokenIds,
    tokenQueries
  };
};
