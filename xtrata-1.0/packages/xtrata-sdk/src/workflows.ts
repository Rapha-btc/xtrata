import type { ContractCallOptions } from '@stacks/connect';
import {
  FungibleConditionCode,
  NonFungibleConditionCode,
  PostConditionMode,
  createAssetInfo,
  makeContractNonFungiblePostCondition,
  makeStandardNonFungiblePostCondition,
  makeStandardSTXPostCondition,
  uintCV,
  type PostCondition
} from '@stacks/transactions';
import {
  buildAddChunkBatchCall,
  buildBeginInscriptionCall,
  buildCollectionMintAddChunkBatchCall,
  buildCollectionMintBeginCall,
  buildCollectionMintSealCall,
  buildMarketBuyCall,
  buildMarketCancelCall,
  buildMarketListCall,
  buildSealInscriptionCall
} from './client';
import {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  batchChunks,
  chunkBytes
} from './mint';
import { toStacksNetwork } from './network';
import {
  buildGuidedMintFlow,
  createCollectionMintSafetyBundle,
  createCoreMintSafetyBundle,
  type GuidedMintFlow,
  type SafeMintBundle
} from './safe';
import type { ContractConfig } from './types';

export const DEFAULT_NFT_ASSET_NAME = 'xtrata-inscription';

const normalizeBatchSize = (value: number | undefined) => {
  if (!Number.isFinite(value) || !value) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)));
};

const withDenyPostConditions = (
  call: ContractCallOptions,
  postConditions?: PostCondition[] | null
) =>
  ({
    ...call,
    postConditionMode: PostConditionMode.Deny,
    ...(postConditions && postConditions.length > 0 ? { postConditions } : {})
  }) as ContractCallOptions;

const buildAssetInfo = (params: {
  nftContract: ContractConfig;
  assetName?: string;
}) =>
  createAssetInfo(
    params.nftContract.address,
    params.nftContract.contractName,
    params.assetName ?? DEFAULT_NFT_ASSET_NAME
  );

export const buildWalletNftSendsPostCondition = (params: {
  nftContract: ContractConfig;
  senderAddress: string;
  tokenId: bigint;
  assetName?: string;
}) =>
  makeStandardNonFungiblePostCondition(
    params.senderAddress,
    NonFungibleConditionCode.Sends,
    buildAssetInfo({
      nftContract: params.nftContract,
      assetName: params.assetName
    }),
    uintCV(params.tokenId)
  );

export const buildContractNftSendsPostCondition = (params: {
  nftContract: ContractConfig;
  senderContract: ContractConfig;
  tokenId: bigint;
  assetName?: string;
}) =>
  makeContractNonFungiblePostCondition(
    params.senderContract.address,
    params.senderContract.contractName,
    NonFungibleConditionCode.Sends,
    buildAssetInfo({
      nftContract: params.nftContract,
      assetName: params.assetName
    }),
    uintCV(params.tokenId)
  );

export type MintChunkBatchPlan = {
  index: number;
  chunkCount: number;
  call: ContractCallOptions;
};

export type MintWorkflowPlan = {
  safety: SafeMintBundle;
  flow: GuidedMintFlow;
  totalChunks: number;
  totalChunkBatches: number;
  beginCall: ContractCallOptions;
  addChunkBatchCalls: MintChunkBatchPlan[];
  sealCall: ContractCallOptions;
};

type MintWorkflowBaseParams = {
  senderAddress: string;
  payloadBytes: Uint8Array;
  expectedHash: Uint8Array;
  mimeType: string;
  tokenUri: string;
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  additionalBeginCapMicroStx?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  chunkBatchSize?: number;
  apiBaseUrl?: string;
};

export type CoreMintWorkflowParams = MintWorkflowBaseParams & {
  contract: ContractConfig;
};

