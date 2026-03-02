import { describe, expect, it } from 'vitest';
import {
  buildMiningFeeGuidance,
  estimateUploadBatchFeeMicroStx,
  MINING_FEE_ASSUMPTIONS
} from '../fee-guidance';

describe('fee guidance helper', () => {
  it('returns unavailable guidance when chunk count is missing', () => {
    const guidance = buildMiningFeeGuidance({ largestChunkCount: 0 });
    expect(guidance.available).toBe(false);
    expect(guidance.table).toHaveLength(0);
    expect(guidance.warnings[0]?.toLowerCase()).toContain('no active artwork');
  });

  it('estimates one-chunk upload below wallet default and warns clearly', () => {
    const guidance = buildMiningFeeGuidance({ largestChunkCount: 1 });
    expect(guidance.available).toBe(true);
    expect(guidance.batchCount).toBe(1);
    expect(guidance.uploadBatches).toHaveLength(1);
    expect(guidance.uploadBatches[0].recommendedPerTxMicroStx).toBe(
      estimateUploadBatchFeeMicroStx(1)
    );
    expect(guidance.uploadBatches[0].recommendedPerTxMicroStx).toBeLessThan(
      MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx
    );
    expect(
      guidance.warnings.some((warning) =>
        warning.toLowerCase().includes('final upload batch has 1 chunk')
      )
    ).toBe(true);
  });

  it('splits full and remainder batches from chunk count', () => {
    const guidance = buildMiningFeeGuidance({ largestChunkCount: 31 });
    expect(guidance.available).toBe(true);
    expect(guidance.chunkCount).toBe(31);
    expect(guidance.batchCount).toBe(2);
    expect(guidance.uploadBatches).toHaveLength(2);

    const [fullBatchRow, remainderRow] = guidance.uploadBatches;
    expect(fullBatchRow.batchCount).toBe(1);
    expect(fullBatchRow.chunkCountPerBatch).toBe(
      MINING_FEE_ASSUMPTIONS.uploadBatchChunkSize
    );
    expect(fullBatchRow.recommendedPerTxMicroStx).toBe(
      MINING_FEE_ASSUMPTIONS.walletDefaultTxMicroStx
    );

    expect(remainderRow.batchCount).toBe(1);
    expect(remainderRow.chunkCountPerBatch).toBe(1);
    expect(remainderRow.recommendedPerTxMicroStx).toBe(
      estimateUploadBatchFeeMicroStx(1)
    );
  });

  it('computes total row savings versus wallet defaults', () => {
    const guidance = buildMiningFeeGuidance({ largestChunkCount: 18 });
    const totalRow = guidance.table.find((row) => row.step === 'total');
    expect(totalRow).toBeTruthy();
    expect(totalRow?.walletDefaultTotalMicroStx).toBeGreaterThan(
      totalRow?.recommendedTotalMicroStx ?? 0
    );
    expect(guidance.totals.savingsMicroStx).toBeGreaterThan(0);
    expect(guidance.totals.highBallparkMicroStx).toBeGreaterThan(
      guidance.totals.lowBallparkMicroStx
    );
  });
});
