import { ClarityValue } from '@stacks/transactions';
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
} from './clarity';
import {
  ContractCallError,
  CONTRACT_ERROR_CODES,
  InscriptionMeta,
  UploadState
} from './types';
import { CHUNK_SIZE } from '../chunking/hash';

const estimateTotalChunks = (totalSize: bigint) => {
  if (totalSize <= 0n) {
    return 0n;
  }
  const chunkSize = BigInt(CHUNK_SIZE);
  return (totalSize + chunkSize - 1n) / chunkSize;
};

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

export const parseGetChunk = (value: ClarityValue) =>
  parseOptionalBuffer(value, 'get-chunk');

export const parseGetChunkBatch = (value: ClarityValue) => {
  const list = expectList(value, 'get-chunk-batch');
  return list.map((entry, index) =>
    parseOptionalBuffer(entry, `get-chunk-batch[${index}]`)
  );
};

export const parseGetDependencies = (value: ClarityValue) => {
  const list = expectList(value, 'get-dependencies');
  return list.map((entry, index) =>
    expectUInt(entry, `get-dependencies[${index}]`)
  );
};

export const parseGetUploadState = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-upload-state');
  if (!optional) {
    return null;
  }
  return parseUploadStateTuple(optional, 'get-upload-state');
};

export const parseGetPendingChunk = (value: ClarityValue) =>
  parseOptionalBuffer(value, 'get-pending-chunk');

export const parseContractError = (value: ClarityValue) => {
  return decodeContractError(value, 'contract-error');
};
