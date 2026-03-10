import { describe, expect, it } from 'vitest';
import { summarizeLiveMintStatusError } from '../status-errors';

describe('summarizeLiveMintStatusError', () => {
  it('returns a short rate-limit summary with retry timing', () => {
    expect(
      summarizeLiveMintStatusError(new Error('429 Too Many Requests'), {
        rateLimitBackoffMs: 15 * 60_000
      })
    ).toBe('Mint status refresh paused by rate limiting. Retry in about 15 min.');
  });

  it('maps network failures to a compact warning', () => {
    expect(summarizeLiveMintStatusError(new Error('Failed to fetch'))).toBe(
      'Mint status temporarily unavailable. Network read failed.'
    );
  });

  it('collapses invalid HTML responses to a fixed warning', () => {
    expect(
      summarizeLiveMintStatusError(
        new Error('<!doctype html><html><body>Bad Gateway</body></html>')
      )
    ).toBe('Mint status temporarily unavailable. Upstream response was invalid.');
  });

  it('maps missing contract responses to a compact warning', () => {
    expect(
      summarizeLiveMintStatusError(new Error('NoSuchContract: contract not found'))
    ).toBe('Mint status temporarily unavailable. Contract data was not found.');
  });

  it('falls back to a generic summary for unknown errors', () => {
    expect(summarizeLiveMintStatusError({ detail: 'very long upstream payload' })).toBe(
      'Mint status temporarily unavailable.'
    );
  });
});
