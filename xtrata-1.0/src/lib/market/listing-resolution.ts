import type { MarketClient } from './client';
import { buildMarketListingKey } from './indexer';
import type { MarketActivityEvent } from './types';
import { isSameAddress } from './actions';

type ListingLookupClient = Pick<
  MarketClient,
  'getListingIdByToken' | 'getListing'
>;

export type ListingResolutionToken = {
  nftContract: string;
  tokenId: bigint;
  owner: string | null;
};

export type ListingResolutionMetadata = {
  marketContractId: string;
  paymentTokenContractId?: string | null;
  marketLabel?: string;
};

export type ListingResolutionTarget = ListingResolutionMetadata & {
  marketClient: ListingLookupClient;
};

export const attachListingMetadata = (
  event: MarketActivityEvent,
  metadata: ListingResolutionMetadata
): MarketActivityEvent => ({
  ...event,
  marketContractId: metadata.marketContractId,
  paymentTokenContractId:
    metadata.paymentTokenContractId === undefined
      ? event.paymentTokenContractId
      : metadata.paymentTokenContractId,
  marketLabel: metadata.marketLabel ?? event.marketLabel
});

const buildListingEvent = (params: {
  listingId: bigint;
  token: ListingResolutionToken;
  listing: Awaited<ReturnType<ListingLookupClient['getListing']>>;
  metadata: ListingResolutionMetadata;
}): MarketActivityEvent | null => {
  if (!params.listing) {
    return null;
  }
  return attachListingMetadata({
    id: `onchain:${params.listingId.toString()}`,
    type: 'list',
    listingId: params.listingId,
    tokenId: params.listing.tokenId,
    price: params.listing.price,
    seller: params.listing.seller,
    nftContract: params.listing.nftContract
  }, params.metadata);
};

const buildCandidateList = (params: {
  tokens: ListingResolutionToken[];
  marketContractId: string;
  existing: Map<string, MarketActivityEvent>;
}) => {
  const seen = new Set<string>();
  return params.tokens.filter((token) => {
    if (!isSameAddress(token.owner, params.marketContractId)) {
      return false;
    }
    const key = buildMarketListingKey(token.nftContract, token.tokenId);
    if (params.existing.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const resolveMissingListingsForTokens = async (params: {
  marketClient: ListingLookupClient;
  senderAddress: string;
  marketContractId: string | null;
  paymentTokenContractId?: string | null;
  marketLabel?: string;
  tokens: ListingResolutionToken[];
  existing: Map<string, MarketActivityEvent>;
  concurrency?: number;
}): Promise<Map<string, MarketActivityEvent>> => {
  if (!params.marketContractId || params.tokens.length === 0) {
    return new Map();
  }
  const candidates = buildCandidateList({
    tokens: params.tokens,
    marketContractId: params.marketContractId,
    existing: params.existing
  });
  if (candidates.length === 0) {
    return new Map();
  }

  const results = new Array<MarketActivityEvent | null>(candidates.length).fill(
    null
  );
  const queue = candidates.map((_, index) => index);
  const workerCount = Math.max(
    1,
    Math.min(params.concurrency ?? 2, candidates.length)
  );

  const runWorker = async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) {
        return;
      }
      const token = candidates[next];
      const listingId = await params.marketClient.getListingIdByToken(
        token.nftContract,
        token.tokenId,
        params.senderAddress
      );
      if (listingId === null) {
        continue;
      }
      const listing = await params.marketClient.getListing(
        listingId,
        params.senderAddress
      );
      const event = buildListingEvent({
        listingId,
        token,
        listing,
        metadata: {
          marketContractId: params.marketContractId,
          paymentTokenContractId: params.paymentTokenContractId,
          marketLabel: params.marketLabel
        }
      });
      if (event) {
        results[next] = event;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  const resolved = new Map<string, MarketActivityEvent>();
  results.forEach((event) => {
    if (!event?.tokenId || !event.nftContract) {
      return;
    }
    const key = buildMarketListingKey(event.nftContract, event.tokenId);
    resolved.set(key, event);
  });
  return resolved;
};

export const resolveMissingListingsAcrossMarkets = async (params: {
  targets: ListingResolutionTarget[];
  senderAddress: string;
  tokens: ListingResolutionToken[];
  existing: Map<string, MarketActivityEvent>;
  concurrencyPerMarket?: number;
}): Promise<Map<string, MarketActivityEvent>> => {
  if (params.targets.length === 0 || params.tokens.length === 0) {
    return new Map();
  }

  const resolvedGroups = await Promise.all(
    params.targets.map((target) =>
      resolveMissingListingsForTokens({
        marketClient: target.marketClient,
        senderAddress: params.senderAddress,
        marketContractId: target.marketContractId,
        paymentTokenContractId: target.paymentTokenContractId,
        marketLabel: target.marketLabel,
        tokens: params.tokens.filter((token) =>
          isSameAddress(token.owner, target.marketContractId)
        ),
        existing: params.existing,
        concurrency: params.concurrencyPerMarket
      })
    )
  );

  const merged = new Map<string, MarketActivityEvent>();
  resolvedGroups.forEach((group) => {
    group.forEach((event, key) => merged.set(key, event));
  });
  return merged;
};

export const mergeListingIndexes = (
  primary: Map<string, MarketActivityEvent>,
  secondary?: Map<string, MarketActivityEvent> | null
) => {
  const merged = new Map(primary);
  secondary?.forEach((event, key) => merged.set(key, event));
  return merged;
};
