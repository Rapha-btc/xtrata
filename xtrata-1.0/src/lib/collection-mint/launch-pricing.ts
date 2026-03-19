import { estimateWorstCaseSealFeeMicroStx } from '../deploy/pricing-lock';
import type { CollectionMintPaymentModel } from './payment-model';
import {
  resolveDisplayedCollectionMintPrice,
  type CollectionMintPricingMetadata
} from './pricing-metadata';

export type LockedCollectionMintFeeFloor = {
  maxChunks: number;
  feeBatches: number;
  beginFeeMicroStx: bigint;
  sealFeeMicroStx: bigint;
  totalProtocolFeeMicroStx: bigint;
};

export const resolveLockedCollectionMintFeeFloor = (params: {
  maxChunks: number;
  feeUnitMicroStx: bigint;
}): LockedCollectionMintFeeFloor | null => {
  const maxChunks = Math.max(0, Math.floor(params.maxChunks));
  if (maxChunks <= 0 || params.feeUnitMicroStx <= 0n) {
    return null;
  }
  const estimate = estimateWorstCaseSealFeeMicroStx({
    maxChunks,
    feeUnitMicroStx: params.feeUnitMicroStx
  });
  const beginFeeMicroStx = params.feeUnitMicroStx;
  return {
    maxChunks,
    feeBatches: estimate.batchCount,
    beginFeeMicroStx,
    sealFeeMicroStx: estimate.sealMicroStx,
    totalProtocolFeeMicroStx: beginFeeMicroStx + estimate.sealMicroStx
  };
};

export const resolveOnChainMintPriceFromDisplayedMintPrice = (params: {
  displayedMintPriceMicroStx: bigint;
  feeFloorMicroStx: bigint;
}) => {
  const onChainMintPriceMicroStx =
    params.displayedMintPriceMicroStx - params.feeFloorMicroStx;
  return onChainMintPriceMicroStx >= 0n ? onChainMintPriceMicroStx : null;
};

export const resolveDisplayedMintPriceFromOnChainMintPrice = (params: {
  onChainMintPriceMicroStx: bigint;
  feeFloorMicroStx: bigint;
}) => params.onChainMintPriceMicroStx + params.feeFloorMicroStx;

export const resolveManagedCollectionMintPrice = (params: {
  paymentModel: CollectionMintPaymentModel;
  contractMintPriceMicroStx: bigint | null;
  pricing: CollectionMintPricingMetadata;
  pricingLockMaxChunks: number | null;
  feeUnitMicroStx: bigint | null;
}) => {
  const metadataResolvedPrice = resolveDisplayedCollectionMintPrice({
    activePhaseMintPriceMicroStx: null,
    onChainMintPriceMicroStx: params.contractMintPriceMicroStx,
    paymentModel: params.paymentModel,
    pricing: params.pricing,
    statusMintPriceMicroStx: params.contractMintPriceMicroStx
  });
  if (
    metadataResolvedPrice !== null &&
    params.contractMintPriceMicroStx !== null &&
    metadataResolvedPrice !== params.contractMintPriceMicroStx
  ) {
    return metadataResolvedPrice;
  }
  if (
    params.paymentModel === 'seal' &&
    params.contractMintPriceMicroStx !== null &&
    params.pricingLockMaxChunks !== null &&
    params.feeUnitMicroStx !== null
  ) {
    const feeFloor = resolveLockedCollectionMintFeeFloor({
      maxChunks: params.pricingLockMaxChunks,
      feeUnitMicroStx: params.feeUnitMicroStx
    });
    if (feeFloor) {
      return resolveDisplayedMintPriceFromOnChainMintPrice({
        onChainMintPriceMicroStx: params.contractMintPriceMicroStx,
        feeFloorMicroStx: feeFloor.totalProtocolFeeMicroStx
      });
    }
  }
  return params.contractMintPriceMicroStx;
};
