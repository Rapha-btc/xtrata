import { validateStacksAddress } from '@stacks/transactions';
import type { ContractConfig, NetworkType } from './types.js';
import { getNetworkFromAddress } from './network.js';

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

export const DEFAULT_CONTRACT: ContractConfig = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-v2-1-0',
  network: 'mainnet',
  protocolVersion: '2.1.0'
};

export const getContractId = (contract: Pick<ContractConfig, 'address' | 'contractName'>) =>
  `${contract.address}.${contract.contractName}`;

export type ParsedContractId = {
  config: ContractConfig | null;
  error: string | null;
};

export const parseContractId = (
  value: string,
  networkHint?: NetworkType | null
): ParsedContractId => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { config: null, error: 'Contract ID is required.' };
  }
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { config: null, error: 'Use format ADDRESS.CONTRACT-NAME.' };
  }

  const address = trimmed.slice(0, dotIndex).trim();
  const contractName = trimmed.slice(dotIndex + 1).trim();

  if (!validateStacksAddress(address)) {
    return { config: null, error: 'Invalid Stacks address.' };
  }
  if (!CONTRACT_NAME_PATTERN.test(contractName)) {
    return { config: null, error: 'Invalid contract name.' };
  }

  const inferredNetwork = getNetworkFromAddress(address) ?? networkHint ?? null;
  if (!inferredNetwork) {
    return { config: null, error: 'Could not infer network from address.' };
  }

  return {
    config: {
      address,
      contractName,
      network: inferredNetwork
    },
    error: null
  };
};

export const parseContractIds = (
  values: string[],
  networkHint?: NetworkType | null
) => {
  const valid: ContractConfig[] = [];
  const errors: string[] = [];
  values.forEach((value, index) => {
    const parsed = parseContractId(value, networkHint);
    if (parsed.config) {
      valid.push(parsed.config);
      return;
    }
    errors.push(`Entry ${index + 1}: ${parsed.error ?? 'Invalid contract ID.'}`);
  });
  return { valid, errors };
};
