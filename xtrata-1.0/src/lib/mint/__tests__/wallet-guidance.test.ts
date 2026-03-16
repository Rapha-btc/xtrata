import { describe, expect, it, vi } from 'vitest';
import {
  buildMintWalletGuidanceMessage,
  confirmMintWalletGuidance,
  confirmMintWalletGuidanceOrAbort,
  getMintWalletGuidanceCancelCopy
} from '../wallet-guidance';

describe('mint wallet guidance', () => {
  it('includes wallet and fee guidance in the popup copy', () => {
    const message = buildMintWalletGuidanceMessage('single');

    expect(message).toContain('Confirm the transaction details carefully before approving.');
    expect(message).toContain(
      'increase or decrease it manually to the correct amount before approving.'
    );
    expect(message).toContain('the fee is too low');
  });

  it('returns true when confirm is unavailable', () => {
    const originalConfirm = globalThis.confirm;
    delete (globalThis as typeof globalThis & { confirm?: typeof confirm }).confirm;

    expect(confirmMintWalletGuidance('collection-live')).toBe(true);

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

  it('applies centralized cancel copy for opted-in flows', () => {
    const originalConfirm = globalThis.confirm;
    const confirmSpy = vi.fn(() => false);
    const setStatus = vi.fn();
    const appendLog = vi.fn();
    globalThis.confirm = confirmSpy;

    expect(
      confirmMintWalletGuidanceOrAbort('collection-batch', {
        setStatus,
        appendLog
      })
    ).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(
      buildMintWalletGuidanceMessage('collection-batch')
    );
    expect(setStatus).toHaveBeenCalledWith(
      getMintWalletGuidanceCancelCopy('collection-batch').statusMessage
    );
    expect(appendLog).toHaveBeenCalledWith(
      getMintWalletGuidanceCancelCopy('collection-batch').logMessage
    );

    globalThis.confirm = originalConfirm;
  });
});
