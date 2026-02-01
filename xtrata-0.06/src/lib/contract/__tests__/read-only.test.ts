import { describe, expect, it } from 'vitest';
import { isRateLimitError } from '../read-only';

describe('read-only retries', () => {
  it('detects rate limit errors', () => {
    expect(isRateLimitError(new Error('Response 429: Too Many Requests'))).toBe(true);
    expect(isRateLimitError('rate limit exceeded')).toBe(true);
    expect(isRateLimitError('429')).toBe(true);
    expect(isRateLimitError('something else')).toBe(false);
  });
});
