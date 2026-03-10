import { describe, expect, it, vi } from 'vitest';
import {
  createMarketFocusStore,
  MARKET_FOCUS_EVENT
} from '../focus';

describe('market focus store', () => {
  it('stores listing focus requests and emits an event', () => {
    const windowStub = new EventTarget();
    vi.stubGlobal('window', windowStub);
    const store = createMarketFocusStore();
    const listener = vi.fn();
    window.addEventListener(MARKET_FOCUS_EVENT, listener);

    const request = store.saveFromListing({
      id: 'listing-1',
      type: 'list',
      listingId: 4n,
      tokenId: 12n,
      nftContract: 'SPTEST.nft',
      marketContractId: 'SPTEST.market',
      paymentTokenContractId: null,
      marketLabel: 'STX market'
    });

    expect(request).toEqual({
      listingId: '4',
      tokenId: '12',
      nftContract: 'SPTEST.nft',
      marketContractId: 'SPTEST.market',
      paymentTokenContractId: null,
      marketLabel: 'STX market'
    });
    expect(store.load()).toEqual(request);
    expect(listener).toHaveBeenCalledTimes(1);

    store.clear();
    expect(store.load()).toBeNull();
    window.removeEventListener(MARKET_FOCUS_EVENT, listener);
    vi.unstubAllGlobals();
  });
});
