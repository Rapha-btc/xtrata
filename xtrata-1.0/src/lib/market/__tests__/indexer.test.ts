import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cl } from '@stacks/transactions';
import {
  __testing,
  buildActiveListingIndex,
  buildMarketListingKey,
  buildUnifiedActivityTimeline,
  loadMarketActivity,
  loadNftActivity
} from '../indexer';
import type { MarketActivityEvent, NftActivityEvent } from '../types';

describe('market indexer', () => {
  beforeEach(() => {
    __testing.resetMarketIndexerRuntimeState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __testing.resetMarketIndexerRuntimeState();
  });

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

  it('parses NFT mint events', () => {
    const parsed = __testing.parseNftMintEvent(
      {
        event_index: 12,
        tx_id: '0xmint',
        block_height: 700,
        block_time_iso: '2026-01-31T00:00:00.000Z',
        recipient: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
        asset_identifier: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1::xtrata-inscription',
        value: { repr: 'u42' }
      },
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1',
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1::xtrata-inscription'
    );

    expect(parsed?.type).toBe('mint');
    expect(parsed?.tokenId).toBe(42n);
    expect(parsed?.recipient).toBe(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );
  });

  it('builds unified activity timeline and drops duplicate transfers', () => {
    const nftContract = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1';
    const marketEvents = [
      {
        id: 'buy-1',
        type: 'buy',
        listingId: 1n,
        tokenId: 5n,
        price: 123n,
        seller: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
        buyer: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        txId: '0xabc',
        blockHeight: 200,
        eventIndex: 1,
        nftContract
      }
    ] satisfies MarketActivityEvent[];
    const nftEvents = [
      {
        id: 'transfer-dup',
        type: 'transfer',
        tokenId: 5n,
        sender: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
        recipient: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        txId: '0xabc',
        blockHeight: 200,
        eventIndex: 2,
        nftContract
      },
      {
        id: 'mint-1',
        type: 'mint',
        tokenId: 6n,
        recipient: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        txId: '0xdef',
        blockHeight: 201,
        eventIndex: 0,
        nftContract
      }
    ] satisfies NftActivityEvent[];

    const unified = buildUnifiedActivityTimeline({
      marketEvents,
      nftEvents,
      nftContractId: nftContract
    });

    expect(unified.find((event) => event.type === 'transfer')).toBeUndefined();
    expect(unified.find((event) => event.type === 'inscribe')?.tokenId).toBe(6n);
    expect(unified.find((event) => event.type === 'buy')?.price).toBe(123n);
  });

  it('deduplicates concurrent market activity fetches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const contract = {
      address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      contractName: 'xtrata-market-v1-2',
      network: 'mainnet' as const
    };

    const [first, second] = await Promise.all([
      loadMarketActivity({ contract, force: true }),
      loadMarketActivity({ contract, force: true })
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.contractId).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-v1-2'
    );
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(second.events).toEqual(first.events);
  });

  it('deduplicates concurrent NFT activity fetches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const contract = {
      address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      contractName: 'xtrata-v1-2',
      network: 'mainnet' as const
    };

    const [first, second] = await Promise.all([
      loadNftActivity({
        contract,
        assetName: 'xtrata-inscription',
        force: true
      }),
      loadNftActivity({
        contract,
        assetName: 'xtrata-inscription',
        force: true
      })
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.assetIdentifier).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-2::xtrata-inscription'
    );
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(second.events).toEqual(first.events);
  });
});
