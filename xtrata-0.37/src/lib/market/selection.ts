import type { StorageLike } from '../wallet/storage';
import { getDefaultStorage } from '../wallet/storage';

const STORAGE_KEY = 'xtrata.v15.1.market.selection';
export const MARKET_SELECTION_EVENT = 'xtrata-market-selection';

type SelectionRecord = {
  contractId: string;
};

const parseSelection = (raw: string | null): SelectionRecord | null => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SelectionRecord;
  } catch (error) {
    return null;
  }
};

export const createMarketSelectionStore = (storage?: StorageLike) => {
  const backing = storage ?? getDefaultStorage();
  const notify = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new Event(MARKET_SELECTION_EVENT));
  };
  return {
    load: (): string | null => {
      const selection = parseSelection(backing.getItem(STORAGE_KEY));
      return selection?.contractId ?? null;
    },
    save: (contractId: string) => {
      const record: SelectionRecord = { contractId };
      backing.setItem(STORAGE_KEY, JSON.stringify(record));
      notify();
    },
    clear: () => {
      backing.removeItem(STORAGE_KEY);
      notify();
    }
  };
};
