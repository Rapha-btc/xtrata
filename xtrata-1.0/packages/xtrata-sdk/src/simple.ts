import {
  createCollectionMintClient,
  createMarketClient,
  createXtrataClient,
  type CollectionMintClient,
  type MarketClient,
  type ReadOnlyCaller,
  type XtrataClient
} from './client.js';
import { getContractId, parseContractId } from './config.js';
import {
  createCollectionMintSnapshot,
  getEffectiveMintPrice,
  isCollectionMintLive,
  shouldShowLiveMintPage
} from './collections.js';
import type {
  CollectionMintSnapshot,
  CollectionMintStatus,
  ContractConfig
} from './types.js';

export class SdkSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SdkSetupError';
  }
}

type SimpleClientBaseParams = {
  contract?: ContractConfig;
  contractId?: string;
  senderAddress?: string;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
  apiBaseUrls?: string[];
};

const resolveContract = (params: SimpleClientBaseParams): ContractConfig => {
  if (params.contract) {
    return params.contract;
  }
  if (!params.contractId) {
    throw new SdkSetupError('contract or contractId is required.');
  }
  const parsed = parseContractId(params.contractId);
  if (!parsed.config) {
    throw new SdkSetupError(parsed.error ?? 'Invalid contract ID.');
  }
  return parsed.config;
};

const resolveSenderAddress = (contract: ContractConfig, senderAddress?: string) =>
  senderAddress?.trim() || contract.address;

export type BoundXtrataReadClient = {
  raw: XtrataClient;
  contract: ContractConfig;
  contractId: string;
  senderAddress: string;
  getLastTokenId: () => Promise<bigint>;
  getNextTokenId: () => Promise<bigint>;
  getAdmin: () => Promise<string>;
  getRoyaltyRecipient: () => Promise<string>;
  getFeeUnit: () => Promise<bigint>;
  isPaused: () => Promise<boolean>;
  getTokenUri: (id: bigint) => Promise<string | null>;
  getOwner: (id: bigint) => Promise<string | null>;
  getSvg: (id: bigint) => Promise<string | null>;
  getSvgDataUri: (id: bigint) => Promise<string | null>;
  getInscriptionMeta: (id: bigint) => ReturnType<XtrataClient['getInscriptionMeta']>;
  getDependencies: (id: bigint) => Promise<bigint[]>;
  getChunk: (id: bigint, index: bigint) => Promise<Uint8Array | null>;
  getChunkBatch: (id: bigint, indexes: bigint[]) => Promise<(Uint8Array | null)[]>;
  getUploadState: (expectedHash: Uint8Array, owner?: string) => Promise<ReturnType<XtrataClient['getUploadState']> extends Promise<infer T> ? T : never>;
  getIdByHash: (expectedHash: Uint8Array) => Promise<bigint | null>;
  getPendingChunk: (expectedHash: Uint8Array, index: bigint, creator?: string) => Promise<Uint8Array | null>;
  getTokenSnapshot: (id: bigint) => Promise<{
    id: bigint;
    owner: string | null;
    tokenUri: string | null;
    metadata: Awaited<ReturnType<XtrataClient['getInscriptionMeta']>>;
    dependencies: bigint[];
  }>;
};

