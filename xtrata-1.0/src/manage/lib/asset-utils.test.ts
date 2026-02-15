import { describe, expect, it } from 'vitest';
import { chunkBytes, computeExpectedHash } from '../../lib/chunking/hash';
import { bytesToHex } from '../../lib/utils/encoding';
import { chunkCount, hexDigest } from './asset-utils';

describe('asset-utils', () => {
  it('computes chunk count with a minimum of one chunk', () => {
    expect(chunkCount(0)).toBe(1);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(16_384)).toBe(1);
    expect(chunkCount(16_385)).toBe(2);
  });

  it('computes digest using protocol expected hash algorithm', async () => {
    const bytes = new Uint8Array(20_000);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 251;
    }
    const file = new File([bytes], 'test.bin', {
      type: 'application/octet-stream'
    });
    const expected = bytesToHex(computeExpectedHash(chunkBytes(bytes)));
    const actual = await hexDigest(file);
    expect(actual).toBe(expected);
  });
});
