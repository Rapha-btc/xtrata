import type { ContractCallOptions } from '@stacks/connect';
import type { StacksNetwork } from '@stacks/network';
import type { ClarityValue } from '@stacks/transactions';
import {
  bufferCV,
  callReadOnlyFunction,
  contractPrincipalCV,
  listCV,
  principalCV,
  stringAsciiCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import { resolveContractCapabilities } from './capabilities.js';
import type {
  CollectionMetadata,
  CollectionMintStatus,
  CollectionPhase,
  CollectionRecipients,
  CollectionSplits,
  ContractConfig,
  InscriptionMeta,
  MarketListing,
  NetworkType,
  UploadState
} from './types.js';
import { getContractId } from './config.js';
import { getApiBaseUrls, toStacksNetwork } from './network.js';
import {
  callReadOnlyWithRetry,
  getReadOnlyBackoffMs,
  isRateLimitError,
  noteReadOnlyFailure,
  noteReadOnlySuccess,
  type ReadOnlyRetryOptions
} from './read-only.js';
import {
  parseCollectionBool,
  parseCollectionUInt,
  parseGetAdmin,
  parseGetChunk,
  parseGetChunkBatch,
  parseGetCollectionActivePhase,
  parseGetCollectionLockedCoreContract,
  parseGetCollectionMetadata,
  parseGetCollectionMintedId,
  parseGetCollectionPhase,
  parseGetCollectionRecipients,
  parseGetCollectionSplits,
  parseGetDependencies,
  parseGetFeeUnit,
  parseGetIdByHash,
  parseGetInscriptionMeta,
  parseGetLastTokenId,
  parseGetMarketFeeBps,
  parseGetMarketLastListingId,
  parseGetMarketListing,
  parseGetMarketListingByToken,
  parseGetMarketListingIdByToken,
  parseGetMarketNftContract,
  parseGetMarketOwner,
  parseGetNextTokenId,
  parseGetOwner,
  parseGetPendingChunk,
  parseGetRoyaltyRecipient,
  parseGetSvg,
  parseGetSvgDataUri,
  parseGetTokenUri,
  parseGetUploadState,
  parseIsPaused
} from './parsers.js';
import { ReadOnlyBackoffError } from './errors.js';

export type ReadOnlyCallOptions = {
  contract: ContractConfig;
  functionName: string;
  functionArgs: ClarityValue[];
  senderAddress: string;
  network: StacksNetwork;
};

export type ReadOnlyCaller = {
  callReadOnly: (options: ReadOnlyCallOptions) => Promise<ClarityValue>;
};

export const createStacksReadOnlyCaller = (): ReadOnlyCaller => ({
  callReadOnly: (options) =>
    callReadOnlyFunction({
      contractAddress: options.contract.address,
      contractName: options.contract.contractName,
      functionName: options.functionName,
      functionArgs: options.functionArgs,
      senderAddress: options.senderAddress,
      network: options.network
    })
});

export type ContractCallOverrides = Partial<ContractCallOptions>;

export const buildContractCallOptions = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  functionName: string;
  functionArgs: ClarityValue[];
  overrides?: ContractCallOverrides;
}): ContractCallOptions => {
  const base: ContractCallOptions = {
    contractAddress: params.contract.address,
    contractName: params.contract.contractName,
    functionName: params.functionName,
    functionArgs: params.functionArgs,
    network: params.network
  };
  return { ...base, ...(params.overrides ?? {}) } as ContractCallOptions;
};

export const buildBeginInscriptionCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  mime: string;
  totalSize: bigint;
  totalChunks: bigint;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'begin-inscription',
    functionArgs: [
      bufferCV(params.expectedHash),
      stringAsciiCV(params.mime),
      uintCV(params.totalSize),
      uintCV(params.totalChunks)
    ],
    overrides: params.overrides
  });

export const buildAddChunkBatchCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  chunks: Uint8Array[];
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'add-chunk-batch',
    functionArgs: [
      bufferCV(params.expectedHash),
      listCV(params.chunks.map((chunk) => bufferCV(chunk)))
    ],
    overrides: params.overrides
  });

