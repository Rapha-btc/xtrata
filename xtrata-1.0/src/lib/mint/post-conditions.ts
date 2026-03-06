import {
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  type PostCondition
} from '@stacks/transactions';
import { MAX_BATCH_SIZE } from '../chunking/hash';

type MintBeginSpendCapParams = {
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  additionalCapMicroStx?: bigint | null;
};

export const resolveMintBeginSpendCapMicroStx = (
  params: MintBeginSpendCapParams
) => {
  const baseCap = params.activePhaseMintPrice ?? params.mintPrice ?? null;
  if (baseCap === null || baseCap < 0n) {
    return null;
  }
  if (params.additionalCapMicroStx === null || params.additionalCapMicroStx === undefined) {
    return baseCap;
  }
  if (params.additionalCapMicroStx <= 0n) {
    return null;
  }
  return params.additionalCapMicroStx < baseCap
    ? params.additionalCapMicroStx
    : baseCap;
};

type CollectionBeginSpendCapParams = {
  protocolFeeMicroStx: bigint | null;
  mintPrice?: bigint | null;
  activePhaseMintPrice?: bigint | null;
  chargeMintPriceAtBegin?: boolean;
  beginFeeMicroStx?: bigint | null;
};

export const resolveCollectionBeginSpendCapMicroStx = (
  params: CollectionBeginSpendCapParams
) => {
  const protocolFee = toPositiveProtocolFee(params.protocolFeeMicroStx);
  if (protocolFee === null) {
    return null;
  }
  const mintPrice =
    params.activePhaseMintPrice ?? params.mintPrice ?? null;
  const beginFee =
    params.beginFeeMicroStx ??
    (params.chargeMintPriceAtBegin ? mintPrice : 0n);
  if (beginFee === null) {
    return null;
  }
  if (beginFee < 0n) {
    return null;
  }
  return protocolFee + beginFee;
};

type SealSpendCapParams = {
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

const toPositiveChunkCount = (value: number | bigint | null) => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'bigint') {
    return value > 0n ? value : null;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return BigInt(value);
};

const toPositiveProtocolFee = (value: bigint | null) => {
  if (value === null || value <= 0n) {
    return null;
  }
  return value;
};

export const resolveSealSpendCapMicroStx = (
  params: SealSpendCapParams
) => {
  const feeUnit = toPositiveProtocolFee(params.protocolFeeMicroStx);
  const totalChunks = toPositiveChunkCount(params.totalChunks);
  if (feeUnit === null || totalChunks === null) {
    return null;
  }
  const chunkBatchSize = BigInt(MAX_BATCH_SIZE);
  const feeBatches = (totalChunks + chunkBatchSize - 1n) / chunkBatchSize;
  return feeUnit * (1n + feeBatches);
};

type BatchSealSpendCapParams = {
  protocolFeeMicroStx: bigint | null;
  totalChunks: Array<number | bigint>;
};

export const resolveBatchSealSpendCapMicroStx = (
  params: BatchSealSpendCapParams
) => {
  const feeUnit = toPositiveProtocolFee(params.protocolFeeMicroStx);
  if (feeUnit === null) {
    return null;
  }
  let total = 0n;
  for (const totalChunks of params.totalChunks) {
    const itemCap = resolveSealSpendCapMicroStx({
      protocolFeeMicroStx: feeUnit,
      totalChunks
    });
    if (itemCap === null) {
      return null;
    }
    total += itemCap;
  }
  return total;
};

type MintBeginPostConditionParams = MintBeginSpendCapParams & {
  sender?: string | null;
};

export const buildMintBeginStxPostConditions = (
  params: MintBeginPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const cap = resolveMintBeginSpendCapMicroStx(params);
  if (cap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(sender, FungibleConditionCode.LessEqual, cap)
  ];
};

type ProtocolFeePostConditionParams = {
  sender?: string | null;
  protocolFeeMicroStx: bigint | null;
};

export const buildProtocolFeeStxPostConditions = (
  params: ProtocolFeePostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const protocolFee = params.protocolFeeMicroStx;
  if (protocolFee === null || protocolFee <= 0n) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      protocolFee
    )
  ];
};

