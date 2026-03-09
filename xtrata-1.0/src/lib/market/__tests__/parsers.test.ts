import { describe, expect, it } from 'vitest';
import {
  contractPrincipalCV,
  noneCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import {
  parseGetFeeBps,
  parseGetLastListingId,
  parseGetListing,
  parseGetListingByToken,
  parseGetListingIdByToken,
  parseGetMarketOwner,
  parseGetNftContract,
  parseGetPaymentToken
} from '../parsers';

const seller = standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
const nftContract = contractPrincipalCV(
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  'xtrata-v1-1-1'
);

const listingTuple = tupleCV({
  seller,
  'nft-contract': nftContract,
  'token-id': uintCV(12),
  price: uintCV(2500000),
  'created-at': uintCV(123)
});

describe('market parsers', () => {
  it('parses market owner', () => {
    const value = responseOkCV(seller);
    expect(parseGetMarketOwner(value)).toBe(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );
  });

  it('parses allowed nft contract', () => {
    const value = responseOkCV(nftContract);
    expect(parseGetNftContract(value)).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
    );
  });

  it('parses payment token contract', () => {
    const value = responseOkCV(
      contractPrincipalCV('SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE', 'usdcx')
    );
    expect(parseGetPaymentToken(value)).toBe(
      'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
    );
  });

  it('parses fee bps', () => {
    const value = responseOkCV(uintCV(250));
    expect(parseGetFeeBps(value)).toBe(250n);
  });

  it('parses last listing id', () => {
    const value = responseOkCV(uintCV(9));
    expect(parseGetLastListingId(value)).toBe(9n);
  });

  it('parses listing option', () => {
    const value = someCV(listingTuple);
    const parsed = parseGetListing(value);
    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error('Expected listing');
    }
    expect(parsed.seller).toBe('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
    expect(parsed.nftContract).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
    );
    expect(parsed.tokenId).toBe(12n);
    expect(parsed.price).toBe(2500000n);
    expect(parsed.createdAt).toBe(123n);
  });

  it('parses empty listing', () => {
    expect(parseGetListing(noneCV())).toBeNull();
    expect(parseGetListingByToken(noneCV())).toBeNull();
    expect(parseGetListingIdByToken(noneCV())).toBeNull();
  });

  it('parses listing id by token', () => {
    const value = someCV(uintCV(33));
    expect(parseGetListingIdByToken(value)).toBe(33n);
  });
});
