import { describe, expect, it, vi } from 'vitest';
import type { InscriptionMeta } from '../../../src/lib/protocol/types';
import {
  resolveRuntimeContent,
  type RuntimeContentReader,
  type RuntimeContractRef,
  type RuntimeEnv
} from '../lib';

const primaryContract: RuntimeContractRef = {
  address: 'SP1111111111111111111111111111111111111111',
  contractName: 'xtrata-v2-1-0'
};

const fallbackContract: RuntimeContractRef = {
  address: 'SP2222222222222222222222222222222222222222',
  contractName: 'xtrata-v1-1-1'
};

const makeMeta = (params: {
  totalSize: bigint;
  totalChunks: bigint;
  mimeType?: string;
}): InscriptionMeta => ({
  owner: primaryContract.address,
  creator: null,
  mimeType: params.mimeType ?? 'image/gif',
  totalSize: params.totalSize,
  totalChunks: params.totalChunks,
  sealed: true,
  finalHash: new Uint8Array([1, 2, 3, 4])
});

const makeEnv = (): RuntimeEnv => ({
  RUNTIME_CONTENT_READ_RETRIES: '0'
});

describe('runtime content reconstruction', () => {
  it('uses get-chunk-batch for remaining chunks and preserves byte order', async () => {
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1, 2])],
      ['1', new Uint8Array([3, 4])],
      ['2', new Uint8Array([5])]
    ]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 5n,
          totalChunks: 3n
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async ({ indexes }) =>
        indexes.map((index) => chunks.get(index.toString()) ?? null)
      )
    };

    const resolved = await resolveRuntimeContent({
      env: makeEnv(),
      apiBases: ['https://example.test'],
      tokenId: 2n,
      primaryContract,
      fallbackContract: null,
      read: reader
    });

    expect(Array.from(resolved.bytes)).toEqual([1, 2, 3, 4, 5]);
    expect(reader.fetchChunk).toHaveBeenCalledTimes(1);
    expect(reader.fetchChunkBatch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reader.fetchChunkBatch).mock.calls[0][0].indexes).toEqual([
      1n,
      2n
    ]);
  });

  it('retries missing batch entries with individual chunk reads', async () => {
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1])],
      ['1', new Uint8Array([2])],
      ['2', new Uint8Array([3])]
    ]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 3n,
          totalChunks: 3n
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async ({ indexes }) =>
        indexes.map((index) => (index === 2n ? null : chunks.get(index.toString()) ?? null))
      )
    };

    const resolved = await resolveRuntimeContent({
      env: makeEnv(),
      apiBases: ['https://example.test'],
      tokenId: 2n,
      primaryContract,
      fallbackContract: null,
      read: reader
    });

    expect(Array.from(resolved.bytes)).toEqual([1, 2, 3]);
    expect(reader.fetchChunkBatch).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(reader.fetchChunk).mock.calls.some((call) => call[0].index === 2n)
    ).toBe(true);
  });

  it('falls back to bounded per-chunk reads when batch reads fail', async () => {
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1])],
      ['1', new Uint8Array([2])],
      ['2', new Uint8Array([3])]
    ]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 3n,
          totalChunks: 3n
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async () => {
        throw new Error('NoSuchFunction');
      })
    };

    const resolved = await resolveRuntimeContent({
      env: makeEnv(),
      apiBases: ['https://example.test'],
      tokenId: 2n,
      primaryContract,
      fallbackContract: null,
      read: reader
    });

    expect(Array.from(resolved.bytes)).toEqual([1, 2, 3]);
    expect(reader.fetchChunkBatch).toHaveBeenCalledTimes(1);
    expect(reader.fetchChunk).toHaveBeenCalledTimes(3);
  });

  it('uses the fallback contract when primary chunks are missing', async () => {
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 2n,
          totalChunks: 2n
        })
      ),
      fetchChunk: vi.fn(async ({ contract, index }) => {
        if (contract.contractName === primaryContract.contractName && index === 0n) {
          throw new Error('Missing chunk 0.');
        }
        if (contract.contractName === fallbackContract.contractName && index === 0n) {
          return new Uint8Array([1]);
        }
        return null;
      }),
      fetchChunkBatch: vi.fn(async ({ contract, indexes }) => {
        if (contract.contractName !== fallbackContract.contractName) {
          return indexes.map(() => null);
        }
        return indexes.map(() => new Uint8Array([2]));
      })
    };

    const resolved = await resolveRuntimeContent({
      env: makeEnv(),
      apiBases: ['https://example.test'],
      tokenId: 2n,
      primaryContract,
      fallbackContract,
      read: reader
    });

    expect(resolved.contract).toEqual(fallbackContract);
    expect(Array.from(resolved.bytes)).toEqual([1, 2]);
  });
});

