import { describe, expect, it } from 'vitest';
import {
  canStageUploadsBeforeDeploy,
  canReuseCollectionSlug,
  canonicalizeManageCollectionMetadata,
  getCollectionDisplayOrder,
  isCollectionUploadsLocked,
  isCollectionPublicVisible,
  isCollectionPublished,
  isValidSlug,
  mergeCollectionMetadata,
  normalizeSlug,
  parseCollectionMetadata,
  sortCollectionsForPublicDisplay,
  stripDeployPricingLockFromMetadata,
  staysWithinLimit
} from '../collections';

describe('collections helpers', () => {
  it('normalizes slug by lowercasing and replacing invalid chars', () => {
    expect(normalizeSlug('  Foo Bar!!__   ')).toBe('foo-bar----');
  });

  it('validates slug patterns correctly', () => {
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('xtrata-collection-123')).toBe(true);
    expect(isValidSlug('Invalid_Slug')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
  });

  it('enforces collection bytes limit', () => {
    expect(staysWithinLimit(100000, 50000, 200000)).toBe(true);
    expect(staysWithinLimit(180000, 50000, 200000)).toBe(false);
  });

  it('parses metadata from JSON strings and objects', () => {
    expect(parseCollectionMetadata('{"a":1}')).toEqual({ a: 1 });
    expect(parseCollectionMetadata({ b: 2 })).toEqual({ b: 2 });
    expect(parseCollectionMetadata('not-json')).toBeNull();
  });

  it('detects public visibility flag from collectionPage metadata', () => {
    expect(
      isCollectionPublicVisible({
        collectionPage: { showOnPublicPage: true }
      })
    ).toBe(true);
    expect(
      isCollectionPublicVisible({
        collectionPage: { showOnPublicPage: '1' }
      })
    ).toBe(true);
    expect(
      isCollectionPublicVisible({
        collectionPage: { showOnPublicPage: false }
      })
    ).toBe(false);
  });

  it('detects published state safely', () => {
    expect(isCollectionPublished('published')).toBe(true);
    expect(isCollectionPublished(' PUBLISHED ')).toBe(true);
    expect(isCollectionPublished('draft')).toBe(false);
  });

  it('reads collection display order from metadata', () => {
    expect(
      getCollectionDisplayOrder({
        collectionPage: { displayOrder: 7 }
      })
    ).toBe(7);
    expect(
      getCollectionDisplayOrder({
        collectionPage: { displayOrder: '12' }
      })
    ).toBe(12);
    expect(
      getCollectionDisplayOrder({
        collectionPage: { displayOrder: ' 4.8 ' }
      })
    ).toBe(4);
    expect(getCollectionDisplayOrder({ collectionPage: {} })).toBeNull();
  });

  it('sorts public collections by explicit order then fallback recency', () => {
    const sorted = sortCollectionsForPublicDisplay([
      {
        id: 'zeta',
        created_at: 3,
        metadata: { collectionPage: { displayOrder: 3 } }
      },
      {
        id: 'alpha',
        created_at: 10,
        metadata: { collectionPage: { displayOrder: 1 } }
      },
      {
        id: 'no-order-new',
        created_at: 20,
        metadata: {}
      },
      {
        id: 'no-order-old',
        created_at: 5,
        metadata: {}
      }
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      'alpha',
      'zeta',
      'no-order-new',
      'no-order-old'
    ]);
  });

  it('allows slug reuse for undeployed draft by same artist', () => {
    expect(
      canReuseCollectionSlug({
        incomingArtistAddress: 'SP123',
        existingArtistAddress: 'sp123',
        contractAddress: null,
        metadata: { templateVersion: 'xtrata-collection-mint-v1.2' },
        state: 'draft'
      })
    ).toBe(true);
  });

  it('blocks slug reuse when deployment is already recorded', () => {
    expect(
      canReuseCollectionSlug({
        incomingArtistAddress: 'SP123',
        existingArtistAddress: 'SP123',
        contractAddress: null,
        metadata: { deployTxId: '0xabc' },
        state: 'draft'
      })
    ).toBe(false);
    expect(
      canReuseCollectionSlug({
        incomingArtistAddress: 'SP123',
        existingArtistAddress: 'SP123',
        contractAddress: 'SP123',
        metadata: null,
        state: 'draft'
      })
    ).toBe(false);
    expect(
      canReuseCollectionSlug({
        incomingArtistAddress: 'SP123',
        existingArtistAddress: 'SP123',
        contractAddress: null,
        metadata: null,
        state: 'published'
      })
    ).toBe(false);
  });

  it('blocks slug reuse across different artists', () => {
    expect(
      canReuseCollectionSlug({
        incomingArtistAddress: 'SP123',
        existingArtistAddress: 'SP999',
        contractAddress: null,
        metadata: null,
        state: 'draft'
      })
    ).toBe(false);
  });

  it('merges reused-slug metadata with existing values preserved', () => {
    expect(
      mergeCollectionMetadata(
        {
          deployPricingLock: { version: 'v1', maxChunks: 99 },
          existingOnly: true
        },
        {
          collection: { name: 'Test' }
        }
      )
    ).toEqual({
      deployPricingLock: { version: 'v1', maxChunks: 99 },
      existingOnly: true,
      collection: { name: 'Test' }
    });
  });

  it('canonicalizes manage payout recipients to the locked core address', () => {
    expect(
      canonicalizeManageCollectionMetadata({
        coreContractId: 'SP1234567890ABCDEFG.collection-core',
        hardcodedDefaults: {
          recipients: {
            artist: 'SPARTIST123',
            marketplace: 'SPMARKET999',
            operator: 'SPOPERATOR999'
          }
        }
      })
    ).toEqual({
      coreContractId: 'SP1234567890ABCDEFG.collection-core',
      hardcodedDefaults: {
        recipients: {
          artist: 'SPARTIST123',
          marketplace: 'SP1234567890ABCDEFG',
          operator: 'SP1234567890ABCDEFG'
        }
      }
    });
  });

  it('falls back to the default Xtrata address when metadata has no core contract id', () => {
    expect(
      canonicalizeManageCollectionMetadata({
        hardcodedDefaults: {
          recipients: {
            artist: 'SPARTIST123'
          }
        }
      })
    ).toEqual({
      hardcodedDefaults: {
        recipients: {
          artist: 'SPARTIST123',
          marketplace: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
          operator: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
        }
      }
    });
  });

  it('strips deploy pricing lock from metadata', () => {
    const removed = stripDeployPricingLockFromMetadata({
      deployPricingLock: { version: 'v1' },
      foo: 'bar'
    });
    expect(removed.changed).toBe(true);
    expect(removed.metadata).toEqual({ foo: 'bar' });

    const untouched = stripDeployPricingLockFromMetadata({ foo: 'bar' });
    expect(untouched.changed).toBe(false);
    expect(untouched.metadata).toEqual({ foo: 'bar' });
  });

  it('detects upload lock states and predeploy staging eligibility', () => {
    expect(isCollectionUploadsLocked('published')).toBe(true);
    expect(isCollectionUploadsLocked('archived')).toBe(true);
    expect(isCollectionUploadsLocked('draft')).toBe(false);

    expect(
      canStageUploadsBeforeDeploy({
        contractAddress: '',
        state: 'draft'
      })
    ).toBe(true);
    expect(
      canStageUploadsBeforeDeploy({
        contractAddress: 'SP123.contract',
        state: 'draft'
      })
    ).toBe(false);
    expect(
      canStageUploadsBeforeDeploy({
        contractAddress: '',
        state: 'published'
      })
    ).toBe(false);
  });
});
