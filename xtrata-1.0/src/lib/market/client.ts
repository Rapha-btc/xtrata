import type { ClarityValue } from '@stacks/transactions';
import { contractPrincipalCV, principalCV, uintCV } from '@stacks/transactions';
import type { StacksNetwork } from '@stacks/network';
import { getApiBaseUrls } from '../network/config';
import { toStacksNetwork } from '../network/stacks';
import type { NetworkType } from '../network/types';
import { getContractId } from '../contract/config';
import type { ContractConfig } from '../contract/config';
import type { ReadOnlyCaller } from '../contract/client';
import { createStacksReadOnlyCaller } from '../contract/client';
import {
  ReadOnlyBackoffError,
  callReadOnlyWithRetry,
  getReadOnlyBackoffMs,
  noteReadOnlyFailure,
  noteReadOnlySuccess
} from '../contract/read-only';
import { logWarn } from '../utils/logger';
import {
  parseGetFeeBps,
  parseGetLastListingId,
  parseGetListing,
  parseGetListingIdByToken,
  parseGetListingByToken,
  parseGetMarketOwner,
  parseGetNftContract,
  parseGetPaymentToken
} from './parsers';
import type { MarketListing } from './types';

const MISSING_FUNCTION_PATTERN =
  /NoSuchPublicFunction|NoSuchContractFunction|does not exist|Unknown function/i;

const isMissingFunctionError = (error: unknown, functionName: string) => {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  if (!MISSING_FUNCTION_PATTERN.test(message)) {
    return false;
  }
  return message.includes(functionName) || !message.includes('get-');
};

const shouldTryFallback = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
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

const toContractPrincipal = (contractId: string) => {
  const [address, ...rest] = contractId.split('.');
  const contractName = rest.join('.');
  if (!address || !contractName) {
    return principalCV(contractId);
  }
  return contractPrincipalCV(address, contractName);
};

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
  const networks = Array.isArray(params.network)
    ? params.network
    : [params.network];
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

export type MarketClient = {
  contract: ContractConfig;
  network: NetworkType;
  getOwner: (senderAddress: string) => Promise<string>;
  getNftContract: (senderAddress: string) => Promise<string>;
  getPaymentToken: (senderAddress: string) => Promise<string | null>;
  getFeeBps: (senderAddress: string) => Promise<bigint>;
  getLastListingId: (senderAddress: string) => Promise<bigint>;
  getListing: (id: bigint, senderAddress: string) => Promise<MarketListing | null>;
  getListingByToken: (
    nftContract: string,
    tokenId: bigint,
    senderAddress: string
  ) => Promise<MarketListing | null>;
  getListingIdByToken: (
    nftContract: string,
    tokenId: bigint,
    senderAddress: string
  ) => Promise<bigint | null>;
};

export const createMarketClient = (params: {
  contract: ContractConfig;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
}): MarketClient => {
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
      return parseGetMarketOwner(value);
    },
    getNftContract: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-nft-contract',
        functionArgs: [],
        senderAddress
      });
      return parseGetNftContract(value);
    },
    getPaymentToken: async (senderAddress) => {
      const backoffMs = getReadOnlyBackoffMs();
      if (backoffMs > 0) {
        throw new ReadOnlyBackoffError(backoffMs);
      }
      let lastError: unknown = null;
      for (let index = 0; index < stacksNetwork.length; index += 1) {
        const activeNetwork = stacksNetwork[index];
        try {
          const value = await caller.callReadOnly({
            contract: params.contract,
            functionName: 'get-payment-token',
            functionArgs: [],
            senderAddress,
            network: activeNetwork
          });
          noteReadOnlySuccess();
          return parseGetPaymentToken(value);
        } catch (error) {
          if (isMissingFunctionError(error, 'get-payment-token')) {
            return null;
          }
          lastError = error;
          const hasFallback = index < stacksNetwork.length - 1;
          if (hasFallback && shouldTryFallback(error)) {
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
    },
    getFeeBps: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-fee-bps',
        functionArgs: [],
        senderAddress
      });
      return parseGetFeeBps(value);
    },
    getLastListingId: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-last-listing-id',
        functionArgs: [],
        senderAddress
      });
      return parseGetLastListingId(value);
    },
    getListing: async (id, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-listing',
        functionArgs: [uintCV(id)],
        senderAddress
      });
      return parseGetListing(value);
    },
    getListingByToken: async (nftContract, tokenId, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-listing-by-token',
        functionArgs: [toContractPrincipal(nftContract), uintCV(tokenId)],
        senderAddress
      });
      return parseGetListingByToken(value);
    },
    getListingIdByToken: async (nftContract, tokenId, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-listing-id-by-token',
        functionArgs: [toContractPrincipal(nftContract), uintCV(tokenId)],
        senderAddress
      });
      return parseGetListingIdByToken(value);
    }
  };
};
