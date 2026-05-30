import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  ReconstructionContentError,
  ReconstructionVerificationError,
  assertVerified,
  assembleChunks,
  chunkBytes,
  computeExpectedHash,
  reconstructInscription,
  reconstructXtrataInscription,
  resolveDependencies,
  verifyPayload
} from '../index';

const bytesFromText = (value: string) => new TextEncoder().encode(value);
const largeBytesFromText = (value: string) =>
  bytesFromText(value.repeat(Math.ceil((CHUNK_SIZE * 3) / value.length) + 1));

describe('reconstruction sdk', () => {
  it('assembles chunks and verifies payload hash', () => {
    const source = bytesFromText('hello xtrata');
    const chunks = chunkBytes(source, 5);
    const assembled = assembleChunks(chunks);
    expect(assembled).toEqual(source);

    const expectedHash = computeExpectedHash(chunks);
    const verification = verifyPayload(source, expectedHash, 5);
    expect(verification.ok).toBe(true);
    expect(() => assertVerified(verification)).not.toThrow();
  });

  it('resolves dependency graph with truncation guard', async () => {
    const graph = await resolveDependencies(
      1n,
      {
        getDependencies: async (tokenId) => {
          if (tokenId === 1n) {
            return [2n, 3n];
          }
          if (tokenId === 2n) {
            return [4n];
          }
          return [];
        }
      },
      { maxNodes: 3 }
    );

    expect(graph.nodes).toEqual([1n, 2n, 3n]);
    expect(graph.truncated).toBe(true);
  });

  it('reconstructs inscription using reader interfaces', async () => {
    const payload = bytesFromText('xtrata-protocol');
    const chunks = chunkBytes(payload);
    const expectedHash = computeExpectedHash(chunks);

    const result = await reconstructInscription(7n, {
      getInscriptionMeta: async () => ({
        mimeType: 'text/plain',
        totalSize: BigInt(payload.length),
        totalChunks: BigInt(chunks.length),
        finalHash: expectedHash
      }),
      getChunk: async (_tokenId, index) => chunks[Number(index)] ?? null,
      getDependencies: async (tokenId) => (tokenId === 7n ? [1n] : []),
      getTokenUri: async () => 'https://example.com/token/7'
    });

    expect(result.tokenId).toBe(7n);
    expect(result.verification.ok).toBe(true);
    expect(new TextDecoder().decode(result.bytes)).toBe('xtrata-protocol');
    expect(result.dependencies.nodes).toEqual([7n, 1n]);
  });

  it('prefers batch reads when a reader exposes getChunkBatch', async () => {
    const payload = largeBytesFromText('batch-friendly-content');
    const chunks = chunkBytes(payload);
    const expectedHash = computeExpectedHash(chunks);
    const batchRequests: bigint[][] = [];

    const result = await reconstructInscription(
      7n,
      {
        getInscriptionMeta: async () => ({
          mimeType: 'text/plain',
          totalSize: BigInt(payload.length),
          totalChunks: BigInt(chunks.length),
          sealed: true,
          finalHash: expectedHash
        }),
        getChunk: async (_tokenId, index) => chunks[Number(index)] ?? null,
        getChunkBatch: async (_tokenId, indexes) => {
          batchRequests.push(indexes);
          return indexes.map((index) => chunks[Number(index)] ?? null);
        },
        getDependencies: async () => []
      },
      { sourceId: 'primary', batchSize: 50, strict: true }
    );

    expect(result.verification.ok).toBe(true);
    expect(batchRequests).toEqual([chunks.slice(1).map((_chunk, index) => BigInt(index + 1))]);
    expect(result.diagnostics.metaSourceId).toBe('primary');
    expect(result.diagnostics.chunkSourceId).toBe('primary');
    expect(result.diagnostics.readMode).toBe('mixed');
    expect(result.diagnostics.batchReads).toBe(1);
    expect(result.diagnostics.singleReads).toBe(1);
  });

  it('falls back to single chunk reads for missing batch entries', async () => {
    const payload = largeBytesFromText('batch fallback');
    const chunks = chunkBytes(payload);
    const expectedHash = computeExpectedHash(chunks);
    const singleReads: bigint[] = [];

    const result = await reconstructInscription(
      7n,
      {
        getInscriptionMeta: async () => ({
          mimeType: 'text/plain',
          totalSize: BigInt(payload.length),
          totalChunks: BigInt(chunks.length),
          sealed: true,
          finalHash: expectedHash
        }),
        getChunk: async (_tokenId, index) => {
          singleReads.push(index);
          return chunks[Number(index)] ?? null;
        },
        getChunkBatch: async (_tokenId, indexes) =>
          indexes.map((index) => (index === 1n ? null : (chunks[Number(index)] ?? null))),
        getDependencies: async () => []
      },
      { sourceId: 'primary', strict: true }
    );

    expect(result.verification.ok).toBe(true);
    expect(singleReads).toEqual([0n, 1n]);
    expect(result.diagnostics.batchFallbacks).toBe(1);
    expect(result.diagnostics.missingChunks).toEqual([]);
  });

  it('can reconstruct bytes from a fallback source while keeping primary metadata', async () => {
    const payload = largeBytesFromText('fallback-source-content');
    const chunks = chunkBytes(payload);
    const expectedHash = computeExpectedHash(chunks);

    const result = await reconstructXtrataInscription({
      tokenId: 7n,
      strict: true,
      sources: [
        {
          sourceId: 'primary',
          readers: {
            getInscriptionMeta: async () => ({
              mimeType: 'text/plain',
              totalSize: BigInt(payload.length),
              totalChunks: BigInt(chunks.length),
              sealed: true,
              finalHash: expectedHash
            }),
            getChunk: async () => null,
            getChunkBatch: async () => [],
            getDependencies: async () => [1n],
            getTokenUri: async () => 'https://example.com/token/7'
          }
        },
        {
          sourceId: 'legacy',
          readers: {
            getInscriptionMeta: async () => null,
            getChunk: async (_tokenId, index) => chunks[Number(index)] ?? null,
            getChunkBatch: async (_tokenId, indexes) =>
              indexes.map((index) => chunks[Number(index)] ?? null),
            getDependencies: async () => []
          }
        }
      ]
    });

    expect(result.bytes).toEqual(payload);
    expect(result.tokenUri).toBe('https://example.com/token/7');
    expect(result.dependencies.nodes).toEqual([7n, 1n]);
    expect(result.diagnostics.metaSourceId).toBe('primary');
    expect(result.diagnostics.chunkSourceId).toBe('legacy');
    expect(result.diagnostics.fallbackUsed).toBe(true);
  });

  it('fails strict reconstruction before reading unsealed content', async () => {
    const payload = bytesFromText('draft');
    const chunks = chunkBytes(payload);
    const expectedHash = computeExpectedHash(chunks);

    await expect(
      reconstructInscription(
        7n,
        {
          getInscriptionMeta: async () => ({
            mimeType: 'text/plain',
            totalSize: BigInt(payload.length),
            totalChunks: BigInt(chunks.length),
            sealed: false,
            finalHash: expectedHash
          }),
          getChunk: async () => {
            throw new Error('should not read chunks');
          },
          getDependencies: async () => []
        },
        { strict: true }
      )
    ).rejects.toMatchObject({
      code: 'unsealed'
    } satisfies Partial<ReconstructionContentError>);
  });

  it('fails strict reconstruction when rebuilt content is shorter than declared', async () => {
    const payload = bytesFromText('short');
    const chunks = chunkBytes(payload);
    const expectedHash = computeExpectedHash(chunks);

    await expect(
      reconstructInscription(
        7n,
        {
          getInscriptionMeta: async () => ({
            mimeType: 'text/plain',
            totalSize: BigInt(payload.length + 1),
            totalChunks: BigInt(chunks.length),
            sealed: true,
            finalHash: expectedHash
          }),
          getChunk: async (_tokenId, index) => chunks[Number(index)] ?? null,
          getDependencies: async () => []
        },
        { strict: true }
      )
    ).rejects.toMatchObject({
      verification: {
        reason: 'short-content'
      }
    });
  });

  it('throws in strict mode when the reconstructed hash mismatches', async () => {
    const payload = bytesFromText('xtrata-protocol');
    const chunks = chunkBytes(payload);
    const wrongHash = new Uint8Array(32).fill(1);

    await expect(
      reconstructInscription(
        7n,
        {
          getInscriptionMeta: async () => ({
            mimeType: 'text/plain',
            totalSize: BigInt(payload.length),
            totalChunks: BigInt(chunks.length),
            finalHash: wrongHash
          }),
          getChunk: async (_tokenId, index) => chunks[Number(index)] ?? null,
          getDependencies: async () => []
        },
        { strict: true }
      )
    ).rejects.toBeInstanceOf(ReconstructionVerificationError);
  });
});
