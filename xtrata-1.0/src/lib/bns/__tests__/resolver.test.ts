import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBnsCacheKey } from '../helpers';
import {
  __resetBnsResolverStateForTests,
  resolveBnsAddress,
  resolveBnsNames
} from '../resolver';

const jsonResponse = (status: number, json: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
  text: async () => JSON.stringify(json)
});

const htmlResponse = (status: number, html: string) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({ html }),
  text: async () => html
});

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

  it('extracts .btc name from explorer address page html', async () => {
    const address = 'SPXGFH9JTKPF2TQZJ2AH7NSMMMXJ72VMGH8PR654';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/names/address/${address}/valid`)) {
        return jsonResponse(404, null);
      }
      if (url.includes(`/v1/addresses/stacks/${address}`)) {
        return jsonResponse(404, null);
      }
      return htmlResponse(
        200,
        `<html><head><title>alice.btc (${address}) | Stacks Explorer</title></head></html>`
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(result.primary).toBe('alice.btc');
    expect(result.names).toEqual(['alice.btc']);
    expect(result.source).toBe('explorer-html');
  });

  it('extracts bns name from associated-name label block in explorer html', async () => {
    const address = 'SPXGFH9JTKPF2TQZJ2AH7NSMMMXJ72VMGH8PR654';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/names/address/${address}/valid`)) {
        return jsonResponse(404, null);
      }
      if (url.includes(`/v1/addresses/stacks/${address}`)) {
        return jsonResponse(404, null);
      }
      return htmlResponse(
        200,
        `<html><body><div>Associated BNS Name</div><span>dyle.btc</span><div>${address}</div></body></html>`
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(result.primary).toBe('dyle.btc');
    expect(result.names).toEqual(['dyle.btc']);
    expect(result.source).toBe('explorer-html');
  });

  it('extracts bns name from escaped Next payload block in one-line source', async () => {
    const address = 'SPXGFH9JTKPF2TQZJ2AH7NSMMMXJ72VMGH8PR654';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/names/address/${address}/valid`)) {
        return jsonResponse(404, null);
      }
      if (url.includes(`/v1/addresses/stacks/${address}`)) {
        return jsonResponse(404, null);
      }
      return htmlResponse(
        200,
        `<html><body><script>self.__next_f.push([1,"5:{\\"initialAddressBNSNamesData\\":{\\"names\\":[\\"dyle.btc\\"]},\\"principal\\":\\"${address}\\"}"])</script></body></html>`
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(result.primary).toBe('dyle.btc');
    expect(result.names).toEqual(['dyle.btc']);
    expect(result.source).toBe('explorer-html');
  });

  it('resolves BNSv2 names from the public BNSv2 API before legacy lookups', async () => {
    const address = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/names/address/${address}/valid`)) {
        return jsonResponse(200, {
          total: 1,
          names: [{ full_name: 'jim.btc', owner: address }]
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(result).toEqual({
      address,
      names: ['jim.btc'],
      primary: 'jim.btc',
      source: 'bnsv2-api'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Hiro names API when the BNSv2 valid-name lookup misses', async () => {
    const address = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/names/address/${address}/valid`)) {
        return jsonResponse(404, null);
      }
      if (url.includes(`/v1/addresses/stacks/${address}`)) {
        return jsonResponse(200, { names: ['jim.btc'] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsNames({
      address,
      network: 'mainnet'
    });

    expect(result).toEqual({
      address,
      names: ['jim.btc'],
      primary: 'jim.btc',
      source: 'hiro-names-api'
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('resolves bns name to address from explorer name page html', async () => {
    const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/names/alice.btc')) {
        return jsonResponse(404, null);
      }
      return htmlResponse(
        200,
        `<html><body><a href="/address/${address}?chain=mainnet">Owner</a></body></html>`
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsAddress({
      name: 'alice.btc',
      network: 'mainnet'
    });

    expect(result).toEqual({
      name: 'alice.btc',
      address,
      source: 'explorer-html'
    });
  });

  it('resolves a Stacks address from BNSv2 zonefile owner data when Hiro returns a bitcoin owner', async () => {
    const address = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/names/jim.btc')) {
        return jsonResponse(200, {
          address: 'bc1qexampleowner0000000000000000000000000',
          blockchain: 'bitcoin',
          zonefile: JSON.stringify({ owner: address })
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsAddress({
      name: 'jim.btc',
      network: 'mainnet'
    });

    expect(result).toEqual({
      name: 'jim.btc',
      address,
      source: 'hiro-names-api'
    });
  });

  it('resolves BNSv2 name details from the Hiro names API before explorer scraping', async () => {
    const address = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/names/jim.btc')) {
        return jsonResponse(200, { address, blockchain: 'stacks' });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveBnsAddress({
      name: 'jim.btc',
      network: 'mainnet'
    });

    expect(result).toEqual({
      name: 'jim.btc',
      address,
      source: 'hiro-names-api'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches successful address-name lookups', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/names/address/SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B/valid')) {
        return jsonResponse(404, null);
      }
      if (url.includes('/v1/addresses/stacks/SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')) {
        return jsonResponse(200, { names: ['alice.btc'] });
      }
      return htmlResponse(
        200,
        '<html><head><meta property="og:title" content="alice.btc (SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B) | Stacks Explorer"></head></html>'
      );
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
