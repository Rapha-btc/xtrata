export type CollectionMintPriceTone =
  | 'free'
  | 'unknown'
  | 'band-0'
  | 'band-1'
  | 'band-2'
  | 'band-3'
  | 'band-4'
  | 'band-5'
  | 'band-6'
  | 'band-7'
  | 'band-8'
  | 'band-9';

const PRICE_BAND_MICROSTX = 10_000_000n;
const MAX_PRICE_BAND = 9n;

export const resolveCollectionMintPriceTone = (params: {
  displayedMintPriceMicroStx: bigint | null;
  freeMint: boolean;
}): CollectionMintPriceTone => {
  if (params.freeMint) {
    return 'free';
  }
  if (params.displayedMintPriceMicroStx === null) {
    return 'unknown';
  }
  const normalized =
    params.displayedMintPriceMicroStx <= 0n
      ? 0n
      : params.displayedMintPriceMicroStx - 1n;
  const band = normalized / PRICE_BAND_MICROSTX;
  const clampedBand = band > MAX_PRICE_BAND ? MAX_PRICE_BAND : band;
  return `band-${clampedBand.toString()}` as CollectionMintPriceTone;
};
