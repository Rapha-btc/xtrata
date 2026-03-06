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
  buildSealInscriptionCall,
  buildSmallMintSingleTxCall,
  buildSmallMintSingleTxRecursiveCall
} from './client.js';
import {
  DEFAULT_BATCH_SIZE,
  MAX_SMALL_MINT_CHUNKS,
  MAX_BATCH_SIZE,
  MAX_MIME_LENGTH,
  MAX_TOKEN_URI_LENGTH,
  batchChunks,
  buildSmallMintSingleTxStxPostConditions,
  chunkBytes
} from './mint.js';
import { toStacksNetwork } from './network.js';
import { SdkValidationError } from './errors.js';
import {
  buildGuidedMintFlow,
  createCollectionMintSafetyBundle,
  createCoreMintSafetyBundle,
  type GuidedMintFlow,
  type SafeMintBundle
} from './safe.js';
import type { ContractConfig } from './types.js';

export const DEFAULT_NFT_ASSET_NAME = 'xtrata-inscription';
const EXPECTED_HASH_BYTES = 32;

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

const assertTrimmedString = (value: string, field: string) => {
  if (!value.trim()) {
    throw new SdkValidationError('invalid-input', `${field} is required.`);
  }
};

const assertPayload = (payloadBytes: Uint8Array) => {
  if (payloadBytes.length <= 0) {
    throw new SdkValidationError(
      'invalid-input',
      'payloadBytes must contain at least one byte.'
    );
  }
};

const assertExpectedHash = (expectedHash: Uint8Array) => {
  if (expectedHash.length !== EXPECTED_HASH_BYTES) {
    throw new SdkValidationError(
      'invalid-input',
      `expectedHash must be ${EXPECTED_HASH_BYTES} bytes.`
    );
  }
};

const assertMimeType = (mimeType: string) => {
  assertTrimmedString(mimeType, 'mimeType');
  if (mimeType.length > MAX_MIME_LENGTH) {
    throw new SdkValidationError(
      'invalid-input',
      `mimeType exceeds max length (${MAX_MIME_LENGTH}).`
    );
  }
};

const assertTokenUri = (tokenUri: string) => {
  assertTrimmedString(tokenUri, 'tokenUri');
  if (tokenUri.length > MAX_TOKEN_URI_LENGTH) {
    throw new SdkValidationError(
      'invalid-input',
      `tokenUri exceeds max length (${MAX_TOKEN_URI_LENGTH}).`
    );
  }
};

const assertKnownMintPrice = (params: {
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
}) => {
  const effectiveMintPrice = params.activePhaseMintPrice ?? params.mintPrice;
  if (effectiveMintPrice === null) {
    throw new SdkValidationError(
      'invalid-input',
      'mintPrice or activePhaseMintPrice is required for deterministic spend caps.'
    );
  }
  if (effectiveMintPrice < 0n) {
    throw new SdkValidationError(
      'invalid-input',
      'mintPrice must be zero or greater.'
    );
  }
};

const assertPositiveBigint = (value: bigint | null, field: string) => {
  if (value === null || value <= 0n) {
    throw new SdkValidationError(
      'invalid-input',
      `${field} must be greater than zero for deterministic safety planning.`
    );
  }
};

const assertNonNegativeBigint = (value: bigint, field: string) => {
  if (value < 0n) {
    throw new SdkValidationError(
      'invalid-input',
      `${field} must be zero or greater.`
    );
  }
};

const assertMatchingNetwork = (left: ContractConfig, right: ContractConfig) => {
  if (left.network !== right.network) {
    throw new SdkValidationError(
      'network-mismatch',
      `Contract networks do not match (${left.network} vs ${right.network}).`
    );
  }
};

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
  assertTrimmedString(params.senderAddress, 'senderAddress');
  assertPayload(params.payloadBytes);
  assertExpectedHash(params.expectedHash);
  assertMimeType(params.mimeType);
  assertTokenUri(params.tokenUri);
  assertKnownMintPrice({
    mintPrice: params.mintPrice,
    activePhaseMintPrice: params.activePhaseMintPrice
  });
  assertPositiveBigint(params.protocolFeeMicroStx, 'protocolFeeMicroStx');

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
  assertTrimmedString(params.senderAddress, 'senderAddress');
  assertPayload(params.payloadBytes);
  assertExpectedHash(params.expectedHash);
  assertMimeType(params.mimeType);
  assertTokenUri(params.tokenUri);
  assertKnownMintPrice({
    mintPrice: params.mintPrice,
    activePhaseMintPrice: params.activePhaseMintPrice
  });
  assertPositiveBigint(params.protocolFeeMicroStx, 'protocolFeeMicroStx');
  assertMatchingNetwork(params.contract, params.xtrataContract);

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

