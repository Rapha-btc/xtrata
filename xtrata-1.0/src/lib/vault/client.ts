import type { ClarityValue } from '@stacks/transactions';
import { boolCV, principalCV, uintCV } from '@stacks/transactions';
import type { StacksNetwork } from '@stacks/network';
import type { ContractCallOptions } from '@stacks/connect';
import { getApiBaseUrls } from '../network/config';
import { toStacksNetwork } from '../network/stacks';
import type { NetworkType } from '../network/types';
import { buildContractCallOptions } from '../contract/client';
import type { ContractCallOverrides, ReadOnlyCaller } from '../contract/client';
import { createStacksReadOnlyCaller } from '../contract/client';
import { getContractId } from '../contract/config';
import type { ContractConfig } from '../contract/config';
import {
  ReadOnlyBackoffError,
  callReadOnlyWithRetry,
  getReadOnlyBackoffMs,
  noteReadOnlyFailure,
  noteReadOnlySuccess
} from '../contract/read-only';
import { logWarn } from '../utils/logger';
import {
  parseGetNextVaultId,
  parseGetReserveToken,
  parseGetTierForAmount,
  parseGetVault,
  parseGetVaultCoreContract,
  parseGetVaultOwner,
  parseHasPremiumAccess
} from './parsers';
import type { VaultRecord } from './types';

const shouldTryFallback = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('cors') ||
    lower.includes('access-control-allow-origin')
  );
};

const getNetworkUrl = (network: StacksNetwork) =>
  'coreApiUrl' in network ? network.coreApiUrl : '';

const callReadOnly = async (params: {
  caller: ReadOnlyCaller;
  contract: ContractConfig;
  network: StacksNetwork | StacksNetwork[];
  functionName: string;
  functionArgs: ClarityValue[];
  senderAddress: string;
  retry?: {
    retries?: number;
    baseDelayMs?: number;
  };
}) => {
  const networks = Array.isArray(params.network) ? params.network : [params.network];
  const contractId = getContractId(params.contract);
  const backoffMs = getReadOnlyBackoffMs();
  if (backoffMs > 0) {
    throw new ReadOnlyBackoffError(backoffMs);
  }
  let lastError: unknown = null;
  for (let index = 0; index < networks.length; index += 1) {
    const activeNetwork = networks[index];
    try {
      const result = await callReadOnlyWithRetry({
        task: () =>
          params.caller.callReadOnly({
            contract: params.contract,
            functionName: params.functionName,
            functionArgs: params.functionArgs,
            senderAddress: params.senderAddress,
            network: activeNetwork
          }),
        functionName: params.functionName,
        contractId,
        retry: params.retry
      });
      noteReadOnlySuccess();
      return result;
    } catch (error) {
      lastError = error;
      const hasFallback = index < networks.length - 1;
      if (hasFallback && shouldTryFallback(error)) {
        logWarn('readonly', 'Read-only call failed, retrying with fallback API', {
          functionName: params.functionName,
          contractId,
          error: error instanceof Error ? error.message : String(error ?? 'error'),
          from: getNetworkUrl(activeNetwork),
          to: getNetworkUrl(networks[index + 1])
        });
        continue;
      }
      break;
    }
  }
  noteReadOnlyFailure(lastError);
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError ?? 'Read-only call failed'));
};

export const buildOpenVaultCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  assetId: bigint;
  initialAmount: bigint;
  overrides?: ContractCallOverrides;
}): ContractCallOptions =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'open-vault',
    functionArgs: [uintCV(params.assetId), uintCV(params.initialAmount)],
    overrides: params.overrides
  });

export const buildDepositSbtcCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  vaultId: bigint;
  amount: bigint;
  overrides?: ContractCallOverrides;
}): ContractCallOptions =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'deposit-sbtc',
    functionArgs: [uintCV(params.vaultId), uintCV(params.amount)],
    overrides: params.overrides
  });

export const buildMarkReservedCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  vaultId: bigint;
  reserved: boolean;
  overrides?: ContractCallOverrides;
}): ContractCallOptions =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'mark-reserved',
    functionArgs: [uintCV(params.vaultId), boolCV(params.reserved)],
    overrides: params.overrides
  });

export type VaultClient = {
  contract: ContractConfig;
  network: NetworkType;
  getOwner: (senderAddress: string) => Promise<string>;
  getCoreContract: (senderAddress: string) => Promise<string>;
  getReserveToken: (senderAddress: string) => Promise<string>;
  getNextVaultId: (senderAddress: string) => Promise<bigint>;
  getVault: (vaultId: bigint, senderAddress: string) => Promise<VaultRecord | null>;
  getTierForAmount: (amount: bigint, senderAddress: string) => Promise<bigint>;
  hasPremiumAccess: (
    assetId: bigint,
    owner: string,
    senderAddress: string
  ) => Promise<boolean>;
};

export const createVaultClient = (params: {
  contract: ContractConfig;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
}): VaultClient => {
  const caller = params.caller ?? createStacksReadOnlyCaller();
  const apiBaseUrls = params.apiBaseUrl
    ? [params.apiBaseUrl]
    : getApiBaseUrls(params.contract.network);
  const stacksNetwork = apiBaseUrls.map((url) =>
    toStacksNetwork(params.contract.network, url)
  );

  return {
    contract: params.contract,
    network: params.contract.network,
    getOwner: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-owner',
        functionArgs: [],
        senderAddress
      });
      return parseGetVaultOwner(value);
    },
    getCoreContract: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-core-contract',
        functionArgs: [],
        senderAddress
      });
      return parseGetVaultCoreContract(value);
    },
    getReserveToken: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-reserve-token',
        functionArgs: [],
        senderAddress
      });
      return parseGetReserveToken(value);
    },
    getNextVaultId: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-next-vault-id',
        functionArgs: [],
        senderAddress
      });
      return parseGetNextVaultId(value);
    },
    getVault: async (vaultId, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-vault',
        functionArgs: [uintCV(vaultId)],
        senderAddress
      });
      return parseGetVault(value);
    },
    getTierForAmount: async (amount, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-tier-for-amount',
        functionArgs: [uintCV(amount)],
        senderAddress
      });
      return parseGetTierForAmount(value);
    },
    hasPremiumAccess: async (assetId, owner, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'has-premium-access',
        functionArgs: [uintCV(assetId), principalCV(owner)],
        senderAddress
      });
      return parseHasPremiumAccess(value);
    }
  };
};
