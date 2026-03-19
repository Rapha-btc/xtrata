import { describe, expect, it } from 'vitest';
import {
  formatMicroStxWithUsd,
  formatTokenAmountWithUsd,
  formatUsdApproxFromBaseUnits,
  getUsdPriceQuote
} from '../format';
import type { UsdPriceBook } from '../types';

const NOW = 1_711_111_115_000;

const priceBook: UsdPriceBook = {
  provider: 'coingecko',
  generatedAt: NOW,
  prices: {
    stx: {
      usd: 0.2952,
      updatedAt: NOW,
      sourceId: 'stacks',
      isFallback: false
    },
    sbtc: {
      usd: 87_500.12,
      updatedAt: NOW,
      sourceId: 'sbtc',
      isFallback: false
    },
    usdc: {
      usd: 1.0001,
      updatedAt: NOW,
      sourceId: 'usd-coin',
      isFallback: false
    }
  }
};

describe('pricing format helpers', () => {
  it('returns fresh quotes only', () => {
    expect(getUsdPriceQuote(priceBook, 'stx', NOW)?.usd).toBe(0.2952);
    expect(getUsdPriceQuote(priceBook, 'stx', NOW + 11 * 60_000)).toBeNull();
  });

  it('formats microstx with an approximate USD value', () => {
    expect(formatMicroStxWithUsd(5_000_000n, priceBook, NOW)).toEqual({
      primary: '5 STX',
      secondary: '~$1.48',
      combined: '5 STX · ~$1.48'
    });
  });

  it('formats fungible token amounts with USD values', () => {
    expect(
      formatTokenAmountWithUsd({
        amount: 2_500_000n,
        decimals: 6,
        symbol: 'USDCx',
        assetKey: 'usdc',
        priceBook,
        now: NOW
      }).combined
    ).toBe('2.5 USDCx · ~$2.50');

    expect(
      formatTokenAmountWithUsd({
        amount: 1_000_000n,
        decimals: 8,
        symbol: 'sBTC',
        assetKey: 'sbtc',
        priceBook,
        now: NOW
      }).combined
    ).toBe('0.01 sBTC · ~$875.00');
  });

  it('returns a sub-cent marker for tiny values', () => {
    expect(
      formatUsdApproxFromBaseUnits({
        amount: 1n,
        decimals: 6,
        assetKey: 'stx',
        priceBook,
        now: NOW
      })
    ).toBe('~<$0.01');
  });
});
