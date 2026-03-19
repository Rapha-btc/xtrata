export type PriceAssetKey = 'stx' | 'sbtc' | 'usdc';

export type SpotPriceEntry = {
  usd: number;
  updatedAt: number;
  sourceId: string;
  isFallback: boolean;
};

export type SpotPriceSnapshot = {
  provider: 'coingecko' | 'coinbase';
  generatedAt: number;
  prices: Record<PriceAssetKey, SpotPriceEntry | null>;
};

export const PUBLIC_PRICE_CACHE_CONTROL =
  'public, max-age=30, s-maxage=60, stale-while-revalidate=300';

type CoinGeckoEntry = {
  usd?: unknown;
  last_updated_at?: unknown;
};

type CoinbaseEntry = {
  data?: {
    amount?: unknown;
    base?: unknown;
    currency?: unknown;
  };
};

const toFinitePositiveNumber = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
};

const toFinitePositiveNumberish = (value: unknown) => {
  const normalized =
    typeof value === 'string' ? Number.parseFloat(value) : value;
  if (
    typeof normalized !== 'number' ||
    !Number.isFinite(normalized) ||
    normalized <= 0
  ) {
    return null;
  }
  return normalized;
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

const toCoinbaseEntryRecord = (value: unknown): CoinbaseEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as CoinbaseEntry;
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

const buildCoinbasePriceEntry = (
  value: unknown,
  sourceId: string,
  fallbackMs: number,
  isFallback = false
): SpotPriceEntry | null => {
  const entry = toCoinbaseEntryRecord(value);
  if (!entry?.data || typeof entry.data !== 'object') {
    return null;
  }
  const usd = toFinitePositiveNumberish(entry.data.amount);
  if (usd === null) {
    return null;
  }
  const currency =
    typeof entry.data.currency === 'string' ? entry.data.currency.trim() : '';
  if (currency && currency.toUpperCase() !== 'USD') {
    return null;
  }
  return {
    usd,
    updatedAt: fallbackMs,
    sourceId,
    isFallback
  };
};

export const parseCoinbaseSpotPayload = (
  payload: {
    stx?: unknown;
    bitcoin?: unknown;
    usdc?: unknown;
  },
  generatedAt = Date.now()
): SpotPriceSnapshot => {
  const stx = buildCoinbasePriceEntry(payload.stx, 'STX-USD', generatedAt);
  const bitcoin = buildCoinbasePriceEntry(
    payload.bitcoin,
    'BTC-USD',
    generatedAt
  );
  const usdc = buildCoinbasePriceEntry(payload.usdc, 'USDC-USD', generatedAt);

  return {
    provider: 'coinbase',
    generatedAt,
    prices: {
      stx,
      sbtc: bitcoin
        ? {
            ...bitcoin,
            isFallback: true
          }
        : null,
      usdc
    }
  };
};

export const hasSpotPriceData = (snapshot: SpotPriceSnapshot) =>
  Object.values(snapshot.prices).some(
    (entry) => entry !== null && Number.isFinite(entry.usd) && entry.usd > 0
  );
