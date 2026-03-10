import type { MarketActivityEvent } from './types';

export const MARKET_FOCUS_EVENT = 'xtrata-market-focus';

export type MarketFocusRequest = {
  tokenId: string;
  nftContract: string;
  listingId: string;
  marketContractId: string;
  paymentTokenContractId?: string | null;
  marketLabel?: string;
};

let pendingFocusRequest: MarketFocusRequest | null = null;

const toRequest = (listing: MarketActivityEvent): MarketFocusRequest | null => {
  if (
    listing.tokenId === undefined ||
    !listing.nftContract ||
    !listing.marketContractId
  ) {
    return null;
  }
  return {
    tokenId: listing.tokenId.toString(),
    nftContract: listing.nftContract,
    listingId: listing.listingId.toString(),
    marketContractId: listing.marketContractId,
    paymentTokenContractId: listing.paymentTokenContractId,
    marketLabel: listing.marketLabel
  };
};

export const createMarketFocusStore = () => {
  const notify = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new Event(MARKET_FOCUS_EVENT));
  };

  return {
    load: () => pendingFocusRequest,
    clear: () => {
      pendingFocusRequest = null;
    },
    saveFromListing: (listing: MarketActivityEvent) => {
      const request = toRequest(listing);
      if (!request) {
        return null;
      }
      pendingFocusRequest = request;
      notify();
      return request;
    }
  };
};
