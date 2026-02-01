export type InscriptionMeta = {
  owner: string;
  creator: string | null;
  mimeType: string;
  totalSize: bigint;
  totalChunks: bigint;
  sealed: boolean;
  finalHash: Uint8Array;
};

export type UploadState = {
  mimeType: string;
  totalSize: bigint;
  totalChunks: bigint;
  currentIndex: bigint;
  runningHash: Uint8Array;
};

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
  '111': 'ERR_DEPENDENCY_MISSING'
} as const;

export type ContractErrorName =
  (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES];

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
