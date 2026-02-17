import { describe, expect, it } from 'vitest';
import {
  CONTRACT_ERROR_CODES,
  ContractCallError,
  ReadOnlyBackoffError,
  SdkValidationError
} from '../errors.js';

describe('sdk error contracts', () => {
  it('keeps known contract error code mappings stable', () => {
    expect(CONTRACT_ERROR_CODES['100']).toBe('ERR_NOT_AUTHORIZED');
    expect(CONTRACT_ERROR_CODES['101']).toBe('ERR_NOT_FOUND');
    expect(CONTRACT_ERROR_CODES['102']).toBe('ERR_INVALID_BATCH');
    expect(CONTRACT_ERROR_CODES['103']).toBe('ERR_HASH_MISMATCH');
    expect(CONTRACT_ERROR_CODES['104']).toBe('ERR_ALREADY_SEALED');
    expect(CONTRACT_ERROR_CODES['105']).toBe('ERR_METADATA_FROZEN');
    expect(CONTRACT_ERROR_CODES['106']).toBe('ERR_WRONG_INDEX');
    expect(CONTRACT_ERROR_CODES['107']).toBe('ERR_INVALID_URI');
    expect(CONTRACT_ERROR_CODES['109']).toBe('ERR_PAUSED');
    expect(CONTRACT_ERROR_CODES['110']).toBe('ERR_INVALID_FEE');
    expect(CONTRACT_ERROR_CODES['111']).toBe('ERR_DEPENDENCY_MISSING');
    expect(CONTRACT_ERROR_CODES['112']).toBe('ERR_EXPIRED');
    expect(CONTRACT_ERROR_CODES['113']).toBe('ERR_NOT_EXPIRED');
    expect(CONTRACT_ERROR_CODES['114']).toBe('ERR_DUPLICATE');
  });

  it('formats contract call errors with known and unknown codes', () => {
    const known = new ContractCallError(100n, CONTRACT_ERROR_CODES['100']);
    expect(known.message).toBe('Contract error ERR_NOT_AUTHORIZED (u100)');
    expect(known.code).toBe(100n);

    const unknown = new ContractCallError(999n);
    expect(unknown.message).toBe('Contract error u999');
    expect(unknown.errorName).toBeUndefined();
  });

  it('surfaces read-only retry backoff metadata', () => {
    const backoff = new ReadOnlyBackoffError(2500);
    expect(backoff.message).toBe('Read-only calls paused for 2500ms');
    expect(backoff.retryAfterMs).toBe(2500);
  });

  it('surfaces validation error code + message for caller handling', () => {
    const validationError = new SdkValidationError(
      'invalid-input',
      'senderAddress is required.'
    );
    expect(validationError.name).toBe('SdkValidationError');
    expect(validationError.code).toBe('invalid-input');
    expect(validationError.message).toBe('senderAddress is required.');
  });
});
