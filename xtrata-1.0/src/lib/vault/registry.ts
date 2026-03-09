import registry from '../../data/vault-registry.json';
import { getContractId } from '../contract/config';
import { getNetworkFromAddress } from '../network/guard';
import { isNetworkType, type NetworkType } from '../network/types';

export type VaultRegistryEntry = {
  label: string;
  address: string;
  contractName: string;
  network: NetworkType;
};

const isValidEntry = (entry: VaultRegistryEntry) => {
  if (!entry.address || !entry.contractName || !entry.label) {
    return false;
  }
  if (!isNetworkType(entry.network)) {
    return false;
  }
  const inferred = getNetworkFromAddress(entry.address);
  if (inferred && inferred !== entry.network) {
    return false;
  }
  return true;
};

const normalizeRegistry = (entries: VaultRegistryEntry[]) => {
  const valid = entries.filter(isValidEntry);
  if (valid.length === 0) {
    throw new Error('Vault registry is empty or invalid');
  }
  return valid;
};

export const VAULT_REGISTRY = normalizeRegistry(registry as VaultRegistryEntry[]);

export const getVaultContractId = (entry: VaultRegistryEntry) =>
  getContractId(entry);
