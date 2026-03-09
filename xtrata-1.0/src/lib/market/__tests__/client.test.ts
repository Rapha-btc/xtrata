import { describe, expect, it } from 'vitest';
import {
  contractPrincipalCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import type { ReadOnlyCallOptions, ReadOnlyCaller } from '../../contract/client';
import { createMarketClient } from '../client';

const contract = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-market-v1-1',
  network: 'mainnet' as const
};

describe('market client', () => {
  it('calls market read-only helpers with correct args', async () => {
    const calls: ReadOnlyCallOptions[] = [];
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        calls.push(options);
        if (options.functionName === 'get-owner') {
          return responseOkCV(
            standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')
          );
        }
        if (options.functionName === 'get-nft-contract') {
          return responseOkCV(contractPrincipalCV(contract.address, 'xtrata-v2-1-0'));
        }
        if (options.functionName === 'get-payment-token') {
          return responseOkCV(
            contractPrincipalCV(
              'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE',
              'usdcx'
            )
          );
        }
        if (options.functionName === 'get-fee-bps') {
          return responseOkCV(uintCV(250));
        }
        if (options.functionName === 'get-last-listing-id') {
          return responseOkCV(uintCV(9));
        }
        if (options.functionName === 'get-listing') {
          return someCV(tupleCV({
            seller: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
            'nft-contract': contractPrincipalCV(contract.address, 'xtrata-v2-1-0'),
            'token-id': uintCV(12),
            price: uintCV(2500000),
            'created-at': uintCV(123)
          }));
        }
        if (options.functionName === 'get-listing-by-token') {
          return someCV(tupleCV({
            seller: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
            'nft-contract': contractPrincipalCV(contract.address, 'xtrata-v2-1-0'),
            'token-id': uintCV(12),
            price: uintCV(2500000),
            'created-at': uintCV(123)
          }));
        }
        if (options.functionName === 'get-listing-id-by-token') {
          return someCV(uintCV(12));
        }
        throw new Error(`Unexpected function: ${options.functionName}`);
      }
    };

    const client = createMarketClient({ contract, caller });
    const sender = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

    expect(await client.getOwner(sender)).toBe(sender);
    expect(await client.getNftContract(sender)).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    expect(await client.getPaymentToken(sender)).toBe(
      'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
    );
    expect(await client.getFeeBps(sender)).toBe(250n);
    expect(await client.getLastListingId(sender)).toBe(9n);
    expect((await client.getListing(12n, sender))?.tokenId).toBe(12n);
    expect((await client.getListingByToken(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      12n,
      sender
    ))?.price).toBe(2500000n);
    expect(await client.getListingIdByToken(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
      12n,
      sender
    )).toBe(12n);
    expect(calls.map((call) => call.functionName)).toEqual([
      'get-owner',
      'get-nft-contract',
      'get-payment-token',
      'get-fee-bps',
      'get-last-listing-id',
      'get-listing',
      'get-listing-by-token',
      'get-listing-id-by-token'
    ]);
  });

  it('treats missing get-payment-token as legacy STX market', async () => {
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        if (options.functionName === 'get-payment-token') {
          throw new Error('NoSuchPublicFunction(get-payment-token)');
        }
        throw new Error(`Unexpected function: ${options.functionName}`);
      }
    };

    const client = createMarketClient({ contract, caller });

    await expect(
      client.getPaymentToken('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')
    ).resolves.toBeNull();
  });
});
