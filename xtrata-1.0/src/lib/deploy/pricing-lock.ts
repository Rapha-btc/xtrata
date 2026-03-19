import { MAX_BATCH_SIZE } from '../chunking/hash';
import { SMALL_MINT_HELPER_MAX_CHUNKS } from '../mint/constants';

export type DeployPricingLockSnapshot = {
  version: 'v1';
  lockedAt: string;
  assetCount: number;
  maxChunks: number;
  maxBytes: number;
  totalBytes: number;
};

const toPositiveInteger = (value: unknown) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
};

export const parseDeployPricingLockSnapshot = (
  metadata: unknown
): DeployPricingLockSnapshot | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const metadataRecord = metadata as Record<string, unknown>;
  const lock = metadataRecord.deployPricingLock;
  if (!lock || typeof lock !== 'object') {
    return null;
  }
  const lockRecord = lock as Record<string, unknown>;
  const lockedAt =
    typeof lockRecord.lockedAt === 'string' ? lockRecord.lockedAt.trim() : '';
  const assetCount = toPositiveInteger(lockRecord.assetCount);
  const maxChunks = toPositiveInteger(lockRecord.maxChunks);
  const maxBytes = toPositiveInteger(lockRecord.maxBytes);
  const totalBytes = toPositiveInteger(lockRecord.totalBytes);
  if (!lockedAt || !assetCount || !maxChunks || !maxBytes || !totalBytes) {
    return null;
  }
  return {
    version: 'v1',
    lockedAt,
    assetCount,
    maxChunks,
    maxBytes,
    totalBytes
  };
};

export const estimateWorstCaseSealFeeMicroStx = (params: {
  maxChunks: number;
  feeUnitMicroStx: bigint;
}) => {
  const normalizedMaxChunks = Math.max(0, Math.floor(params.maxChunks));
  const batchCount =
    normalizedMaxChunks > 0 ? Math.ceil(normalizedMaxChunks / MAX_BATCH_SIZE) : 0;
  const sealMicroStx =
    normalizedMaxChunks > 0
      ? params.feeUnitMicroStx * BigInt(1 + batchCount)
      : 0n;
  return {
    batchCount,
    sealMicroStx
  };
};

export const evaluateDeployPriceSafety = (params: {
  mintPriceMicroStx: bigint;
  maxChunks: number;
  feeUnitMicroStx: bigint;
  singleTxChunkThreshold?: number;
}) => {
  const singleTxChunkThreshold =
    typeof params.singleTxChunkThreshold === 'number' &&
    Number.isFinite(params.singleTxChunkThreshold) &&
    params.singleTxChunkThreshold > 0
      ? Math.floor(params.singleTxChunkThreshold)
      : SMALL_MINT_HELPER_MAX_CHUNKS;
  const estimate = estimateWorstCaseSealFeeMicroStx({
    maxChunks: params.maxChunks,
    feeUnitMicroStx: params.feeUnitMicroStx
  });
  const normalizedMaxChunks = Math.max(0, Math.floor(params.maxChunks));
  const useSingleTxFeeProfile =
    normalizedMaxChunks > 0 && normalizedMaxChunks <= singleTxChunkThreshold;
  const worstCaseBeginFeeMicroStx = useSingleTxFeeProfile
    ? params.feeUnitMicroStx
    : 0n;
  const absorbedProtocolFeeMicroStx =
    estimate.sealMicroStx + worstCaseBeginFeeMicroStx;
  const marginMicroStx = params.mintPriceMicroStx - absorbedProtocolFeeMicroStx;
  return {
    feeBatches: estimate.batchCount,
    worstCaseSealFeeMicroStx: estimate.sealMicroStx,
    worstCaseBeginFeeMicroStx,
    absorbedProtocolFeeMicroStx,
    worstCaseTotalProtocolFeeMicroStx: absorbedProtocolFeeMicroStx,
    absorptionModel: useSingleTxFeeProfile
      ? ('single-tx-total-fees' as const)
      : ('seal-fee-only' as const),
    singleTxChunkThreshold,
    marginMicroStx,
    safe: marginMicroStx >= 0n
  };
};
