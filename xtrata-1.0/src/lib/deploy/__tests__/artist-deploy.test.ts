import { describe, expect, it } from 'vitest';
import {
  ARTIST_DEPLOY_DEFAULTS,
  buildArtistDeployContractSource,
  deriveArtistCollectionSlug,
  deriveArtistCollectionSymbol,
  deriveArtistContractName,
  resolveArtistDeployPayoutSplits
} from '../artist-deploy';

const STANDARD_TEMPLATE = `
(define-constant ALLOWED-XTRATA-CONTRACT .xtrata-v2-1-0)
(define-data-var mint-price uint u0)
(define-data-var max-supply uint u0)
(define-data-var collection-name (string-ascii 64) "")
(define-data-var collection-symbol (string-ascii 16) "")
(define-data-var collection-description (string-ascii 256) "")
(define-data-var default-dependencies (list 50 uint) (list))
(define-data-var artist-recipient principal tx-sender)
(define-data-var marketplace-recipient principal tx-sender)
(define-data-var operator-recipient principal tx-sender)
(define-data-var artist-bps uint u0)
(define-data-var marketplace-bps uint u0)
(define-data-var operator-bps uint u0)
`;

const PREINSCRIBED_TEMPLATE = `
(define-constant ALLOWED-XTRATA-CONTRACT .xtrata-v2-1-0)
(define-data-var price uint u0)
(define-data-var artist-recipient principal tx-sender)
(define-data-var marketplace-recipient principal tx-sender)
(define-data-var operator-recipient principal tx-sender)
(define-data-var artist-bps uint u10000)
(define-data-var marketplace-bps uint u0)
(define-data-var operator-bps uint u0)
`;