export const buildSealInscriptionCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  tokenUri: string;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'seal-inscription',
    functionArgs: [bufferCV(params.expectedHash), stringAsciiCV(params.tokenUri)],
    overrides: params.overrides
  });

export const buildSealInscriptionBatchCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  items: { expectedHash: Uint8Array; tokenUri: string }[];
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'seal-inscription-batch',
    functionArgs: [
      listCV(
        params.items.map((item) =>
          tupleCV({
            hash: bufferCV(item.expectedHash),
            'token-uri': stringAsciiCV(item.tokenUri)
          })
        )
      )
    ],
    overrides: params.overrides
  });

export const buildSealRecursiveCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  tokenUri: string;
  dependencies: bigint[];
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'seal-recursive',
    functionArgs: [
      bufferCV(params.expectedHash),
      stringAsciiCV(params.tokenUri),
      listCV(params.dependencies.map((dep) => uintCV(dep)))
    ],
    overrides: params.overrides
  });

export const buildTransferCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  id: bigint;
  sender: string;
  recipient: string;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'transfer',
    functionArgs: [uintCV(params.id), principalCV(params.sender), principalCV(params.recipient)],
    overrides: params.overrides
  });

export const buildSetRoyaltyRecipientCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  recipient: string;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'set-royalty-recipient',
    functionArgs: [principalCV(params.recipient)],
    overrides: params.overrides
  });

export const buildCollectionMintBeginCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  xtrataContract: ContractConfig;
  expectedHash: Uint8Array;
  mime: string;
  totalSize: bigint;
  totalChunks: bigint;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'mint-begin',
    functionArgs: [
      contractPrincipalCV(
        params.xtrataContract.address,
        params.xtrataContract.contractName
      ),
      bufferCV(params.expectedHash),
      stringAsciiCV(params.mime),
      uintCV(params.totalSize),
      uintCV(params.totalChunks)
    ],
    overrides: params.overrides
  });

export const buildCollectionMintAddChunkBatchCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  xtrataContract: ContractConfig;
  expectedHash: Uint8Array;
  chunks: Uint8Array[];
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'mint-add-chunk-batch',
    functionArgs: [
      contractPrincipalCV(
        params.xtrataContract.address,
        params.xtrataContract.contractName
      ),
      bufferCV(params.expectedHash),
      listCV(params.chunks.map((chunk) => bufferCV(chunk)))
    ],
    overrides: params.overrides
  });

export const buildCollectionMintSealCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  xtrataContract: ContractConfig;
  expectedHash: Uint8Array;
  tokenUri: string;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'mint-seal',
    functionArgs: [
      contractPrincipalCV(
        params.xtrataContract.address,
        params.xtrataContract.contractName
      ),
      bufferCV(params.expectedHash),
      stringAsciiCV(params.tokenUri)
    ],
    overrides: params.overrides
  });

export const buildCollectionMintSealBatchCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  xtrataContract: ContractConfig;
  items: { expectedHash: Uint8Array; tokenUri: string }[];
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'mint-seal-batch',
    functionArgs: [
      contractPrincipalCV(
        params.xtrataContract.address,
        params.xtrataContract.contractName
      ),
      listCV(
        params.items.map((item) =>
          tupleCV({
            hash: bufferCV(item.expectedHash),
            'token-uri': stringAsciiCV(item.tokenUri)
          })
        )
      )
    ],
    overrides: params.overrides
  });

export const buildSmallMintSingleTxCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  xtrataContract: ContractConfig;
  expectedHash: Uint8Array;
  mime: string;
  totalSize: bigint;
  chunks: Uint8Array[];
  tokenUri: string;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'mint-small-single-tx',
    functionArgs: [
      contractPrincipalCV(
        params.xtrataContract.address,
        params.xtrataContract.contractName
      ),
      bufferCV(params.expectedHash),
      stringAsciiCV(params.mime),
      uintCV(params.totalSize),
      listCV(params.chunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(params.tokenUri)
    ],
    overrides: params.overrides
  });

export const buildSmallMintSingleTxRecursiveCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  xtrataContract: ContractConfig;
  expectedHash: Uint8Array;
  mime: string;
  totalSize: bigint;
  chunks: Uint8Array[];
  tokenUri: string;
  dependencies: bigint[];
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'mint-small-single-tx-recursive',
    functionArgs: [
      contractPrincipalCV(
        params.xtrataContract.address,
        params.xtrataContract.contractName
      ),
      bufferCV(params.expectedHash),
      stringAsciiCV(params.mime),
      uintCV(params.totalSize),
      listCV(params.chunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(params.tokenUri),
      listCV(params.dependencies.map((dependency) => uintCV(dependency)))
    ],
    overrides: params.overrides
  });

export const buildMarketListCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  nftContract: ContractConfig;
  tokenId: bigint;
  priceMicroStx: bigint;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'list-token',
    functionArgs: [
      contractPrincipalCV(params.nftContract.address, params.nftContract.contractName),
      uintCV(params.tokenId),
      uintCV(params.priceMicroStx)
    ],
    overrides: params.overrides
  });

export const buildMarketCancelCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  nftContract: ContractConfig;
  listingId: bigint;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'cancel',
    functionArgs: [
      contractPrincipalCV(params.nftContract.address, params.nftContract.contractName),
      uintCV(params.listingId)
    ],
    overrides: params.overrides
  });

export const buildMarketBuyCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  nftContract: ContractConfig;
  listingId: bigint;
  overrides?: ContractCallOverrides;
}) =>
  buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'buy',
    functionArgs: [
      contractPrincipalCV(params.nftContract.address, params.nftContract.contractName),
      uintCV(params.listingId)
    ],
    overrides: params.overrides
  });

