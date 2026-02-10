import { describe, expect, it } from 'vitest';
import {
  COLLECTION_RESERVATION_TIMEOUT_MS,
  formatRemainingMinutesSeconds,
  getSoonestReservationRemainingMs,
  parseStoredReservations,
  removeReservationsByHashes,
  serializeReservations,
  upsertReservation
} from '../reservations';

describe('reservation parsing', () => {
  it('ignores invalid entries', () => {
    const parsed = parseStoredReservations(
      JSON.stringify([
        { hashHex: 'bad', itemLabel: 'x', startedAtMs: 1 },
        {
          hashHex:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          itemLabel: 'ok',
          startedAtMs: 10
        }
      ])
    );
    expect(parsed.length).toBe(1);
    expect(parsed[0]?.itemLabel).toBe('ok');
  });

  it('round trips through serialization', () => {
    const value = [
      {
        hashHex:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        itemLabel: 'item',
        startedAtMs: 50
      }
    ];
    const parsed = parseStoredReservations(serializeReservations(value));
    expect(parsed).toEqual(value);
  });
});

describe('reservation updates', () => {
  const hashA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const hashB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  it('upserts and sorts by started time', () => {
    const first = upsertReservation([], {
      hashHex: hashB,
      itemLabel: 'b',
      startedAtMs: 200
    });
    const second = upsertReservation(first, {
      hashHex: hashA,
      itemLabel: 'a',
      startedAtMs: 100
    });
    expect(second.map((entry) => entry.hashHex)).toEqual([hashA, hashB]);
  });

  it('removes by hash', () => {
    const source = [
      { hashHex: hashA, itemLabel: 'a', startedAtMs: 100 },
      { hashHex: hashB, itemLabel: 'b', startedAtMs: 200 }
    ];
    const next = removeReservationsByHashes(source, [hashA]);
    expect(next.length).toBe(1);
    expect(next[0]?.hashHex).toBe(hashB);
  });
});

describe('reservation timing', () => {
  const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  it('computes soonest remaining', () => {
    const remaining = getSoonestReservationRemainingMs(
      [{ hashHex: hash, itemLabel: 'x', startedAtMs: 1_000 }],
      1_500,
      1_000
    );
    expect(remaining).toBe(500);
  });

  it('formats minute seconds', () => {
    expect(formatRemainingMinutesSeconds(COLLECTION_RESERVATION_TIMEOUT_MS)).toBe(
      '20:00'
    );
  });
});
