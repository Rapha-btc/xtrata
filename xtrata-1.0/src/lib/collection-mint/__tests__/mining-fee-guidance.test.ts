import { describe, expect, it } from 'vitest';
import {
  formatMiningFeeMicroStx,
  toChunkCountLabel
} from '../mining-fee-guidance';

describe('collection mining fee guidance helpers', () => {
  it('formats microstx values to STX labels', () => {
    expect(formatMiningFeeMicroStx(3_000)).toBe('0.003000 STX');
    expect(formatMiningFeeMicroStx(500_000)).toBe('0.500000 STX');
  });

  it('returns placeholder labels for invalid fee values', () => {
    expect(formatMiningFeeMicroStx(null)).toBe('—');
    expect(formatMiningFeeMicroStx(Number.NaN)).toBe('—');
    expect(formatMiningFeeMicroStx(-1)).toBe('—');
  });

  it('formats chunk counts safely', () => {
    expect(toChunkCountLabel(31)).toBe('31');
    expect(toChunkCountLabel(0)).toBe('—');
    expect(toChunkCountLabel(undefined)).toBe('—');
  });
});
