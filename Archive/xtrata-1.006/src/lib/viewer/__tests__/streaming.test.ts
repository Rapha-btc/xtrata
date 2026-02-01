import { describe, expect, it } from 'vitest';
import { shouldAllowTokenUriPreview } from '../streaming';

describe('shouldAllowTokenUriPreview', () => {
  it('blocks token uri preview while streaming with no preview content', () => {
    expect(
      shouldAllowTokenUriPreview({
        hasMeta: true,
        contentError: false,
        streamPhase: 'buffering',
        hasPreviewContent: false,
        shouldStream: true
      })
    ).toBe(false);
  });

  it('allows token uri preview when stream errors', () => {
    expect(
      shouldAllowTokenUriPreview({
        hasMeta: true,
        contentError: false,
        streamPhase: 'error',
        hasPreviewContent: false,
        shouldStream: true
      })
    ).toBe(true);
  });

  it('allows token uri preview when metadata is missing', () => {
    expect(
      shouldAllowTokenUriPreview({
        hasMeta: false,
        contentError: false,
        streamPhase: 'idle',
        hasPreviewContent: false,
        shouldStream: false
      })
    ).toBe(true);
  });

  it('allows token uri preview when not streaming and no preview content', () => {
    expect(
      shouldAllowTokenUriPreview({
        hasMeta: true,
        contentError: false,
        streamPhase: 'idle',
        hasPreviewContent: false,
        shouldStream: false
      })
    ).toBe(true);
  });
});