type SealPostConditionParams = {
  sender?: string | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

export const buildSealStxPostConditions = (
  params: SealPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const sealCap = resolveSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (sealCap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      sealCap
    )
  ];
};

type BatchSealPostConditionParams = {
  sender?: string | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: Array<number | bigint>;
};

export const buildBatchSealStxPostConditions = (
  params: BatchSealPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const sealCap = resolveBatchSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (sealCap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      sealCap
    )
  ];
};

type CollectionSealSpendCapParams = {
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

const resolveCollectionMintPrice = (params: {
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
}) => {
  const price = params.activePhaseMintPrice ?? params.mintPrice ?? null;
  if (price === null || price < 0n) {
    return null;
  }
  return price;
};

export const resolveCollectionSealSpendCapMicroStx = (
  params: CollectionSealSpendCapParams
) => {
  const mintPrice = resolveCollectionMintPrice(params);
  const sealCap = resolveSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (mintPrice === null || sealCap === null) {
    return null;
  }
  return mintPrice + sealCap;
};

type CollectionBatchSealSpendCapParams = {
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: Array<number | bigint>;
};

export const resolveCollectionBatchSealSpendCapMicroStx = (
  params: CollectionBatchSealSpendCapParams
) => {
  const mintPrice = resolveCollectionMintPrice(params);
  const batchSealCap = resolveBatchSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  if (mintPrice === null || batchSealCap === null) {
    return null;
  }
  return mintPrice * BigInt(params.totalChunks.length) + batchSealCap;
};

type CollectionSmallSingleTxSpendCapParams = {
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
  chargeMintPriceAtBegin?: boolean;
  beginFeeMicroStx?: bigint | null;
  sealSpendCapMicroStx?: bigint | null;
};

export const resolveCollectionSmallSingleTxSpendCapMicroStx = (
  params: CollectionSmallSingleTxSpendCapParams
) => {
  const beginCap = resolveCollectionBeginSpendCapMicroStx({
    mintPrice: params.mintPrice,
    activePhaseMintPrice: params.activePhaseMintPrice,
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    chargeMintPriceAtBegin: params.chargeMintPriceAtBegin,
    beginFeeMicroStx: params.beginFeeMicroStx
  });
  if (beginCap === null) {
    return null;
  }

  let sealCap = params.sealSpendCapMicroStx;
  if (sealCap === undefined || sealCap === null) {
    sealCap = params.chargeMintPriceAtBegin
      ? resolveSealSpendCapMicroStx({
          protocolFeeMicroStx: params.protocolFeeMicroStx,
          totalChunks: params.totalChunks
        })
      : resolveCollectionSealSpendCapMicroStx({
          mintPrice: params.mintPrice,
          activePhaseMintPrice: params.activePhaseMintPrice,
          protocolFeeMicroStx: params.protocolFeeMicroStx,
          totalChunks: params.totalChunks
        });
  }

  if (sealCap === null || sealCap < 0n) {
    return null;
  }

  return beginCap + sealCap;
};

type CollectionSealPostConditionParams = {
  sender?: string | null;
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

export const buildCollectionSealStxPostConditions = (
  params: CollectionSealPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const cap = resolveCollectionSealSpendCapMicroStx(params);
  if (cap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      cap
    )
  ];
};

type CollectionBatchSealPostConditionParams = {
  sender?: string | null;
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: Array<number | bigint>;
};

export const buildCollectionBatchSealStxPostConditions = (
  params: CollectionBatchSealPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const cap = resolveCollectionBatchSealSpendCapMicroStx(params);
  if (cap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      cap
    )
  ];
};

type CollectionSmallSingleTxPostConditionParams =
  CollectionSmallSingleTxSpendCapParams & {
    sender?: string | null;
  };

export const buildCollectionSmallSingleTxStxPostConditions = (
  params: CollectionSmallSingleTxPostConditionParams
): PostCondition[] | null => {
  const sender = params.sender?.trim() ?? '';
  if (!sender) {
    return null;
  }
  const cap = resolveCollectionSmallSingleTxSpendCapMicroStx(params);
  if (cap === null) {
    return null;
  }
  return [
    makeStandardSTXPostCondition(
      sender,
      FungibleConditionCode.LessEqual,
      cap
    )
  ];
};
