import { describe, expect, it } from 'vitest';
import { StacksMainnet } from '@stacks/network';
import {
  ClarityType,
  contractPrincipalCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  trueCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import type { ReadOnlyCallOptions, ReadOnlyCaller } from '../../contract/client';
import {
  buildBuyWithUsdcCall,
  buildCreateListingCall,
  buildSetListingActiveCall,
  createCommerceClient
} from '../client';

const contract = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-commerce',
  network: 'mainnet' as const
};

describe('commerce client', () => {
  it('builds commerce write calls', () => {
    const createCall = buildCreateListingCall({
      contract,
      network: new StacksMainnet(),
      assetId: 12n,
      price: 250n
    });
    expect(createCall.functionName).toBe('create-listing');
    expect(createCall.functionArgs).toHaveLength(2);
    expect(createCall.functionArgs[0].type).toBe(ClarityType.UInt);

    const toggleCall = buildSetListingActiveCall({
      contract,
      network: new StacksMainnet(),
      listingId: 1n,
      active: false
    });
    expect(toggleCall.functionName).toBe('set-listing-active');
    expect(toggleCall.functionArgs[1].type).toBe(ClarityType.BoolFalse);

    const buyCall = buildBuyWithUsdcCall({
      contract,
      network: new StacksMainnet(),
      listingId: 2n
    });
    expect(buyCall.functionName).toBe('buy-with-usdc');
    expect(buyCall.functionArgs).toHaveLength(1);
  });

  it('calls commerce read-only helpers with correct args', async () => {
    const calls: ReadOnlyCallOptions[] = [];
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        calls.push(options);
        if (options.functionName === 'get-next-listing-id') {
          return responseOkCV(uintCV(9));
        }
        if (options.functionName === 'get-listing') {
          return someCV(tupleCV({
            'asset-id': uintCV(12),
            seller: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
            price: uintCV(250),
            active: trueCV(),
            'created-at': uintCV(100),
            'updated-at': uintCV(101)
          }));
        }
        if (options.functionName === 'has-entitlement') {
          return responseOkCV(trueCV());
        }
        if (options.functionName === 'get-core-contract') {
          return responseOkCV(contractPrincipalCV(contract.address, 'xtrata-v2-1-0'));
        }
        throw new Error(`Unexpected function: ${options.functionName}`);
      }
    };

    const client = createCommerceClient({ contract, caller });
    const sender = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

    const nextListingId = await client.getNextListingId(sender);
    const listing = await client.getListing(12n, sender);
    const entitled = await client.hasEntitlement(12n, sender, sender);
    const coreContract = await client.getCoreContract(sender);

    expect(nextListingId).toBe(9n);
    expect(listing?.assetId).toBe(12n);
    expect(entitled).toBe(true);
    expect(coreContract).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    expect(calls.map((call) => call.functionName)).toEqual([
      'get-next-listing-id',
      'get-listing',
      'has-entitlement',
      'get-core-contract'
    ]);
    expect(calls[2]?.functionArgs[1]?.type).toBe(ClarityType.PrincipalStandard);
  });
});
