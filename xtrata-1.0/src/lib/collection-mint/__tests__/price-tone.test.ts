import { describe, expect, it } from 'vitest';
import { resolveCollectionMintPriceTone } from '../price-tone';

describe('resolveCollectionMintPriceTone', () => {
  it('returns free for free mints regardless of price', () => {
    expect(
      resolveCollectionMintPriceTone({
        displayedMintPriceMicroStx: 300_000n,
        freeMint: true
      })
    ).toBe('free');
  });

  it('returns unknown when the displayed price is unavailable', () => {
    expect(
      resolveCollectionMintPriceTone({
        displayedMintPriceMicroStx: null,
        freeMint: false
      })
    ).toBe('unknown');
  });

  it('keeps prices up to 10 STX in the first paid band', () => {
    expect(
      resolveCollectionMintPriceTone({
        displayedMintPriceMicroStx: 10_000_000n,
        freeMint: false
      })
    ).toBe('band-0');
  });

  it('moves higher prices up through the warm paid bands and clamps at the top band', () => {
    expect(
      resolveCollectionMintPriceTone({
        displayedMintPriceMicroStx: 10_000_001n,
        freeMint: false
      })
    ).toBe('band-1');
    expect(
      resolveCollectionMintPriceTone({
        displayedMintPriceMicroStx: 55_000_000n,
        freeMint: false
      })
    ).toBe('band-5');
    expect(
      resolveCollectionMintPriceTone({
        displayedMintPriceMicroStx: 250_000_000n,
        freeMint: false
      })
    ).toBe('band-9');
  });
});
