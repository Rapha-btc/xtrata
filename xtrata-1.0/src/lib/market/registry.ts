import registry from '../../data/market-registry.json';
import { getNetworkFromAddress } from '../network/guard';
import { isNetworkType, type NetworkType } from '../network/types';
import { getContractId } from '../contract/config';

export type MarketRegistryEntry = {
  label: string;
  address: string;
  contractName: string;
  network: NetworkType;
  paymentTokenContractId?: string | null;
};

const isValidEntry = (entry: MarketRegistryEntry) => {
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

const normalizeRegistry = (entries: MarketRegistryEntry[]) => {
  const valid = entries.filter(isValidEntry);
  if (valid.length === 0) {
    throw new Error('Market registry is empty or invalid');
  }
  return valid;
};

export const MARKET_REGISTRY = normalizeRegistry(
  registry as MarketRegistryEntry[]
);

const MARKET_REGISTRY_BY_ID = new Map(
  MARKET_REGISTRY.map((entry) => [getContractId(entry), entry])
);

export const getMarketContractId = (entry: MarketRegistryEntry) =>
  getContractId(entry);

export const getMarketRegistryEntry = (
  contractId: string | null | undefined
) => {
  if (!contractId) {
    return null;
  }
  return MARKET_REGISTRY_BY_ID.get(contractId) ?? null;
};
