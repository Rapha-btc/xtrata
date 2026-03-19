import {
  PUBLIC_PRICE_CACHE_CONTROL,
  hasSpotPriceData,
  parseCoinGeckoSpotPayload,
  parseCoinbaseSpotPayload
} from '../lib/prices';
import { jsonResponse, serverError } from '../lib/utils';

const COINGECKO_PRICE_SOURCE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=stacks,sbtc,usd-coin,bitcoin&vs_currencies=usd&include_last_updated_at=true';
const COINBASE_PRICE_SOURCE_URLS = {
  stx: 'https://api.coinbase.com/v2/prices/STX-USD/spot',
  bitcoin: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
  usdc: 'https://api.coinbase.com/v2/prices/USDC-USD/spot'
} as const;
const UPSTREAM_TIMEOUT_MS = 3_000;
const ERROR_CACHE_CONTROL = 'private, no-store, max-age=0';

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const parseUpstreamJson = async (response: Response) => {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Price source returned invalid JSON.');
  }
};

const fetchCoinGeckoSnapshot = async () => {
  const upstreamResponse = await fetchWithTimeout(
    COINGECKO_PRICE_SOURCE_URL,
    UPSTREAM_TIMEOUT_MS
  );
  if (!upstreamResponse.ok) {
    throw new Error(`CoinGecko unavailable (${upstreamResponse.status}).`);
  }
  const payload = await parseUpstreamJson(upstreamResponse);
  const snapshot = parseCoinGeckoSpotPayload(payload, Date.now());
  if (!hasSpotPriceData(snapshot)) {
    throw new Error('CoinGecko returned no usable price data.');
  }
  return snapshot;
};

const fetchCoinbaseSnapshot = async () => {
  const responses = await Promise.allSettled([
    fetchWithTimeout(COINBASE_PRICE_SOURCE_URLS.stx, UPSTREAM_TIMEOUT_MS),
    fetchWithTimeout(COINBASE_PRICE_SOURCE_URLS.bitcoin, UPSTREAM_TIMEOUT_MS),
    fetchWithTimeout(COINBASE_PRICE_SOURCE_URLS.usdc, UPSTREAM_TIMEOUT_MS)
  ]);
  const generatedAt = Date.now();
  const [stxPayload, bitcoinPayload, usdcPayload] = await Promise.all([
    responses[0].status === 'fulfilled' && responses[0].value.ok
      ? parseUpstreamJson(responses[0].value)
      : Promise.resolve(null),
    responses[1].status === 'fulfilled' && responses[1].value.ok
      ? parseUpstreamJson(responses[1].value)
      : Promise.resolve(null),
    responses[2].status === 'fulfilled' && responses[2].value.ok
      ? parseUpstreamJson(responses[2].value)
      : Promise.resolve(null)
  ]);
  const snapshot = parseCoinbaseSpotPayload(
    {
      stx: stxPayload,
      bitcoin: bitcoinPayload,
      usdc: usdcPayload
    },
    generatedAt
  );
  if (!hasSpotPriceData(snapshot)) {
    throw new Error('Coinbase returned no usable price data.');
  }
  return snapshot;
};

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    try {
      const snapshot = await fetchCoinGeckoSnapshot();
      return jsonResponse(snapshot, 200, {
        'Cache-Control': PUBLIC_PRICE_CACHE_CONTROL
      });
    } catch (coinGeckoError) {
      const snapshot = await fetchCoinbaseSnapshot();
      return jsonResponse(snapshot, 200, {
        'Cache-Control': PUBLIC_PRICE_CACHE_CONTROL,
        'X-Price-Source-Fallback':
          coinGeckoError instanceof Error ? coinGeckoError.message : 'coinbase'
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Price refresh failed.';
    return jsonResponse(
      {
        error: message
      },
      502,
      {
        'Cache-Control': ERROR_CACHE_CONTROL
      }
    );
  }
};
