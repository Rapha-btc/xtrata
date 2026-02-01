import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEE_UNIT_MICROSTX,
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
});
