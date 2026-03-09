import { describe, expect, it } from 'vitest';
import {
  getCollectionPageDisplayOrder,
  sortPublicCollectionCards
} from '../public-order';

describe('public collection order helpers', () => {
  it('reads and truncates collection page display order', () => {
    expect(
      getCollectionPageDisplayOrder({
        collectionPage: { displayOrder: 4.8 }
      })
    ).toBe(4);
    expect(
      getCollectionPageDisplayOrder({
        collectionPage: { displayOrder: '7' }
      })
    ).toBe(7);
    expect(getCollectionPageDisplayOrder({ collectionPage: {} })).toBeNull();
  });

  it('sorts cards by explicit display order before name fallback', () => {
    const sorted = sortPublicCollectionCards([
      {
        id: 'gamma',
        name: 'Gamma',
        displayOrder: null
      },
      {
        id: 'beta',
        name: 'Beta',
        displayOrder: 2
      },
      {
        id: 'alpha',
        name: 'Alpha',
        displayOrder: 1
      },
      {
        id: 'delta',
        name: 'Delta',
        displayOrder: null
      }
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      'alpha',
      'beta',
      'delta',
      'gamma'
    ]);
  });
});
