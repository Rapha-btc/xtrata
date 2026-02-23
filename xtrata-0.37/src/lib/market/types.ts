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

export type NftActivityType = 'mint' | 'transfer';

export type NftActivityEvent = {
  id: string;
  type: NftActivityType;
  tokenId?: bigint;
  sender?: string;
  recipient?: string;
  nftContract?: string;
  assetIdentifier?: string;
  txId?: string;
  blockHeight?: number;
  eventIndex?: number;
  timestamp?: string;
};

export type NftIndexSnapshot = {
  assetIdentifier: string;
  events: NftActivityEvent[];
  updatedAt: number;
};

export type UnifiedActivityType = MarketActivityType | 'inscribe' | 'transfer';

export type UnifiedActivityEvent = {
  id: string;
  source: 'market' | 'nft';
  type: UnifiedActivityType;
  listingId?: bigint;
  tokenId?: bigint;
  price?: bigint;
  fee?: bigint;
  seller?: string;
  buyer?: string;
  from?: string;
  to?: string;
  nftContract?: string;
  txId?: string;
  blockHeight?: number;
  eventIndex?: number;
  timestamp?: string;
};