export const buildCoreMintWorkflowPlan = (
  params: CoreMintWorkflowParams
): MintWorkflowPlan => {
  const network = toStacksNetwork(params.contract.network, params.apiBaseUrl);
  const chunks = chunkBytes(params.payloadBytes);
  const chunkBatches = batchChunks(chunks, normalizeBatchSize(params.chunkBatchSize));
  const safety = createCoreMintSafetyBundle({
    sender: params.senderAddress,
    mintPrice: params.mintPrice,
    activePhaseMintPrice: params.activePhaseMintPrice,
    additionalCapMicroStx: params.additionalBeginCapMicroStx,
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: chunks.length
  });

  const beginCall = withDenyPostConditions(
    buildBeginInscriptionCall({
      contract: params.contract,
      network,
      expectedHash: params.expectedHash,
      mime: params.mimeType,
      totalSize: BigInt(params.payloadBytes.length),
      totalChunks: BigInt(chunks.length)
    }),
    safety.beginPostConditions
  );

  const addChunkBatchCalls = chunkBatches.map((batch, index) => ({
    index,
    chunkCount: batch.length,
    call: withDenyPostConditions(
      buildAddChunkBatchCall({
        contract: params.contract,
        network,
        expectedHash: params.expectedHash,
        chunks: batch
      })
    )
  }));

  const sealCall = withDenyPostConditions(
    buildSealInscriptionCall({
      contract: params.contract,
      network,
      expectedHash: params.expectedHash,
      tokenUri: params.tokenUri
    }),
    safety.sealPostConditions
  );

  return {
    safety,
    flow: buildGuidedMintFlow({
      beginConfirmed: false,
      uploadedChunkBatches: 0,
      totalChunkBatches: addChunkBatchCalls.length,
      sealConfirmed: false
    }),
    totalChunks: chunks.length,
    totalChunkBatches: addChunkBatchCalls.length,
    beginCall,
    addChunkBatchCalls,
    sealCall
  };
};

export type CollectionMintWorkflowParams = MintWorkflowBaseParams & {
  contract: ContractConfig;
  xtrataContract: ContractConfig;
};

export const buildCollectionMintWorkflowPlan = (
  params: CollectionMintWorkflowParams
): MintWorkflowPlan => {
  const network = toStacksNetwork(params.contract.network, params.apiBaseUrl);
  const chunks = chunkBytes(params.payloadBytes);
  const chunkBatches = batchChunks(chunks, normalizeBatchSize(params.chunkBatchSize));
  const safety = createCollectionMintSafetyBundle({
    sender: params.senderAddress,
    mintPrice: params.mintPrice,
    activePhaseMintPrice: params.activePhaseMintPrice,
    additionalCapMicroStx: params.additionalBeginCapMicroStx,
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: chunks.length
  });

  const beginCall = withDenyPostConditions(
    buildCollectionMintBeginCall({
      contract: params.contract,
      network,
      xtrataContract: params.xtrataContract,
      expectedHash: params.expectedHash,
      mime: params.mimeType,
      totalSize: BigInt(params.payloadBytes.length),
      totalChunks: BigInt(chunks.length)
    }),
    safety.beginPostConditions
  );

  const addChunkBatchCalls = chunkBatches.map((batch, index) => ({
    index,
    chunkCount: batch.length,
    call: withDenyPostConditions(
      buildCollectionMintAddChunkBatchCall({
        contract: params.contract,
        network,
        xtrataContract: params.xtrataContract,
        expectedHash: params.expectedHash,
        chunks: batch
      })
    )
  }));

  const sealCall = withDenyPostConditions(
    buildCollectionMintSealCall({
      contract: params.contract,
      network,
      xtrataContract: params.xtrataContract,
      expectedHash: params.expectedHash,
      tokenUri: params.tokenUri
    }),
    safety.sealPostConditions
  );

  return {
    safety,
    flow: buildGuidedMintFlow({
      beginConfirmed: false,
      uploadedChunkBatches: 0,
      totalChunkBatches: addChunkBatchCalls.length,
      sealConfirmed: false
    }),
    totalChunks: chunks.length,
    totalChunkBatches: addChunkBatchCalls.length,
    beginCall,
    addChunkBatchCalls,
    sealCall
  };
};

