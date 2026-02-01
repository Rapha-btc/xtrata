import { describe, expect, it } from 'vitest';
import { formatBytes, truncateMiddle } from '../format';

describe('format helpers', () => {
  it('truncates long strings', () => {
    expect(truncateMiddle('SPD60B1MGZVZR8758E86SR364N95VSP13E5FHYXE')).toBe(
      'SPD60B...5FHYXE'
    );
  });

  it('formats byte counts', () => {
    expect(formatBytes(512n)).toBe('512 B');
    expect(formatBytes(2048n)).toBe('2.0 KB');
  });
});
