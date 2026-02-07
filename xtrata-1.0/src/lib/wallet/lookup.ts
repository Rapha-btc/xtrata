import { validateStacksAddress } from '@stacks/transactions';
import { normalizeBnsName } from '../bns/helpers';

export type WalletLookupBnsStatus =
  | 'idle'
  | 'loading'
  | 'resolved'
  | 'missing'
  | 'error';

export type WalletLookupState = {
  input: string;
  trimmed: string;
  entered: boolean;
  valid: boolean;
  lookupAddress: string | null;
  lookupName: string | null;
  resolvedAddress: string | null;
  bnsStatus: WalletLookupBnsStatus;
  bnsError: string | null;
};

type WalletLookupOptions = {
  resolvedNameAddress?: string | null;
  bnsStatus?: WalletLookupBnsStatus;
  bnsError?: string | null;
};

export const getWalletLookupState = (
  input: string,
  walletAddress: string | null,
  options?: WalletLookupOptions
): WalletLookupState => {
  const trimmed = input.trim();
  const entered = trimmed.length > 0;
  const lookupAddress =
    entered && validateStacksAddress(trimmed) ? trimmed : null;
  const lookupName = lookupAddress ? null : normalizeBnsName(trimmed);
  const valid = !entered || !!lookupAddress || !!lookupName;
  const resolvedNameAddress = options?.resolvedNameAddress ?? null;
  const resolvedAddress = lookupName
    ? resolvedNameAddress
    : lookupAddress ?? walletAddress ?? null;
  const bnsStatus = lookupName ? options?.bnsStatus ?? 'idle' : 'idle';
  const bnsError = lookupName ? options?.bnsError ?? null : null;
  return {
    input,
    trimmed,
    entered,
    valid,
    lookupAddress,
    lookupName,
    resolvedAddress,
    bnsStatus,
    bnsError
  };
};
