import { describe, expect, it } from 'vitest';
import { isValidSlug, normalizeSlug, staysWithinLimit } from '../collections';

describe('collections helpers', () => {
  it('normalizes slug by lowercasing and replacing invalid chars', () => {
    expect(normalizeSlug('  Foo Bar!!__   ')).toBe('foo-bar----');
  });

  it('validates slug patterns correctly', () => {
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('xtrata-collection-123')).toBe(true);
    expect(isValidSlug('Invalid_Slug')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
  });

  it('enforces collection bytes limit', () => {
    expect(staysWithinLimit(100000, 50000, 200000)).toBe(true);
    expect(staysWithinLimit(180000, 50000, 200000)).toBe(false);
  });
});
