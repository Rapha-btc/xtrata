export type PriceAssetKey = 'stx' | 'sbtc' | 'usdc';

export type UsdPriceQuote = {
  usd: number;
  updatedAt: number;
  sourceId: string;
  isFallback: boolean;
};

export type UsdPriceBook = {
  provider: string;
  generatedAt: number;
  prices: Record<PriceAssetKey, UsdPriceQuote | null>;
};

export const USD_PRICE_QUERY_KEY = ['pricing', 'usd-spot'] as const;
export const USD_PRICE_STALE_MS = 55_000;
export const USD_PRICE_REFETCH_MS = 60_000;
export const USD_PRICE_GC_MS = 10 * 60_000;
export const USD_PRICE_MAX_AGE_MS = 10 * 60_000;
