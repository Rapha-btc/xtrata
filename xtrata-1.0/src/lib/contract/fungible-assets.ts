import type { ContractConfig } from './config';
import { getContractId } from './config';
import type { PriceAssetKey } from '../pricing/types';

export type FungibleAssetConfig = ContractConfig & {
  assetName: string;
  symbol: string;
  decimals: number;
  priceAssetKey: PriceAssetKey | null;
};

const KNOWN_FUNGIBLE_ASSETS: FungibleAssetConfig[] = [
  {
    address: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE',
    contractName: 'usdcx',
    network: 'mainnet',
    assetName: 'usdcx-token',
    symbol: 'USDCx',
    decimals: 6,
    priceAssetKey: 'usdc'
  },
  {
    address: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4',
    contractName: 'sbtc-token',
    network: 'mainnet',
    assetName: 'sbtc-token',
    symbol: 'sBTC',
    decimals: 8,
    priceAssetKey: 'sbtc'
  }
];

const KNOWN_FUNGIBLE_ASSET_BY_ID = new Map(
  KNOWN_FUNGIBLE_ASSETS.map((asset) => [getContractId(asset), asset])
);

export const getKnownFungibleAsset = (
  contractId: string | null | undefined
): FungibleAssetConfig | null => {
  if (!contractId) {
    return null;
  }
  return KNOWN_FUNGIBLE_ASSET_BY_ID.get(contractId) ?? null;
};
