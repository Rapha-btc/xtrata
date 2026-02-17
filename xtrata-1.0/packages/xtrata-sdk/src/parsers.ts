import type { ClarityValue } from '@stacks/transactions';
import {
  expectBool,
  expectBuffer,
  expectList,
  expectOptional,
  expectPrincipal,
  expectStringAscii,
  expectTuple,
  expectUInt,
  getTupleValue,
  unwrapResponse
} from './clarity.js';
import { CONTRACT_ERROR_CODES, ContractCallError } from './errors.js';
import type {
  CollectionMetadata,
  CollectionPhase,
  CollectionRecipients,
  CollectionSplits,
  InscriptionMeta,
  MarketListing,
  UploadState
} from './types.js';

const decodeContractError = (value: ClarityValue, context: string) => {
  const code = expectUInt(value, context);
  const name = CONTRACT_ERROR_CODES[code.toString() as keyof typeof CONTRACT_ERROR_CODES];
  return new ContractCallError(code, name);
};

const expectContractOk = (value: ClarityValue, context: string) => {
  const response = unwrapResponse(value, context);
  if (!response.ok) {
    throw decodeContractError(response.value, `${context} error`);
  }
  return response.value;
};

const estimateTotalChunks = (totalSize: bigint) => {
  if (totalSize <= 0n) {
    return 0n;
  }
  const chunkSize = 16_384n;
  return (totalSize + chunkSize - 1n) / chunkSize;
};

const parseOptionalString = (value: ClarityValue, context: string) => {
  const optional = expectOptional(value, context);
  if (!optional) {
    return null;
  }
  return expectStringAscii(optional, context);
};

const parseOptionalPrincipal = (value: ClarityValue, context: string) => {
  const optional = expectOptional(value, context);
  if (!optional) {
    return null;
  }
  return expectPrincipal(optional, context);
};

const parseOptionalBuffer = (value: ClarityValue, context: string) => {
  const optional = expectOptional(value, context);
  if (!optional) {
    return null;
  }
  return expectBuffer(optional, context);
};

const parseInscriptionMetaTuple = (tupleValue: ClarityValue, context: string) => {
  const tuple = expectTuple(tupleValue, context);
  const owner = expectPrincipal(getTupleValue(tuple, 'owner', context), `${context}.owner`);
  const creatorEntry = tuple['creator'];
  const creator =
    creatorEntry === undefined
      ? null
      : expectPrincipal(creatorEntry, `${context}.creator`);
  const mimeType = expectStringAscii(
    getTupleValue(tuple, 'mime-type', context),
    `${context}.mime-type`
  );
  const totalSize = expectUInt(
    getTupleValue(tuple, 'total-size', context),
    `${context}.total-size`
  );
  const totalChunksEntry = tuple['total-chunks'];
  const totalChunks =
    totalChunksEntry === undefined
      ? estimateTotalChunks(totalSize)
      : expectUInt(totalChunksEntry, `${context}.total-chunks`);
  const sealed = expectBool(getTupleValue(tuple, 'sealed', context), `${context}.sealed`);
  const finalHash = expectBuffer(
    getTupleValue(tuple, 'final-hash', context),
    `${context}.final-hash`
  );

  return {
    owner,
    creator,
    mimeType,
    totalSize,
    totalChunks,
    sealed,
    finalHash
  } satisfies InscriptionMeta;
};

const parseUploadStateTuple = (tupleValue: ClarityValue, context: string) => {
  const tuple = expectTuple(tupleValue, context);
  const mimeType = expectStringAscii(
    getTupleValue(tuple, 'mime-type', context),
    `${context}.mime-type`
  );
  const totalSize = expectUInt(
    getTupleValue(tuple, 'total-size', context),
    `${context}.total-size`
  );
  const totalChunks = expectUInt(
    getTupleValue(tuple, 'total-chunks', context),
    `${context}.total-chunks`
  );
  const currentIndex = expectUInt(
    getTupleValue(tuple, 'current-index', context),
    `${context}.current-index`
  );
  const runningHash = expectBuffer(
    getTupleValue(tuple, 'running-hash', context),
    `${context}.running-hash`
  );

  return {
    mimeType,
    totalSize,
    totalChunks,
    currentIndex,
    runningHash
  } satisfies UploadState;
};