export const createXtrataReadClient = (
  params: SimpleClientBaseParams
): BoundXtrataReadClient => {
  const contract = resolveContract(params);
  const senderAddress = resolveSenderAddress(contract, params.senderAddress);
  const raw = createXtrataClient({
    contract,
    caller: params.caller,
    apiBaseUrl: params.apiBaseUrl,
    apiBaseUrls: params.apiBaseUrls
  });

  return {
    raw,
    contract,
    contractId: getContractId(contract),
    senderAddress,
    getLastTokenId: () => raw.getLastTokenId(senderAddress),
    getNextTokenId: () => raw.getNextTokenId(senderAddress),
    getAdmin: () => raw.getAdmin(senderAddress),
    getRoyaltyRecipient: () => raw.getRoyaltyRecipient(senderAddress),
    getFeeUnit: () => raw.getFeeUnit(senderAddress),
    isPaused: () => raw.isPaused(senderAddress),
    getTokenUri: (id) => raw.getTokenUri(id, senderAddress),
    getOwner: (id) => raw.getOwner(id, senderAddress),
    getSvg: (id) => raw.getSvg(id, senderAddress),
    getSvgDataUri: (id) => raw.getSvgDataUri(id, senderAddress),
    getInscriptionMeta: (id) => raw.getInscriptionMeta(id, senderAddress),
    getDependencies: (id) => raw.getDependencies(id, senderAddress),
    getChunk: (id, index) => raw.getChunk(id, index, senderAddress),
    getChunkBatch: (id, indexes) => raw.getChunkBatch(id, indexes, senderAddress),
    getUploadState: (expectedHash, owner) =>
      raw.getUploadState(expectedHash, owner ?? senderAddress, senderAddress),
    getIdByHash: (expectedHash) => raw.getIdByHash(expectedHash, senderAddress),
    getPendingChunk: (expectedHash, index, creator) =>
      raw.getPendingChunk(expectedHash, index, senderAddress, creator),
    getTokenSnapshot: async (id) => {
      const [owner, tokenUri, metadata, dependencies] = await Promise.all([
        raw.getOwner(id, senderAddress),
        raw.getTokenUri(id, senderAddress),
        raw.getInscriptionMeta(id, senderAddress),
        raw.getDependencies(id, senderAddress)
      ]);
      return {
        id,
        owner,
        tokenUri,
        metadata,
        dependencies
      };
    }
  };
};

export type BoundCollectionReadClient = {
  raw: CollectionMintClient;
  contract: ContractConfig;
  contractId: string;
  senderAddress: string;
  getStatus: () => Promise<CollectionMintStatus>;
  getSnapshot: () => Promise<CollectionMintSnapshot & {
    effectiveMintPrice: bigint;
  }>;
  getMetadata: () => ReturnType<CollectionMintClient['getMetadata']>;
  getRecipients: () => ReturnType<CollectionMintClient['getRecipients']>;
  getSplits: () => ReturnType<CollectionMintClient['getSplits']>;
  getMintedId: (index: bigint) => Promise<bigint | null>;
  getMintedIds: (count: number, startIndex?: number) => Promise<Array<{ index: bigint; tokenId: bigint | null }>>;
  isLive: () => Promise<boolean>;
  shouldShowLivePage: (state?: string | null) => Promise<boolean>;
};

export const createCollectionReadClient = (
  params: SimpleClientBaseParams
): BoundCollectionReadClient => {
  const contract = resolveContract(params);
  const senderAddress = resolveSenderAddress(contract, params.senderAddress);
  const raw = createCollectionMintClient({
    contract,
    caller: params.caller,
    apiBaseUrl: params.apiBaseUrl,
    apiBaseUrls: params.apiBaseUrls
  });

  return {
    raw,
    contract,
    contractId: getContractId(contract),
    senderAddress,
    getStatus: () => raw.getStatus(senderAddress),
    getSnapshot: async () => {
      const status = await raw.getStatus(senderAddress);
      const snapshot = createCollectionMintSnapshot(status);
      return {
        ...snapshot,
        effectiveMintPrice: getEffectiveMintPrice(status)
      };
    },
    getMetadata: () => raw.getMetadata(senderAddress),
    getRecipients: () => raw.getRecipients(senderAddress),
    getSplits: () => raw.getSplits(senderAddress),
    getMintedId: (index) => raw.getMintedId(index, senderAddress),
    getMintedIds: async (count, startIndex = 0) => {
      const safeCount = Math.max(0, Math.floor(count));
      const safeStart = Math.max(0, Math.floor(startIndex));
      const results: Array<{ index: bigint; tokenId: bigint | null }> = [];
      for (let offset = 0; offset < safeCount; offset += 1) {
        const index = BigInt(safeStart + offset);
        const tokenId = await raw.getMintedId(index, senderAddress);
        results.push({ index, tokenId });
      }
      return results;
    },
    isLive: async () => {
      const status = await raw.getStatus(senderAddress);
      return isCollectionMintLive(status);
    },
    shouldShowLivePage: async (state) => {
      const status = await raw.getStatus(senderAddress);
      return shouldShowLiveMintPage({ state, status });
    }
  };
};

