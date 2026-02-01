import type { NetworkType } from '../network/types';

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