export type MarketWorkflowPlan = {
  call: ContractCallOptions;
  postConditions: PostCondition[];
  summaryLines: string[];
};

export type MarketListWorkflowParams = {
  marketContract: ContractConfig;
  nftContract: ContractConfig;
  senderAddress: string;
  tokenId: bigint;
  priceMicroStx: bigint;
  assetName?: string;
  apiBaseUrl?: string;
};

export const buildMarketListWorkflowPlan = (
  params: MarketListWorkflowParams
): MarketWorkflowPlan => {
  const network = toStacksNetwork(params.marketContract.network, params.apiBaseUrl);
  const postConditions: PostCondition[] = [
    buildWalletNftSendsPostCondition({
      nftContract: params.nftContract,
      senderAddress: params.senderAddress,
      tokenId: params.tokenId,
      assetName: params.assetName
    })
  ];

  const call = withDenyPostConditions(
    buildMarketListCall({
      contract: params.marketContract,
      network,
      nftContract: params.nftContract,
      tokenId: params.tokenId,
      priceMicroStx: params.priceMicroStx
    }),
    postConditions
  );

  return {
    call,
    postConditions,
    summaryLines: [
      `List token #${params.tokenId.toString()} for ${params.priceMicroStx.toString()} microSTX.`,
      'Deny mode enforces NFT transfer post-condition.'
    ]
  };
};

export type MarketCancelWorkflowParams = {
  marketContract: ContractConfig;
  nftContract: ContractConfig;
  listingId: bigint;
  tokenId: bigint;
  assetName?: string;
  apiBaseUrl?: string;
};

export const buildMarketCancelWorkflowPlan = (
  params: MarketCancelWorkflowParams
): MarketWorkflowPlan => {
  const network = toStacksNetwork(params.marketContract.network, params.apiBaseUrl);
  const postConditions: PostCondition[] = [
    buildContractNftSendsPostCondition({
      nftContract: params.nftContract,
      senderContract: params.marketContract,
      tokenId: params.tokenId,
      assetName: params.assetName
    })
  ];

  const call = withDenyPostConditions(
    buildMarketCancelCall({
      contract: params.marketContract,
      network,
      nftContract: params.nftContract,
      listingId: params.listingId
    }),
    postConditions
  );

  return {
    call,
    postConditions,
    summaryLines: [
      `Cancel listing #${params.listingId.toString()} for token #${params.tokenId.toString()}.`,
      'Deny mode enforces escrow NFT return post-condition.'
    ]
  };
};

export type MarketBuyWorkflowParams = {
  marketContract: ContractConfig;
  nftContract: ContractConfig;
  buyerAddress: string;
  listingId: bigint;
  tokenId: bigint;
  listingPriceMicroStx: bigint;
  assetName?: string;
  apiBaseUrl?: string;
};

export const buildMarketBuyWorkflowPlan = (
  params: MarketBuyWorkflowParams
): MarketWorkflowPlan => {
  const network = toStacksNetwork(params.marketContract.network, params.apiBaseUrl);
  const postConditions: PostCondition[] = [
    makeStandardSTXPostCondition(
      params.buyerAddress,
      FungibleConditionCode.Equal,
      params.listingPriceMicroStx
    ),
    buildContractNftSendsPostCondition({
      nftContract: params.nftContract,
      senderContract: params.marketContract,
      tokenId: params.tokenId,
      assetName: params.assetName
    })
  ];

  const call = withDenyPostConditions(
    buildMarketBuyCall({
      contract: params.marketContract,
      network,
      nftContract: params.nftContract,
      listingId: params.listingId
    }),
    postConditions
  );

  return {
    call,
    postConditions,
    summaryLines: [
      `Buy listing #${params.listingId.toString()} for ${params.listingPriceMicroStx.toString()} microSTX.`,
      'Deny mode enforces exact STX spend + escrow NFT transfer post-conditions.'
    ]
  };
};
