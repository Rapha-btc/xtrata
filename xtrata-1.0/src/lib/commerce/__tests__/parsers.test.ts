import { describe, expect, it } from 'vitest';
import {
  contractPrincipalCV,
  noneCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  trueCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import {
  parseGetCommerceCoreContract,
  parseGetCommerceOwner,
  parseGetListing,
  parseGetNextListingId,
  parseGetPaymentToken,
  parseHasEntitlement
} from '../parsers';

const seller = standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
const core = contractPrincipalCV(
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  'xtrata-v2-1-0'
);
const payment = contractPrincipalCV(
  'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE',
  'usdcx'
);

const listingTuple = tupleCV({
  'asset-id': uintCV(12),
  seller,
  price: uintCV(2500000),
  active: trueCV(),
  'created-at': uintCV(123),
  'updated-at': uintCV(125)
});

describe('commerce parsers', () => {
  it('parses owner and linked contracts', () => {
    expect(parseGetCommerceOwner(responseOkCV(seller))).toBe(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );
    expect(parseGetCommerceCoreContract(responseOkCV(core))).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    expect(parseGetPaymentToken(responseOkCV(payment))).toBe(
      'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
    );
  });

  it('parses next listing id and entitlement flag', () => {
    expect(parseGetNextListingId(responseOkCV(uintCV(7)))).toBe(7n);
    expect(parseHasEntitlement(responseOkCV(trueCV()))).toBe(true);
  });

  it('parses optional listing tuples', () => {
    const parsed = parseGetListing(someCV(listingTuple));
    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error('Expected listing');
    }
    expect(parsed.assetId).toBe(12n);
    expect(parsed.seller).toBe('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
    expect(parsed.price).toBe(2500000n);
    expect(parsed.active).toBe(true);
    expect(parsed.createdAt).toBe(123n);
    expect(parsed.updatedAt).toBe(125n);
  });

  it('returns null for missing listings', () => {
    expect(parseGetListing(noneCV())).toBeNull();
  });
});
