import { describe, expect, it } from 'vitest';
import { filterTokensByOwner } from '../ownership';
import type { TokenSummary } from '../types';

const tokens: TokenSummary[] = [
  {
    id: 1n,
    owner: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
    tokenUri: null,
    meta: null,
    svgDataUri: null
  },
  {
    id: 2n,
    owner: 'SPD60B1MGZVZR8758E86SR364N95VSP13E5FHYXE',
    tokenUri: null,
    meta: null,
    svgDataUri: null
  }
];

describe('filterTokensByOwner', () => {
  it('filters tokens by owner (case-insensitive)', () => {
    const result = filterTokensByOwner(
      tokens,
      'sp2jxkmsh007npyaqhkjpqmaqyad90nqgtvjvq02b'
    );
    expect(result.map((token) => token.id)).toEqual([1n]);
  });

  it('returns empty when no owner provided', () => {
    expect(filterTokensByOwner(tokens, null)).toEqual([]);
  });
});
