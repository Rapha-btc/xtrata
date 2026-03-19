import type { ArtistMintType } from './artist-deploy';

export const isDeployFreeMintMode = (params: {
  mintType: ArtistMintType;
  freeMintEnabled: boolean;
}) => params.mintType === 'standard' && params.freeMintEnabled;

export const resolveDeployMintPriceOverrideMicroStx = (params: {
  mintType: ArtistMintType;
  freeMintEnabled: boolean;
  feeFloorMintPriceMicroStx: bigint | null;
}) =>
  isDeployFreeMintMode(params) ? params.feeFloorMintPriceMicroStx : null;