const shouldTryFallback = (error: unknown) => {
  if (isRateLimitError(error)) {
    return true;
  }
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
  retry?: ReadOnlyRetryOptions;
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
        // Keep this branch explicit so consumers can add logger hooks around SDK calls.
        void getNetworkUrl(activeNetwork);
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

export type XtrataClient = {
  contract: ContractConfig;
  network: NetworkType;
  supportsChunkBatchRead: boolean;
  getLastTokenId: (senderAddress: string) => Promise<bigint>;
  getNextTokenId: (senderAddress: string) => Promise<bigint>;
  getAdmin: (senderAddress: string) => Promise<string>;
  getRoyaltyRecipient: (senderAddress: string) => Promise<string>;
  getFeeUnit: (senderAddress: string) => Promise<bigint>;
  isPaused: (senderAddress: string) => Promise<boolean>;
  getTokenUri: (id: bigint, senderAddress: string) => Promise<string | null>;
  getOwner: (id: bigint, senderAddress: string) => Promise<string | null>;
  getSvg: (id: bigint, senderAddress: string) => Promise<string | null>;
  getSvgDataUri: (id: bigint, senderAddress: string) => Promise<string | null>;
  getInscriptionMeta: (id: bigint, senderAddress: string) => Promise<InscriptionMeta | null>;
  getDependencies: (id: bigint, senderAddress: string) => Promise<bigint[]>;
  getChunk: (id: bigint, index: bigint, senderAddress: string) => Promise<Uint8Array | null>;
  getChunkBatch: (
    id: bigint,
    indexes: bigint[],
    senderAddress: string
  ) => Promise<(Uint8Array | null)[]>;
  getUploadState: (
    expectedHash: Uint8Array,
    owner: string,
    senderAddress: string
  ) => Promise<UploadState | null>;
  getIdByHash: (expectedHash: Uint8Array, senderAddress: string) => Promise<bigint | null>;
  getPendingChunk: (
    expectedHash: Uint8Array,
    index: bigint,
    senderAddress: string,
    creator?: string
  ) => Promise<Uint8Array | null>;
};

const resolveNetworks = (params: {
  contract: ContractConfig;
  apiBaseUrl?: string;
  apiBaseUrls?: string[];
}) => {
  const urls =
    params.apiBaseUrls && params.apiBaseUrls.length > 0
      ? params.apiBaseUrls
      : params.apiBaseUrl
        ? [params.apiBaseUrl]
        : getApiBaseUrls(params.contract.network);
  return urls.map((url) => toStacksNetwork(params.contract.network, url));
};

export const createXtrataClient = (params: {
  contract: ContractConfig;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
  apiBaseUrls?: string[];
}): XtrataClient => {
  const caller = params.caller ?? createStacksReadOnlyCaller();
  const stacksNetwork = resolveNetworks(params);
  const capabilities = resolveContractCapabilities(params.contract);

  return {
    contract: params.contract,
    network: params.contract.network,
    supportsChunkBatchRead: capabilities.supportsChunkBatchRead,
    getLastTokenId: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-last-token-id',
        functionArgs: [],
        senderAddress
      });
      return parseGetLastTokenId(value);
    },
    getNextTokenId: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-next-token-id',
        functionArgs: [],
        senderAddress
      });
      return parseGetNextTokenId(value);
    },
    getAdmin: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-admin',
        functionArgs: [],
        senderAddress
      });
      return parseGetAdmin(value);
    },
    getRoyaltyRecipient: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-royalty-recipient',
        functionArgs: [],
        senderAddress
      });
      return parseGetRoyaltyRecipient(value);
    },
    getFeeUnit: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-fee-unit',
        functionArgs: [],
        senderAddress
      });
      return parseGetFeeUnit(value);
    },
    isPaused: async (senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'is-paused',
        functionArgs: [],
        senderAddress
      });
      return parseIsPaused(value);
    },
    getTokenUri: async (id, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-token-uri',
        functionArgs: [uintCV(id)],
        senderAddress
      });
      return parseGetTokenUri(value);
    },
    getOwner: async (id, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-owner',
        functionArgs: [uintCV(id)],
        senderAddress
      });
      return parseGetOwner(value);
    },
    getSvg: async (id, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-svg',
        functionArgs: [uintCV(id)],
        senderAddress
      });
      return parseGetSvg(value);
    },
    getSvgDataUri: async (id, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-svg-data-uri',
        functionArgs: [uintCV(id)],
        senderAddress
      });
      return parseGetSvgDataUri(value);
    },
    getInscriptionMeta: async (id, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-inscription-meta',
        functionArgs: [uintCV(id)],
        senderAddress
      });
      return parseGetInscriptionMeta(value);
    },
    getDependencies: async (id, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-dependencies',
        functionArgs: [uintCV(id)],
        senderAddress
      });
      return parseGetDependencies(value);
    },
    getChunk: async (id, index, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-chunk',
        functionArgs: [uintCV(id), uintCV(index)],
        senderAddress,
        retry: {
          retries: 4,
          baseDelayMs: 1_000
        }
      });
      return parseGetChunk(value);
    },
    getChunkBatch: async (id, indexes, senderAddress) => {
      if (indexes.length === 0) {
        return [];
      }
      if (!capabilities.supportsChunkBatchRead) {
        throw new Error('Chunk batch reads are not supported by this contract.');
      }
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-chunk-batch',
        functionArgs: [uintCV(id), listCV(indexes.map((index) => uintCV(index)))],
        senderAddress,
        retry: {
          retries: 4,
          baseDelayMs: 1_000
        }
      });
      return parseGetChunkBatch(value);
    },
    getUploadState: async (expectedHash, owner, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-upload-state',
        functionArgs: [bufferCV(expectedHash), principalCV(owner)],
        senderAddress
      });
      return parseGetUploadState(value);
    },
    getIdByHash: async (expectedHash, senderAddress) => {
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-id-by-hash',
        functionArgs: [bufferCV(expectedHash)],
        senderAddress
      });
      return parseGetIdByHash(value);
    },
    getPendingChunk: async (expectedHash, index, senderAddress, creator) => {
      const functionArgs = capabilities.pendingChunkRequiresCreator
        ? [bufferCV(expectedHash), principalCV(creator ?? senderAddress), uintCV(index)]
        : [bufferCV(expectedHash), uintCV(index)];
      const value = await callReadOnly({
        caller,
        contract: params.contract,
        network: stacksNetwork,
        functionName: 'get-pending-chunk',
        functionArgs,
        senderAddress,
        retry: {
          retries: 4,
          baseDelayMs: 1_000
        }
      });
      return parseGetPendingChunk(value);
    }
  };
};

