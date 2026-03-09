import { describe, expect, it } from 'vitest';
import {
  getBuyActionValidationMessage,
  getCancelActionValidationMessage,
  getListActionValidationMessage,
  isSameAddress,
  normalizeAddress,
  parsePriceMicroStx,
  validateBuyAction,
  validateCancelAction,
  validateListAction
} from '../actions';

const WALLET = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
const OTHER = 'SPD60B1MGZVZR8758E86SR364N95VSP13E5FHYXE';

describe('market action helpers', () => {
  it('normalizes addresses and compares case-insensitively', () => {
    expect(normalizeAddress(` ${WALLET.toLowerCase()} `)).toBe(WALLET);
    expect(isSameAddress(WALLET.toLowerCase(), WALLET)).toBe(true);
    expect(isSameAddress(WALLET, OTHER)).toBe(false);
  });

  it('parses micro stx from valid price input', () => {
    expect(parsePriceMicroStx('1')).toBe(1_000_000n);
    expect(parsePriceMicroStx('0.25')).toBe(250_000n);
    expect(parsePriceMicroStx('0.000001')).toBe(1n);
  });

  it('rejects invalid price input', () => {
    expect(parsePriceMicroStx('')).toBeNull();
    expect(parsePriceMicroStx('abc')).toBeNull();
    expect(parsePriceMicroStx('0')).toBeNull();
    expect(parsePriceMicroStx('0.0000001')).toBeNull();
  });

  it('validates list action success path', () => {
    const result = validateListAction({
      hasMarketContract: true,
      walletAddress: WALLET,
      tokenId: 7n,
      tokenOwner: WALLET,
      isListed: false,
      priceInput: '0.5'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected list action to be valid');
    }
    expect(result.priceAmount).toBe(500_000n);
  });

  it('blocks list action when token owner mismatches wallet', () => {
    const result = validateListAction({
      hasMarketContract: true,
      walletAddress: WALLET,
      tokenId: 7n,
      tokenOwner: OTHER,
      isListed: false,
      priceInput: '1'
    });
    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(getListActionValidationMessage(result.reason)).toBe(
      'Only the owner can list this inscription.'
    );
  });

  it('supports custom price parsers and symbols', () => {
    const result = validateListAction({
      hasMarketContract: true,
      walletAddress: WALLET,
      tokenId: 7n,
      tokenOwner: WALLET,
      isListed: false,
      priceInput: '2.5',
      parsePriceInput: (value) => (value === '2.5' ? 250_000_000n : null)
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected list action to be valid');
    }
    expect(result.priceAmount).toBe(250_000_000n);
    expect(
      getListActionValidationMessage('invalid-price', { priceSymbol: 'USDCx' })
    ).toBe('Enter a valid price in USDCx.');
  });

  it('blocks list action for expected guard conditions', () => {
    expect(
      validateListAction({
        hasMarketContract: false,
        walletAddress: WALLET,
        tokenId: 1n,
        priceInput: '1'
      })
    ).toEqual({ ok: false, reason: 'missing-market' });

    expect(
      validateListAction({
        hasMarketContract: true,
        walletAddress: null,
        tokenId: 1n,
        priceInput: '1'
      })
    ).toEqual({ ok: false, reason: 'missing-wallet' });

    expect(
      validateListAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        networkMismatch: true,
        tokenId: 1n,
        priceInput: '1'
      })
    ).toEqual({ ok: false, reason: 'network-mismatch' });

    expect(
      validateListAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        marketNetworkMismatch: true,
        tokenId: 1n,
        priceInput: '1'
      })
    ).toEqual({ ok: false, reason: 'market-network-mismatch' });

    expect(
      validateListAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        tokenId: null,
        priceInput: '1'
      })
    ).toEqual({ ok: false, reason: 'missing-token' });

    expect(
      validateListAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        tokenId: 1n,
        isListed: true,
        priceInput: '1'
      })
    ).toEqual({ ok: false, reason: 'already-listed' });

    expect(
      validateListAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        tokenId: 1n,
        priceInput: 'bad'
      })
    ).toEqual({ ok: false, reason: 'invalid-price' });
  });

  it('validates cancel action success path', () => {
    expect(
      validateCancelAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        tokenId: 7n,
        listingId: 22n,
        listingSeller: WALLET
      })
    ).toEqual({ ok: true, reason: null });
  });

  it('blocks cancel action for expected guard conditions', () => {
    expect(
      validateCancelAction({
        hasMarketContract: false,
        walletAddress: WALLET,
        tokenId: 1n,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'missing-market' });

    expect(
      validateCancelAction({
        hasMarketContract: true,
        walletAddress: null,
        tokenId: 1n,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'missing-wallet' });

    expect(
      validateCancelAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        networkMismatch: true,
        tokenId: 1n,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'network-mismatch' });

    expect(
      validateCancelAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        marketNetworkMismatch: true,
        tokenId: 1n,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'market-network-mismatch' });

    expect(
      validateCancelAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        tokenId: null,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'missing-token' });

    const missingListing = validateCancelAction({
      hasMarketContract: true,
      walletAddress: WALLET,
      tokenId: 1n,
      listingId: null
    });
    expect(missingListing).toEqual({ ok: false, reason: 'missing-listing' });
    expect(getCancelActionValidationMessage(missingListing.reason)).toBe(
      'This inscription is not listed.'
    );

    expect(
      validateCancelAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        tokenId: 1n,
        listingId: 3n,
        listingSeller: OTHER
      })
    ).toEqual({ ok: false, reason: 'seller-mismatch' });
  });

  it('validates buy action success path', () => {
    expect(
      validateBuyAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        listingId: 22n,
        listingSeller: OTHER
      })
    ).toEqual({ ok: true, reason: null });
  });

  it('blocks buy action for expected guard conditions', () => {
    expect(
      validateBuyAction({
        hasMarketContract: false,
        walletAddress: WALLET,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'missing-market' });

    expect(
      validateBuyAction({
        hasMarketContract: true,
        walletAddress: null,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'missing-wallet' });

    expect(
      validateBuyAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        networkMismatch: true,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'network-mismatch' });

    expect(
      validateBuyAction({
        hasMarketContract: true,
        walletAddress: WALLET,
        marketNetworkMismatch: true,
        listingId: 1n
      })
    ).toEqual({ ok: false, reason: 'market-network-mismatch' });

    const missingListing = validateBuyAction({
      hasMarketContract: true,
      walletAddress: WALLET,
      listingId: null
    });
    expect(missingListing).toEqual({ ok: false, reason: 'missing-listing' });
    expect(getBuyActionValidationMessage(missingListing.reason)).toBe(
      'This inscription is not listed.'
    );

    const ownListing = validateBuyAction({
      hasMarketContract: true,
      walletAddress: WALLET,
      listingId: 4n,
      listingSeller: WALLET.toLowerCase()
    });
    expect(ownListing).toEqual({ ok: false, reason: 'seller-match' });
    expect(getBuyActionValidationMessage(ownListing.reason)).toBe(
      'You cannot buy your own listing.'
    );
  });
});
