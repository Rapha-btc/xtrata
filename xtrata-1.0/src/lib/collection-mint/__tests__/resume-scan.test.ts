import { describe, expect, it } from 'vitest';
import { findFirstMatchInBatches } from '../resume-scan';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('findFirstMatchInBatches', () => {
  it('returns the first matching item in source order', async () => {
    const items = [1, 2, 3, 4];

    const match = await findFirstMatchInBatches({
      items,
      batchSize: 2,
      predicate: async (item) => {
        await pause(item === 2 ? 10 : 1);
        return item === 2 || item === 3;
      }
    });

    expect(match).toBe(2);
  });

  it('respects the configured batch size', async () => {
    const items = [1, 2, 3, 4, 5];
    let inFlight = 0;
    let peak = 0;

    await findFirstMatchInBatches({
      items,
      batchSize: 2,
      predicate: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await pause(5);
        inFlight -= 1;
        return false;
      }
    });

    expect(peak).toBe(2);
  });

  it('returns null when no items match', async () => {
    const match = await findFirstMatchInBatches({
      items: ['a', 'b'],
      batchSize: 2,
      predicate: async () => false
    });

    expect(match).toBeNull();
  });
});