const parseCollectionPhaseTuple = (value: ClarityValue, context: string): CollectionPhase => {
  const tuple = expectTuple(value, context);
  return {
    enabled: expectBool(getTupleValue(tuple, 'enabled', context), `${context}.enabled`),
    startBlock: expectUInt(getTupleValue(tuple, 'start-block', context), `${context}.start-block`),
    endBlock: expectUInt(getTupleValue(tuple, 'end-block', context), `${context}.end-block`),
    mintPrice: expectUInt(getTupleValue(tuple, 'mint-price', context), `${context}.mint-price`),
    maxPerWallet: expectUInt(
      getTupleValue(tuple, 'max-per-wallet', context),
      `${context}.max-per-wallet`
    ),
    maxSupply: expectUInt(getTupleValue(tuple, 'max-supply', context), `${context}.max-supply`),
    allowlistMode: expectUInt(
      getTupleValue(tuple, 'allowlist-mode', context),
      `${context}.allowlist-mode`
    )
  };
};

const parseCollectionMetadataTuple = (
  value: ClarityValue,
  context: string
): CollectionMetadata => {
  const tuple = expectTuple(value, context);
  return {
    name: expectStringAscii(getTupleValue(tuple, 'name', context), `${context}.name`),
    symbol: expectStringAscii(getTupleValue(tuple, 'symbol', context), `${context}.symbol`),
    baseUri: expectStringAscii(getTupleValue(tuple, 'base-uri', context), `${context}.base-uri`),
    description: expectStringAscii(
      getTupleValue(tuple, 'description', context),
      `${context}.description`
    ),
    revealBlock: expectUInt(
      getTupleValue(tuple, 'reveal-block', context),
      `${context}.reveal-block`
    )
  };
};

const parseCollectionRecipientsTuple = (
  value: ClarityValue,
  context: string
): CollectionRecipients => {
  const tuple = expectTuple(value, context);
  return {
    artist: expectPrincipal(getTupleValue(tuple, 'artist', context), `${context}.artist`),
    marketplace: expectPrincipal(
      getTupleValue(tuple, 'marketplace', context),
      `${context}.marketplace`
    ),
    operator: expectPrincipal(getTupleValue(tuple, 'operator', context), `${context}.operator`)
  };
};

const parseCollectionSplitsTuple = (
  value: ClarityValue,
  context: string
): CollectionSplits => {
  const tuple = expectTuple(value, context);
  return {
    artist: expectUInt(getTupleValue(tuple, 'artist', context), `${context}.artist`),
    marketplace: expectUInt(
      getTupleValue(tuple, 'marketplace', context),
      `${context}.marketplace`
    ),
    operator: expectUInt(getTupleValue(tuple, 'operator', context), `${context}.operator`)
  };
};

const parseMarketListingTuple = (value: ClarityValue, context: string): MarketListing => {
  const tuple = expectTuple(value, context);
  return {
    seller: expectPrincipal(getTupleValue(tuple, 'seller', context), `${context}.seller`),
    nftContract: expectPrincipal(
      getTupleValue(tuple, 'nft-contract', context),
      `${context}.nft-contract`
    ),
    tokenId: expectUInt(getTupleValue(tuple, 'token-id', context), `${context}.token-id`),
    price: expectUInt(getTupleValue(tuple, 'price', context), `${context}.price`),
    createdAt: expectUInt(getTupleValue(tuple, 'created-at', context), `${context}.created-at`)
  };
};

export const parseGetLastTokenId = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-last-token-id'), 'get-last-token-id');

export const parseGetFeeUnit = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-fee-unit'), 'get-fee-unit');

export const parseGetNextTokenId = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-next-token-id'), 'get-next-token-id');

export const parseGetAdmin = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-admin'), 'get-admin');

export const parseGetRoyaltyRecipient = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-royalty-recipient'), 'get-royalty-recipient');

export const parseIsPaused = (value: ClarityValue) =>
  expectBool(expectContractOk(value, 'is-paused'), 'is-paused');

export const parseGetTokenUri = (value: ClarityValue) =>
  parseOptionalString(expectContractOk(value, 'get-token-uri'), 'get-token-uri');

export const parseGetOwner = (value: ClarityValue) =>
  parseOptionalPrincipal(expectContractOk(value, 'get-owner'), 'get-owner');

