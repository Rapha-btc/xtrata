import { describe, expect, it } from 'vitest';
import { getCollectionDeployReadiness } from '../collection-deploy';
import type { Env } from '../db';

const baseEnv: Env = {};

describe('collection deploy readiness', () => {
  it('returns not ready when collection is missing', async () => {
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: 'missing-id',
      queryAllImpl: async () => ({ results: [] })
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toContain('Collection not found');
  });

  it('returns not ready when contract address is missing', async () => {
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: 'c1',
      queryAllImpl: async () => ({
        results: [{ id: 'c1', contract_address: null, metadata: null }]
      })
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toContain('Deploy the collection contract');
  });

  it('returns not ready when deploy tx id is not recorded', async () => {
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: 'c1',
      queryAllImpl: async () => ({
        results: [
          {
            id: 'c1',
            contract_address: 'SP1234',
            metadata: JSON.stringify({ coreContractId: 'SP1234.core' })
          }
        ]
      })
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toContain('not recorded');
  });

  it('returns ready when deploy tx id is missing but contract source exists', async () => {
    const urls: string[] = [];
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: 'c1',
      queryAllImpl: async () => ({
        results: [
          {
            id: 'c1',
            contract_address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
            metadata: JSON.stringify({ contractName: 'xtrata-collection-ahv1-7f52463b' })
          }
        ]
      }),
      fetcher: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ source: '(define-constant TEST u1)' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    expect(result.ready).toBe(true);
    expect(result.deployTxId).toBeNull();
    expect(result.deployTxStatus).toBe('success');
    expect(result.reason).toContain('Deployment confirmed from contract source');
    expect(urls[0]).toContain('/v2/contracts/source/');
  });

  it('returns not ready when deploy tx id is missing and contract source is not indexed', async () => {
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: 'c1',
      queryAllImpl: async () => ({
        results: [
          {
            id: 'c1',
            contract_address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
            metadata: JSON.stringify({ contractName: 'xtrata-collection-ahv1-7f52463b' })
          }
        ]
      }),
      fetcher: async () =>
        new Response('not found', {
          status: 404
        })
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toContain('not recorded');
  });

  it('derives contract name from slug/id when metadata contractName is missing', async () => {
    const urls: string[] = [];
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: '7f52463b-6f3f-4442-aaaa-bbbbbbbbbbbb',
      queryAllImpl: async () => ({
        results: [
          {
            id: '7f52463b-6f3f-4442-aaaa-bbbbbbbbbbbb',
            slug: 'ahv1',
            contract_address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
            metadata: JSON.stringify({ mintType: 'standard' })
          }
        ]
      }),
      fetcher: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ source: '(define-constant TEST u1)' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    expect(result.ready).toBe(true);
    expect(urls[0]).toContain(
      '/v2/contracts/source/SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7/xtrata-collection-ahv1-7f52463b'
    );
  });

  it('returns ready when Hiro reports tx success', async () => {
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: 'c1',
      queryAllImpl: async () => ({
        results: [
          {
            id: 'c1',
            contract_address: 'SP1234',
            metadata: JSON.stringify({ deployTxId: 'abc123' })
          }
        ]
      }),
      fetcher: async () =>
        new Response(JSON.stringify({ tx_status: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    });

    expect(result.ready).toBe(true);
    expect(result.deployTxId).toBe('0xabc123');
    expect(result.deployTxStatus).toBe('success');
  });

  it('returns not ready when Hiro reports aborted tx', async () => {
    const result = await getCollectionDeployReadiness({
      env: baseEnv,
      collectionId: 'c1',
      queryAllImpl: async () => ({
        results: [
          {
            id: 'c1',
            contract_address: 'SP1234',
            metadata: JSON.stringify({ deployTxId: '0xdeadbeef' })
          }
        ]
      }),
      fetcher: async () =>
        new Response(JSON.stringify({ tx_status: 'abort_by_response' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toContain('abort_by_response');
  });

  it('retries deploy status lookup with the next key on Hiro rate limits', async () => {
    const headerSnapshots: Array<string | null> = [];
    const result = await getCollectionDeployReadiness({
      env: {
        HIRO_API_KEYS: 'key-one,key-two'
      },
      collectionId: 'c1',
      queryAllImpl: async () => ({
        results: [
          {
            id: 'c1',
            contract_address: 'SP1234',
            metadata: JSON.stringify({ deployTxId: '0xabc123' })
          }
        ]
      }),
      fetcher: async (_input, init) => {
        const headers = new Headers(init?.headers);
        headerSnapshots.push(headers.get('x-hiro-api-key'));
        if (headerSnapshots.length === 1) {
          return new Response('rate limited', {
            status: 429
          });
        }
        return new Response(JSON.stringify({ tx_status: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    expect(result.ready).toBe(true);
    expect(result.deployTxStatus).toBe('success');
    expect(headerSnapshots).toEqual(['key-one', 'key-two']);
  });
});
