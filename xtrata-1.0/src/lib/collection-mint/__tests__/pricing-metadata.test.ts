import { describe, expect, it } from 'vitest';
import {
  isDisplayedCollectionMintFree,
  resolveCollectionMintPricingMetadata,
  resolveDisplayedCollectionMintPrice
} from '../pricing-metadata';

describe('resolveCollectionMintPricingMetadata', () => {
  it('reads canonical mint-price metadata', () => {
    const pricing = resolveCollectionMintPricingMetadata({
      mode: 'price-includes-total-fees',
      mintPriceMicroStx: '300000',
      onChainMintPriceMicroStx: '0',
      absorbedProtocolFeeMicroStx: '300000'
    });

    expect(pricing.mode).toBe('price-includes-total-fees');
    expect(pricing.mintPriceMicroStx).toBe(300_000n);
    expect(pricing.onChainMintPriceMicroStx).toBe(0n);
    expect(pricing.absorbedProtocolFeeMicroStx).toBe(300_000n);
  });

  it('accepts legacy advertised metadata as a fallback', () => {
    const pricing = resolveCollectionMintPricingMetadata({
      mode: 'advertised-includes-seal-fee',
      advertisedMintPriceMicroStx: '450000',
      onChainMintPriceMicroStx: '250000'
    });

    expect(pricing.mode).toBe('price-includes-seal-fee');
    expect(pricing.mintPriceMicroStx).toBe(450_000n);
    expect(pricing.onChainMintPriceMicroStx).toBe(250_000n);
  });
});

describe('resolveDisplayedCollectionMintPrice', () => {
  it('shows the configured mint price when pricing metadata matches on-chain state', () => {
    const displayed = resolveDisplayedCollectionMintPrice({
      activePhaseMintPriceMicroStx: null,
      onChainMintPriceMicroStx: 0n,
      paymentModel: 'seal',
      pricing: resolveCollectionMintPricingMetadata({
        mode: 'price-includes-total-fees',
        mintPriceMicroStx: '300000',
        onChainMintPriceMicroStx: '0'
      }),
      statusMintPriceMicroStx: 0n
    });

    expect(displayed).toBe(300_000n);
  });

  it('falls back to the on-chain price when metadata does not match', () => {
    const displayed = resolveDisplayedCollectionMintPrice({
      activePhaseMintPriceMicroStx: null,
      onChainMintPriceMicroStx: 120_000n,
      paymentModel: 'seal',
      pricing: resolveCollectionMintPricingMetadata({
        mode: 'price-includes-total-fees',
        mintPriceMicroStx: '300000',
        onChainMintPriceMicroStx: '0'
      }),
      statusMintPriceMicroStx: 50_000n
    });

    expect(displayed).toBe(120_000n);
  });
});

describe('isDisplayedCollectionMintFree', () => {
  it('returns true when metadata matches an absorbed-fee-only free mint', () => {
    const freeMint = isDisplayedCollectionMintFree({
      activePhaseMintPriceMicroStx: null,
      paymentModel: 'seal',
      pricing: resolveCollectionMintPricingMetadata({
        mode: 'price-includes-total-fees',
        mintPriceMicroStx: '300000',
        onChainMintPriceMicroStx: '0',
        absorbedProtocolFeeMicroStx: '300000'
      }),
      statusMintPriceMicroStx: 0n
    });

    expect(freeMint).toBe(true);
  });

  it('returns false when phase pricing is active or metadata is out of sync', () => {
    const activePhaseFreeMint = isDisplayedCollectionMintFree({
      activePhaseMintPriceMicroStx: 250_000n,
      paymentModel: 'seal',
      pricing: resolveCollectionMintPricingMetadata({
        mode: 'price-includes-total-fees',
        mintPriceMicroStx: '300000',
        onChainMintPriceMicroStx: '0',
        absorbedProtocolFeeMicroStx: '300000'
      }),
      statusMintPriceMicroStx: 0n
    });
    const staleMetadataFreeMint = isDisplayedCollectionMintFree({
      activePhaseMintPriceMicroStx: null,
      paymentModel: 'seal',
      pricing: resolveCollectionMintPricingMetadata({
        mode: 'price-includes-total-fees',
        mintPriceMicroStx: '300000',
        onChainMintPriceMicroStx: '0',
        absorbedProtocolFeeMicroStx: '300000'
      }),
      statusMintPriceMicroStx: 10_000n
    });

    expect(activePhaseFreeMint).toBe(false);
    expect(staleMetadataFreeMint).toBe(false);
  });
});
