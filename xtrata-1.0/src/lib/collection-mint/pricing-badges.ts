export type CollectionMintPriceDisplayMode =
  | 'raw-on-chain'
  | 'advertised-includes-seal-fee'
  | 'advertised-includes-total-fees';

export const normalizeCollectionMintPriceDisplayMode = (
  mode: string | null | undefined
): CollectionMintPriceDisplayMode => {
  const normalized = (mode ?? '').trim().toLowerCase();
  if (normalized === 'advertised-includes-total-fees') {
    return 'advertised-includes-total-fees';
  }
  if (normalized === 'advertised-includes-seal-fee') {
    return 'advertised-includes-seal-fee';
  }
  return 'raw-on-chain';
};

export const isCollectionFreeMint = (params: {
  pricingMode: string | null | undefined;
  displayedMintPriceMicroStx: bigint | null;
  absorbedProtocolFeeMicroStx: bigint | null;
}) => {
  if (
    params.displayedMintPriceMicroStx === null ||
    params.absorbedProtocolFeeMicroStx === null
  ) {
    return false;
  }
  const pricingMode = normalizeCollectionMintPriceDisplayMode(params.pricingMode);
  if (pricingMode === 'raw-on-chain') {
    return false;
  }
  return params.displayedMintPriceMicroStx === params.absorbedProtocolFeeMicroStx;
};
