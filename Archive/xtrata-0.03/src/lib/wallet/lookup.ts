import { validateStacksAddress } from '@stacks/transactions';

export type WalletLookupState = {
  input: string;
  trimmed: string;
  entered: boolean;
  valid: boolean;
  lookupAddress: string | null;
  resolvedAddress: string | null;
};

export const getWalletLookupState = (
  input: string,
  walletAddress: string | null
): WalletLookupState => {
  const trimmed = input.trim();
  const entered = trimmed.length > 0;
  const valid = trimmed.length === 0 || validateStacksAddress(trimmed);
  const lookupAddress = entered && valid ? trimmed : null;
  const resolvedAddress = lookupAddress ?? walletAddress ?? null;
  return {
    input,
    trimmed,
    entered,
    valid,
    lookupAddress,
    resolvedAddress
  };
};
