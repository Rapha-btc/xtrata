import {
  FungibleConditionCode,
  NonFungibleConditionCode,
  createAssetInfo,
  makeStandardFungiblePostCondition,
  makeContractNonFungiblePostCondition,
  makeStandardNonFungiblePostCondition,
  uintCV
} from '@stacks/transactions';
import type { ContractConfig } from './config';
import type { FungibleAssetConfig } from './fungible-assets';

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

export const buildContractTransferPostCondition = (params: {
  nftContract: ContractConfig;
  senderContract: ContractConfig;
  tokenId: bigint;
  assetName?: string;
}) => {
  const assetInfo = createAssetInfo(
    params.nftContract.address,
    params.nftContract.contractName,
    params.assetName ?? DEFAULT_NFT_ASSET_NAME
  );

  return makeContractNonFungiblePostCondition(
    params.senderContract.address,
    params.senderContract.contractName,
    NonFungibleConditionCode.Sends,
    assetInfo,
    uintCV(params.tokenId)
  );
};

export const buildFungibleSpendPostCondition = (params: {
  token: FungibleAssetConfig;
  senderAddress: string;
  amount: bigint;
  conditionCode?: FungibleConditionCode;
}) => {
  const assetInfo = createAssetInfo(
    params.token.address,
    params.token.contractName,
    params.token.assetName
  );

  return makeStandardFungiblePostCondition(
    params.senderAddress,
    params.conditionCode ?? FungibleConditionCode.Equal,
    params.amount,
    assetInfo
  );
};
