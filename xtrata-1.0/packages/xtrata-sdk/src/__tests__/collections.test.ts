import { describe, expect, it } from 'vitest';
import {
  createCollectionMintSnapshot,
  parseRandomDropManifest,
  selectRandomDropAssets,
  shouldShowLiveMintPage
} from '../collections';

describe('sdk collection helpers', () => {
  it('derives live snapshot from status', () => {
    const snapshot = createCollectionMintSnapshot({
      paused: false,
      finalized: false,
      mintPrice: 1_000_000n,
      maxSupply: 10n,
      mintedCount: 6n,
      reservedCount: 1n,
      activePhaseId: 0n,
      activePhase: null
    });

    expect(snapshot.remaining).toBe(3n);
    expect(snapshot.soldOut).toBe(false);
    expect(snapshot.live).toBe(true);
  });

  it('hides live page for non-published state', () => {
    const visible = shouldShowLiveMintPage({
      state: 'draft',
      status: {
        paused: false,
        finalized: false,
        mintPrice: 1n,
        maxSupply: 2n,
        mintedCount: 0n,
        reservedCount: 0n,
        activePhaseId: 0n,
        activePhase: null
      }
    });

    expect(visible).toBe(false);
  });

  it('parses random-drop manifest and supports deterministic selection', () => {
    const parsed = parseRandomDropManifest([
      { url: 'https://example.com/a.png' },
      { url: 'https://example.com/b.png' }
    ]);

    expect(parsed.errors).toEqual([]);
    const selected = selectRandomDropAssets(parsed.assets, 1, () => 0.1);
    expect(selected).toHaveLength(1);
  });
});
