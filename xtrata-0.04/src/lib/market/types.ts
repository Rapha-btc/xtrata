export type MarketListing = {
  seller: string;
  nftContract: string;
  tokenId: bigint;
  price: bigint;
  createdAt: bigint;
};

export type MarketActivityType = 'list' | 'buy' | 'cancel';

export type MarketActivityEvent = {
  id: string;
  type: MarketActivityType;
  listingId: bigint;
  tokenId?: bigint;
  price?: bigint;
  fee?: bigint;
  seller?: string;
  buyer?: string;
  nftContract?: string;
  txId?: string;
  blockHeight?: number;
  eventIndex?: number;
  timestamp?: string;
};

export type MarketIndexSnapshot = {
  contractId: string;
  events: MarketActivityEvent[];
  updatedAt: number;
};
