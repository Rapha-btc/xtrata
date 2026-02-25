import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyHiroApiKey,
  getHiroApiKeys,
  shouldRetryWithNextHiroKey
} from '../hiro-keys';
import { proxyHiroRequest } from '../hiro-proxy';

describe('hiro key helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('collects keys from numbered, list, and legacy env vars', () => {
    const keys = getHiroApiKeys({
      HIRO_API_KEY_2: 'key-2',
      HIRO_API_KEY_1: 'key-1',
      HIRO_API_KEYS: 'key-2, key-3\nkey-4',
      HIRO_API_KEY: 'key-4',
      VITE_HIRO_API_KEY: 'key-5'
    });

    expect(keys).toEqual(['key-1', 'key-2', 'key-3', 'key-4', 'key-5']);
  });

  it('applies and clears Hiro auth headers', () => {
    const headers = new Headers();
    applyHiroApiKey(headers, 'abc123');
    expect(headers.get('x-hiro-api-key')).toBe('abc123');
    expect(headers.get('x-api-key')).toBe('abc123');

    applyHiroApiKey(headers, null);
    expect(headers.has('x-hiro-api-key')).toBe(false);
    expect(headers.has('x-api-key')).toBe(false);
  });

  it('treats auth and rate limit statuses as retryable', () => {
    expect(shouldRetryWithNextHiroKey(401)).toBe(true);
    expect(shouldRetryWithNextHiroKey(403)).toBe(true);
    expect(shouldRetryWithNextHiroKey(429)).toBe(true);
    expect(shouldRetryWithNextHiroKey(404)).toBe(false);
  });
});

describe('hiro proxy key fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retries with the next key when the previous key is rate limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate-limited', {
          status: 429
        })
      )
      .mockResolvedValueOnce(
        new Response('ok', {
          status: 200
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxyHiroRequest({
      request: new Request('https://example.com/hiro/mainnet/v2/info'),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/info'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers as HeadersInit);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers as HeadersInit);
    expect(firstHeaders.get('x-hiro-api-key')).toBe('key-a');
    expect(secondHeaders.get('x-hiro-api-key')).toBe('key-b');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });
});
