import { validateStacksAddress } from '@stacks/transactions';

export type TransferValidationResult = {
  ok: boolean;
  reason:
    | 'missing-wallet'
    | 'network-mismatch'
    | 'missing-token'
    | 'missing-recipient'
    | 'invalid-recipient'
    | 'self-recipient'
    | null;
  recipient?: string;
};

export const validateTransferRequest = (params: {
  senderAddress?: string | null;
  recipientAddress: string;
  tokenId?: bigint | null;
  networkMismatch?: boolean;
}): TransferValidationResult => {
  if (!params.senderAddress) {
    return { ok: false, reason: 'missing-wallet' };
  }
  if (params.networkMismatch) {
    return { ok: false, reason: 'network-mismatch' };
  }
  if (params.tokenId === null || params.tokenId === undefined) {
    return { ok: false, reason: 'missing-token' };
  }
  const trimmed = params.recipientAddress.trim();
  if (!trimmed) {
    return { ok: false, reason: 'missing-recipient' };
  }
  if (!validateStacksAddress(trimmed)) {
    return { ok: false, reason: 'invalid-recipient' };
  }
  if (trimmed === params.senderAddress) {
    return { ok: false, reason: 'self-recipient' };
  }
  return {
    ok: true,
    reason: null,
    recipient: trimmed
  };
};

export const getTransferValidationMessage = (
  result: TransferValidationResult
): string | null => {
  if (result.ok) {
    return null;
  }
  switch (result.reason) {
    case 'missing-wallet':
      return 'Connect a wallet to transfer inscriptions.';
    case 'network-mismatch':
      return 'Network mismatch: switch wallet or contract before transferring.';
    case 'missing-token':
      return 'Select an inscription to transfer.';
    case 'missing-recipient':
      return 'Enter a recipient address.';
    case 'invalid-recipient':
      return 'Enter a valid Stacks address.';
    case 'self-recipient':
      return 'Recipient must be different from the sender.';
    default:
      return 'Transfer is not ready yet.';
  }
};
