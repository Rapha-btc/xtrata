import { describe, expect, it } from 'vitest';
import {
  buildRuntimeInscriptionContentUrl,
  hasCoverImageMetadata,
  isSvgCoverImageMimeType,
  normalizeCoverImageSource,
  parseInscriptionTokenId,
  resolveCollectionCoverInscriptionReference,
  resolveCollectionCoverImageUrl
} from '../cover-image';

describe('collection cover image helpers', () => {
  it('normalizes cover source values', () => {
    expect(normalizeCoverImageSource('collection-asset')).toBe('collection-asset');
    expect(normalizeCoverImageSource('inscribed-image-url')).toBe(
      'inscribed-image-url'
    );
    expect(normalizeCoverImageSource('inscription-id')).toBe('inscription-id');
    expect(normalizeCoverImageSource('unknown')).toBeNull();
  });

  it('parses inscription token ids from safe input values', () => {
    expect(parseInscriptionTokenId('00042')).toBe('42');
    expect(parseInscriptionTokenId(7)).toBe('7');
    expect(parseInscriptionTokenId(9n)).toBe('9');
    expect(parseInscriptionTokenId('-1')).toBeNull();
    expect(parseInscriptionTokenId('abc')).toBeNull();
  });

  it('builds runtime reconstruction urls for inscription-id cover images', () => {
    const url = buildRuntimeInscriptionContentUrl({
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      tokenId: '123'
    });
    expect(url).toBeTruthy();
    const parsed = new URL(`https://xtrata.xyz${url ?? ''}`);
    expect(parsed.pathname).toBe('/runtime/content');
    expect(parsed.searchParams.get('contractId')).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    expect(parsed.searchParams.get('tokenId')).toBe('123');
    expect(parsed.searchParams.get('network')).toBe('mainnet');
  });

  it('resolves collection cover urls across supported source types', () => {
    expect(
      resolveCollectionCoverImageUrl({
        coverImage: { source: 'collection-asset', assetId: 'asset-1' },
        collectionId: 'drop-123'
      })
    ).toBe('/collections/drop-123/asset-preview?assetId=asset-1&purpose=cover');

    expect(
      resolveCollectionCoverImageUrl({
        coverImage: {
          source: 'inscribed-image-url',
          imageUrl: 'https://example.com/cover.png'
        },
        collectionId: 'drop-123'
      })
    ).toBe('https://example.com/cover.png');

    const inscriptionUrl = resolveCollectionCoverImageUrl({
      coverImage: {
        source: 'inscription-id',
        tokenId: '987',
        coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
      },
      collectionId: 'drop-123'
    });
    expect(inscriptionUrl).toContain('/runtime/content?');
    expect(inscriptionUrl).toContain('tokenId=987');
  });

  it('resolves inscription cover references for recursive svg rendering', () => {
    expect(
      resolveCollectionCoverInscriptionReference({
        coverImage: {
          source: 'inscription-id',
          tokenId: '00044',
          coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
          mimeType: 'image/svg+xml'
        }
      })
    ).toEqual({
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      tokenId: '44',
      mimeType: 'image/svg+xml',
      preferDataUriRender: true
    });
    expect(isSvgCoverImageMimeType('image/svg+xml')).toBe(true);
    expect(isSvgCoverImageMimeType('image/png')).toBe(false);
  });

  it('parses runtime reconstruction urls back into inscription references', () => {
    expect(
      resolveCollectionCoverInscriptionReference({
        coverImage: {
          source: 'inscribed-image-url',
          imageUrl:
            '/runtime/content?contractId=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0&tokenId=987&network=mainnet'
        }
      })
    ).toEqual({
      coreContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      tokenId: '987',
      mimeType: null,
      preferDataUriRender: true
    });
  });

  it('detects whether cover metadata is configured', () => {
    expect(
      hasCoverImageMetadata({
        source: 'collection-asset',
        assetId: 'asset-1'
      })
    ).toBe(true);
    expect(
      hasCoverImageMetadata({
        source: 'inscribed-image-url',
        imageUrl: 'https://example.com/cover.png'
      })
    ).toBe(true);
    expect(
      hasCoverImageMetadata({
        source: 'inscription-id',
        tokenId: '44'
      })
    ).toBe(true);
    expect(
      hasCoverImageMetadata({
        source: 'inscription-id',
        tokenId: 'x'
      })
    ).toBe(false);
  });
});
