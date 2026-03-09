import { describe, expect, it, vi } from 'vitest';
import {
  buildMintWalletGuidanceMessage,
  confirmMintWalletGuidance
} from '../wallet-guidance';

describe('mint wallet guidance', () => {
  it('includes wallet and fee guidance in the popup copy', () => {
    const message = buildMintWalletGuidanceMessage('single');

    expect(message).toContain('Avoid Leather wallet for inscriptions.');
    expect(message).toContain('Use Xverse wallet for a better inscription experience.');
    expect(message).toContain(
      'increase or decrease it manually to the correct amount before approving.'
    );
    expect(message).toContain('the fee is too low');
  });

  it('returns true when confirm is unavailable', () => {
    const originalConfirm = globalThis.confirm;
    delete (globalThis as typeof globalThis & { confirm?: typeof confirm }).confirm;

    expect(confirmMintWalletGuidance('collection')).toBe(true);

    globalThis.confirm = originalConfirm;
  });

  it('delegates to global confirm when available', () => {
    const originalConfirm = globalThis.confirm;
    const confirmSpy = vi.fn(() => false);
    globalThis.confirm = confirmSpy;

    expect(confirmMintWalletGuidance('resume')).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(
      buildMintWalletGuidanceMessage('resume')
    );

    globalThis.confirm = originalConfirm;
  });
});
