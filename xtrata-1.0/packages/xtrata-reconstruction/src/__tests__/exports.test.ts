import { describe, expect, it } from 'vitest';
import * as reconstruction from '../index';

describe('reconstruction public exports', () => {
  it('exposes deterministic payload helpers', () => {
    expect(typeof reconstruction.CHUNK_SIZE).toBe('number');
    expect(typeof reconstruction.chunkBytes).toBe('function');
    expect(typeof reconstruction.assembleChunks).toBe('function');
    expect(typeof reconstruction.computeExpectedHash).toBe('function');
    expect(typeof reconstruction.verifyPayload).toBe('function');
  });

  it('exposes graph and end-to-end reconstruction helpers', () => {
    expect(typeof reconstruction.resolveDependencies).toBe('function');
    expect(typeof reconstruction.reconstructInscription).toBe('function');
  });
});
