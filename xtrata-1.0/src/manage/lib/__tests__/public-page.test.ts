import { describe, expect, it } from 'vitest';
import {
  getCollectionPublicDisplayOrder,
  isCollectionVisibleOnPublicPage,
  mergeCollectionPublicDisplayOrderMetadata,
  mergeCollectionPublicVisibilityMetadata,
  sortCollectionsForPublicPage
} from '../public-page';

describe('manage public page helpers', () => {
  it('reads the public visibility flag from collection page metadata', () => {
    expect(
      isCollectionVisibleOnPublicPage({
        collectionPage: { showOnPublicPage: true }
      })
    ).toBe(true);
    expect(
      isCollectionVisibleOnPublicPage({
        collectionPage: { showOnPublicPage: '1' }
      })
    ).toBe(true);
    expect(
      isCollectionVisibleOnPublicPage({
        collectionPage: { showOnPublicPage: false }
      })
    ).toBe(false);
  });

  it('reads and truncates public display order', () => {
    expect(
      getCollectionPublicDisplayOrder({
        collectionPage: { displayOrder: 4.8 }
      })
    ).toBe(4);
    expect(
      getCollectionPublicDisplayOrder({
        collectionPage: { displayOrder: '7' }
      })
    ).toBe(7);
    expect(getCollectionPublicDisplayOrder({ collectionPage: {} })).toBeNull();
  });

  it('sorts collections by explicit public order before recency fallback', () => {
    const sorted = sortCollectionsForPublicPage([
      {
        id: 'hidden-old',
        created_at: 5,
        metadata: {}
      },
      {
        id: 'visible-second',
        created_at: 20,
        metadata: { collectionPage: { displayOrder: 2 } }
      },
      {
        id: 'visible-first',
        created_at: 10,
        metadata: { collectionPage: { displayOrder: 1 } }
      },
      {
        id: 'hidden-new',
        created_at: 50,
        metadata: {}
      }
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      'visible-first',
      'visible-second',
      'hidden-new',
      'hidden-old'
    ]);
  });

  it('merges visibility and display order into existing collection page metadata', () => {
    const visibilityMerged = mergeCollectionPublicVisibilityMetadata(
      {
        collectionPage: { displayOrder: 3, headline: 'Live' },
        extra: 'value'
      },
      false
    );
    const orderMerged = mergeCollectionPublicDisplayOrderMetadata(
      visibilityMerged,
      9
    );

    expect(orderMerged).toEqual({
      collectionPage: {
        displayOrder: 9,
        headline: 'Live',
        showOnPublicPage: false
      },
      extra: 'value'
    });
  });
});
