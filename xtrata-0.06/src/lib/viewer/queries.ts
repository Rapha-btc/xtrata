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
export const getTokenThumbnailKey = (contractId: string, id: bigint) => [
  ...getViewerKey(contractId),
  'thumbnail',
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
  const sourceContractId = getContractId(params.client.contract);
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
    svgDataUri,
    sourceContractId
  };
};

const isEmptySummary = (summary: TokenSummary) =>
  !summary.meta && !summary.tokenUri && !summary.owner && !summary.svgDataUri;

export const fetchTokenSummaryWithFallback = async (params: {
  primaryClient: XtrataClient;
  legacyClient?: XtrataClient | null;
  id: bigint;
  senderAddress: string;
  legacyMaxId?: bigint | null;
  primaryAvailable?: boolean;
  escrowOwner?: string | null;
}): Promise<TokenSummary> => {
  const legacyClient = params.legacyClient ?? null;
  const legacyMaxId = params.legacyMaxId ?? null;
  const primaryAvailable = params.primaryAvailable ?? true;
  const escrowOwner = params.escrowOwner ?? null;

  const primaryContractId = getContractId(params.primaryClient.contract);
  const legacyContractId = legacyClient
    ? getContractId(legacyClient.contract)
    : null;

  const shouldPreferLegacy =
    !!legacyClient && legacyMaxId !== null && params.id <= legacyMaxId;

  if (shouldPreferLegacy) {
    const legacySummary = await fetchTokenSummary({
      client: legacyClient!,
      id: params.id,
      senderAddress: params.senderAddress
    });
    if (
      primaryAvailable &&
      escrowOwner &&
      legacySummary.owner === escrowOwner
    ) {
      const primarySummary = await fetchTokenSummary({
        client: params.primaryClient,
        id: params.id,
        senderAddress: params.senderAddress
      });
      if (!isEmptySummary(primarySummary)) {
        return { ...primarySummary, sourceContractId: primaryContractId };
      }
    }
    return { ...legacySummary, sourceContractId: legacyContractId ?? legacySummary.sourceContractId };
  }

  if (!primaryAvailable && legacyClient) {
    const legacySummary = await fetchTokenSummary({
      client: legacyClient,
      id: params.id,
      senderAddress: params.senderAddress
    });
    return { ...legacySummary, sourceContractId: legacyContractId ?? legacySummary.sourceContractId };
  }

  const primarySummary = await fetchTokenSummary({
    client: params.primaryClient,
    id: params.id,
    senderAddress: params.senderAddress
  });

  if (
    legacyClient &&
    legacyMaxId !== null &&
    params.id <= legacyMaxId &&
    isEmptySummary(primarySummary)
  ) {
    const legacySummary = await fetchTokenSummary({
      client: legacyClient,
      id: params.id,
      senderAddress: params.senderAddress
    });
    if (!isEmptySummary(legacySummary)) {
      return { ...legacySummary, sourceContractId: legacyContractId ?? legacySummary.sourceContractId };
    }
  }

  return { ...primarySummary, sourceContractId: primaryContractId };
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

export const useCombinedLastTokenId = (params: {
  primary: XtrataClient;
  legacy?: XtrataClient | null;
  senderAddress: string;
  enabled?: boolean;
}) => {
  const primaryId = getContractId(params.primary.contract);
  const legacyId = params.legacy ? getContractId(params.legacy.contract) : 'none';
  return useQuery({
    queryKey: [...getViewerKey(primaryId), 'last-token-id', legacyId],
    queryFn: async () => {
      const [primaryLast, legacyLast] = await Promise.all([
        safeRead(
          () => params.primary.getLastTokenId(params.senderAddress),
          null
        ),
        params.legacy
          ? safeRead(
              () => params.legacy!.getLastTokenId(params.senderAddress),
              null
            )
          : Promise.resolve(null)
      ]);
      const primaryAvailable = primaryLast !== null;
      const legacyAvailable = legacyLast !== null;
      if (!primaryAvailable && !legacyAvailable) {
        throw new Error('Unable to load collection for primary or legacy contract.');
      }
      const candidates = [primaryLast, legacyLast].filter(
        (value): value is bigint => value !== null
      );
      const lastTokenId =
        candidates.length > 0
          ? candidates.reduce((max, value) => (value > max ? value : max), candidates[0])
          : null;
      return {
        lastTokenId,
        primaryLastTokenId: primaryLast,
        legacyLastTokenId: legacyLast,
        primaryAvailable,
        legacyAvailable
      };
    },
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
  contractIdOverride?: string;
  fetchSummary?: (id: bigint) => Promise<TokenSummary>;
}) => {
  const contractId =
    params.contractIdOverride ?? getContractId(params.client.contract);
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

  const fetcher =
    params.fetchSummary ??
    ((id: bigint) =>
      fetchTokenSummary({
        client: params.client,
        id,
        senderAddress: params.senderAddress
      }));

  const tokenQueries = useQueries({
    queries: tokenIds.map((id) => ({
      queryKey: getTokenSummaryKey(contractId, id),
      queryFn: () => fetcher(id),
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
