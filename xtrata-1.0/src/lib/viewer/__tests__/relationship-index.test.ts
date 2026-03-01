import { describe, expect, it } from 'vitest';
import {
  buildRelationshipChildKey,
  buildRelationshipParentKey,
  loadRelationshipChildren,
  loadRelationshipParents,
  loadRelationshipSyncCursor,
  saveRelationshipChildDependencies,
  saveRelationshipSyncCursor
} from '../relationship-index';

describe('relationship index', () => {
  it('builds stable relationship keys', () => {
    expect(buildRelationshipChildKey('SP123.contract', 42n)).toBe(
      'SP123.contract:42'
    );
    expect(buildRelationshipParentKey('SP123.contract', 7n)).toBe(
      'SP123.contract:7'
    );
  });

  it('returns empty/default values when indexeddb is unavailable', async () => {
    const children = await loadRelationshipChildren({
      contractId: 'SP123.contract',
      parentId: 1n
    });
    const parents = await loadRelationshipParents({
      contractId: 'SP123.contract',
      childId: 2n
    });
    const cursor = await loadRelationshipSyncCursor('SP123.contract');

    expect(children).toEqual([]);
    expect(parents).toEqual([]);
    expect(cursor).toBe(0n);
  });

  it('noops writes when indexeddb is unavailable', async () => {
    await expect(
      saveRelationshipChildDependencies({
        contractId: 'SP123.contract',
        childId: 9n,
        parentIds: [1n, 2n]
      })
    ).resolves.toBeUndefined();
    await expect(
      saveRelationshipSyncCursor({
        contractId: 'SP123.contract',
        nextMintedIndex: 25n
      })
    ).resolves.toBeUndefined();
  });
});
