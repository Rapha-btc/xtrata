import { describe, expect, it } from 'vitest';
import {
  canReuseCollectionSlug,
  isCollectionPublicVisible,
  isCollectionPublished,
  isValidSlug,
  normalizeSlug,
  parseCollectionMetadata,
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
});
