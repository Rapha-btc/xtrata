import { describe, expect, it } from 'vitest';
import { formatDecimalAmount, parseDecimalAmount } from '../amounts';

describe('amount helpers', () => {
  it('parses fixed-decimal token amounts', () => {
    expect(parseDecimalAmount('1', 6)).toBe(1_000_000n);
    expect(parseDecimalAmount('0.25', 6)).toBe(250_000n);
    expect(parseDecimalAmount('0.00000001', 8)).toBe(1n);
  });

  it('rejects invalid decimal amounts', () => {
    expect(parseDecimalAmount('', 6)).toBeNull();
    expect(parseDecimalAmount('abc', 6)).toBeNull();
    expect(parseDecimalAmount('0', 6)).toBeNull();
    expect(parseDecimalAmount('0.0000001', 6)).toBeNull();
  });

  it('formats fixed-decimal token amounts', () => {
    expect(formatDecimalAmount(250_000n, 6)).toBe('0.250000');
    expect(formatDecimalAmount(1n, 8)).toBe('0.00000001');
    expect(formatDecimalAmount(42n, 0)).toBe('42');
  });
});
