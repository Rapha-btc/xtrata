import { formatDecimalAmount } from '../utils/amounts';
import type { PriceAssetKey, UsdPriceBook, UsdPriceQuote } from './types';
import { USD_PRICE_MAX_AGE_MS } from './types';

const USD_RATE_SCALE = 1_000_000n;
const MICRO_USD_PER_CENT = 10_000n;

const trimTrailingZeroes = (value: string) =>
  value.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');

const addThousandsSeparators = (value: string) =>
  value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatUsdFromCents = (cents: bigint) => {
  const negative = cents < 0n;
  const normalized = negative ? -cents : cents;
  const whole = normalized / 100n;
  const fraction = (normalized % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${addThousandsSeparators(
    whole.toString()
  )}.${fraction}`;
};

const quoteIsFresh = (quote: UsdPriceQuote | null, now: number) =>
  !!quote && quote.updatedAt > 0 && now - quote.updatedAt <= USD_PRICE_MAX_AGE_MS;

export const getUsdPriceQuote = (
  priceBook: UsdPriceBook | null | undefined,
  assetKey: PriceAssetKey | null | undefined,
  now = Date.now()
) => {
  if (!priceBook || !assetKey) {
    return null;
  }
  const quote = priceBook.prices[assetKey] ?? null;
  return quoteIsFresh(quote, now) ? quote : null;
};

export const formatTokenAmountForDisplay = (
  amount: bigint,
  decimals: number,
  symbol: string
) => `${trimTrailingZeroes(formatDecimalAmount(amount, decimals))} ${symbol}`;

export const formatUsdApproxFromBaseUnits = (params: {
  amount: bigint | null | undefined;
  decimals: number;
  assetKey: PriceAssetKey | null | undefined;
  priceBook: UsdPriceBook | null | undefined;
  now?: number;
}) => {
  if (params.amount === null || params.amount === undefined) {
    return null;
  }
  if (params.amount === 0n) {
    return '~$0.00';
  }
  const quote = getUsdPriceQuote(
    params.priceBook,
    params.assetKey,
    params.now ?? Date.now()
  );
  if (!quote) {
    return null;
  }
  const divisor = 10n ** BigInt(params.decimals);
  const scaledRate = BigInt(Math.round(quote.usd * Number(USD_RATE_SCALE)));
  if (scaledRate <= 0n) {
    return null;
  }
  const negative = params.amount < 0n;
  const normalizedAmount = negative ? -params.amount : params.amount;
  const microUsd =
    (normalizedAmount * scaledRate + divisor / 2n) / divisor;
  if (microUsd <= 0n) {
    return '~<$0.01';
  }
  const cents = (microUsd + MICRO_USD_PER_CENT / 2n) / MICRO_USD_PER_CENT;
  if (cents <= 0n) {
    return '~<$0.01';
  }
  return `~${formatUsdFromCents(negative ? -cents : cents)}`;
};

export const formatTokenAmountWithUsd = (params: {
  amount: bigint | null | undefined;
  decimals: number;
  symbol: string;
  assetKey: PriceAssetKey | null | undefined;
  priceBook: UsdPriceBook | null | undefined;
  now?: number;
}) => {
  if (params.amount === null || params.amount === undefined) {
    return {
      primary: 'Unknown',
      secondary: null,
      combined: 'Unknown'
    };
  }
  const primary = formatTokenAmountForDisplay(
    params.amount,
    params.decimals,
    params.symbol
  );
  const secondary = formatUsdApproxFromBaseUnits({
    amount: params.amount,
    decimals: params.decimals,
    assetKey: params.assetKey,
    priceBook: params.priceBook,
    now: params.now
  });
  return {
    primary,
    secondary,
    combined: secondary ? `${primary} · ${secondary}` : primary
  };
};

export const formatMicroStxWithUsd = (
  amount: bigint | null | undefined,
  priceBook: UsdPriceBook | null | undefined,
  now?: number
) =>
  formatTokenAmountWithUsd({
    amount,
    decimals: 6,
    symbol: 'STX',
    assetKey: 'stx',
    priceBook,
    now
  });
