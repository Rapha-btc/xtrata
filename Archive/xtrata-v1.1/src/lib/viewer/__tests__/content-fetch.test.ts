import { describe, expect, it, vi } from 'vitest';
import type { XtrataClient } from '../../contract/client';

vi.mock('../cache', () => ({
  loadInscriptionFromCache: vi.fn().mockResolvedValue(null),
  saveInscriptionToCache: vi.fn().mockResolvedValue(undefined)
}));

import { fetchOnChainContent } from '../content';

const buildClient = (params: {
  supportsBatch: boolean;
  getChunk: XtrataClient['getChunk'];
  getChunkBatch: XtrataClient['getChunkBatch'];
}) =>
  ({
    contract: {
      address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      contractName: 'xtrata-v1-1-1',
      network: 'mainnet'
    },
    supportsChunkBatchRead: params.supportsBatch,
    getChunk: params.getChunk,
    getChunkBatch: params.getChunkBatch
  }) as unknown as XtrataClient;

describe('fetchOnChainContent', () => {
  it('uses batch reads when available', async () => {
    const first = new Uint8Array([1, 2]);
    const second = new Uint8Array([3, 4]);
    const third = new Uint8Array([5, 6]);
    const getChunk = vi.fn(async (_id: bigint, index: bigint) => {
      if (index === 0n) {
        return first;
      }
      return null;
    });
    const getChunkBatch = vi.fn(async () => [second, third]);
    const client = buildClient({
      supportsBatch: true,
      getChunk,
      getChunkBatch
    });

    const result = await fetchOnChainContent({
      client,
      id: 1n,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      totalSize: 6n,
      mimeType: 'application/octet-stream'
    });

    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getChunk).toHaveBeenCalledTimes(1);
    expect(getChunkBatch).toHaveBeenCalledTimes(1);
  });

  it('falls back to per-chunk reads when batch is unavailable', async () => {
    const first = new Uint8Array([1, 2]);
    const second = new Uint8Array([3, 4]);
    const third = new Uint8Array([5, 6]);
    const getChunk = vi.fn(async (_id: bigint, index: bigint) => {
      if (index === 0n) {
        return first;
      }
      if (index === 1n) {
        return second;
      }
      if (index === 2n) {
        return third;
      }
      return null;
    });
    const getChunkBatch = vi.fn(async () => []);
    const client = buildClient({
      supportsBatch: false,
      getChunk,
      getChunkBatch
    });

    const result = await fetchOnChainContent({
      client,
      id: 2n,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      totalSize: 6n,
      mimeType: 'application/octet-stream'
    });

    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getChunkBatch).not.toHaveBeenCalled();
    expect(getChunk).toHaveBeenCalledTimes(3);
  });

  it('falls back to per-chunk reads when batch calls exceed cost', async () => {
    const first = new Uint8Array([1, 2]);
    const second = new Uint8Array([3, 4]);
    const third = new Uint8Array([5, 6]);
    const getChunk = vi.fn(async (_id: bigint, index: bigint) => {
      if (index === 0n) {
        return first;
      }
      if (index === 1n) {
        return second;
      }
      if (index === 2n) {
        return third;
      }
      return null;
    });
    const getChunkBatch = vi.fn(async () => {
      throw new Error('CostBalanceExceeded');
    });
    const client = buildClient({
      supportsBatch: true,
      getChunk,
      getChunkBatch
    });

    const result = await fetchOnChainContent({
      client,
      id: 3n,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      totalSize: 6n,
      mimeType: 'application/octet-stream'
    });

    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getChunkBatch).toHaveBeenCalled();
    expect(getChunk).toHaveBeenCalledTimes(3);
  });
});
