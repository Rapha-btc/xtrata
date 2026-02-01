import { describe, expect, it } from 'vitest';
import { buildTokenPage, buildTokenRange } from '../model';

describe('viewer model', () => {
  it('builds token id ranges', () => {
    expect(buildTokenRange(0n)).toEqual([0n]);
    expect(buildTokenRange(2n)).toEqual([0n, 1n, 2n]);
  });

  it('builds token pages from a range', () => {
    expect(buildTokenPage(0n, 0, 16)).toEqual([0n]);
    expect(buildTokenPage(15n, 0, 16)).toHaveLength(16);
    expect(buildTokenPage(16n, 0, 16)).toHaveLength(16);
    expect(buildTokenPage(16n, 1, 16)).toEqual([16n]);
  });
});
