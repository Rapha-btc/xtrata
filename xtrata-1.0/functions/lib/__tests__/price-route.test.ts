import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as priceRouteOnRequest } from '../../prices/spot';

const originalFetch = global.fetch;

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });

describe('prices route', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('falls back to Coinbase when CoinGecko fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { amount: '0.24475', base: 'STX', currency: 'USD' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { amount: '69856.52', base: 'BTC', currency: 'USD' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { amount: '1', base: 'USDC', currency: 'USD' } })
      ) as typeof fetch;

    const response = await priceRouteOnRequest({
      request: new Request('https://example.test/prices/spot')
    } as any);
    const payload = (await response.json()) as {
      provider: string;
      prices: {
        stx: { usd: number } | null;
        sbtc: { usd: number; isFallback: boolean } | null;
        usdc: { usd: number } | null;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.provider).toBe('coinbase');
    expect(payload.prices.stx?.usd).toBe(0.24475);
    expect(payload.prices.sbtc?.usd).toBe(69_856.52);
    expect(payload.prices.sbtc?.isFallback).toBe(true);
    expect(payload.prices.usdc?.usd).toBe(1);
  });
});
