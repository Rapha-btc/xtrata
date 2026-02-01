import type { StorageLike } from '../wallet/storage';
import { getDefaultStorage } from '../wallet/storage';
import type { ContractRegistryEntry } from './registry';
import { getContractId } from './config';

const STORAGE_KEY = 'xtrata.v15.1.contract.selection';

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

export const createContractSelectionStore = (
  registry: ContractRegistryEntry[],
  storage?: StorageLike
) => {
  if (registry.length === 0) {
    throw new Error('Contract registry cannot be empty');
  }

  const backing = storage ?? getDefaultStorage();
  const byId = new Map<string, ContractRegistryEntry>();
  for (const entry of registry) {
    byId.set(getContractId(entry), entry);
  }
  const defaultEntry = registry[0];

  return {
    load: (): ContractRegistryEntry => {
      const selection = parseSelection(backing.getItem(STORAGE_KEY));
      if (selection) {
        const entry = byId.get(selection.contractId);
        if (entry) {
          return entry;
        }
      }
      return defaultEntry;
    },
    save: (entry: ContractRegistryEntry) => {
      const record: SelectionRecord = { contractId: getContractId(entry) };
      backing.setItem(STORAGE_KEY, JSON.stringify(record));
    },
    clear: () => {
      backing.removeItem(STORAGE_KEY);
    }
  };
};
