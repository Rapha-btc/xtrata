import { describe, expect, it } from 'vitest';
import {
  attachListingMetadata,
  mergeListingIndexes,
  resolveMissingListingsAcrossMarkets,
  resolveMissingListingsForTokens
} from '../listing-resolution';
import { buildMarketListingKey } from '../indexer';
import type { MarketActivityEvent, MarketListing } from '../types';

const MARKET_CONTRACT =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-v1-1';
const MARKET_CONTRACT_USDCX =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-usdcx-v1-0';
const NFT_CONTRACT =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1';
const SENDER = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

const createListing = (params: {
  tokenId: bigint;
  price?: bigint;
  seller?: string;
  nftContract?: string;
}): MarketListing => ({
  seller: params.seller ?? SENDER,
  nftContract: params.nftContract ?? NFT_CONTRACT,
  tokenId: params.tokenId,
  price: params.price ?? 100_000n,
  createdAt: 123n
});

describe('listing resolution helpers', () => {
  it('skips lookup when token already exists in listing index', async () => {
    const calls = {
      idByToken: 0,
      listing: 0
    };
    const marketClient = {
      getListingIdByToken: async () => {
        calls.idByToken += 1;
        return 1n;
      },
      getListing: async () => {
        calls.listing += 1;
        return createListing({ tokenId: 9n });
      }
    };
    const existingEvent: MarketActivityEvent = {
      id: 'existing',
      type: 'list',
      listingId: 4n,
      tokenId: 9n,
      nftContract: NFT_CONTRACT,
      seller: SENDER
    };
    const existing = new Map([
      [buildMarketListingKey(NFT_CONTRACT, 9n), existingEvent]
    ]);

    const resolved = await resolveMissingListingsForTokens({
      marketClient,
      senderAddress: SENDER,
      marketContractId: MARKET_CONTRACT,
      tokens: [{ nftContract: NFT_CONTRACT, tokenId: 9n, owner: MARKET_CONTRACT }],
      existing
    });

    expect(resolved.size).toBe(0);
    expect(calls.idByToken).toBe(0);
    expect(calls.listing).toBe(0);
  });

  it('looks up missing escrow token and returns listing event', async () => {
    const marketClient = {
      getListingIdByToken: async () => 7n,
      getListing: async () =>
        createListing({ tokenId: 22n, price: 250_000n, seller: SENDER })
    };
    const resolved = await resolveMissingListingsForTokens({
      marketClient,
      senderAddress: SENDER,
      marketContractId: MARKET_CONTRACT,
      tokens: [{ nftContract: NFT_CONTRACT, tokenId: 22n, owner: MARKET_CONTRACT }],
      existing: new Map()
    });
    const key = buildMarketListingKey(NFT_CONTRACT, 22n);
    const event = resolved.get(key);

    expect(resolved.size).toBe(1);
    expect(event?.listingId).toBe(7n);
    expect(event?.price).toBe(250_000n);
    expect(event?.seller).toBe(SENDER);
    expect(event?.marketContractId).toBe(MARKET_CONTRACT);
  });

  it('skips non-escrow owners', async () => {
    let called = false;
    const marketClient = {
      getListingIdByToken: async () => {
        called = true;
        return 1n;
      },
      getListing: async () => createListing({ tokenId: 3n })
    };
    const resolved = await resolveMissingListingsForTokens({
      marketClient,
      senderAddress: SENDER,
      marketContractId: MARKET_CONTRACT,
      tokens: [{ nftContract: NFT_CONTRACT, tokenId: 3n, owner: SENDER }],
      existing: new Map()
    });
    expect(resolved.size).toBe(0);
    expect(called).toBe(false);
  });

  it('respects concurrency limits while resolving', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const marketClient = {
      getListingIdByToken: async (_nftContract: string, tokenId: bigint) => {
        inFlight += 1;
        if (inFlight > maxInFlight) {
          maxInFlight = inFlight;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return tokenId;
      },
      getListing: async (listingId: bigint) =>
        createListing({ tokenId: listingId })
    };

    const tokens = [1n, 2n, 3n, 4n].map((tokenId) => ({
      nftContract: NFT_CONTRACT,
      tokenId,
      owner: MARKET_CONTRACT
    }));

    const resolved = await resolveMissingListingsForTokens({
      marketClient,
      senderAddress: SENDER,
      marketContractId: MARKET_CONTRACT,
      tokens,
      existing: new Map(),
      concurrency: 2
    });

    expect(resolved.size).toBe(4);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('merges listing indexes with deterministic override behavior', () => {
    const keyOne = buildMarketListingKey(NFT_CONTRACT, 1n);
    const keyTwo = buildMarketListingKey(NFT_CONTRACT, 2n);
    const primary = new Map<string, MarketActivityEvent>([
      [
        keyOne,
        {
          id: 'primary-1',
          type: 'list',
          listingId: 1n,
          tokenId: 1n,
          nftContract: NFT_CONTRACT
        }
      ],
      [
        keyTwo,
        {
          id: 'primary-2',
          type: 'list',
          listingId: 2n,
          tokenId: 2n,
          nftContract: NFT_CONTRACT
        }
      ]
    ]);
    const secondary = new Map<string, MarketActivityEvent>([
      [
        keyTwo,
        {
          id: 'secondary-2',
          type: 'list',
          listingId: 9n,
          tokenId: 2n,
          nftContract: NFT_CONTRACT
        }
      ]
    ]);

    const merged = mergeListingIndexes(primary, secondary);
    expect(merged.size).toBe(2);
    expect(merged.get(keyOne)?.listingId).toBe(1n);
    expect(merged.get(keyTwo)?.listingId).toBe(9n);
  });

  it('attaches market metadata to activity events', () => {
    const event = attachListingMetadata(
      {
        id: 'event-1',
        type: 'list',
        listingId: 3n,
        tokenId: 5n,
        nftContract: NFT_CONTRACT
      },
      {
        marketContractId: MARKET_CONTRACT,
        paymentTokenContractId: null,
        marketLabel: 'STX market'
      }
    );

    expect(event.marketContractId).toBe(MARKET_CONTRACT);
    expect(event.paymentTokenContractId).toBeNull();
    expect(event.marketLabel).toBe('STX market');
  });

  it('resolves missing listings across multiple markets', async () => {
    const stxClient = {
      getListingIdByToken: async () => 11n,
      getListing: async () => createListing({ tokenId: 11n, price: 200_000n })
    };
    const usdcxClient = {
      getListingIdByToken: async () => 22n,
      getListing: async () => createListing({ tokenId: 22n, price: 500_000n })
    };

    const resolved = await resolveMissingListingsAcrossMarkets({
      targets: [
        {
          marketContractId: MARKET_CONTRACT,
          paymentTokenContractId: null,
          marketLabel: 'STX market',
          marketClient: stxClient
        },
        {
          marketContractId: MARKET_CONTRACT_USDCX,
          paymentTokenContractId:
            'SP3Y2Y3K4P7ZJ2Y4Q4M6P6V5R3K3XG0ZQ8N8YQ7R7.token-usdcx',
          marketLabel: 'USDCx market',
          marketClient: usdcxClient
        }
      ],
      senderAddress: SENDER,
      tokens: [
        { nftContract: NFT_CONTRACT, tokenId: 11n, owner: MARKET_CONTRACT },
        { nftContract: NFT_CONTRACT, tokenId: 22n, owner: MARKET_CONTRACT_USDCX }
      ],
      existing: new Map()
    });

    expect(resolved.get(buildMarketListingKey(NFT_CONTRACT, 11n))?.marketContractId).toBe(
      MARKET_CONTRACT
    );
    expect(
      resolved.get(buildMarketListingKey(NFT_CONTRACT, 22n))?.paymentTokenContractId
    ).toBe('SP3Y2Y3K4P7ZJ2Y4Q4M6P6V5R3K3XG0ZQ8N8YQ7R7.token-usdcx');
  });
});
