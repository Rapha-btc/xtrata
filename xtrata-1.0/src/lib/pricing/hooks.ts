import { useQuery } from '@tanstack/react-query';
import type { UsdPriceBook, UsdPriceQuote } from './types';
import {
  USD_PRICE_GC_MS,
  USD_PRICE_QUERY_KEY,
  USD_PRICE_REFETCH_MS,
  USD_PRICE_STALE_MS
} from './types';

const toFinitePositiveNumber = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
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

export const fetchUsdPriceBook = async (signal?: AbortSignal) => {
  const response = await fetch('/prices/spot', {
    headers: {
      Accept: 'application/json'
    },
    signal
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Price snapshot is not valid JSON.');
    }
  }
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error.trim()
        : '';
    throw new Error(message || `Price snapshot request failed (${response.status}).`);
  }
  return parseUsdPriceBookPayload(payload);
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
