import { describe, expect, it } from 'vitest';
import {
  evaluateDeployPriceSafety,
  estimateWorstCaseSealFeeMicroStx,
  parseDeployPricingLockSnapshot
} from '../pricing-lock';

describe('deploy pricing lock helpers', () => {
  it('parses valid pricing lock snapshot from metadata', () => {
    const snapshot = parseDeployPricingLockSnapshot({
      deployPricingLock: {
        version: 'v1',
        lockedAt: '2026-02-23T00:00:00.000Z',
        assetCount: 12,
        maxChunks: 121,
        maxBytes: 1_234_567,
        totalBytes: 9_999_999
      }
    });

    expect(snapshot).toEqual({
      version: 'v1',
      lockedAt: '2026-02-23T00:00:00.000Z',
      assetCount: 12,
      maxChunks: 121,
      maxBytes: 1_234_567,
      totalBytes: 9_999_999
    });
  });

  it('rejects malformed lock snapshots', () => {
    expect(parseDeployPricingLockSnapshot(null)).toBeNull();
    expect(
      parseDeployPricingLockSnapshot({
        deployPricingLock: { assetCount: 1, maxChunks: 1, maxBytes: 1, totalBytes: 1 }
      })
    ).toBeNull();
    expect(
      parseDeployPricingLockSnapshot({
        deployPricingLock: {
          lockedAt: '2026-02-23T00:00:00.000Z',
          assetCount: 0,
          maxChunks: 1,
          maxBytes: 1,
          totalBytes: 1
        }
      })
    ).toBeNull();
  });

  it('estimates worst-case seal fee from max chunks', () => {
    const estimate = estimateWorstCaseSealFeeMicroStx({
      maxChunks: 120,
      feeUnitMicroStx: 100_000n
    });
    expect(estimate.batchCount).toBe(3);
    expect(estimate.sealMicroStx).toBe(400_000n);
  });

  it('evaluates deploy price safety margin', () => {
    const safe = evaluateDeployPriceSafety({
      mintPriceMicroStx: 1_000_000n,
      maxChunks: 120,
      feeUnitMicroStx: 100_000n
    });
    expect(safe.worstCaseSealFeeMicroStx).toBe(400_000n);
    expect(safe.worstCaseBeginFeeMicroStx).toBe(0n);
    expect(safe.absorbedProtocolFeeMicroStx).toBe(400_000n);
    expect(safe.absorptionModel).toBe('seal-fee-only');
    expect(safe.marginMicroStx).toBe(600_000n);
    expect(safe.safe).toBe(true);

    const exactFloorMatch = evaluateDeployPriceSafety({
      mintPriceMicroStx: 400_000n,
      maxChunks: 120,
      feeUnitMicroStx: 100_000n
    });
    expect(exactFloorMatch.marginMicroStx).toBe(0n);
    expect(exactFloorMatch.safe).toBe(true);

    const unsafe = evaluateDeployPriceSafety({
      mintPriceMicroStx: 399_999n,
      maxChunks: 120,
      feeUnitMicroStx: 100_000n
    });
    expect(unsafe.marginMicroStx).toBe(-1n);
    expect(unsafe.safe).toBe(false);
  });

  it('uses single-tx total protocol fee floor when max chunks fit helper route', () => {
    const evaluation = evaluateDeployPriceSafety({
      mintPriceMicroStx: 1_000_000n,
      maxChunks: 30,
      feeUnitMicroStx: 100_000n
    });
    expect(evaluation.worstCaseSealFeeMicroStx).toBe(200_000n);
    expect(evaluation.worstCaseBeginFeeMicroStx).toBe(100_000n);
    expect(evaluation.absorbedProtocolFeeMicroStx).toBe(300_000n);
    expect(evaluation.worstCaseTotalProtocolFeeMicroStx).toBe(300_000n);
    expect(evaluation.absorptionModel).toBe('single-tx-total-fees');
    expect(evaluation.marginMicroStx).toBe(700_000n);
    expect(evaluation.safe).toBe(true);
  });
});
