import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  batchChunks,
  chunkBytes,
  computeExpectedHash,
  CHUNK_SIZE,
  MAX_BATCH_SIZE
} from '../hash';

const bytesToHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

const computeExpectedHashNode = (chunks: Uint8Array[]) => {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    const combined = Buffer.concat([running, Buffer.from(chunk)]);
    running = createHash('sha256').update(combined).digest();
  }
  return new Uint8Array(running);
};

describe('chunking', () => {
  it('splits data into 16kb chunks with remainder', () => {
    const data = new Uint8Array(CHUNK_SIZE * 2 + 10);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = i % 256;
    }

    const chunks = chunkBytes(data);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(10);
  });

  it('batches chunks into groups of 50', () => {
    const chunks = Array.from({ length: 120 }, (_, index) => new Uint8Array([index]));
    const batches = batchChunks(chunks);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(MAX_BATCH_SIZE);
    expect(batches[1]).toHaveLength(MAX_BATCH_SIZE);
    expect(batches[2]).toHaveLength(20);
  });
});

describe('hashing', () => {
  it('matches the contract running-hash algorithm', () => {
    const data = new Uint8Array(CHUNK_SIZE + 3);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (i * 3) % 256;
    }

    const chunks = chunkBytes(data);
    const expected = computeExpectedHashNode(chunks);
    const actual = computeExpectedHash(chunks);

    expect(bytesToHex(actual)).toBe(bytesToHex(expected));
  });
});