export type SmallMintSingleTxWorkflowPlan = {
  totalChunks: number;
  call: ContractCallOptions;
  postConditions: PostCondition[] | null;
  summaryLines: string[];
};

export type SmallMintSingleTxWorkflowParams = {
  helperContract: ContractConfig;
  xtrataContract: ContractConfig;
  senderAddress: string;
  payloadBytes: Uint8Array;
  expectedHash: Uint8Array;
  mimeType: string;
  tokenUri: string;
  protocolFeeMicroStx: bigint | null;
  dependencies?: bigint[];
  apiBaseUrl?: string;
};

export const buildSmallMintSingleTxWorkflowPlan = (
  params: SmallMintSingleTxWorkflowParams
): SmallMintSingleTxWorkflowPlan => {
  assertTrimmedString(params.senderAddress, 'senderAddress');
  assertPayload(params.payloadBytes);
  assertExpectedHash(params.expectedHash);
  assertMimeType(params.mimeType);
  assertTokenUri(params.tokenUri);
  assertPositiveBigint(params.protocolFeeMicroStx, 'protocolFeeMicroStx');
  assertMatchingNetwork(params.helperContract, params.xtrataContract);

  const dependencies = params.dependencies ?? [];
  const chunks = chunkBytes(params.payloadBytes);
  if (chunks.length > MAX_SMALL_MINT_CHUNKS) {
    throw new SdkValidationError(
      'invalid-input',
      `Small mint helper supports at most ${MAX_SMALL_MINT_CHUNKS} chunks.`
    );
  }

  const network = toStacksNetwork(params.helperContract.network, params.apiBaseUrl);
  const postConditions = buildSmallMintSingleTxStxPostConditions({
    sender: params.senderAddress,
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: chunks.length
  });
  const call = withDenyPostConditions(
    dependencies.length > 0
      ? buildSmallMintSingleTxRecursiveCall({
          contract: params.helperContract,
          network,
          xtrataContract: params.xtrataContract,
          expectedHash: params.expectedHash,
          mime: params.mimeType,
          totalSize: BigInt(params.payloadBytes.length),
          chunks,
          tokenUri: params.tokenUri,
          dependencies
        })
      : buildSmallMintSingleTxCall({
          contract: params.helperContract,
          network,
          xtrataContract: params.xtrataContract,
          expectedHash: params.expectedHash,
          mime: params.mimeType,
          totalSize: BigInt(params.payloadBytes.length),
          chunks,
          tokenUri: params.tokenUri
        }),
    postConditions
  );

  return {
    totalChunks: chunks.length,
    call,
    postConditions,
    summaryLines: [
      `Single-tx helper route with ${chunks.length} chunk(s).`,
      dependencies.length > 0
        ? `Recursive sealing enabled with ${dependencies.length} dependency id(s).`
        : 'Non-recursive single mint.',
      `Deny mode spend cap set for combined begin+seal fees (${params.protocolFeeMicroStx.toString()} fee-unit basis).`
    ]
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
  assertTrimmedString(params.senderAddress, 'senderAddress');
  assertPositiveBigint(params.priceMicroStx, 'priceMicroStx');
  assertNonNegativeBigint(params.tokenId, 'tokenId');
  assertMatchingNetwork(params.marketContract, params.nftContract);

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
  assertNonNegativeBigint(params.listingId, 'listingId');
  assertNonNegativeBigint(params.tokenId, 'tokenId');
  assertMatchingNetwork(params.marketContract, params.nftContract);

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
  assertTrimmedString(params.buyerAddress, 'buyerAddress');
  assertNonNegativeBigint(params.listingId, 'listingId');
  assertNonNegativeBigint(params.tokenId, 'tokenId');
  assertPositiveBigint(params.listingPriceMicroStx, 'listingPriceMicroStx');
  assertMatchingNetwork(params.marketContract, params.nftContract);

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
