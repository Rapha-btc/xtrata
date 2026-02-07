import { describe, expect, it } from 'vitest';
import { getWalletLookupState } from '../lookup';

describe('wallet lookup', () => {
  const sampleAddress = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

  it('accepts a valid stacks address', () => {
    const state = getWalletLookupState(sampleAddress, null);
    expect(state.valid).toBe(true);
    expect(state.lookupAddress).toBe(sampleAddress);
    expect(state.lookupName).toBeNull();
    expect(state.resolvedAddress).toBe(sampleAddress);
  });

  it('accepts a bns name and resolves when provided', () => {
    const initial = getWalletLookupState('alice.btc', null);
    expect(initial.valid).toBe(true);
    expect(initial.lookupName).toBe('alice.btc');
    expect(initial.lookupAddress).toBeNull();
    expect(initial.resolvedAddress).toBeNull();

    const resolved = getWalletLookupState('alice.btc', null, {
      resolvedNameAddress: sampleAddress,
      bnsStatus: 'resolved'
    });
    expect(resolved.resolvedAddress).toBe(sampleAddress);
    expect(resolved.bnsStatus).toBe('resolved');
  });

  it('rejects invalid input and falls back to connected wallet', () => {
    const state = getWalletLookupState('not a name', sampleAddress);
    expect(state.valid).toBe(false);
    expect(state.resolvedAddress).toBe(sampleAddress);
  });
});
