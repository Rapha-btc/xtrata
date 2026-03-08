import type { StorageLike } from '../wallet/storage';
import { getDefaultStorage } from '../wallet/storage';
import { getMarketContractId, MARKET_REGISTRY } from './registry';

const STORAGE_KEY = 'xtrata.v15.1.market.selection';
export const MARKET_SELECTION_EVENT = 'xtrata-market-selection';

const DEFAULT_MARKET_CONTRACT_ID = getMarketContractId(MARKET_REGISTRY[0]!);
const LEGACY_STX_MARKET_IDS = new Set(
  MARKET_REGISTRY.filter(
    (entry) =>
      !entry.paymentTokenContractId &&
      getMarketContractId(entry) !== DEFAULT_MARKET_CONTRACT_ID &&
      entry.contractName.startsWith('xtrata-market-v1-')
  ).map((entry) => getMarketContractId(entry))
);

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

const normalizeSelectionContractId = (
  contractId: string | null | undefined
): string | null => {
  if (!contractId) {
    return null;
  }
  if (LEGACY_STX_MARKET_IDS.has(contractId)) {
    return DEFAULT_MARKET_CONTRACT_ID;
  }
  return contractId;
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
      const contractId = normalizeSelectionContractId(selection?.contractId);
      if (selection?.contractId && contractId && contractId !== selection.contractId) {
        const record: SelectionRecord = { contractId };
        backing.setItem(STORAGE_KEY, JSON.stringify(record));
      }
      return contractId;
    },
    save: (contractId: string) => {
      const record: SelectionRecord = {
        contractId: normalizeSelectionContractId(contractId) ?? contractId
      };
      backing.setItem(STORAGE_KEY, JSON.stringify(record));
      notify();
    },
    clear: () => {
      backing.removeItem(STORAGE_KEY);
      notify();
    }
  };
};
