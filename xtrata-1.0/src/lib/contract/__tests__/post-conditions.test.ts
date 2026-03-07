import { describe, expect, it } from 'vitest';
import {
  ClarityType,
  FungibleConditionCode,
  NonFungibleConditionCode
} from '@stacks/transactions';
import { DEFAULT_CONTRACT } from '../config';
import { getKnownFungibleAsset } from '../fungible-assets';
import {
  DEFAULT_NFT_ASSET_NAME,
  buildFungibleSpendPostCondition,
  buildContractTransferPostCondition,
  buildTransferPostCondition
} from '../post-conditions';

describe('contract post conditions', () => {
  it('builds a transfer post condition for the default NFT asset', () => {
    const condition = buildTransferPostCondition({
      contract: DEFAULT_CONTRACT,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      tokenId: 15n
    });

    expect(condition.conditionCode).toBe(NonFungibleConditionCode.Sends);
    expect(condition.assetInfo.contractName.content).toBe(
      DEFAULT_CONTRACT.contractName
    );
    expect(condition.assetInfo.assetName.content).toBe(
      DEFAULT_NFT_ASSET_NAME
    );
    expect(condition.assetName.type).toBe(ClarityType.UInt);
  });

  it('builds a contract transfer post condition for escrowed NFTs', () => {
    const condition = buildContractTransferPostCondition({
      nftContract: DEFAULT_CONTRACT,
      senderContract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-market-v1-0',
        network: 'mainnet'
      },
      tokenId: 42n
    });

    expect(condition.conditionCode).toBe(NonFungibleConditionCode.Sends);
    expect(condition.assetInfo.contractName.content).toBe(
      DEFAULT_CONTRACT.contractName
    );
    expect(condition.assetInfo.assetName.content).toBe(
      DEFAULT_NFT_ASSET_NAME
    );
    expect(condition.assetName.type).toBe(ClarityType.UInt);
  });

  it('builds a fungible spend post condition for known SIP-010 assets', () => {
    const token = getKnownFungibleAsset(
      'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
    );
    if (!token) {
      throw new Error('Expected known fungible token');
    }

    const condition = buildFungibleSpendPostCondition({
      token,
      senderAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      amount: 2_500_000n
    });

    expect(condition.conditionCode).toBe(FungibleConditionCode.Equal);
    expect(condition.assetInfo.contractName.content).toBe(token.contractName);
    expect(condition.assetInfo.assetName.content).toBe(token.assetName);
    expect(condition.amount).toBe(2_500_000n);
  });
});
