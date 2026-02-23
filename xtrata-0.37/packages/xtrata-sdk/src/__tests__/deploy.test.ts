import { describe, expect, it } from 'vitest';
import {
  buildArtistDeployContractSource,
  deriveArtistCollectionSlug,
  deriveArtistCollectionSymbol
} from '../deploy';

describe('sdk deploy helpers', () => {
  it('derives collection symbol/slug', () => {
    expect(deriveArtistCollectionSymbol('Audional Headphones V0')).toBe('AUDIONALHEADPHON');
    expect(deriveArtistCollectionSlug('Audional Headphones V0')).toBe('audional-headphones-v0');
  });

  it('injects user-configurable values into template source', () => {
    const template = `
(define-constant ALLOWED-XTRATA-CONTRACT 'SP000.test)
(define-data-var mint-price uint u0)
(define-data-var max-supply uint u0)
(define-data-var collection-name (string-ascii 64) "")
(define-data-var collection-symbol (string-ascii 16) "")
(define-data-var collection-description (string-ascii 256) "")
(define-data-var artist-recipient principal 'SP000)
(define-data-var marketplace-recipient principal 'SP000)
(define-data-var operator-recipient principal 'SP000)
(define-data-var default-dependencies (list 50 uint) (list))
`;

    const result = buildArtistDeployContractSource({
      input: {
        collectionName: 'AHV0',
        symbol: 'AHV0',
        description: 'Test',
        supply: '10',
        mintType: 'standard',
        mintPriceStx: '1.111111',
        artistAddress: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
        marketplaceAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        parentInscriptions: '40,56,57'
      },
      templateSources: {
        standardSource: template,
        preinscribedSource: template
      },
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      operatorAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    });

    expect(result.errors).toEqual([]);
    expect(result.source).toContain("ALLOWED-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0");
    expect(result.source).toContain('(define-data-var mint-price uint u1111111)');
    expect(result.source).toContain('(define-data-var max-supply uint u10)');
    expect(result.source).toContain('(define-data-var default-dependencies (list 50 uint) (list u40 u56 u57))');
  });
});
