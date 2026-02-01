import type { ClarityValue } from '@stacks/transactions';
import {
  bufferCV,
  callReadOnlyFunction,
  listCV,
  principalCV,
  stringAsciiCV,
  uintCV
} from '@stacks/transactions';
import type { ContractCallOptions } from '@stacks/connect';
import type { StacksNetwork } from '@stacks/network';
import { toStacksNetwork } from '../network/stacks';
import type { NetworkType } from '../network/types';
import type { ContractConfig } from './config';
import { getContractId } from './config';
import { callReadOnlyWithRetry } from './read-only';
import { resolveContractCapabilities } from './capabilities';
import {
  parseGetChunk,
  parseGetDependencies,
  parseGetAdmin,
  parseGetFeeUnit,
  parseGetInscriptionMeta,
  parseGetLastTokenId,
  parseGetNextTokenId,
  parseGetOwner,
  parseGetPendingChunk,
  parseGetRoyaltyRecipient,
  parseIsPaused,
  parseGetSvg,
  parseGetSvgDataUri,
  parseGetTokenUri,
  parseGetUploadState,
  parseGetChunkBatch
} from '../protocol/parsers';
import type { InscriptionMeta, UploadState } from '../protocol/types';

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

export const createStacksReadOnlyCaller = (): ReadOnlyCaller => {
  return {
    callReadOnly: (options) =>
      callReadOnlyFunction({
        contractAddress: options.contract.address,
        contractName: options.contract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        senderAddress: options.senderAddress,
        network: options.network
      })
  };
};

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

  return { ...base, ...(params.overrides ?? {}) };
};

export const buildBeginInscriptionCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  mime: string;
  totalSize: bigint;
  totalChunks: bigint;
  overrides?: ContractCallOverrides;
}) => {
  return buildContractCallOptions({
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
};

export const buildAddChunkBatchCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  chunks: Uint8Array[];
  overrides?: ContractCallOverrides;
}) => {
  return buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'add-chunk-batch',
    functionArgs: [
      bufferCV(params.expectedHash),
      listCV(params.chunks.map((chunk) => bufferCV(chunk)))
    ],
    overrides: params.overrides
  });
};

export const buildSealInscriptionCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  tokenUri: string;
  overrides?: ContractCallOverrides;
}) => {
  return buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'seal-inscription',
    functionArgs: [bufferCV(params.expectedHash), stringAsciiCV(params.tokenUri)],
    overrides: params.overrides
  });
};

export const buildSealRecursiveCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  expectedHash: Uint8Array;
  tokenUri: string;
  dependencies: bigint[];
  overrides?: ContractCallOverrides;
}) => {
  return buildContractCallOptions({
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
};

export const buildTransferCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  id: bigint;
  sender: string;
  recipient: string;
  overrides?: ContractCallOverrides;
}) => {
  return buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'transfer',
    functionArgs: [uintCV(params.id), principalCV(params.sender), principalCV(params.recipient)],
    overrides: params.overrides
  });
};

export const buildSetRoyaltyRecipientCall = (params: {
  contract: ContractConfig;
  network: StacksNetwork;
  recipient: string;
  overrides?: ContractCallOverrides;
}) => {
  return buildContractCallOptions({
    contract: params.contract,
    network: params.network,
    functionName: 'set-royalty-recipient',
    functionArgs: [principalCV(params.recipient)],
    overrides: params.overrides
  });
};

const callReadOnly = async (params: {
  caller: ReadOnlyCaller;
  contract: ContractConfig;
  network: StacksNetwork;
  functionName: string;
  functionArgs: ClarityValue[];
  senderAddress: string;
  retry?: {
    retries?: number;
    baseDelayMs?: number;
  };
}) => {
  return callReadOnlyWithRetry({
    task: () =>
      params.caller.callReadOnly({
        contract: params.contract,
        functionName: params.functionName,
        functionArgs: params.functionArgs,
        senderAddress: params.senderAddress,
        network: params.network
      }),
    functionName: params.functionName,
    contractId: getContractId(params.contract),
    retry: params.retry
  });
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
  getPendingChunk: (
    expectedHash: Uint8Array,
    index: bigint,
    senderAddress: string,
    creator?: string
  ) => Promise<Uint8Array | null>;
};

export const createXtrataClient = (params: {
  contract: ContractConfig;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
}): XtrataClient => {
  const caller = params.caller ?? createStacksReadOnlyCaller();
  const stacksNetwork = toStacksNetwork(
    params.contract.network,
    params.apiBaseUrl
  );
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
          baseDelayMs: 1000
        }
      });
      return parseGetChunk(value);
    },
    getChunkBatch: async (id, indexes, senderAddress) => {
      if (indexes.length === 0) {
        return [];
      }
      if (!capabilities.supportsChunkBatchRead) {
        throw new Error('Chunk batch reads not supported by this contract');
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
          baseDelayMs: 1000
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
    getPendingChunk: async (expectedHash, index, senderAddress, creator) => {
      const functionArgs = capabilities.pendingChunkRequiresCreator
        ? [
            bufferCV(expectedHash),
            principalCV(creator ?? senderAddress),
            uintCV(index)
          ]
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
          baseDelayMs: 1000
        }
      });
      return parseGetPendingChunk(value);
    }
  };
};
