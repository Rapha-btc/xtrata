import {
  NonFungibleConditionCode,
  createAssetInfo,
  makeStandardNonFungiblePostCondition,
  uintCV
} from '@stacks/transactions';
import type { ContractConfig } from './config';

export const DEFAULT_NFT_ASSET_NAME = 'xtrata-inscription';

export const buildTransferPostCondition = (params: {
  contract: ContractConfig;
  senderAddress: string;
  tokenId: bigint;
  assetName?: string;
}) => {
  const assetInfo = createAssetInfo(
    params.contract.address,
    params.contract.contractName,
    params.assetName ?? DEFAULT_NFT_ASSET_NAME
  );

  return makeStandardNonFungiblePostCondition(
    params.senderAddress,
    NonFungibleConditionCode.Sends,
    assetInfo,
    uintCV(params.tokenId)
  );
};
