import { describe, expect, it } from 'vitest';
import {
  parseStxToMicroStx,
  resolveMetadataDisplayMintPrice
} from '../display-price';

describe('collection display mint price helpers', () => {
  it('parses STX strings into microstx', () => {
    expect(parseStxToMicroStx('1')).toBe(1_000_000n);
    expect(parseStxToMicroStx('1.2')).toBe(1_200_000n);
    expect(parseStxToMicroStx('0.000001')).toBe(1n);
  });

  it('returns null for invalid STX strings', () => {
    expect(parseStxToMicroStx('')).toBeNull();
    expect(parseStxToMicroStx('abc')).toBeNull();
    expect(parseStxToMicroStx('1.1234567')).toBeNull();
  });

  it('uses explicit collection-page override when enabled', () => {
    const resolved = resolveMetadataDisplayMintPrice({
      collection: {
        mintPriceStx: '0.8'
      },
      collectionPage: {
        displayMintPriceMode: 'override',
        displayMintPriceStx: '1'
      }
    });
    expect(resolved.source).toBe('collection-page-override');
    expect(resolved.microStx).toBe(1_000_000n);
  });

  it('falls back to absorbed metadata price when override mode is not set', () => {
    const resolved = resolveMetadataDisplayMintPrice({
      collection: {
        mintPriceMicroStx: '1000000',
        priceAbsorption: {
          enabled: true
        }
      }
    });
    expect(resolved.source).toBe('price-absorption');
    expect(resolved.microStx).toBe(1_000_000n);
  });

  it('respects explicit on-chain mode and skips absorbed metadata fallback', () => {
    const resolved = resolveMetadataDisplayMintPrice({
      collection: {
        mintPriceMicroStx: '1000000',
        priceAbsorption: {
          enabled: true
        }
      },
      collectionPage: {
        displayMintPriceMode: 'on-chain'
      }
    });
    expect(resolved.source).toBe('none');
    expect(resolved.microStx).toBeNull();
  });
});
