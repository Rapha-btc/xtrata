import {
  FungibleConditionCode,
  NonFungibleConditionCode,
  PostConditionMode
} from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import { SdkValidationError } from '../errors';
import { chunkBytes, computeExpectedHash } from '../mint';
import {
  buildSmallMintSingleTxWorkflowPlan,
  buildCollectionMintWorkflowPlan,
  buildCoreMintWorkflowPlan,
  buildMarketBuyWorkflowPlan,
  buildMarketCancelWorkflowPlan,
  buildMarketListWorkflowPlan
} from '../workflows';

const mainnetAddress = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const collectionAddress = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';

describe('sdk workflows', () => {
  it('builds core mint workflow calls with deny-mode post-conditions', () => {
    const payloadBytes = new Uint8Array(16_384 * 3);
    const expectedHash = computeExpectedHash(chunkBytes(payloadBytes));
    const plan = buildCoreMintWorkflowPlan({
      contract: {
        address: mainnetAddress,
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      senderAddress: mainnetAddress,
      payloadBytes,
      expectedHash,
      mimeType: 'image/png',
      tokenUri: 'ipfs://demo',
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      chunkBatchSize: 2
    });

    expect(plan.totalChunks).toBe(3);
    expect(plan.totalChunkBatches).toBe(2);
    expect(plan.beginCall.functionName).toBe('begin-inscription');
    expect(plan.beginCall.postConditionMode).toBe(PostConditionMode.Deny);
    expect(plan.beginCall.postConditions).toHaveLength(1);
    expect(plan.addChunkBatchCalls).toHaveLength(2);
    expect(plan.sealCall.functionName).toBe('seal-inscription');
    expect(plan.sealCall.postConditionMode).toBe(PostConditionMode.Deny);
    expect(plan.flow.nextAction).toBe('Submit begin transaction.');
  });

  it('builds collection mint workflow with begin cap including protocol fee', () => {
    const payloadBytes = new Uint8Array(1024);
    const expectedHash = computeExpectedHash(chunkBytes(payloadBytes));
    const plan = buildCollectionMintWorkflowPlan({
      contract: {
        address: collectionAddress,
        contractName: 'xtrata-collection-ahv0-34f95221',
        network: 'mainnet'
      },
      xtrataContract: {
        address: mainnetAddress,
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      senderAddress: collectionAddress,
      payloadBytes,
      expectedHash,
      mimeType: 'image/png',
      tokenUri: 'ipfs://demo',
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n
    });

    const beginCondition = plan.beginCall.postConditions?.[0] as {
      amount: bigint;
    };
    expect(plan.beginCall.functionName).toBe('mint-begin');
    expect(beginCondition.amount).toBe(1_100_000n);
    expect(plan.sealCall.functionName).toBe('mint-seal');
  });

  it('builds market list/cancel/buy flows with deny-mode safety conditions', () => {
    const marketContract = {
      address: mainnetAddress,
      contractName: 'xtrata-market-v1-1',
      network: 'mainnet' as const
    };
    const nftContract = {
      address: mainnetAddress,
      contractName: 'xtrata-v2-1-0',
      network: 'mainnet' as const
    };

    const listPlan = buildMarketListWorkflowPlan({
      marketContract,
      nftContract,
      senderAddress: mainnetAddress,
      tokenId: 58n,
      priceMicroStx: 2_500_000n
    });

    const cancelPlan = buildMarketCancelWorkflowPlan({
      marketContract,
      nftContract,
      listingId: 101n,
      tokenId: 58n
    });

    const buyPlan = buildMarketBuyWorkflowPlan({
      marketContract,
      nftContract,
      buyerAddress: collectionAddress,
      listingId: 101n,
      tokenId: 58n,
      listingPriceMicroStx: 2_500_000n
    });

    expect(listPlan.call.functionName).toBe('list-token');
    expect(listPlan.call.postConditionMode).toBe(PostConditionMode.Deny);
    expect((listPlan.postConditions[0] as { conditionCode: number }).conditionCode).toBe(
      NonFungibleConditionCode.Sends
    );

    expect(cancelPlan.call.functionName).toBe('cancel');
    expect(cancelPlan.call.postConditionMode).toBe(PostConditionMode.Deny);
    expect(
      (cancelPlan.postConditions[0] as { conditionCode: number }).conditionCode
    ).toBe(NonFungibleConditionCode.Sends);

    expect(buyPlan.call.functionName).toBe('buy');
    expect(buyPlan.call.postConditionMode).toBe(PostConditionMode.Deny);
    expect((buyPlan.postConditions[0] as { conditionCode: number }).conditionCode).toBe(
      FungibleConditionCode.Equal
    );
    expect((buyPlan.postConditions[0] as { amount: bigint }).amount).toBe(2_500_000n);
    expect((buyPlan.postConditions[1] as { conditionCode: number }).conditionCode).toBe(
      NonFungibleConditionCode.Sends
    );
  });

  it('builds small helper single-tx mint workflow plan', () => {
    const payloadBytes = new Uint8Array(20_000);
    const expectedHash = computeExpectedHash(chunkBytes(payloadBytes));
    const plan = buildSmallMintSingleTxWorkflowPlan({
      helperContract: {
        address: mainnetAddress,
        contractName: 'xtrata-small-mint-v1-0',
        network: 'mainnet'
      },
      xtrataContract: {
        address: mainnetAddress,
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      senderAddress: mainnetAddress,
      payloadBytes,
      expectedHash,
      mimeType: 'text/plain',
      tokenUri: 'ipfs://small',
      protocolFeeMicroStx: 100_000n
    });

    expect(plan.totalChunks).toBe(2);
    expect(plan.call.functionName).toBe('mint-small-single-tx');
    expect(plan.call.postConditionMode).toBe(PostConditionMode.Deny);
    expect(plan.call.postConditions).toHaveLength(1);
    expect((plan.call.postConditions?.[0] as { amount: bigint }).amount).toBe(300_000n);
  });

  it('throws validation error when small helper payload exceeds 30 chunks', () => {
    const payloadBytes = new Uint8Array(16_384 * 31);
    const expectedHash = computeExpectedHash(chunkBytes(payloadBytes));
    expect(() =>
      buildSmallMintSingleTxWorkflowPlan({
        helperContract: {
          address: mainnetAddress,
          contractName: 'xtrata-small-mint-v1-0',
          network: 'mainnet'
        },
        xtrataContract: {
          address: mainnetAddress,
          contractName: 'xtrata-v2-1-0',
          network: 'mainnet'
        },
        senderAddress: mainnetAddress,
        payloadBytes,
        expectedHash,
        mimeType: 'text/plain',
        tokenUri: 'ipfs://small',
        protocolFeeMicroStx: 100_000n
      })
    ).toThrow('supports at most 30 chunks');
  });

  it('throws validation error for malformed core mint inputs', () => {
    expect(() =>
      buildCoreMintWorkflowPlan({
        contract: {
          address: mainnetAddress,
          contractName: 'xtrata-v2-1-0',
          network: 'mainnet'
        },
        senderAddress: ' ',
        payloadBytes: new Uint8Array([1, 2, 3]),
        expectedHash: new Uint8Array(31),
        mimeType: 'image/png',
        tokenUri: 'ipfs://demo',
        mintPrice: 1_000_000n,
        protocolFeeMicroStx: 100_000n
      })
    ).toThrow(SdkValidationError);
  });

  it('throws validation error for oversized token URI in mint workflow', () => {
    expect(() =>
      buildCoreMintWorkflowPlan({
        contract: {
          address: mainnetAddress,
          contractName: 'xtrata-v2-1-0',
          network: 'mainnet'
        },
        senderAddress: mainnetAddress,
        payloadBytes: new Uint8Array([1, 2, 3]),
        expectedHash: new Uint8Array(32),
        mimeType: 'image/png',
        tokenUri: `ipfs://${'x'.repeat(300)}`,
        mintPrice: 1_000_000n,
        protocolFeeMicroStx: 100_000n
      })
    ).toThrow('tokenUri exceeds max length');
  });

  it('throws validation error when collection/core contract networks mismatch', () => {
    expect(() =>
      buildCollectionMintWorkflowPlan({
        contract: {
          address: collectionAddress,
          contractName: 'xtrata-collection-ahv0-34f95221',
          network: 'mainnet'
        },
        xtrataContract: {
          address: mainnetAddress,
          contractName: 'xtrata-v2-1-0',
          network: 'testnet'
        },
        senderAddress: collectionAddress,
        payloadBytes: new Uint8Array([1, 2, 3]),
        expectedHash: new Uint8Array(32),
        mimeType: 'image/png',
        tokenUri: 'ipfs://demo',
        mintPrice: 1_000_000n,
        protocolFeeMicroStx: 100_000n
      })
    ).toThrow(SdkValidationError);
  });

  it('throws validation error when market buy price is zero', () => {
    expect(() =>
      buildMarketBuyWorkflowPlan({
        marketContract: {
          address: mainnetAddress,
          contractName: 'xtrata-market-v1-1',
          network: 'mainnet'
        },
        nftContract: {
          address: mainnetAddress,
          contractName: 'xtrata-v2-1-0',
          network: 'mainnet'
        },
        buyerAddress: collectionAddress,
        listingId: 101n,
        tokenId: 58n,
        listingPriceMicroStx: 0n
      })
    ).toThrow('listingPriceMicroStx must be greater than zero');
  });
});