export const parseGetSvg = (value: ClarityValue) =>
  parseOptionalString(expectContractOk(value, 'get-svg'), 'get-svg');

export const parseGetSvgDataUri = (value: ClarityValue) =>
  parseOptionalString(expectContractOk(value, 'get-svg-data-uri'), 'get-svg-data-uri');

export const parseGetInscriptionMeta = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-inscription-meta');
  if (!optional) {
    return null;
  }
  return parseInscriptionMetaTuple(optional, 'get-inscription-meta');
};

export const parseGetChunk = (value: ClarityValue) => parseOptionalBuffer(value, 'get-chunk');

export const parseGetChunkBatch = (value: ClarityValue) => {
  const list = expectList(value, 'get-chunk-batch');
  return list.map((entry, index) => parseOptionalBuffer(entry, `get-chunk-batch[${index}]`));
};

export const parseGetDependencies = (value: ClarityValue) => {
  const list = expectList(value, 'get-dependencies');
  return list.map((entry, index) => expectUInt(entry, `get-dependencies[${index}]`));
};

export const parseGetUploadState = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-upload-state');
  if (!optional) {
    return null;
  }
  return parseUploadStateTuple(optional, 'get-upload-state');
};

export const parseGetIdByHash = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-id-by-hash');
  if (!optional) {
    return null;
  }
  return expectUInt(optional, 'get-id-by-hash');
};

export const parseGetPendingChunk = (value: ClarityValue) =>
  parseOptionalBuffer(value, 'get-pending-chunk');

export const parseCollectionBool = (value: ClarityValue, functionName: string) =>
  expectBool(expectContractOk(value, functionName), functionName);

export const parseCollectionUInt = (value: ClarityValue, functionName: string) =>
  expectUInt(expectContractOk(value, functionName), functionName);

export const parseGetCollectionActivePhase = (value: ClarityValue) =>
  parseCollectionUInt(value, 'get-active-phase');

export const parseGetCollectionPhase = (value: ClarityValue): CollectionPhase | null => {
  const optional = expectOptional(value, 'get-phase');
  if (!optional) {
    return null;
  }
  return parseCollectionPhaseTuple(optional, 'get-phase');
};

export const parseGetCollectionMetadata = (value: ClarityValue) =>
  parseCollectionMetadataTuple(expectContractOk(value, 'get-collection-metadata'), 'get-collection-metadata');

export const parseGetCollectionRecipients = (value: ClarityValue) =>
  parseCollectionRecipientsTuple(expectContractOk(value, 'get-recipients'), 'get-recipients');

export const parseGetCollectionSplits = (value: ClarityValue) =>
  parseCollectionSplitsTuple(expectContractOk(value, 'get-splits'), 'get-splits');

export const parseGetCollectionMintedId = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-minted-id');
  if (!optional) {
    return null;
  }
  const tuple = expectTuple(optional, 'get-minted-id');
  return expectUInt(getTupleValue(tuple, 'token-id', 'get-minted-id'), 'get-minted-id.token-id');
};

export const parseGetCollectionLockedCoreContract = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-locked-core-contract'), 'get-locked-core-contract');

export const parseGetMarketOwner = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-owner'), 'get-owner');

export const parseGetMarketNftContract = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-nft-contract'), 'get-nft-contract');

export const parseGetMarketFeeBps = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-fee-bps'), 'get-fee-bps');

export const parseGetMarketLastListingId = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-last-listing-id'), 'get-last-listing-id');

export const parseGetMarketListing = (value: ClarityValue): MarketListing | null => {
  const optional = expectOptional(value, 'get-listing');
  if (!optional) {
    return null;
  }
  return parseMarketListingTuple(optional, 'get-listing');
};

export const parseGetMarketListingByToken = (value: ClarityValue): MarketListing | null => {
  const optional = expectOptional(value, 'get-listing-by-token');
  if (!optional) {
    return null;
  }
  return parseMarketListingTuple(optional, 'get-listing-by-token');
};

export const parseGetMarketListingIdByToken = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-listing-id-by-token');
  if (!optional) {
    return null;
  }
  return expectUInt(optional, 'get-listing-id-by-token');
};

export const parseContractError = (value: ClarityValue) =>
  decodeContractError(value, 'contract-error');
