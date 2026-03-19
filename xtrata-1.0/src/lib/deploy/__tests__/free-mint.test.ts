import { describe, expect, it } from 'vitest';
import {
  isDeployFreeMintMode,
  resolveDeployMintPriceOverrideMicroStx
} from '../free-mint';

describe('deploy free mint helpers', () => {
  it('enables free mint mode only for standard mints', () => {
    expect(
      isDeployFreeMintMode({ mintType: 'standard', freeMintEnabled: true })
    ).toBe(true);
    expect(
      isDeployFreeMintMode({ mintType: 'pre-inscribed', freeMintEnabled: true })
    ).toBe(false);
    expect(
      isDeployFreeMintMode({ mintType: 'standard', freeMintEnabled: false })
    ).toBe(false);
  });

  it('returns the absorbed fee floor as the effective free mint price override', () => {
    expect(
      resolveDeployMintPriceOverrideMicroStx({
        mintType: 'standard',
        freeMintEnabled: true,
        feeFloorMintPriceMicroStx: 3000n
      })
    ).toBe(3000n);
    expect(
      resolveDeployMintPriceOverrideMicroStx({
        mintType: 'standard',
        freeMintEnabled: true,
        feeFloorMintPriceMicroStx: null
      })
    ).toBeNull();
    expect(
      resolveDeployMintPriceOverrideMicroStx({
        mintType: 'pre-inscribed',
        freeMintEnabled: true,
        feeFloorMintPriceMicroStx: 3000n
      })
    ).toBeNull();
  });
});
