import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUsdPriceBook } from '../hooks';

const originalFetch = global.fetch;

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });

describe('pricing hooks', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses the first-party price route when JSON is available', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        provider: 'coingecko',
        generatedAt: 1_711_111_115_000,
        prices: {
          stx: {
            usd: 0.29,
            updatedAt: 1_711_111_115_000,
            sourceId: 'stacks',
            isFallback: false
          },
          sbtc: {
            usd: 87_500.12,
            updatedAt: 1_711_111_115_000,
            sourceId: 'sbtc',
            isFallback: false
          },
          usdc: {
            usd: 1,
            updatedAt: 1_711_111_115_000,
            sourceId: 'usd-coin',
            isFallback: false
          }
        }
      })
    ) as typeof fetch;

    const priceBook = await fetchUsdPriceBook();

    expect(priceBook.provider).toBe('coingecko');
    expect(priceBook.prices.stx?.usd).toBe(0.29);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to Coinbase when the route returns HTML', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8'
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { amount: '0.24475', base: 'STX', currency: 'USD' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { amount: '69856.52', base: 'BTC', currency: 'USD' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { amount: '1', base: 'USDC', currency: 'USD' } })
      ) as typeof fetch;

    const priceBook = await fetchUsdPriceBook();

    expect(priceBook.provider).toBe('coinbase');
    expect(priceBook.prices.stx?.usd).toBe(0.24475);
    expect(priceBook.prices.sbtc?.usd).toBe(69_856.52);
    expect(priceBook.prices.sbtc?.isFallback).toBe(true);
    expect(priceBook.prices.usdc?.usd).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});
