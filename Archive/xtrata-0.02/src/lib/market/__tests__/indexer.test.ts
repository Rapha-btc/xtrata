import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';
import { __testing, buildActiveListingIndex, buildMarketListingKey } from '../indexer';
import type { MarketActivityEvent } from '../types';

describe('market indexer', () => {
  it('parses list events from print tuple', () => {
    const value = Cl.tuple({
      event: Cl.stringAscii('list'),
      'listing-id': Cl.uint(12),
      seller: Cl.standardPrincipal('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
      'nft-contract': Cl.contractPrincipal(
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        'xtrata-v1-1-1'
      ),
      'token-id': Cl.uint(24),
      price: Cl.uint(250000)
    });

    const parsed = __testing.parseMarketEventFromValue(value, {
      txId: '0xabc',
      blockHeight: 123,
      eventIndex: 2,
      timestamp: '2026-01-31T00:00:00.000Z'
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('list');
    expect(parsed?.listingId).toBe(12n);
    expect(parsed?.tokenId).toBe(24n);
    expect(parsed?.price).toBe(250000n);
  });

  it('parses buy events from print tuple', () => {
    const value = Cl.tuple({
      event: Cl.stringAscii('buy'),
      'listing-id': Cl.uint(3),
      buyer: Cl.standardPrincipal('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
      seller: Cl.standardPrincipal('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'),
      'nft-contract': Cl.contractPrincipal(
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        'xtrata-v1-1-1'
      ),
      'token-id': Cl.uint(99),
      price: Cl.uint(500000),
      fee: Cl.uint(0)
    });

    const parsed = __testing.parseMarketEventFromValue(value, {
      txId: '0xdef',
      blockHeight: 456,
      eventIndex: 1
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('buy');
    expect(parsed?.listingId).toBe(3n);
    expect(parsed?.tokenId).toBe(99n);
    expect(parsed?.buyer).toBe(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );
    expect(parsed?.seller).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    );
  });

  it('builds active listing index from events', () => {
    const nftContract = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1';
    const otherContract = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.other-nft';
    const events = [
      {
        id: 'list-1',
        type: 'list',
        listingId: 1n,
        tokenId: 1n,
        nftContract,
        blockHeight: 100,
        eventIndex: 1
      },
      {
        id: 'cancel-1',
        type: 'cancel',
        listingId: 1n,
        tokenId: 1n,
        nftContract,
        blockHeight: 101,
        eventIndex: 0
      },
      {
        id: 'list-2',
        type: 'list',
        listingId: 2n,
        tokenId: 2n,
        nftContract,
        blockHeight: 102,
        eventIndex: 0
      },
      {
        id: 'buy-2',
        type: 'buy',
        listingId: 2n,
        tokenId: 2n,
        nftContract,
        blockHeight: 103,
        eventIndex: 0
      },
      {
        id: 'list-3',
        type: 'list',
        listingId: 3n,
        tokenId: 1n,
        nftContract,
        blockHeight: 104,
        eventIndex: 0
      },
      {
        id: 'other-contract',
        type: 'list',
        listingId: 9n,
        tokenId: 5n,
        nftContract: otherContract,
        blockHeight: 105,
        eventIndex: 0
      }
    ] satisfies MarketActivityEvent[];

    const active = buildActiveListingIndex(events, nftContract);
    const tokenOneKey = buildMarketListingKey(nftContract, 1n);
    const tokenTwoKey = buildMarketListingKey(nftContract, 2n);
    const tokenFiveKey = buildMarketListingKey(otherContract, 5n);

    expect(active.has(tokenOneKey)).toBe(true);
    expect(active.get(tokenOneKey)?.listingId).toBe(3n);
    expect(active.has(tokenTwoKey)).toBe(false);
    expect(active.has(tokenFiveKey)).toBe(false);
  });
});
