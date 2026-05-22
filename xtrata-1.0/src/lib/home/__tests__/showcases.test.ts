import { describe, expect, it } from 'vitest';
import {
  normalizePublicWalletLookup,
  parseHomeGalleryTokenIds,
  type HomeTokenGallery
} from '../showcases';

describe('normalizePublicWalletLookup', () => {
  it('keeps valid Stacks addresses unchanged', () => {
    expect(
      normalizePublicWalletLookup(
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
      )
    ).toBe('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X');
  });

  it('normalizes full BNS names', () => {
    expect(normalizePublicWalletLookup('DYLE.BTC')).toBe('dyle.btc');
  });

  it('treats a single label as a .btc name', () => {
    expect(normalizePublicWalletLookup('DYLE')).toBe('dyle.btc');
  });

  it('rejects invalid wallet lookups', () => {
    expect(normalizePublicWalletLookup('not a valid name')).toBeNull();
  });
});

describe('parseHomeGalleryTokenIds', () => {
  it('parses unique non-negative token ids in manifest order', () => {
    const gallery: HomeTokenGallery = {
      id: 'test',
      title: 'Test',
      kicker: 'Test',
      description: 'Test',
      tokens: [
        { tokenId: '5', label: 'Five' },
        { tokenId: '-1', label: 'Negative' },
        { tokenId: '5', label: 'Duplicate' },
        { tokenId: '8', label: 'Eight' },
        { tokenId: 'bad', label: 'Bad' }
      ]
    };
    expect(parseHomeGalleryTokenIds(gallery)).toEqual([5n, 8n]);
  });
});
