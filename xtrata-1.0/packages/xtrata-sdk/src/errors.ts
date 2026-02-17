export const CONTRACT_ERROR_CODES = {
  '100': 'ERR_NOT_AUTHORIZED',
  '101': 'ERR_NOT_FOUND',
  '102': 'ERR_INVALID_BATCH',
  '103': 'ERR_HASH_MISMATCH',
  '104': 'ERR_ALREADY_SEALED',
  '105': 'ERR_METADATA_FROZEN',
  '106': 'ERR_WRONG_INDEX',
  '107': 'ERR_INVALID_URI',
  '109': 'ERR_PAUSED',
  '110': 'ERR_INVALID_FEE',
  '111': 'ERR_DEPENDENCY_MISSING',
  '112': 'ERR_EXPIRED',
  '113': 'ERR_NOT_EXPIRED',
  '114': 'ERR_DUPLICATE'
} as const;

export type ContractErrorName =
  (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES];

export class ClarityParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClarityParseError';
  }
}

export class ContractCallError extends Error {
  code: bigint;
  errorName: ContractErrorName | undefined;

  constructor(code: bigint, name?: ContractErrorName) {
    const message = name
      ? `Contract error ${name} (u${code.toString()})`
      : `Contract error u${code.toString()}`;
    super(message);
    this.name = 'ContractCallError';
    this.code = code;
    this.errorName = name;
  }
}

export class ReadOnlyBackoffError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Read-only calls paused for ${retryAfterMs}ms`);
    this.name = 'ReadOnlyBackoffError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class SdkValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SdkValidationError';
    this.code = code;
  }
}
