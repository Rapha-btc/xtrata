import { describe, expect, it } from 'vitest';
import { createMarketSelectionStore } from '../selection';
import { createMemoryStorage } from '../../wallet/storage';

const STORAGE_KEY = 'xtrata.v15.1.market.selection';
const DEFAULT_STX_MARKET =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-stx-v1-0';
const LEGACY_STX_MARKET =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-v1-1';
const USDC_MARKET =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-usdc-v1-0';

describe('market selection store', () => {
  it('migrates a saved legacy STX market to the new default STX market', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ contractId: LEGACY_STX_MARKET })
    );

    const store = createMarketSelectionStore(storage);

    expect(store.load()).toBe(DEFAULT_STX_MARKET);
    expect(storage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ contractId: DEFAULT_STX_MARKET })
    );
  });

  it('preserves non-legacy market selections', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ contractId: USDC_MARKET }));

    const store = createMarketSelectionStore(storage);

    expect(store.load()).toBe(USDC_MARKET);
    expect(storage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ contractId: USDC_MARKET })
    );
  });

  it('normalizes legacy STX selections on save', () => {
    const storage = createMemoryStorage();
    const store = createMarketSelectionStore(storage);

    store.save(LEGACY_STX_MARKET);

    expect(storage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ contractId: DEFAULT_STX_MARKET })
    );
  });
});
