import { describe, expect, it } from 'vitest';
import { StacksMainnet } from '@stacks/network';
import {
  ClarityType,
  boolCV,
  noneCV,
  responseOkCV,
  someCV,
  stringAsciiCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import {
  buildCollectionMintBeginCall,
  buildMarketListCall,
  buildSmallMintSingleTxCall,
  createCollectionMintClient,
  type ReadOnlyCallOptions,
  type ReadOnlyCaller
} from '../client';

const contract = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-collection-demo',
  network: 'mainnet' as const
};

describe('sdk client', () => {
  it('builds collection mint begin contract call', () => {
    const call = buildCollectionMintBeginCall({
      contract,
      network: new StacksMainnet(),
      xtrataContract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      expectedHash: new Uint8Array(32).fill(1),
      mime: 'image/png',
      totalSize: 100n,
      totalChunks: 1n
    });

    expect(call.functionName).toBe('mint-begin');
    expect(call.functionArgs).toHaveLength(5);
  });

  it('builds market list call', () => {
    const call = buildMarketListCall({
      contract,
      network: new StacksMainnet(),
      nftContract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      tokenId: 4n,
      priceMicroStx: 1_000_000n
    });

    expect(call.functionName).toBe('list-token');
    expect(call.functionArgs[0].type).toBe(ClarityType.PrincipalContract);
  });

  it('builds small single-tx helper call', () => {
    const call = buildSmallMintSingleTxCall({
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-small-mint-v1-0',
        network: 'mainnet'
      },
      network: new StacksMainnet(),
      xtrataContract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      },
      expectedHash: new Uint8Array(32).fill(2),
      mime: 'image/png',
      totalSize: 200n,
      chunks: [new Uint8Array([0xaa, 0xbb])],
      tokenUri: 'ipfs://small'
    });

    expect(call.functionName).toBe('mint-small-single-tx');
    expect(call.functionArgs).toHaveLength(6);
  });

  it('loads collection status with active phase', async () => {
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options: ReadOnlyCallOptions) => {
        switch (options.functionName) {
          case 'is-paused':
            return responseOkCV(boolCV(false));
          case 'get-finalized':
            return responseOkCV(boolCV(false));
          case 'get-mint-price':
            return responseOkCV(uintCV(2_000_000));
          case 'get-max-supply':
            return responseOkCV(uintCV(10));
          case 'get-minted-count':
            return responseOkCV(uintCV(3));
          case 'get-reserved-count':
            return responseOkCV(uintCV(1));
          case 'get-active-phase':
            return responseOkCV(uintCV(1));
          case 'get-phase':
            return someCV(
              tupleCV({
                enabled: boolCV(true),
                'start-block': uintCV(0),
                'end-block': uintCV(0),
                'mint-price': uintCV(1_111_111),
                'max-per-wallet': uintCV(0),
                'max-supply': uintCV(10),
                'allowlist-mode': uintCV(1)
              })
            );
          case 'get-collection-metadata':
            return responseOkCV(
              tupleCV({
                name: stringAsciiCV('AHV0'),
                symbol: stringAsciiCV('AHV0'),
                'base-uri': stringAsciiCV(''),
                description: stringAsciiCV('demo'),
                'reveal-block': uintCV(0)
              })
            );
          default:
            return noneCV();
        }
      }
    };

    const client = createCollectionMintClient({
      contract,
      caller,
      apiBaseUrls: ['https://example.com']
    });

    const status = await client.getStatus(contract.address);
    expect(status.paused).toBe(false);
    expect(status.activePhaseId).toBe(1n);
    expect(status.activePhase?.mintPrice).toBe(1_111_111n);
  });
});
