import { DEFAULT_BATCH_SIZE } from './constants';
import { MICROSTX_PER_STX } from '../contract/fees';

export const MEBIBYTE_BYTES = 1024n * 1024n;
export const DATA_MINING_FEE_MICROSTX_PER_MEBIBYTE =
  BigInt(MICROSTX_PER_STX);

const normalizePositiveInteger = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
};

export const estimateSequentialMintTransactions = (params: {
  totalChunks: number;
  batchSize?: number;
}) => {
  const totalChunks = normalizePositiveInteger(params.totalChunks);
  const batchSize = normalizePositiveInteger(
    params.batchSize ?? DEFAULT_BATCH_SIZE
  );
  if (totalChunks === 0 || batchSize === 0) {
    return {
      beginTransactions: 0,
      uploadTransactions: 0,
      sealTransactions: 0,
      totalTransactions: 0,
      batchSize
    };
  }
  const uploadTransactions = Math.ceil(totalChunks / batchSize);
  return {
    beginTransactions: 1,
    uploadTransactions,
    sealTransactions: 1,
    totalTransactions: 2 + uploadTransactions,
    batchSize
  };
};

export const estimateDataMiningFeeMicroStx = (
  totalBytes: bigint,
  microStxPerMebibyte = DATA_MINING_FEE_MICROSTX_PER_MEBIBYTE
) => {
  if (totalBytes <= 0n || microStxPerMebibyte <= 0n) {
    return 0n;
  }
  return (
    (totalBytes * microStxPerMebibyte + MEBIBYTE_BYTES / 2n) /
    MEBIBYTE_BYTES
  );
};
