export const MICROSTX_PER_STX = 1_000_000;

export const MINING_FEE_ASSUMPTIONS = Object.freeze({
  beginTxMicroStx: 3_000,
  sealTxMicroStx: 3_000,
  walletDefaultTxMicroStx: 500_000,
  uploadBatchChunkSize: 30,
  perChunkUploadMicroStx: 500_000 / 30,
  lowBallparkMultiplier: 0.75,
  highBallparkMultiplier: 1.35
});

export type MiningFeeTableRow = {
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

export type MiningFeeGuidance = {
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
  table: MiningFeeTableRow[];
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

const toPositiveInteger = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const formatMicroStx = (value: number) =>
  `${(value / MICROSTX_PER_STX).toFixed(6)} STX`;

export const estimateUploadBatchFeeMicroStx = (chunkCount: number) => {
  const normalizedChunkCount = toPositiveInteger(chunkCount);
  if (normalizedChunkCount <= 0) {
    return 0;
  }
  const estimated =
    MINING_FEE_ASSUMPTIONS.perChunkUploadMicroStx * normalizedChunkCount;
  return Math.max(MINING_FEE_ASSUMPTIONS.beginTxMicroStx, Math.round(estimated));
};

export const buildMiningFeeGuidance = (params: {
  largestChunkCount: unknown;
}): MiningFeeGuidance => {
  const chunkCount = toPositiveInteger(params.largestChunkCount);
  const warnings: string[] = [];

  if (chunkCount <= 0) {
    warnings.push(
      'No active artwork files found yet. Upload at least one file to generate mining-fee estimates.'
    );
    return {
      available: false,
      chunkCount: 0,
      batchCount: 0,
      assumptions: {
        beginTxMicroStx: MINING_FEE_ASSUMPTIONS.beginTxMicroStx,
        sealTxMicroStx: MINING_FEE_ASSUMPTIONS.sealTxMicroStx,
        walletDefaultTxMicroStx: MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx,
        uploadBatchChunkSize: MINING_FEE_ASSUMPTIONS.uploadBatchChunkSize,
        perChunkUploadMicroStx: MINING_FEE_ASSUMPTIONS.perChunkUploadMicroStx
      },
      table: [],
      uploadBatches: [],
      totals: {
        recommendedMicroStx: 0,
        walletDefaultMicroStx: 0,
        lowBallparkMicroStx: 0,
        highBallparkMicroStx: 0,
        savingsMicroStx: 0
      },
      warnings
    };
  }

  const fullBatchChunkSize = MINING_FEE_ASSUMPTIONS.uploadBatchChunkSize;
  const fullBatchCount = Math.floor(chunkCount / fullBatchChunkSize);
  const remainderChunkCount = chunkCount % fullBatchChunkSize;
  const batchCount =
    fullBatchCount + (remainderChunkCount > 0 ? 1 : 0);

  const uploadBatches: UploadBatchFeeRow[] = [];
  if (fullBatchCount > 0) {
    const perTxFee = estimateUploadBatchFeeMicroStx(fullBatchChunkSize);
    const recommendedTotalMicroStx = perTxFee * fullBatchCount;
    const walletDefaultTotalMicroStx =
      MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx * fullBatchCount;
    uploadBatches.push({
      label:
        fullBatchCount === 1
          ? `Full upload batch (${fullBatchChunkSize} chunks)`
          : `Full upload batches (${fullBatchChunkSize} chunks each)`,
      batchCount: fullBatchCount,
      chunkCountPerBatch: fullBatchChunkSize,
      totalChunks: fullBatchChunkSize * fullBatchCount,
      recommendedPerTxMicroStx: perTxFee,
      recommendedTotalMicroStx,
      walletDefaultPerTxMicroStx: MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx,
      walletDefaultTotalMicroStx,
      savingsMicroStx: Math.max(
        0,
        walletDefaultTotalMicroStx - recommendedTotalMicroStx
      ),
      note: `Calculated from ~${formatMicroStx(
        MINING_FEE_ASSUMPTIONS.perChunkUploadMicroStx
      )} per chunk.`
    });
  }
  if (remainderChunkCount > 0) {
    const perTxFee = estimateUploadBatchFeeMicroStx(remainderChunkCount);
    const walletDefaultTotalMicroStx =
      MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx;
    uploadBatches.push({
      label:
        fullBatchCount > 0
          ? `Final upload batch (${remainderChunkCount} chunk${
              remainderChunkCount === 1 ? '' : 's'
            })`
          : `Single upload batch (${remainderChunkCount} chunk${
              remainderChunkCount === 1 ? '' : 's'
            })`,
      batchCount: 1,
      chunkCountPerBatch: remainderChunkCount,
      totalChunks: remainderChunkCount,
      recommendedPerTxMicroStx: perTxFee,
      recommendedTotalMicroStx: perTxFee,
      walletDefaultPerTxMicroStx: MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx,
      walletDefaultTotalMicroStx,
      savingsMicroStx: Math.max(0, walletDefaultTotalMicroStx - perTxFee),
      note:
        remainderChunkCount === 1
          ? 'This is a one-chunk upload batch. Wallet defaults are often much higher than needed.'
          : `Scaled from ${remainderChunkCount} chunks in the final batch.`
    });
  }

  const uploadRecommendedTotal = uploadBatches.reduce(
    (sum, row) => sum + row.recommendedTotalMicroStx,
    0
  );
  const uploadWalletDefaultTotal = batchCount * MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx;
  const beginRecommended = MINING_FEE_ASSUMPTIONS.beginTxMicroStx;
  const sealRecommended = MINING_FEE_ASSUMPTIONS.sealTxMicroStx;
  const beginWalletDefault = MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx;
  const sealWalletDefault = MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx;

  const recommendedTotal =
    beginRecommended + uploadRecommendedTotal + sealRecommended;
  const walletDefaultTotal =
    beginWalletDefault + uploadWalletDefaultTotal + sealWalletDefault;
  const totalTxCount = batchCount + 2;
  const averageRecommendedPerUploadTx =
    batchCount > 0 ? Math.round(uploadRecommendedTotal / batchCount) : 0;

  const table: MiningFeeTableRow[] = [
    {
      step: 'begin',
      label: 'Begin transaction',
      txCount: 1,
      chunkCount: 0,
      recommendedPerTxMicroStx: beginRecommended,
      recommendedTotalMicroStx: beginRecommended,
      walletDefaultPerTxMicroStx: beginWalletDefault,
      walletDefaultTotalMicroStx: beginWalletDefault,
      savingsMicroStx: Math.max(0, beginWalletDefault - beginRecommended),
      note:
        'Micro transaction only. This does not carry chunk payload bytes.'
    },
    {
      step: 'upload',
      label: `Upload batch transaction${batchCount === 1 ? '' : 's'}`,
      txCount: batchCount,
      chunkCount,
      recommendedPerTxMicroStx:
        batchCount > 0 ? averageRecommendedPerUploadTx : null,
      recommendedTotalMicroStx: uploadRecommendedTotal,
      walletDefaultPerTxMicroStx:
        batchCount > 0 ? MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx : null,
      walletDefaultTotalMicroStx: uploadWalletDefaultTotal,
      savingsMicroStx: Math.max(0, uploadWalletDefaultTotal - uploadRecommendedTotal),
      note: `Chunk-based estimate using ${chunkCount} chunk${
        chunkCount === 1 ? '' : 's'
      } across ${batchCount} batch${batchCount === 1 ? '' : 'es'}.`
    },
    {
      step: 'seal',
      label: 'Seal transaction',
      txCount: 1,
      chunkCount: 0,
      recommendedPerTxMicroStx: sealRecommended,
      recommendedTotalMicroStx: sealRecommended,
      walletDefaultPerTxMicroStx: sealWalletDefault,
      walletDefaultTotalMicroStx: sealWalletDefault,
      savingsMicroStx: Math.max(0, sealWalletDefault - sealRecommended),
      note:
        'Finalization transaction. Keep extra wallet balance available for protocol fees and mint price.'
    },
    {
      step: 'total',
      label: 'Estimated mining total',
      txCount: totalTxCount,
      chunkCount,
      recommendedPerTxMicroStx:
        totalTxCount > 0 ? Math.round(recommendedTotal / totalTxCount) : null,
      recommendedTotalMicroStx: recommendedTotal,
      walletDefaultPerTxMicroStx:
        totalTxCount > 0 ? MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx : null,
      walletDefaultTotalMicroStx: walletDefaultTotal,
      savingsMicroStx: Math.max(0, walletDefaultTotal - recommendedTotal),
      note:
        'Ballpark only. Wallet may require higher mining fees during congestion.'
    }
  ];

  if (beginWalletDefault >= beginRecommended * 25) {
    warnings.push(
      `Wallet default begin fee (${formatMicroStx(
        beginWalletDefault
      )}) is much higher than the suggested micro begin fee (${formatMicroStx(
        beginRecommended
      )}).`
    );
  }
  if (remainderChunkCount === 1) {
    warnings.push(
      `Final upload batch has 1 chunk. Suggested upload mining fee is ~${formatMicroStx(
        estimateUploadBatchFeeMicroStx(1)
      )}, not ${formatMicroStx(MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx)}.`
    );
  }
  warnings.push(
    'If the wallet rejects a lower mining fee, increase it gradually and retry. Protocol fees and mint price are separate from these mining-fee estimates.'
  );

  const lowBallparkMicroStx = Math.max(
    beginRecommended + sealRecommended,
    Math.round(recommendedTotal * MINING_FEE_ASSUMPTIONS.lowBallparkMultiplier)
  );
  const highBallparkMicroStx = Math.round(
    recommendedTotal * MINING_FEE_ASSUMPTIONS.highBallparkMultiplier
  );

  return {
    available: true,
    chunkCount,
    batchCount,
    assumptions: {
      beginTxMicroStx: MINING_FEE_ASSUMPTIONS.beginTxMicroStx,
      sealTxMicroStx: MINING_FEE_ASSUMPTIONS.sealTxMicroStx,
      walletDefaultTxMicroStx: MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx,
      uploadBatchChunkSize: MINING_FEE_ASSUMPTIONS.uploadBatchChunkSize,
      perChunkUploadMicroStx: MINING_FEE_ASSUMPTIONS.perChunkUploadMicroStx
    },
    table,
    uploadBatches,
    totals: {
      recommendedMicroStx: recommendedTotal,
      walletDefaultMicroStx: walletDefaultTotal,
      lowBallparkMicroStx,
      highBallparkMicroStx,
      savingsMicroStx: Math.max(0, walletDefaultTotal - recommendedTotal)
    },
    warnings
  };
};
