import { describe, expect, it, vi } from 'vitest';
import { chunkBytes, computeExpectedHash } from '../../../packages/xtrata-reconstruction/src/index';
import type { InscriptionMeta } from '../../../src/lib/protocol/types';
import {
  resolveRuntimeContent,
  resolveRuntimeContentStream,
  getRuntimeReadConfig,
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
  bytes?: Uint8Array;
  finalHash?: Uint8Array;
}): InscriptionMeta => ({
  owner: primaryContract.address,
  creator: null,
  mimeType: params.mimeType ?? 'image/gif',
  totalSize: params.totalSize,
  totalChunks: params.totalChunks,
  sealed: true,
  finalHash:
    params.finalHash ??
    computeExpectedHash(chunkBytes(params.bytes ?? new Uint8Array(Number(params.totalSize))))
});

const makeEnv = (): RuntimeEnv => ({
  RUNTIME_CONTENT_READ_RETRIES: '0'
});

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('runtime content reconstruction', () => {
  it('clamps runtime read batches to 30 chunks', () => {
    expect(
      getRuntimeReadConfig({
        RUNTIME_CONTENT_READ_BATCH_SIZE: '50'
      }).batchSize
    ).toBe(30);
  });

  it('uses get-chunk-batch for remaining chunks and preserves byte order', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1, 2])],
      ['1', new Uint8Array([3, 4])],
      ['2', new Uint8Array([5])]
    ]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 5n,
          totalChunks: 3n,
          bytes
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
    expect(vi.mocked(reader.fetchChunkBatch).mock.calls[0][0].indexes).toEqual([1n, 2n]);
  });

  it('streams reconstructed bytes in order and reports completed bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1])],
      ['1', new Uint8Array([2])],
      ['2', new Uint8Array([3])]
    ]);
    const onComplete = vi.fn(async () => undefined);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 3n,
          totalChunks: 3n,
          bytes
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async ({ indexes }) =>
        indexes.map((index) => chunks.get(index.toString()) ?? null)
      )
    };

    const resolved = await resolveRuntimeContentStream({
      env: makeEnv(),
      apiBases: ['https://example.test'],
      tokenId: 2n,
      primaryContract,
      fallbackContract: null,
      read: reader,
      onComplete
    });
    const streamed = new Uint8Array(await new Response(resolved.stream).arrayBuffer());

    expect(Array.from(streamed)).toEqual([1, 2, 3]);
    expect(resolved.contentLength).toBe(3);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(Array.from(onComplete.mock.calls[0][0])).toEqual([1, 2, 3]);
    expect(onComplete.mock.calls[0][1].contract).toEqual(primaryContract);
  });

  it('fetches large batch groups concurrently while preserving order', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const chunks = new Map<string, Uint8Array>(
      Array.from({ length: 9 }, (_, index) => [index.toString(), new Uint8Array([index + 1])])
    );
    let activeBatchReads = 0;
    let maxActiveBatchReads = 0;
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 9n,
          totalChunks: 9n,
          bytes
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async ({ indexes }) => {
        activeBatchReads += 1;
        maxActiveBatchReads = Math.max(maxActiveBatchReads, activeBatchReads);
        await wait(5);
        activeBatchReads -= 1;
        return indexes.map((index) => chunks.get(index.toString()) ?? null);
      })
    };

    const resolved = await resolveRuntimeContent({
      env: {
        ...makeEnv(),
        RUNTIME_CONTENT_READ_BATCH_SIZE: '2',
        RUNTIME_CONTENT_READ_CONCURRENCY: '3'
      },
      apiBases: ['https://example.test'],
      tokenId: 294n,
      primaryContract,
      fallbackContract: null,
      read: reader
    });

    expect(Array.from(resolved.bytes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(reader.fetchChunk).toHaveBeenCalledTimes(1);
    expect(reader.fetchChunkBatch).toHaveBeenCalledTimes(4);
    expect(maxActiveBatchReads).toBeGreaterThan(1);
  });

  it('probes larger batches and reduces batch size on cost errors', async () => {
    const bytes = Uint8Array.from({ length: 61 }, (_entry, index) => index + 1);
    const chunks = new Map<string, Uint8Array>(
      Array.from({ length: 61 }, (_, index) => [index.toString(), new Uint8Array([index + 1])])
    );
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 61n,
          totalChunks: 61n,
          bytes
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async ({ indexes }) => {
        if (indexes.length > 25) {
          throw new Error('CostBalanceExceeded');
        }
        return indexes.map((index) => chunks.get(index.toString()) ?? null);
      })
    };

    const resolved = await resolveRuntimeContent({
      env: {
        RUNTIME_CONTENT_READ_RETRIES: '2'
      },
      apiBases: ['https://example.test'],
      tokenId: 294n,
      primaryContract,
      fallbackContract: null,
      read: reader
    });

    const batchCalls = vi.mocked(reader.fetchChunkBatch).mock.calls;
    expect(Array.from(resolved.bytes)).toEqual(Array.from(bytes));
    expect(batchCalls.map(([params]) => params.indexes.length)).toEqual(
      expect.arrayContaining([30, 15, 15])
    );
    expect(reader.fetchChunk).toHaveBeenCalledTimes(1);
  });

  it('retries missing batch entries with individual chunk reads', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1])],
      ['1', new Uint8Array([2])],
      ['2', new Uint8Array([3])]
    ]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 3n,
          totalChunks: 3n,
          bytes
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async ({ indexes }) =>
        indexes.map((index) => (index === 2n ? null : (chunks.get(index.toString()) ?? null)))
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
    expect(vi.mocked(reader.fetchChunk).mock.calls.some((call) => call[0].index === 2n)).toBe(true);
  });

  it('falls back to bounded per-chunk reads when batch reads fail', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1])],
      ['1', new Uint8Array([2])],
      ['2', new Uint8Array([3])]
    ]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 3n,
          totalChunks: 3n,
          bytes
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

  it('does not retry or fall back to chunk reads after Cloudflare subrequest exhaustion', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const chunks = new Map<string, Uint8Array>([
      ['0', new Uint8Array([1])],
      ['1', new Uint8Array([2])],
      ['2', new Uint8Array([3])]
    ]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 3n,
          totalChunks: 3n,
          bytes
        })
      ),
      fetchChunk: vi.fn(async ({ index }) => chunks.get(index.toString()) ?? null),
      fetchChunkBatch: vi.fn(async () => {
        throw new Error('Too many subrequests by single Worker invocation.');
      })
    };

    await expect(
      resolveRuntimeContent({
        env: {
          RUNTIME_CONTENT_READ_RETRIES: '2'
        },
        apiBases: ['https://example.test'],
        tokenId: 2n,
        primaryContract,
        fallbackContract: null,
        read: reader
      })
    ).rejects.toMatchObject({
      code: 'terminal-read-error',
      diagnostics: {
        batchFallbacks: 0,
        singleReads: 1
      }
    });

    expect(reader.fetchChunkBatch).toHaveBeenCalledTimes(1);
    expect(reader.fetchChunk).toHaveBeenCalledTimes(1);
  });

  it('uses the fallback contract when primary chunks are missing', async () => {
    const bytes = new Uint8Array([1, 2]);
    const reader: RuntimeContentReader = {
      fetchMeta: vi.fn(async () =>
        makeMeta({
          totalSize: 2n,
          totalChunks: 2n,
          bytes
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
