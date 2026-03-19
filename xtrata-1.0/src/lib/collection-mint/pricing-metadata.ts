import type { CollectionMintPaymentModel } from './payment-model';

export type CollectionMintPriceDisplayMode =
  | 'raw-on-chain'
  | 'price-includes-seal-fee'
  | 'price-includes-total-fees';

export type CollectionMintPricingMetadata = {
  mode: CollectionMintPriceDisplayMode;
  mintPriceMicroStx: bigint | null;
  onChainMintPriceMicroStx: bigint | null;
  absorbedSealFeeMicroStx: bigint | null;
  absorbedBeginFeeMicroStx: bigint | null;
  absorbedProtocolFeeMicroStx: bigint | null;
  absorptionModel: string | null;
};

const LEGACY_PRICE_DISPLAY_MODES: Record<string, CollectionMintPriceDisplayMode> = {
  'price-includes-seal-fee': 'price-includes-seal-fee',
  'price-includes-total-fees': 'price-includes-total-fees',
  'advertised-includes-seal-fee': 'price-includes-seal-fee',
  'advertised-includes-total-fees': 'price-includes-total-fees'
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const toText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toBigIntOrNull = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      return null;
    }
    try {
      return BigInt(normalized);
    } catch {
      return null;
    }
  }
  return null;
};

export const resolveCollectionMintPricingMetadata = (
  value: unknown
): CollectionMintPricingMetadata => {
  const pricing = toRecord(value);
  const modeRaw = toText(pricing?.mode).toLowerCase();
  return {
    mode: LEGACY_PRICE_DISPLAY_MODES[modeRaw] ?? 'raw-on-chain',
    mintPriceMicroStx: toBigIntOrNull(
      pricing?.mintPriceMicroStx ?? pricing?.advertisedMintPriceMicroStx
    ),
    onChainMintPriceMicroStx: toBigIntOrNull(pricing?.onChainMintPriceMicroStx),
    absorbedSealFeeMicroStx: toBigIntOrNull(pricing?.absorbedSealFeeMicroStx),
    absorbedBeginFeeMicroStx: toBigIntOrNull(pricing?.absorbedBeginFeeMicroStx),
    absorbedProtocolFeeMicroStx: toBigIntOrNull(pricing?.absorbedProtocolFeeMicroStx),
    absorptionModel: toText(pricing?.absorptionModel) || null
  };
};

export const resolveDisplayedCollectionMintPrice = (params: {
  activePhaseMintPriceMicroStx: bigint | null;
  onChainMintPriceMicroStx: bigint | null;
  paymentModel: CollectionMintPaymentModel;
  pricing: CollectionMintPricingMetadata;
  statusMintPriceMicroStx: bigint | null;
}) => {
  if (params.activePhaseMintPriceMicroStx !== null) {
    return params.onChainMintPriceMicroStx;
  }
  if (params.paymentModel !== 'seal') {
    return params.onChainMintPriceMicroStx;
  }
  if (
    params.pricing.mode !== 'price-includes-seal-fee' &&
    params.pricing.mode !== 'price-includes-total-fees'
  ) {
    return params.onChainMintPriceMicroStx;
  }
  if (
    params.pricing.mintPriceMicroStx === null ||
    params.pricing.onChainMintPriceMicroStx === null ||
    params.statusMintPriceMicroStx === null ||
    params.pricing.onChainMintPriceMicroStx !== params.statusMintPriceMicroStx
  ) {
    return params.onChainMintPriceMicroStx;
  }
  return params.pricing.mintPriceMicroStx;
};

export const isDisplayedCollectionMintFree = (params: {
  activePhaseMintPriceMicroStx: bigint | null;
  paymentModel: CollectionMintPaymentModel;
  pricing: CollectionMintPricingMetadata;
  statusMintPriceMicroStx: bigint | null;
}) => {
  if (params.activePhaseMintPriceMicroStx !== null) {
    return false;
  }
  if (params.paymentModel !== 'seal') {
    return false;
  }
  if (params.pricing.mode !== 'price-includes-total-fees') {
    return false;
  }
  if (
    params.pricing.mintPriceMicroStx === null ||
    params.pricing.absorbedProtocolFeeMicroStx === null ||
    params.pricing.onChainMintPriceMicroStx === null ||
    params.statusMintPriceMicroStx === null
  ) {
    return false;
  }
  if (params.pricing.onChainMintPriceMicroStx !== params.statusMintPriceMicroStx) {
    return false;
  }
  return (
    params.pricing.mintPriceMicroStx === params.pricing.absorbedProtocolFeeMicroStx &&
    params.pricing.onChainMintPriceMicroStx === 0n
  );
};
