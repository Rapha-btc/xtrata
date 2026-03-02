import { formatMicroStx } from '../contract/fees';

export type MiningFeeGuidanceRow = {
  step: 'begin' | 'upload' | 'seal' | 'total';
  label: string;
  txCount: number;
  chunkCount: number;
  recommendedPerTxMicroStx: number | null;
  recommendedTotalMicroStx: number;
  walletDefaultPerTxMicroStx: number | null;
  walletDefaultTotalMicroStx: number;
  savingsMicroStx: number;
  note: string;
};

export type UploadBatchFeeRow = {
  label: string;
  batchCount: number;
  chunkCountPerBatch: number;
  totalChunks: number;
  recommendedPerTxMicroStx: number;
  recommendedTotalMicroStx: number;
  walletDefaultPerTxMicroStx: number;
  walletDefaultTotalMicroStx: number;
  savingsMicroStx: number;
  note: string;
};

export type CollectionMiningFeeGuidance = {
  collectionId: string;
  collectionSlug: string | null;
  largestAsset: {
    assetId: string | null;
    path: string | null;
    filename: string | null;
    state: string | null;
    totalBytes: number;
    totalChunks: number;
  } | null;
  assetCounts: {
    total: number;
    active: number;
  };
  generatedAt: number;
  available: boolean;
  chunkCount: number;
  batchCount: number;
  assumptions: {
    beginTxMicroStx: number;
    sealTxMicroStx: number;
    walletDefaultTxMicroStx: number;
    uploadBatchChunkSize: number;
    perChunkUploadMicroStx: number;
  };
  table: MiningFeeGuidanceRow[];
  uploadBatches: UploadBatchFeeRow[];
  totals: {
    recommendedMicroStx: number;
    walletDefaultMicroStx: number;
    lowBallparkMicroStx: number;
    highBallparkMicroStx: number;
    savingsMicroStx: number;
  };
  warnings: string[];
};

export const formatMiningFeeMicroStx = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '—';
  }
  return formatMicroStx(Math.round(value));
};

export const toChunkCountLabel = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '—';
  }
  return Math.floor(value).toLocaleString();
};
