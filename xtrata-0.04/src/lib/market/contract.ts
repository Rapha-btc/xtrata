import { validateStacksAddress } from '@stacks/transactions';
import type { ContractConfig } from '../contract/config';
import { getNetworkFromAddress } from '../network/guard';

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

export type ParsedMarketContract = {
  config: ContractConfig | null;
  error: string | null;
};

export const parseMarketContractId = (value: string): ParsedMarketContract => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { config: null, error: 'Set a market contract ID first.' };
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
  const network = getNetworkFromAddress(address);
  if (!network) {
    return { config: null, error: 'Could not infer network from address.' };
  }
  return { config: { address, contractName, network }, error: null };
};
