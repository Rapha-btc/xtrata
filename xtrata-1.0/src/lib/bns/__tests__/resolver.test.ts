import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBnsCacheKey } from '../helpers';
import {
  __resetBnsResolverStateForTests,
  resolveBnsAddress,
  resolveBnsNames
} from '../resolver';

describe('bns resolver', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __resetBnsResolverStateForTests();
  });

  it('falls back to raw address labels when providers return transient server errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 525
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const address = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
    const cacheKey = buildBnsCacheKey({
      network: 'mainnet',
      kind: 'address',
      value: address
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(cacheKey);
    }

    const result = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(result).toEqual({
      address,
      names: [],
      primary: null,
      source: null
    });
    expect(fetchMock).toHaveBeenCalled();
    if (typeof window !== 'undefined' && window.localStorage) {
      expect(window.localStorage.getItem(cacheKey)).toBeNull();
    }
  });

  it('tries next provider when one provider enters transient backoff', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 525
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 525
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 525
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          names: ['alice.btc'],
          displayName: 'alice.btc'
        })
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
    const result = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(result.primary).toBe('alice.btc');
    expect(result.source).toBe('stacks-api');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('applies short cooldown after transient address fallback to avoid repeat hammering', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 525
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
    const cacheKey = buildBnsCacheKey({
      network: 'mainnet',
      kind: 'address',
      value: address
    });
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(cacheKey);
    }
    const first = await resolveBnsNames({
      address,
      network: 'mainnet'
    });
    const callCountAfterFirst = fetchMock.mock.calls.length;
    const second = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(first).toEqual({
      address,
      names: [],
      primary: null,
      source: null
    });
    expect(second).toEqual(first);
    expect(callCountAfterFirst).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(callCountAfterFirst);
  });

  it('throws when bns name lookup fails so wallet search can surface an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 525
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      resolveBnsAddress({
        name: 'alice.btc',
        network: 'mainnet'
      })
    ).rejects.toBeInstanceOf(Error);
  });

  it('caches successful address-name lookups', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        names: ['alice.btc'],
        displayName: 'alice.btc'
      })
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
    const first = await resolveBnsNames({
      address,
      network: 'mainnet'
    });
    const second = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(first.primary).toBe('alice.btc');
    expect(second.primary).toBe('alice.btc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
