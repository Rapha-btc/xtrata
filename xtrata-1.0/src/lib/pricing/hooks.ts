import { useQuery } from '@tanstack/react-query';
import type { UsdPriceBook, UsdPriceQuote } from './types';
import {
  USD_PRICE_GC_MS,
  USD_PRICE_QUERY_KEY,
  USD_PRICE_REFETCH_MS,
  USD_PRICE_STALE_MS
} from './types';
import { logWarn } from '../utils/logger';

const PRICE_ROUTE_PATH = '/prices/spot';
const COINBASE_SPOT_URLS = {
  stx: 'https://api.coinbase.com/v2/prices/STX-USD/spot',
  bitcoin: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
  usdc: 'https://api.coinbase.com/v2/prices/USDC-USD/spot'
} as const;

const toFinitePositiveNumber = (value: unknown) => {
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

const toPositiveInteger = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
};

const toQuote = (value: unknown): UsdPriceQuote | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const usd = toFinitePositiveNumber(record.usd);
  const updatedAt = toPositiveInteger(record.updatedAt);
  const sourceId =
    typeof record.sourceId === 'string' && record.sourceId.trim()
      ? record.sourceId.trim()
      : null;
  if (usd === null || updatedAt === null || !sourceId) {
    return null;
  }
  return {
    usd,
    updatedAt,
    sourceId,
    isFallback: record.isFallback === true
  };
};

const hasUsdPriceQuotes = (priceBook: UsdPriceBook) =>
  Object.values(priceBook.prices).some(
    (quote) => quote !== null && Number.isFinite(quote.usd) && quote.usd > 0
  );

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError';

const parseJsonText = (text: string, errorMessage: string) => {
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(errorMessage);
  }
};

const parseCoinbaseSpotQuote = (
  payload: unknown,
  sourceId: string,
  updatedAt: number,
  isFallback = false
): UsdPriceQuote | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  const usd = toFinitePositiveNumber(record.amount);
  const currency =
    typeof record.currency === 'string' ? record.currency.trim() : '';
  if (usd === null || (currency && currency.toUpperCase() !== 'USD')) {
    return null;
  }
  return {
    usd,
    updatedAt,
    sourceId,
    isFallback
  };
};

const fetchCoinbasePayload = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    },
    signal
  });
  const payload = parseJsonText(
    await response.text(),
    'Coinbase price response is not valid JSON.'
  );
  if (!response.ok) {
    throw new Error(`Coinbase price request failed (${response.status}).`);
  }
  return payload;
};

export const buildCoinbaseFallbackPriceBook = (payload: {
  stx?: unknown;
  bitcoin?: unknown;
  usdc?: unknown;
}): UsdPriceBook => {
  const generatedAt = Date.now();
  const stx = parseCoinbaseSpotQuote(payload.stx, 'STX-USD', generatedAt);
  const bitcoin = parseCoinbaseSpotQuote(
    payload.bitcoin,
    'BTC-USD',
    generatedAt,
    true
  );
  const usdc = parseCoinbaseSpotQuote(payload.usdc, 'USDC-USD', generatedAt);

  return {
    provider: 'coinbase',
    generatedAt,
    prices: {
      stx,
      sbtc: bitcoin,
      usdc
    }
  };
};

export const fetchCoinbaseFallbackPriceBook = async (signal?: AbortSignal) => {
  const results = await Promise.allSettled([
    fetchCoinbasePayload(COINBASE_SPOT_URLS.stx, signal),
    fetchCoinbasePayload(COINBASE_SPOT_URLS.bitcoin, signal),
    fetchCoinbasePayload(COINBASE_SPOT_URLS.usdc, signal)
  ]);

  const rejectedAbort = results.find((result) => {
    return result.status === 'rejected' && isAbortError(result.reason);
  });
  if (rejectedAbort?.status === 'rejected' && signal?.aborted) {
    throw rejectedAbort.reason;
  }

  const priceBook = buildCoinbaseFallbackPriceBook({
    stx: results[0].status === 'fulfilled' ? results[0].value : null,
    bitcoin: results[1].status === 'fulfilled' ? results[1].value : null,
    usdc: results[2].status === 'fulfilled' ? results[2].value : null
  });
  if (!hasUsdPriceQuotes(priceBook)) {
    throw new Error('Coinbase fallback returned no usable price data.');
  }
  return priceBook;
};

export const parseUsdPriceBookPayload = (payload: unknown): UsdPriceBook => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Price snapshot is invalid.');
  }
  const record = payload as Record<string, unknown>;
  const generatedAt = toPositiveInteger(record.generatedAt);
  if (generatedAt === null) {
    throw new Error('Price snapshot is missing generatedAt.');
  }
  const pricesRecord =
    record.prices && typeof record.prices === 'object'
      ? (record.prices as Record<string, unknown>)
      : {};

  return {
    provider:
      typeof record.provider === 'string' && record.provider.trim()
        ? record.provider.trim()
        : 'unknown',
    generatedAt,
    prices: {
      stx: toQuote(pricesRecord.stx),
      sbtc: toQuote(pricesRecord.sbtc),
      usdc: toQuote(pricesRecord.usdc)
    }
  };
};

const fetchFirstPartyUsdPriceBook = async (signal?: AbortSignal) => {
  const response = await fetch(PRICE_ROUTE_PATH, {
    headers: {
      Accept: 'application/json'
    },
    signal
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error('Price snapshot route returned HTML instead of JSON.');
  }
  const payload = parseJsonText(text, 'Price snapshot is not valid JSON.');
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error.trim()
        : '';
    throw new Error(message || `Price snapshot request failed (${response.status}).`);
  }
  const priceBook = parseUsdPriceBookPayload(payload);
  if (!hasUsdPriceQuotes(priceBook)) {
    throw new Error('Price snapshot returned no usable price data.');
  }
  return priceBook;
};

export const fetchUsdPriceBook = async (signal?: AbortSignal) => {
  try {
    return await fetchFirstPartyUsdPriceBook(signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    logWarn('pricing', 'Price route unavailable; using Coinbase fallback', {
      error: error instanceof Error ? error.message : String(error)
    });
    return fetchCoinbaseFallbackPriceBook(signal);
  }
};

export const useUsdPriceBook = (options?: {
  enabled?: boolean;
  staleTimeMs?: number;
  refetchIntervalMs?: number;
}) => {
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: [...USD_PRICE_QUERY_KEY],
    enabled,
    queryFn: ({ signal }) => fetchUsdPriceBook(signal),
    staleTime: options?.staleTimeMs ?? USD_PRICE_STALE_MS,
    gcTime: USD_PRICE_GC_MS,
    retry: 1,
    refetchInterval: enabled
      ? options?.refetchIntervalMs ?? USD_PRICE_REFETCH_MS
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    meta: {
      persist: true
    }
  });
};