describe('artist deploy helpers', () => {
  it('derives symbol and slug from collection name', () => {
    expect(deriveArtistCollectionSymbol('Neon River Collective')).toBe(
      'NEONRIVERCOLLECT'
    );
    expect(deriveArtistCollectionSlug(' Neon River Collective ')).toBe(
      'neon-river-collective'
    );
  });

  it('derives deterministic contract name', () => {
    const name = deriveArtistContractName({
      collectionName: 'Neon River Collective',
      mintType: 'standard',
      seed: '0f95ac11-1234'
    });
    expect(name).toBe('xtrata-collection-neon-river-co-0f95ac11');
    expect(name.length).toBeLessThanOrEqual(40);
  });

  it('prefers draft slug for readable contract names and keeps the seed suffix', () => {
    const name = deriveArtistContractName({
      collectionName: 'Ignored fallback collection name',
      slug: 'russian-rampage-v0',
      mintType: 'standard',
      seed: '9ac4dc21-0000'
    });
    expect(name).toBe('xtrata-collection-russian-rampa-9ac4dc21');
    expect(name.length).toBeLessThanOrEqual(40);
  });

  it('builds standard template source with hardcoded defaults', () => {
    const result = buildArtistDeployContractSource({
      input: {
        collectionName: 'Neon River',
        symbol: 'NRIV',
        description: 'Launch drop',
        supply: '777',
        mintType: 'standard',
        mintPriceStx: '0.42',
        artistAddress: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9',
        marketplaceAddress: 'SP000000000000000000002Q6VF78'
      },
      templateSources: {
        standardSource: STANDARD_TEMPLATE,
        preinscribedSource: PREINSCRIBED_TEMPLATE
      },
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      operatorAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    });

    expect(result.errors).toEqual([]);
    expect(result.source).toContain(
      "(define-constant ALLOWED-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0)"
    );
    expect(result.source).toContain('(define-data-var mint-price uint u420000)');
    expect(result.source).toContain('(define-data-var max-supply uint u777)');
    expect(result.source).toContain(
      '(define-data-var default-dependencies (list 50 uint) (list))'
    );
    expect(result.source).toContain(
      "(define-data-var artist-recipient principal 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9)"
    );
    expect(result.source).toContain(
      "(define-data-var marketplace-recipient principal 'SP000000000000000000002Q6VF78)"
    );
    expect(result.source).toContain(
      "(define-data-var operator-recipient principal 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X)"
    );
    expect(result.source).toContain(
      `(define-data-var artist-bps uint u${ARTIST_DEPLOY_DEFAULTS.artistBps.toString()})`
    );
    expect(result.source).toContain(
      `(define-data-var marketplace-bps uint u${ARTIST_DEPLOY_DEFAULTS.marketplaceBps.toString()})`
    );
    expect(result.source).toContain(
      `(define-data-var operator-bps uint u${ARTIST_DEPLOY_DEFAULTS.operatorBps.toString()})`
    );
  });

  it('uses zero payout splits when on-chain mint price is zero', () => {
    expect(resolveArtistDeployPayoutSplits(0n)).toEqual({
      artistBps: 0,
      marketplaceBps: 0,
      operatorBps: 0
    });

    const result = buildArtistDeployContractSource({
      input: {
        collectionName: 'Free Mint',
        symbol: 'FREE',
        description: 'Zero payout free mint',
        supply: '777',
        mintType: 'standard',
        mintPriceStx: '0',
        artistAddress: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9',
        marketplaceAddress: 'SP000000000000000000002Q6VF78'
      },
      templateSources: {
        standardSource: STANDARD_TEMPLATE,
        preinscribedSource: PREINSCRIBED_TEMPLATE
      },
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      operatorAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    });

    expect(result.errors).toEqual([]);
    expect(result.source).toContain('(define-data-var mint-price uint u0)');
    expect(result.source).toContain('(define-data-var artist-bps uint u0)');
    expect(result.source).toContain('(define-data-var marketplace-bps uint u0)');
    expect(result.source).toContain('(define-data-var operator-bps uint u0)');
  });

  it('normalizes non-ascii description text before validation', () => {
    const result = buildArtistDeployContractSource({
      input: {
        collectionName: 'Neon River',
        symbol: 'NRIV',
        description: 'Artist’s vision — deja vu 🚀\nline two',
        supply: '777',
        mintType: 'standard',
        mintPriceStx: '0.42',
        artistAddress: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9',
        marketplaceAddress: 'SP000000000000000000002Q6VF78'
      },
      templateSources: {
        standardSource: STANDARD_TEMPLATE,
        preinscribedSource: PREINSCRIBED_TEMPLATE
      },
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      operatorAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      'Description was normalized to printable ASCII for contract compatibility.'
    );
    expect(result.resolved.description).toBe("Artist's vision - deja vu line two");
    expect(result.source).toContain(
      `(define-data-var collection-description (string-ascii 256) "Artist's vision - deja vu line two")`
    );
  });

  it('builds pre-inscribed template source and warns about supply target', () => {
    const result = buildArtistDeployContractSource({
      input: {
        collectionName: 'Pre Drop',
        symbol: 'PREDROP',
        description: 'Pre-inscribed',
        supply: '250',
        mintType: 'pre-inscribed',
        mintPriceStx: '1',
        artistAddress: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9',
        marketplaceAddress: 'SP000000000000000000002Q6VF78'
      },
      templateSources: {
        standardSource: STANDARD_TEMPLATE,
        preinscribedSource: PREINSCRIBED_TEMPLATE
      },
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      operatorAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.source).toContain('(define-data-var price uint u1000000)');
  });

  it('injects default parent inscription IDs for standard collection mints', () => {
    const result = buildArtistDeployContractSource({
      input: {
        collectionName: 'Parents On',
        symbol: 'PARENTS',
        description: 'Has parent inscriptions',
        supply: '50',
        mintType: 'standard',
        mintPriceStx: '0.1',
        parentInscriptions: '9, 3 9\n12',
        artistAddress: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9',
        marketplaceAddress: 'SP000000000000000000002Q6VF78'
      },
      templateSources: {
        standardSource: STANDARD_TEMPLATE,
        preinscribedSource: PREINSCRIBED_TEMPLATE
      },
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      operatorAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    });

    expect(result.errors).toEqual([]);
    expect(result.resolved.defaultDependencyIds).toEqual([3n, 9n, 12n]);
    expect(result.source).toContain(
      '(define-data-var default-dependencies (list 50 uint) (list u3 u9 u12))'
    );
  });

  it('returns validation errors for malformed input', () => {
    const result = buildArtistDeployContractSource({
      input: {
        collectionName: '',
        symbol: 'bad symbol',
        description: 'x'.repeat(257),
        supply: '0',
        mintType: 'standard',
        mintPriceStx: '1.1234567',
        parentInscriptions: 'abc',
        artistAddress: 'invalid',
        marketplaceAddress: 'invalid'
      },
      templateSources: {
        standardSource: STANDARD_TEMPLATE,
        preinscribedSource: PREINSCRIBED_TEMPLATE
      },
      coreContractId: 'invalid',
      operatorAddress: 'invalid'
    });

    expect(result.errors.length).toBeGreaterThan(0);
  });
});
