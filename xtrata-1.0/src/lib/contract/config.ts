import { validateStacksAddress } from '@stacks/transactions';
import type { NetworkType } from '../network/types';
import { getNetworkFromAddress } from '../network/guard';

export type ContractConfig = {
  address: string;
  contractName: string;
  network: NetworkType;
};

export const DEFAULT_CONTRACT: ContractConfig = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-v1-1-1',
  network: 'mainnet'
};

export const CONTRACTS: ContractConfig[] = [DEFAULT_CONTRACT];

export const getContractId = (contract: ContractConfig) =>
  `${contract.address}.${contract.contractName}`;

export const parseContractId = (value: string): ContractConfig | null => {
  const trimmed = value.trim();
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return null;
  }
  const address = trimmed.slice(0, dotIndex).trim();
  const contractName = trimmed.slice(dotIndex + 1).trim();
  if (!validateStacksAddress(address) || !contractName) {
    return null;
  }
  const network = getNetworkFromAddress(address);
  if (!network) {
    return null;
  }
  return {
    address,
    contractName,
    network
  };
};