export type BoundMarketReadClient = {
  raw: MarketClient;
  contract: ContractConfig;
  contractId: string;
  senderAddress: string;
  getOwner: () => Promise<string>;
  getNftContract: () => Promise<string>;
  getFeeBps: () => Promise<bigint>;
  getLastListingId: () => Promise<bigint>;
  getListing: (listingId: bigint) => Promise<ReturnType<MarketClient['getListing']> extends Promise<infer T> ? T : never>;
  getListingByToken: (nftContractId: string, tokenId: bigint) => Promise<ReturnType<MarketClient['getListingByToken']> extends Promise<infer T> ? T : never>;
  getListingIdByToken: (nftContractId: string, tokenId: bigint) => Promise<bigint | null>;
  getListings: (fromListingId: bigint, toListingId: bigint) => Promise<Array<{ listingId: bigint; listing: Awaited<ReturnType<MarketClient['getListing']>> }>>;
};

export const createMarketReadClient = (
  params: SimpleClientBaseParams
): BoundMarketReadClient => {
  const contract = resolveContract(params);
  const senderAddress = resolveSenderAddress(contract, params.senderAddress);
  const raw = createMarketClient({
    contract,
    caller: params.caller,
    apiBaseUrl: params.apiBaseUrl,
    apiBaseUrls: params.apiBaseUrls
  });

  return {
    raw,
    contract,
    contractId: getContractId(contract),
    senderAddress,
    getOwner: () => raw.getOwner(senderAddress),
    getNftContract: () => raw.getNftContract(senderAddress),
    getFeeBps: () => raw.getFeeBps(senderAddress),
    getLastListingId: () => raw.getLastListingId(senderAddress),
    getListing: (listingId) => raw.getListing(listingId, senderAddress),
    getListingByToken: (nftContractId, tokenId) =>
      raw.getListingByToken(nftContractId, tokenId, senderAddress),
    getListingIdByToken: (nftContractId, tokenId) =>
      raw.getListingIdByToken(nftContractId, tokenId, senderAddress),
    getListings: async (fromListingId, toListingId) => {
      const lower = fromListingId <= toListingId ? fromListingId : toListingId;
      const upper = fromListingId <= toListingId ? toListingId : fromListingId;
      const maxItems = 300;
      const results: Array<{
        listingId: bigint;
        listing: Awaited<ReturnType<MarketClient['getListing']>>;
      }> = [];
      let cursor = lower;
      while (cursor <= upper && results.length < maxItems) {
        const listing = await raw.getListing(cursor, senderAddress);
        results.push({ listingId: cursor, listing });
        cursor += 1n;
      }
      return results;
    }
  };
};

export type SimpleSdkSuite = {
  senderAddress: string;
  xtrata?: BoundXtrataReadClient;
  collection?: BoundCollectionReadClient;
  market?: BoundMarketReadClient;
};

export const createSimpleSdk = (params: {
  senderAddress: string;
  xtrataContractId?: string;
  collectionContractId?: string;
  marketContractId?: string;
  caller?: ReadOnlyCaller;
  apiBaseUrl?: string;
  apiBaseUrls?: string[];
}): SimpleSdkSuite => {
  const senderAddress = params.senderAddress.trim();
  if (!senderAddress) {
    throw new SdkSetupError('senderAddress is required.');
  }

  return {
    senderAddress,
    xtrata: params.xtrataContractId
      ? createXtrataReadClient({
          contractId: params.xtrataContractId,
          senderAddress,
          caller: params.caller,
          apiBaseUrl: params.apiBaseUrl,
          apiBaseUrls: params.apiBaseUrls
        })
      : undefined,
    collection: params.collectionContractId
      ? createCollectionReadClient({
          contractId: params.collectionContractId,
          senderAddress,
          caller: params.caller,
          apiBaseUrl: params.apiBaseUrl,
          apiBaseUrls: params.apiBaseUrls
        })
      : undefined,
    market: params.marketContractId
      ? createMarketReadClient({
          contractId: params.marketContractId,
          senderAddress,
          caller: params.caller,
          apiBaseUrl: params.apiBaseUrl,
          apiBaseUrls: params.apiBaseUrls
        })
      : undefined
  };
};
