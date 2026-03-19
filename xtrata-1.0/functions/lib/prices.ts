export type PriceAssetKey = 'stx' | 'sbtc' | 'usdc';

export type SpotPriceEntry = {
  usd: number;
  updatedAt: number;
  sourceId: string;
  isFallback: boolean;
};

export type SpotPriceSnapshot = {
  provider: 'coingecko';
  generatedAt: number;
  prices: Record<PriceAssetKey, SpotPriceEntry | null>;
};

export const PUBLIC_PRICE_CACHE_CONTROL =
  'public, max-age=30, s-maxage=60, stale-while-revalidate=300';

type CoinGeckoEntry = {
  usd?: unknown;
  last_updated_at?: unknown;
};

const toFinitePositiveNumber = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
};

const toUnixMilliseconds = (value: unknown, fallbackMs: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallbackMs;
  }
  return Math.floor(value * 1000);
};

const toEntryRecord = (value: unknown): CoinGeckoEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as CoinGeckoEntry;
};

const buildPriceEntry = (
  value: unknown,
  sourceId: string,
  fallbackMs: number,
  isFallback = false
): SpotPriceEntry | null => {
  const entry = toEntryRecord(value);
  if (!entry) {
    return null;
  }
  const usd = toFinitePositiveNumber(entry.usd);
  if (usd === null) {
    return null;
  }
  return {
    usd,
    updatedAt: toUnixMilliseconds(entry.last_updated_at, fallbackMs),
    sourceId,
    isFallback
  };
};

export const parseCoinGeckoSpotPayload = (
  payload: unknown,
  generatedAt = Date.now()
): SpotPriceSnapshot => {
  const data =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const stx = buildPriceEntry(data['stacks'], 'stacks', generatedAt);
  const sbtcDirect = buildPriceEntry(data['sbtc'], 'sbtc', generatedAt);
  const bitcoinFallback = buildPriceEntry(
    data['bitcoin'],
    'bitcoin',
    generatedAt,
    true
  );
  const usdc = buildPriceEntry(data['usd-coin'], 'usd-coin', generatedAt);

  return {
    provider: 'coingecko',
    generatedAt,
    prices: {
      stx,
      sbtc: sbtcDirect ?? bitcoinFallback,
      usdc
    }
  };
};

export const hasSpotPriceData = (snapshot: SpotPriceSnapshot) =>
  Object.values(snapshot.prices).some(
    (entry) => entry !== null && Number.isFinite(entry.usd) && entry.usd > 0
  );
