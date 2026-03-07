import registry from '../../data/commerce-registry.json';
import { getContractId } from '../contract/config';
import { getNetworkFromAddress } from '../network/guard';
import { isNetworkType, type NetworkType } from '../network/types';

export type CommerceRegistryEntry = {
  label: string;
  address: string;
  contractName: string;
  network: NetworkType;
};

const isValidEntry = (entry: CommerceRegistryEntry) => {
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

const normalizeRegistry = (entries: CommerceRegistryEntry[]) => {
  const valid = entries.filter(isValidEntry);
  if (valid.length === 0) {
    throw new Error('Commerce registry is empty or invalid');
  }
  return valid;
};

export const COMMERCE_REGISTRY = normalizeRegistry(
  registry as CommerceRegistryEntry[]
);

export const getCommerceContractId = (entry: CommerceRegistryEntry) =>
  getContractId(entry);
