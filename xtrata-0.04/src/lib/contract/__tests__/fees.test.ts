import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEE_UNIT_MICROSTX,
  estimateBatchContractFees,
  estimateContractFees,
  getFeeSchedule
} from '../fees';

describe('contract fee estimates', () => {
  it('estimates fee-unit fees for v1.1.1', () => {
    const schedule = getFeeSchedule({ protocolVersion: '1.1.1' }, 250_000);
    expect(schedule.model).toBe('fee-unit');
    expect(schedule.feeUnitMicroStx).toBe(250_000);

    const estimate = estimateContractFees({ schedule, totalChunks: 120 });
    expect(estimate.feeBatches).toBe(3);
    expect(estimate.beginMicroStx).toBe(250_000);
    expect(estimate.sealMicroStx).toBe(1_000_000);
    expect(estimate.totalMicroStx).toBe(1_250_000);
  });

  it('defaults the fee unit when missing', () => {
    const schedule = getFeeSchedule({ protocolVersion: '1.1.1' }, null);
    expect(schedule.feeUnitMicroStx).toBe(DEFAULT_FEE_UNIT_MICROSTX);
  });

  it('estimates batch fees by summing per-item fees', () => {
    const schedule = getFeeSchedule({ protocolVersion: '1.1.1' }, 250_000);
    const estimate = estimateBatchContractFees({
      schedule,
      totalChunks: [120, 10]
    });
    const singleA = estimateContractFees({ schedule, totalChunks: 120 });
    const singleB = estimateContractFees({ schedule, totalChunks: 10 });

    expect(estimate.itemCount).toBe(2);
    expect(estimate.beginMicroStx).toBe(singleA.beginMicroStx + singleB.beginMicroStx);
    expect(estimate.sealMicroStx).toBe(singleA.sealMicroStx + singleB.sealMicroStx);
    expect(estimate.totalMicroStx).toBe(estimate.beginMicroStx + estimate.sealMicroStx);
  });
});
