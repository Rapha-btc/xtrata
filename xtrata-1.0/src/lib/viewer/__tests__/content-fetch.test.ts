import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger', () => ({
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logDebug: vi.fn()
}));

import { logWarn } from '../../utils/logger';
import type { XtrataClient } from '../../contract/client';

vi.mock('../cache', () => ({
  loadInscriptionFromCache: vi.fn().mockResolvedValue(null),
  saveInscriptionToCache: vi.fn().mockResolvedValue(undefined),
  saveInscriptionToTempCache: vi.fn().mockResolvedValue(undefined),
  TEMP_CACHE_MAX_BYTES: 400_000,
  TEMP_CACHE_TTL_MS: 6_000
}));

import {
  saveInscriptionToCache,
  saveInscriptionToTempCache
} from '../cache';
import { fetchOnChainContent } from '../content';

const buildClient = (params: {
  supportsBatch: boolean;
  getChunk: XtrataClient['getChunk'];
  getChunkBatch: XtrataClient['getChunkBatch'];
  contractName?: string;
}) =>
  ({
    contract: {
      address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      contractName: params.contractName ?? 'xtrata-v1-1-1',
      network: 'mainnet'
    },
    supportsChunkBatchRead: params.supportsBatch,
    getChunk: params.getChunk,
    getChunkBatch: params.getChunkBatch
  }) as unknown as XtrataClient;

describe('fetchOnChainContent', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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

  it('falls back to fallback chunk source when primary chunk 0 is missing', async () => {
    const logWarnMock = vi.mocked(logWarn);
    logWarnMock.mockClear();
    const primaryGetChunk = vi.fn(async () => null);
    const primaryGetChunkBatch = vi.fn(async () => []);
    const primaryClient = buildClient({
      supportsBatch: true,
      getChunk: primaryGetChunk,
      getChunkBatch: primaryGetChunkBatch,
      contractName: 'xtrata-v2-1-0'
    });

    const first = new Uint8Array([9, 8]);
    const second = new Uint8Array([7, 6]);
    const legacyGetChunk = vi.fn(async (_id: bigint, index: bigint) => {
      if (index === 0n) {
        return first;
      }
      if (index === 1n) {
        return second;
      }
      return null;
    });
    const legacyGetChunkBatch = vi.fn(async () => []);
    const legacyClient = buildClient({
      supportsBatch: false,
      getChunk: legacyGetChunk,
      getChunkBatch: legacyGetChunkBatch,
      contractName: 'xtrata-v1-1-1'
    });

    const result = await fetchOnChainContent({
      client: primaryClient,
      fallbackClient: legacyClient,
      cacheContractId:
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      id: 3n,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      totalSize: 4n,
      mimeType: 'application/octet-stream'
    });

    expect(Array.from(result)).toEqual([9, 8, 7, 6]);
    expect(primaryGetChunk).toHaveBeenCalled();
    expect(legacyGetChunk).toHaveBeenCalled();
    expect(logWarnMock).toHaveBeenCalledWith(
      'chunk',
      'Primary chunk read failed; attempting fallback source',
      expect.objectContaining({
        id: '3',
        primaryContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
        fallbackContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
      })
    );
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

  it('warns when reconstructed content is shorter than expected', async () => {
    const logWarnMock = vi.mocked(logWarn);
    logWarnMock.mockClear();
    const first = new Uint8Array([1, 2, 3, 4]);
    const second = new Uint8Array([5]);
    const getChunk = vi.fn(async (_id: bigint, index: bigint) => {
      if (index === 0n) {
        return first;
      }
      if (index === 1n) {
        return second;
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
      id: 4n,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      totalSize: 6n,
      mimeType: 'application/octet-stream'
    });

    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
    expect(logWarnMock).toHaveBeenCalledWith(
      'chunk',
      'Reconstructed content shorter than expected',
      expect.objectContaining({
        id: '4',
        expectedBytes: 6,
        actualBytes: 5
      })
    );
  });

  it('stores large audio in the temp cache when it fits the stream cache window', async () => {
    const getChunk = vi.fn(async (_id: bigint, index: bigint) => {
      if (index === 0n) {
        return new Uint8Array(300_000);
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
      id: 5n,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      totalSize: 300_000n,
      mimeType: 'audio/mpeg'
    });

    expect(result).toHaveLength(300_000);
    expect(saveInscriptionToTempCache).toHaveBeenCalledWith(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1',
      5n,
      expect.any(Uint8Array),
      'audio/mpeg',
      6_000
    );
    expect(saveInscriptionToCache).not.toHaveBeenCalled();
  });

  it('keeps oversized audio on the permanent cache path', async () => {
    const getChunk = vi.fn(async (_id: bigint, index: bigint) => {
      if (index === 0n) {
        return new Uint8Array(500_000);
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
      id: 6n,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      totalSize: 500_000n,
      mimeType: 'audio/mpeg'
    });

    expect(result).toHaveLength(500_000);
    expect(saveInscriptionToCache).toHaveBeenCalledWith(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1',
      6n,
      expect.any(Uint8Array),
      'audio/mpeg'
    );
    expect(saveInscriptionToTempCache).not.toHaveBeenCalled();
  });
});