export type CollectionMintClient = {
  contract: ContractConfig;
  network: NetworkType;
  isPaused: (senderAddress: string) => Promise<boolean>;
  getFinalized: (senderAddress: string) => Promise<boolean>;
  getMintPrice: (senderAddress: string) => Promise<bigint>;
  getMaxSupply: (senderAddress: string) => Promise<bigint>;
  getMintedCount: (senderAddress: string) => Promise<bigint>;
  getReservedCount: (senderAddress: string) => Promise<bigint>;
  getActivePhase: (senderAddress: string) => Promise<bigint>;
  getPhase: (phaseId: bigint, senderAddress: string) => Promise<CollectionPhase | null>;
  getMetadata: (senderAddress: string) => Promise<CollectionMetadata>;
  getRecipients: (senderAddress: string) => Promise<CollectionRecipients>;
  getSplits: (senderAddress: string) => Promise<CollectionSplits>;
  getMintedId: (index: bigint, senderAddress: string) => Promise<bigint | null>;
  getLockedCoreContract: (senderAddress: string) => Promise<string>;
  getStatus: (senderAddress: string) => Promise<CollectionMintStatus>;
};

export const createCollectionMintClient = (params: {
  contract: ContractConfig;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
  apiBaseUrls?: string[];
}): CollectionMintClient => {
  const caller = params.caller ?? createStacksReadOnlyCaller();
  const stacksNetwork = resolveNetworks(params);

  const read = async (
    functionName: string,
    functionArgs: ClarityValue[],
    senderAddress: string,
    retry?: ReadOnlyRetryOptions
  ) =>
    callReadOnly({
      caller,
      contract: params.contract,
      network: stacksNetwork,
      functionName,
      functionArgs,
      senderAddress,
      retry
    });

  return {
    contract: params.contract,
    network: params.contract.network,
    isPaused: async (senderAddress) => parseCollectionBool(await read('is-paused', [], senderAddress), 'is-paused'),
    getFinalized: async (senderAddress) => parseCollectionBool(await read('get-finalized', [], senderAddress), 'get-finalized'),
    getMintPrice: async (senderAddress) => parseCollectionUInt(await read('get-mint-price', [], senderAddress), 'get-mint-price'),
    getMaxSupply: async (senderAddress) => parseCollectionUInt(await read('get-max-supply', [], senderAddress), 'get-max-supply'),
    getMintedCount: async (senderAddress) => parseCollectionUInt(await read('get-minted-count', [], senderAddress), 'get-minted-count'),
    getReservedCount: async (senderAddress) => parseCollectionUInt(await read('get-reserved-count', [], senderAddress), 'get-reserved-count'),
    getActivePhase: async (senderAddress) => parseGetCollectionActivePhase(await read('get-active-phase', [], senderAddress)),
    getPhase: async (phaseId, senderAddress) =>
      parseGetCollectionPhase(await read('get-phase', [uintCV(phaseId)], senderAddress)),
    getMetadata: async (senderAddress) =>
      parseGetCollectionMetadata(await read('get-collection-metadata', [], senderAddress)),
    getRecipients: async (senderAddress) =>
      parseGetCollectionRecipients(await read('get-recipients', [], senderAddress)),
    getSplits: async (senderAddress) =>
      parseGetCollectionSplits(await read('get-splits', [], senderAddress)),
    getMintedId: async (index, senderAddress) =>
      parseGetCollectionMintedId(await read('get-minted-id', [uintCV(index)], senderAddress)),
    getLockedCoreContract: async (senderAddress) =>
      parseGetCollectionLockedCoreContract(
        await read('get-locked-core-contract', [], senderAddress)
      ),
    getStatus: async (senderAddress) => {
      const [paused, finalized, mintPrice, maxSupply, mintedCount, reservedCount, activePhaseId] =
        await Promise.all([
          parseCollectionBool(await read('is-paused', [], senderAddress), 'is-paused'),
          parseCollectionBool(await read('get-finalized', [], senderAddress), 'get-finalized'),
          parseCollectionUInt(await read('get-mint-price', [], senderAddress), 'get-mint-price'),
          parseCollectionUInt(await read('get-max-supply', [], senderAddress), 'get-max-supply'),
          parseCollectionUInt(await read('get-minted-count', [], senderAddress), 'get-minted-count'),
          parseCollectionUInt(await read('get-reserved-count', [], senderAddress), 'get-reserved-count'),
          parseGetCollectionActivePhase(await read('get-active-phase', [], senderAddress))
        ]);

      const activePhase =
        activePhaseId > 0n
          ? parseGetCollectionPhase(
              await read('get-phase', [uintCV(activePhaseId)], senderAddress)
            )
          : null;

      return {
        paused,
        finalized,
        mintPrice,
        maxSupply,
        mintedCount,
        reservedCount,
        activePhaseId,
        activePhase
      };
    }
  };
};

