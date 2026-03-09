import type { ClarityValue } from '@stacks/transactions';
import { boolCV, principalCV, uintCV } from '@stacks/transactions';
import type { StacksNetwork } from '@stacks/network';
import type { ContractCallOptions } from '@stacks/connect';
import { getApiBaseUrls } from '../network/config';
import { toStacksNetwork } from '../network/stacks';
import type { NetworkType } from '../network/types';
import { buildContractCallOptions } from '../contract/client';
import type {
  ContractCallOverrides,
  ReadOnlyCaller,
  ReadOnlyCallOptions
} from '../contract/client';
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
  parseGetCommerceCoreContract,
  parseGetCommerceOwner,
  parseGetListing,
  parseGetNextListingId,
  parseGetPaymentToken,
  parseHasEntitlement
} from './parsers';
import type { CommerceListing } from './types';

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

export const buildCreateListingCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  assetId: bigint;
  price: bigint;
  overrides?: ContractCallOverrides;
}): ContractCallOptions =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'create-listing',
    functionArgs: [uintCV(params.assetId), uintCV(params.price)],
    overrides: params.overrides
  });

export const buildSetListingActiveCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  listingId: bigint;
  active: boolean;
  overrides?: ContractCallOverrides;
}): ContractCallOptions =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'set-listing-active',
    functionArgs: [uintCV(params.listingId), boolCV(params.active)],
    overrides: params.overrides
  });

export const buildBuyWithUsdcCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  listingId: bigint;
  overrides?: ContractCallOverrides;
}): ContractCallOptions =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'buy-with-usdc',
    functionArgs: [uintCV(params.listingId)],
    overrides: params.overrides
  });

export type CommerceClient = {
  contract: ContractConfig;
  network: NetworkType;
  getOwner: (senderAddress: string) => Promise<string>;
  getCoreContract: (senderAddress: string) => Promise<string>;
  getPaymentToken: (senderAddress: string) => Promise<string>;
  getNextListingId: (senderAddress: string) => Promise<bigint>;
  getListing: (listingId: bigint, senderAddress: string) => Promise<CommerceListing | null>;
  hasEntitlement: (
    assetId: bigint,
    owner: string,
    senderAddress: string
  ) => Promise<boolean>;
};

export const createCommerceClient = (params: {
  contract: ContractConfig;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
}): CommerceClient => {
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
      return parseGetCommerceOwner(value);
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
      return parseGetCommerceCoreContract(value);
    },
    getPaymentToken: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-payment-token',
        functionArgs: [],
        senderAddress
      });
      return parseGetPaymentToken(value);
    },
    getNextListingId: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-next-listing-id',
        functionArgs: [],
        senderAddress
      });
      return parseGetNextListingId(value);
    },
    getListing: async (listingId, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-listing',
        functionArgs: [uintCV(listingId)],
        senderAddress
      });
      return parseGetListing(value);
    },
    hasEntitlement: async (assetId, owner, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'has-entitlement',
        functionArgs: [uintCV(assetId), principalCV(owner)],
        senderAddress
      });
      return parseHasEntitlement(value);
    }
  };
};

export type { ReadOnlyCallOptions };
