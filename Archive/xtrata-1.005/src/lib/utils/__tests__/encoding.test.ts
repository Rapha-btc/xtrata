import { describe, expect, it } from 'vitest';
import { bytesToHex } from '../encoding';

describe('bytesToHex', () => {
  it('converts bytes to hex string', () => {
    const value = new Uint8Array([0, 15, 255]);
    expect(bytesToHex(value)).toBe('000fff');
  });
});
