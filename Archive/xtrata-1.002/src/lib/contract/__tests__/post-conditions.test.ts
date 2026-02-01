import { describe, expect, it } from 'vitest';
import { ClarityType, NonFungibleConditionCode } from '@stacks/transactions';
import { DEFAULT_CONTRACT } from '../config';
import {
  DEFAULT_NFT_ASSET_NAME,
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
});
