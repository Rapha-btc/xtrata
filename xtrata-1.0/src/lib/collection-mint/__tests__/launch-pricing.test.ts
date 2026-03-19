import { describe, expect, it } from 'vitest';
import {
  resolveDisplayedMintPriceFromOnChainMintPrice,
  resolveLockedCollectionMintFeeFloor,
  resolveManagedCollectionMintPrice,
  resolveOnChainMintPriceFromDisplayedMintPrice
} from '../launch-pricing';
import { resolveCollectionMintPricingMetadata } from '../pricing-metadata';

describe('resolveLockedCollectionMintFeeFloor', () => {
  it('includes begin and seal protocol fees in the floor', () => {
    const floor = resolveLockedCollectionMintFeeFloor({
      maxChunks: 1,
      feeUnitMicroStx: 100_000n
    });

    expect(floor).toEqual({
      maxChunks: 1,
      feeBatches: 1,
      beginFeeMicroStx: 100_000n,
      sealFeeMicroStx: 200_000n,
      totalProtocolFeeMicroStx: 300_000n
    });
  });
});

describe('display/on-chain mint price conversion', () => {
  it('derives the on-chain payout base from the displayed mint price', () => {
    expect(
      resolveOnChainMintPriceFromDisplayedMintPrice({
        displayedMintPriceMicroStx: 800_000n,
        feeFloorMicroStx: 300_000n
      })
    ).toBe(500_000n);
  });

  it('returns null when the displayed price is below the locked fee floor', () => {
    expect(
      resolveOnChainMintPriceFromDisplayedMintPrice({
        displayedMintPriceMicroStx: 299_999n,
        feeFloorMicroStx: 300_000n
      })
    ).toBeNull();
  });

  it('rebuilds the collector-facing mint price from the on-chain payout base', () => {
    expect(
      resolveDisplayedMintPriceFromOnChainMintPrice({
        onChainMintPriceMicroStx: 500_000n,
        feeFloorMicroStx: 300_000n
      })
    ).toBe(800_000n);
  });
});

describe('resolveManagedCollectionMintPrice', () => {
  it('prefers synced metadata when available', () => {
    const price = resolveManagedCollectionMintPrice({
      paymentModel: 'seal',
      contractMintPriceMicroStx: 500_000n,
      pricing: resolveCollectionMintPricingMetadata({
        mode: 'price-includes-total-fees',
        mintPriceMicroStx: '800000',
        onChainMintPriceMicroStx: '500000'
      }),
      pricingLockMaxChunks: 1,
      feeUnitMicroStx: 100_000n
    });

    expect(price).toBe(800_000n);
  });

  it('falls back to on-chain plus locked fee floor when metadata is raw', () => {
    const price = resolveManagedCollectionMintPrice({
      paymentModel: 'seal',
      contractMintPriceMicroStx: 500_000n,
      pricing: resolveCollectionMintPricingMetadata({
        mode: 'raw-on-chain',
        onChainMintPriceMicroStx: '500000'
      }),
      pricingLockMaxChunks: 1,
      feeUnitMicroStx: 100_000n
    });

    expect(price).toBe(800_000n);
  });
});
