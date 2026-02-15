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
});
