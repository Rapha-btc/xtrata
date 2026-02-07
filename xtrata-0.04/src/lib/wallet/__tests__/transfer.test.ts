import { describe, expect, it } from 'vitest';
import {
  getTransferValidationMessage,
  validateTransferRequest
} from '../transfer';

const SENDER = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
const RECIPIENT = 'SPD60B1MGZVZR8758E86SR364N95VSP13E5FHYXE';

describe('transfer validation', () => {
  it('requires a wallet address', () => {
    const result = validateTransferRequest({
      senderAddress: null,
      recipientAddress: RECIPIENT,
      tokenId: 1n
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-wallet');
    expect(getTransferValidationMessage(result)).toBe(
      'Connect a wallet to transfer inscriptions.'
    );
  });

  it('blocks on network mismatch', () => {
    const result = validateTransferRequest({
      senderAddress: SENDER,
      recipientAddress: RECIPIENT,
      tokenId: 1n,
      networkMismatch: true
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network-mismatch');
  });

  it('requires a token selection', () => {
    const result = validateTransferRequest({
      senderAddress: SENDER,
      recipientAddress: RECIPIENT,
      tokenId: null
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-token');
  });

  it('requires a recipient address', () => {
    const result = validateTransferRequest({
      senderAddress: SENDER,
      recipientAddress: '  ',
      tokenId: 5n
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-recipient');
  });

  it('validates the recipient address', () => {
    const result = validateTransferRequest({
      senderAddress: SENDER,
      recipientAddress: 'SPBAD',
      tokenId: 5n
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-recipient');
  });

  it('blocks self transfers', () => {
    const result = validateTransferRequest({
      senderAddress: SENDER,
      recipientAddress: SENDER,
      tokenId: 5n
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('self-recipient');
  });

  it('accepts a valid transfer request', () => {
    const result = validateTransferRequest({
      senderAddress: SENDER,
      recipientAddress: ` ${RECIPIENT} `,
      tokenId: 5n
    });

    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.recipient).toBe(RECIPIENT);
  });
});
