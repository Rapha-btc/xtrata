import { describe, expect, it } from 'vitest';
import {
  hasSpotPriceData,
  parseCoinGeckoSpotPayload,
  parseCoinbaseSpotPayload
} from '../prices';

describe('public price helpers', () => {
  it('parses direct CoinGecko spot prices', () => {
    const snapshot = parseCoinGeckoSpotPayload(
      {
        stacks: { usd: 0.29, last_updated_at: 1_711_111_111 },
        sbtc: { usd: 87_500.12, last_updated_at: 1_711_111_112 },
        'usd-coin': { usd: 1.0001, last_updated_at: 1_711_111_113 },
        bitcoin: { usd: 87_499.98, last_updated_at: 1_711_111_114 }
      },
      1_711_111_115_000
    );

    expect(snapshot.provider).toBe('coingecko');
    expect(snapshot.prices.stx?.usd).toBe(0.29);
    expect(snapshot.prices.sbtc?.usd).toBe(87_500.12);
    expect(snapshot.prices.sbtc?.sourceId).toBe('sbtc');
    expect(snapshot.prices.sbtc?.isFallback).toBe(false);
    expect(snapshot.prices.usdc?.usd).toBe(1.0001);
    expect(hasSpotPriceData(snapshot)).toBe(true);
  });

  it('falls back to bitcoin when sBTC is unavailable', () => {
    const snapshot = parseCoinGeckoSpotPayload(
      {
        stacks: { usd: 0.31, last_updated_at: 1_711_111_111 },
        bitcoin: { usd: 88_000.55, last_updated_at: 1_711_111_112 }
      },
      1_711_111_115_000
    );

    expect(snapshot.prices.sbtc?.usd).toBe(88_000.55);
    expect(snapshot.prices.sbtc?.sourceId).toBe('bitcoin');
    expect(snapshot.prices.sbtc?.isFallback).toBe(true);
  });

  it('rejects empty or invalid payloads as usable data', () => {
    const snapshot = parseCoinGeckoSpotPayload(
      {
        stacks: { usd: 0 },
        sbtc: { usd: -1 },
        'usd-coin': { usd: '1.0' }
      },
      1_711_111_115_000
    );

    expect(snapshot.prices.stx).toBeNull();
    expect(snapshot.prices.sbtc).toBeNull();
    expect(snapshot.prices.usdc).toBeNull();
    expect(hasSpotPriceData(snapshot)).toBe(false);
  });

  it('parses Coinbase fallback spot prices', () => {
    const snapshot = parseCoinbaseSpotPayload(
      {
        stx: {
          data: { amount: '0.24475', base: 'STX', currency: 'USD' }
        },
        bitcoin: {
          data: { amount: '69856.52', base: 'BTC', currency: 'USD' }
        },
        usdc: {
          data: { amount: '1', base: 'USDC', currency: 'USD' }
        }
      },
      1_711_111_115_000
    );

    expect(snapshot.provider).toBe('coinbase');
    expect(snapshot.prices.stx?.usd).toBe(0.24475);
    expect(snapshot.prices.sbtc?.usd).toBe(69_856.52);
    expect(snapshot.prices.sbtc?.isFallback).toBe(true);
    expect(snapshot.prices.usdc?.usd).toBe(1);
    expect(hasSpotPriceData(snapshot)).toBe(true);
  });
});
