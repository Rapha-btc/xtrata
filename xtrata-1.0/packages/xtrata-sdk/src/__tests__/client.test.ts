import { describe, expect, it } from 'vitest';
import { StacksMainnet } from '@stacks/network';
import {
  ClarityType,
  boolCV,
  contractPrincipalCV,
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
  createXtrataClient,
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
                'project-uri': stringAsciiCV('https://example.com/project'),
                'collection-page-uri': stringAsciiCV('https://example.com/collection'),
                'cover-inscription-id': someCV(uintCV(7)),
                'reveal-block': uintCV(0)
              })
            );
          case 'get-collection-summary':
            return responseOkCV(
              tupleCV({
                name: stringAsciiCV('AHV0'),
                symbol: stringAsciiCV('AHV0'),
                'base-uri': stringAsciiCV(''),
                description: stringAsciiCV('demo'),
                'project-uri': stringAsciiCV('https://example.com/project'),
                'collection-page-uri': stringAsciiCV('https://example.com/collection'),
                'cover-inscription-id': someCV(uintCV(7)),
                'reveal-block': uintCV(0),
                paused: boolCV(false),
                finalized: boolCV(false),
                'mint-price': uintCV(2_000_000),
                'max-supply': uintCV(10),
                'minted-count': uintCV(3),
                'reserved-count': uintCV(1),
                'active-phase-id': uintCV(1),
                'locked-core-contract': contractPrincipalCV(
                  contract.address,
                  'xtrata-v3-0-0'
                ),
                'max-small-mint-chunks': uintCV(30)
              })
            );
          case 'get-cover-inscription':
            return responseOkCV(
              tupleCV({
                'core-contract': contractPrincipalCV(contract.address, 'xtrata-v3-0-0'),
                'token-id': someCV(uintCV(7))
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
    const metadata = await client.getMetadata(contract.address);
    const summary = await client.getSummary(contract.address);
    const cover = await client.getCoverInscription(contract.address);
    expect(status.paused).toBe(false);
    expect(status.activePhaseId).toBe(1n);
    expect(status.activePhase?.mintPrice).toBe(1_111_111n);
    expect(metadata.projectUri).toBe('https://example.com/project');
    expect(metadata.collectionPageUri).toBe('https://example.com/collection');
    expect(metadata.coverInscriptionId).toBe(7n);
    expect(summary.lockedCoreContract).toBe(
      `${contract.address}.xtrata-v3-0-0`
    );
    expect(summary.maxSmallMintChunks).toBe(30n);
    expect(cover.coreContract).toBe(`${contract.address}.xtrata-v3-0-0`);
    expect(cover.tokenId).toBe(7n);
  });

  it('uses v3 fee-recipient and mint-origin readers when supported', async () => {
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options: ReadOnlyCallOptions) => {
        switch (options.functionName) {
          case 'get-fee-recipient':
            return responseOkCV(
              contractPrincipalCV(contract.address, 'xtrata-market-stx-v1-0')
            );
          case 'get-mint-origin':
            return someCV(contractPrincipalCV(contract.address, 'xtrata-collection-mint-v1-5'));
          default:
            return responseOkCV(uintCV(0));
        }
      }
    };

    const client = createXtrataClient({
      contract: {
        address: contract.address,
        contractName: 'xtrata-v3-0-0',
        network: 'mainnet',
        protocolVersion: '3.0.0'
      },
      caller,
      apiBaseUrls: ['https://example.com']
    });

    await expect(client.getFeeRecipient(contract.address)).resolves.toBe(
      `${contract.address}.xtrata-market-stx-v1-0`
    );
    await expect(client.getMintOrigin(4n, contract.address)).resolves.toBe(
      `${contract.address}.xtrata-collection-mint-v1-5`
    );
  });

  it('uses v3 fee quote reader when supported', async () => {
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options: ReadOnlyCallOptions) => {
        if (options.functionName === 'quote-inscription-fee') {
          return responseOkCV(
            tupleCV({
              'resolved-bps': uintCV(10_000),
              'policy-source': uintCV(2),
              'begin-fee': uintCV(100),
              'seal-fee': uintCV(140),
              'single-tx-fee': uintCV(120),
              'size-fee': uintCV(40),
              'extra-batches': uintCV(1),
              'extra-batch-fee': uintCV(20),
              'total-fee': uintCV(120)
            })
          );
        }
        return responseOkCV(uintCV(0));
      }
    };

    const client = createXtrataClient({
      contract: {
        address: contract.address,
        contractName: 'xtrata-v3-0-0',
        network: 'mainnet',
        protocolVersion: '3.0.0'
      },
      caller,
      apiBaseUrls: ['https://example.com']
    });

    await expect(
      client.quoteInscriptionFee(
        {
          payer: contract.address,
          totalSize: 16_384n,
          totalChunks: 1n,
          mode: 'single-tx'
        },
        contract.address
      )
    ).resolves.toEqual({
      resolvedBps: 10_000n,
      policySource: 'wallet',
      beginFee: 100n,
      sealFee: 140n,
      singleTxFee: 120n,
      sizeFee: 40n,
      extraBatches: 1n,
      extraBatchFee: 20n,
      totalFee: 120n
    });
  });
});
