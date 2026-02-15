import { describe, expect, it } from 'vitest';
import {
  isXtrataOwnerAddress,
  parseArtistAllowlist
} from '../manage';

describe('manage allowlist parsing', () => {
  it('parses addresses and .btc names into separate buckets', () => {
    const parsed = parseArtistAllowlist(
      ' SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X, Alice.BTC, bob.btc '
    );

    expect(parsed.entries).toEqual([
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      'alice.btc',
      'bob.btc'
    ]);
    expect(Array.from(parsed.literalAddresses.values())).toEqual([
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    ]);
    expect(Array.from(parsed.bnsNames.values())).toEqual(['alice.btc', 'bob.btc']);
  });

  it('deduplicates repeated entries', () => {
    const parsed = parseArtistAllowlist('alice.btc, Alice.BTC, sp123, SP123');

    expect(parsed.entries).toEqual(['alice.btc', 'SP123']);
    expect(Array.from(parsed.bnsNames.values())).toEqual(['alice.btc']);
    expect(Array.from(parsed.literalAddresses.values())).toEqual(['SP123']);
  });

  it('handles quoted, JSON-like, and newline-separated env formats', () => {
    const parsed = parseArtistAllowlist(
      '["SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X",\n"alice.btc"]'
    );

    expect(parsed.entries).toEqual([
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      'alice.btc'
    ]);
    expect(Array.from(parsed.literalAddresses.values())).toEqual([
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    ]);
    expect(Array.from(parsed.bnsNames.values())).toEqual(['alice.btc']);
  });

  it('detects the xtrata owner address regardless of casing', () => {
    expect(
      isXtrataOwnerAddress(
        'sp3jnsexazp4bdshv0dn3m8r3p0my0eebqqzx743x'
      )
    ).toBe(true);
    expect(isXtrataOwnerAddress('SP1234TESTADDRESS')).toBe(false);
  });
});
