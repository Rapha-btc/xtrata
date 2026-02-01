import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../wallet/storage';
import { createContractSelectionStore } from '../selection';
import type { ContractRegistryEntry } from '../registry';

const registry: ContractRegistryEntry[] = [
  {
    label: 'xtrata-v1-1-1',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v1-1-1',
    network: 'mainnet',
    protocolVersion: '1.1.1'
  }
];

describe('contract selection store', () => {
  it('defaults to the first registry entry', () => {
    const store = createContractSelectionStore(registry, createMemoryStorage());
    const selected = store.load();
    expect(selected.label).toBe('xtrata-v1-1-1');
  });

  it('persists selection', () => {
    const storage = createMemoryStorage();
    const store = createContractSelectionStore(registry, storage);

    store.save(registry[0]);
    const selected = store.load();
    expect(selected.label).toBe('xtrata-v1-1-1');
  });
});
