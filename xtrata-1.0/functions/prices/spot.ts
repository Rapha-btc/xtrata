import {
  PUBLIC_PRICE_CACHE_CONTROL,
  hasSpotPriceData,
  parseCoinGeckoSpotPayload
} from '../lib/prices';
import { jsonResponse, serverError } from '../lib/utils';

const PRICE_SOURCE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=stacks,sbtc,usd-coin,bitcoin&vs_currencies=usd&include_last_updated_at=true';
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

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const upstreamResponse = await fetchWithTimeout(
      PRICE_SOURCE_URL,
      UPSTREAM_TIMEOUT_MS
    );
    if (!upstreamResponse.ok) {
      return serverError(`Price source unavailable (${upstreamResponse.status}).`);
    }

    const payload = await parseUpstreamJson(upstreamResponse);
    const snapshot = parseCoinGeckoSpotPayload(payload, Date.now());
    if (!hasSpotPriceData(snapshot)) {
      return serverError('Price source returned no usable price data.');
    }

    return jsonResponse(snapshot, 200, {
      'Cache-Control': PUBLIC_PRICE_CACHE_CONTROL
    });
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
