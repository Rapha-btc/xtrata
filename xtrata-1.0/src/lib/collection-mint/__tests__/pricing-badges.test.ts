import { describe, expect, it } from 'vitest';
import {
  isCollectionFreeMint,
  normalizeCollectionMintPriceDisplayMode
} from '../pricing-badges';

describe('collection pricing badges', () => {
  it('normalizes supported pricing modes', () => {
    expect(normalizeCollectionMintPriceDisplayMode('advertised-includes-seal-fee')).toBe(
      'advertised-includes-seal-fee'
    );
    expect(normalizeCollectionMintPriceDisplayMode('advertised-includes-total-fees')).toBe(
      'advertised-includes-total-fees'
    );
    expect(normalizeCollectionMintPriceDisplayMode('anything-else')).toBe('raw-on-chain');
  });

  it('marks absorbed-fee exact matches as free mint', () => {
    expect(
      isCollectionFreeMint({
        pricingMode: 'advertised-includes-seal-fee',
        displayedMintPriceMicroStx: 3000n,
        absorbedProtocolFeeMicroStx: 3000n
      })
    ).toBe(true);
    expect(
      isCollectionFreeMint({
        pricingMode: 'advertised-includes-total-fees',
        displayedMintPriceMicroStx: 3000n,
        absorbedProtocolFeeMicroStx: 3000n
      })
    ).toBe(true);
  });

  it('does not mark prices above the absorbed floor as free mint', () => {
    expect(
      isCollectionFreeMint({
        pricingMode: 'advertised-includes-seal-fee',
        displayedMintPriceMicroStx: 3001n,
        absorbedProtocolFeeMicroStx: 3000n
      })
    ).toBe(false);
  });

  it('does not mark raw on-chain pricing or missing values as free mint', () => {
    expect(
      isCollectionFreeMint({
        pricingMode: 'raw-on-chain',
        displayedMintPriceMicroStx: 3000n,
        absorbedProtocolFeeMicroStx: 3000n
      })
    ).toBe(false);
    expect(
      isCollectionFreeMint({
        pricingMode: 'advertised-includes-seal-fee',
        displayedMintPriceMicroStx: null,
        absorbedProtocolFeeMicroStx: 3000n
      })
    ).toBe(false);
    expect(
      isCollectionFreeMint({
        pricingMode: 'advertised-includes-seal-fee',
        displayedMintPriceMicroStx: 3000n,
        absorbedProtocolFeeMicroStx: null
      })
    ).toBe(false);
  });
});
