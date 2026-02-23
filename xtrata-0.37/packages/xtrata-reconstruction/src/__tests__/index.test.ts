import { describe, expect, it } from 'vitest';
import {
  assembleChunks,
  chunkBytes,
  computeExpectedHash,
  reconstructInscription,
  resolveDependencies,
  verifyPayload
} from '../index';

const bytesFromText = (value: string) => new TextEncoder().encode(value);

describe('reconstruction sdk', () => {
  it('assembles chunks and verifies payload hash', () => {
    const source = bytesFromText('hello xtrata');
    const chunks = chunkBytes(source, 5);
    const assembled = assembleChunks(chunks);
    expect(assembled).toEqual(source);

    const expectedHash = computeExpectedHash(chunks);
    const verification = verifyPayload(source, expectedHash, 5);
    expect(verification.ok).toBe(true);
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
});