const parseContractPrincipal = (contractId: string) => {
  const [address, ...rest] = contractId.split('.');
  const contractName = rest.join('.');
  if (!address || !contractName) {
    return principalCV(contractId);
  }
  return contractPrincipalCV(address, contractName);
};

export type MarketClient = {
  contract: ContractConfig;
  network: NetworkType;
  getOwner: (senderAddress: string) => Promise<string>;
  getNftContract: (senderAddress: string) => Promise<string>;
  getFeeBps: (senderAddress: string) => Promise<bigint>;
  getLastListingId: (senderAddress: string) => Promise<bigint>;
  getListing: (id: bigint, senderAddress: string) => Promise<MarketListing | null>;
  getListingByToken: (
    nftContractId: string,
    tokenId: bigint,
    senderAddress: string
  ) => Promise<MarketListing | null>;
  getListingIdByToken: (
    nftContractId: string,
    tokenId: bigint,
    senderAddress: string
  ) => Promise<bigint | null>;
};

export const createMarketClient = (params: {
  contract: ContractConfig;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
  apiBaseUrls?: string[];
}): MarketClient => {
  const caller = params.caller ?? createStacksReadOnlyCaller();
  const stacksNetwork = resolveNetworks(params);

  const read = async (
    functionName: string,
    functionArgs: ClarityValue[],
    senderAddress: string,
    retry?: ReadOnlyRetryOptions
  ) =>
    callReadOnly({
      caller,
      contract: params.contract,
      network: stacksNetwork,
      functionName,
      functionArgs,
      senderAddress,
      retry
    });

  return {
    contract: params.contract,
    network: params.contract.network,
    getOwner: async (senderAddress) => parseGetMarketOwner(await read('get-owner', [], senderAddress)),
    getNftContract: async (senderAddress) =>
      parseGetMarketNftContract(await read('get-nft-contract', [], senderAddress)),
    getFeeBps: async (senderAddress) => parseGetMarketFeeBps(await read('get-fee-bps', [], senderAddress)),
    getLastListingId: async (senderAddress) =>
      parseGetMarketLastListingId(await read('get-last-listing-id', [], senderAddress)),
    getListing: async (id, senderAddress) =>
      parseGetMarketListing(await read('get-listing', [uintCV(id)], senderAddress)),
    getListingByToken: async (nftContractId, tokenId, senderAddress) =>
      parseGetMarketListingByToken(
        await read(
          'get-listing-by-token',
          [parseContractPrincipal(nftContractId), uintCV(tokenId)],
          senderAddress
        )
      ),
    getListingIdByToken: async (nftContractId, tokenId, senderAddress) =>
      parseGetMarketListingIdByToken(
        await read(
          'get-listing-id-by-token',
          [parseContractPrincipal(nftContractId), uintCV(tokenId)],
          senderAddress
        )
      )
  };
};
