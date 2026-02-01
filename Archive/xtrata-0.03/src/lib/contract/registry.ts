import registry from '../../data/contract-registry.json';
import { getNetworkFromAddress } from '../network/guard';
import { isNetworkType } from '../network/types';
import type { ContractConfig } from './config';
import { getContractId } from './config';
import { isProtocolVersion, type ProtocolVersion } from './capabilities';

export type ContractRegistryEntry = ContractConfig & {
  label: string;
  protocolVersion: ProtocolVersion;
};

const isValidEntry = (entry: ContractRegistryEntry) => {
  if (!entry.address || !entry.contractName || !entry.label) {
    return false;
  }
  if (!isNetworkType(entry.network)) {
    return false;
  }
  if (!isProtocolVersion(entry.protocolVersion)) {
    return false;
  }
  const inferred = getNetworkFromAddress(entry.address);
  if (inferred && inferred !== entry.network) {
    return false;
  }
  return true;
};

const normalizeRegistry = (entries: ContractRegistryEntry[]) => {
  const valid = entries.filter(isValidEntry);
  if (valid.length === 0) {
    throw new Error('Contract registry is empty or invalid');
  }
  return valid;
};

export const CONTRACT_REGISTRY = normalizeRegistry(
  registry as ContractRegistryEntry[]
);

export const getRegistryById = () => {
  const map = new Map<string, ContractRegistryEntry>();
  for (const entry of CONTRACT_REGISTRY) {
    map.set(getContractId(entry), entry);
  }
  return map;
};
