import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyHiroApiKey,
  getHiroApiKeys,
  shouldRetryWithNextHiroKey
} from '../hiro-keys';
import { __testing, proxyHiroRequest } from '../hiro-proxy';

describe('hiro key helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __testing.resetHiroProxyRuntimeState();
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
    __testing.resetHiroProxyRuntimeState();
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

  it('coalesces concurrent GET requests with matching inputs', async () => {
    let resolver: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolver = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const firstPromise = proxyHiroRequest({
      request: new Request('https://example.com/hiro/mainnet/extended/v1/info'),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'extended/v1/info'
    });
    const secondPromise = proxyHiroRequest({
      request: new Request('https://example.com/hiro/mainnet/extended/v1/info'),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'extended/v1/info'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolver?.(
      new Response('coalesced', {
        status: 200
      })
    );

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.text()).toBe('coalesced');
    expect(await second.text()).toBe('coalesced');
  });

  it('cools down rate-limited keys across requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate-limited', {
          status: 429
        })
      )
      .mockResolvedValueOnce(
        new Response('ok-1', {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response('ok-2', {
          status: 200
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = await proxyHiroRequest({
      request: new Request('https://example.com/hiro/mainnet/v2/info'),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/info'
    });
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('ok-1');

    const second = await proxyHiroRequest({
      request: new Request('https://example.com/hiro/mainnet/v2/info'),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/info'
    });
    expect(second.status).toBe(200);
    expect(await second.text()).toBe('ok-2');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers as HeadersInit);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers as HeadersInit);
    const thirdHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers as HeadersInit);
    expect(firstHeaders.get('x-hiro-api-key')).toBe('key-a');
    expect(secondHeaders.get('x-hiro-api-key')).toBe('key-b');
    expect(thirdHeaders.get('x-hiro-api-key')).toBe('key-b');
  });

  it('caches allowlisted call-read POST responses for a short window', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"okay":true}', {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await proxyHiroRequest({
      request: new Request(
        'https://example.com/hiro/mainnet/v2/contracts/call-read/SP123/test/get-last-token-id',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ sender: 'SPSENDER' })
        }
      ),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/contracts/call-read/SP123/test/get-last-token-id'
    });

    const second = await proxyHiroRequest({
      request: new Request(
        'https://example.com/hiro/mainnet/v2/contracts/call-read/SP123/test/get-last-token-id',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ sender: 'SPSENDER' })
        }
      ),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/contracts/call-read/SP123/test/get-last-token-id'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.text()).toBe('{"okay":true}');
    expect(await second.text()).toBe('{"okay":true}');
    expect(second.headers.get('x-xtrata-proxy-cache')).toBe('hit');
  });

  it('does not cache non-allowlisted call-read functions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('first', { status: 200 }))
      .mockResolvedValueOnce(new Response('second', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await proxyHiroRequest({
      request: new Request(
        'https://example.com/hiro/mainnet/v2/contracts/call-read/SP123/test/custom-fn',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sender: 'SPSENDER' })
        }
      ),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/contracts/call-read/SP123/test/custom-fn'
    });

    const second = await proxyHiroRequest({
      request: new Request(
        'https://example.com/hiro/mainnet/v2/contracts/call-read/SP123/test/custom-fn',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sender: 'SPSENDER' })
        }
      ),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/contracts/call-read/SP123/test/custom-fn'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await first.text()).toBe('first');
    expect(await second.text()).toBe('second');
    expect(second.headers.get('x-xtrata-proxy-cache')).toBeNull();
  });

  it('keys cached POST call-read responses by body fingerprint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('sender-a', { status: 200 }))
      .mockResolvedValueOnce(new Response('sender-b', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await proxyHiroRequest({
      request: new Request(
        'https://example.com/hiro/mainnet/v2/contracts/call-read/SP123/test/get-owner',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sender: 'SPA' })
        }
      ),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/contracts/call-read/SP123/test/get-owner'
    });

    const second = await proxyHiroRequest({
      request: new Request(
        'https://example.com/hiro/mainnet/v2/contracts/call-read/SP123/test/get-owner',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sender: 'SPB' })
        }
      ),
      env: {
        HIRO_API_KEYS: 'key-a,key-b'
      },
      network: 'mainnet',
      path: 'v2/contracts/call-read/SP123/test/get-owner'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await first.text()).toBe('sender-a');
    expect(await second.text()).toBe('sender-b');
  });
});
