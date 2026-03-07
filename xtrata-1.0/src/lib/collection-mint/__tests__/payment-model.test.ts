import { describe, expect, it } from 'vitest';
import { resolveCollectionMintPaymentModel } from '../payment-model';

describe('resolveCollectionMintPaymentModel', () => {
  it('maps v1.0 and v1.1 templates to begin pricing', () => {
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint-v1.0')).toBe(
      'begin'
    );
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint-v1.1')).toBe(
      'begin'
    );
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint-v1-1')).toBe(
      'begin'
    );
  });

  it('maps v1.2+ templates to seal pricing', () => {
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint-v1.2')).toBe(
      'seal'
    );
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint-v1.4')).toBe(
      'seal'
    );
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint-v1-4')).toBe(
      'seal'
    );
  });

  it('returns unknown when template version does not match expected pattern', () => {
    expect(resolveCollectionMintPaymentModel('')).toBe('unknown');
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint')).toBe(
      'unknown'
    );
    expect(resolveCollectionMintPaymentModel('xtrata-collection-mint-v2.0')).toBe(
      'unknown'
    );
  });
});
