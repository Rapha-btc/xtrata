import { MICROSTX_PER_STX } from '../contract/fees';

const STX_AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

export const normalizeAddress = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
};

export const isSameAddress = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight;
};

export const parsePriceMicroStx = (raw: string): bigint | null => {
  const trimmed = raw.trim();
  if (!trimmed || !STX_AMOUNT_PATTERN.test(trimmed)) {
    return null;
  }
  const [wholePart, fractionalPartRaw = ''] = trimmed.split('.');
  if (fractionalPartRaw.length > 6) {
    return null;
  }
  const whole = BigInt(wholePart);
  const fractional =
    fractionalPartRaw.length > 0
      ? BigInt(fractionalPartRaw.padEnd(6, '0'))
      : 0n;
  const microStx = whole * BigInt(MICROSTX_PER_STX) + fractional;
  if (microStx <= 0n) {
    return null;
  }
  return microStx;
};

export type ListActionValidationReason =
  | 'missing-market'
  | 'missing-wallet'
  | 'network-mismatch'
  | 'market-network-mismatch'
  | 'missing-token'
  | 'not-owner'
  | 'already-listed'
  | 'invalid-price'
  | null;

export type ListActionValidationResult =
  | {
      ok: true;
      reason: null;
      priceAmount: bigint;
    }
  | {
      ok: false;
      reason: Exclude<ListActionValidationReason, null>;
    };

export const validateListAction = (params: {
  hasMarketContract: boolean;
  walletAddress?: string | null;
  networkMismatch?: boolean;
  marketNetworkMismatch?: boolean;
  tokenId?: bigint | null;
  tokenOwner?: string | null;
  isListed?: boolean;
  priceInput: string;
  parsePriceInput?: (value: string) => bigint | null;
}): ListActionValidationResult => {
  if (!params.hasMarketContract) {
    return { ok: false, reason: 'missing-market' };
  }
  if (!params.walletAddress) {
    return { ok: false, reason: 'missing-wallet' };
  }
  if (params.networkMismatch) {
    return { ok: false, reason: 'network-mismatch' };
  }
  if (params.marketNetworkMismatch) {
    return { ok: false, reason: 'market-network-mismatch' };
  }
  if (params.tokenId === null || params.tokenId === undefined) {
    return { ok: false, reason: 'missing-token' };
  }
  if (
    params.tokenOwner &&
    !isSameAddress(params.tokenOwner, params.walletAddress)
  ) {
    return { ok: false, reason: 'not-owner' };
  }
  if (params.isListed) {
    return { ok: false, reason: 'already-listed' };
  }
  const priceAmount = (params.parsePriceInput ?? parsePriceMicroStx)(
    params.priceInput
  );
  if (priceAmount === null) {
    return { ok: false, reason: 'invalid-price' };
  }
  return { ok: true, reason: null, priceAmount };
};

export const getListActionValidationMessage = (
  reason: ListActionValidationReason,
  options?: {
    priceSymbol?: string;
  }
) => {
  switch (reason) {
    case 'missing-market':
      return 'Select a market contract in the Market module first.';
    case 'missing-wallet':
      return 'Connect a wallet to list.';
    case 'network-mismatch':
      return 'Network mismatch: switch wallet or market contract before listing.';
    case 'market-network-mismatch':
      return 'Market network must match the active NFT contract.';
    case 'missing-token':
      return 'Select a token to list.';
    case 'not-owner':
      return 'Only the owner can list this inscription.';
    case 'already-listed':
      return 'This inscription is already listed.';
    case 'invalid-price':
      return `Enter a valid price in ${options?.priceSymbol ?? 'STX'}.`;
    default:
      return null;
  }
};

export type CancelActionValidationReason =
  | 'missing-market'
  | 'missing-wallet'
  | 'network-mismatch'
  | 'market-network-mismatch'
  | 'missing-token'
  | 'missing-listing'
  | 'seller-mismatch'
  | null;

export type CancelActionValidationResult =
  | {
      ok: true;
      reason: null;
    }
  | {
      ok: false;
      reason: Exclude<CancelActionValidationReason, null>;
    };

export const validateCancelAction = (params: {
  hasMarketContract: boolean;
  walletAddress?: string | null;
  networkMismatch?: boolean;
  marketNetworkMismatch?: boolean;
  tokenId?: bigint | null;
  listingId?: bigint | null;
  listingSeller?: string | null;
}): CancelActionValidationResult => {
  if (!params.hasMarketContract) {
    return { ok: false, reason: 'missing-market' };
  }
  if (!params.walletAddress) {
    return { ok: false, reason: 'missing-wallet' };
  }
  if (params.networkMismatch) {
    return { ok: false, reason: 'network-mismatch' };
  }
  if (params.marketNetworkMismatch) {
    return { ok: false, reason: 'market-network-mismatch' };
  }
  if (params.tokenId === null || params.tokenId === undefined) {
    return { ok: false, reason: 'missing-token' };
  }
  if (params.listingId === null || params.listingId === undefined) {
    return { ok: false, reason: 'missing-listing' };
  }
  if (
    params.listingSeller &&
    !isSameAddress(params.listingSeller, params.walletAddress)
  ) {
    return { ok: false, reason: 'seller-mismatch' };
  }
  return { ok: true, reason: null };
};

export const getCancelActionValidationMessage = (
  reason: CancelActionValidationReason
) => {
  switch (reason) {
    case 'missing-market':
      return 'Select a market contract in the Market module first.';
    case 'missing-wallet':
      return 'Connect a wallet to cancel.';
    case 'network-mismatch':
      return 'Network mismatch: switch wallet or market contract before cancelling.';
    case 'market-network-mismatch':
      return 'Market network must match the active NFT contract.';
    case 'missing-token':
      return 'Select a token to cancel.';
    case 'missing-listing':
      return 'This inscription is not listed.';
    case 'seller-mismatch':
      return 'Only the seller can cancel this listing.';
    default:
      return null;
  }
};

export type BuyActionValidationReason =
  | 'missing-market'
  | 'missing-wallet'
  | 'network-mismatch'
  | 'market-network-mismatch'
  | 'missing-listing'
  | 'seller-match'
  | null;

export type BuyActionValidationResult =
  | {
      ok: true;
      reason: null;
    }
  | {
      ok: false;
      reason: Exclude<BuyActionValidationReason, null>;
    };

export const validateBuyAction = (params: {
  hasMarketContract: boolean;
  walletAddress?: string | null;
  networkMismatch?: boolean;
  marketNetworkMismatch?: boolean;
  listingId?: bigint | null;
  listingSeller?: string | null;
}): BuyActionValidationResult => {
  if (!params.hasMarketContract) {
    return { ok: false, reason: 'missing-market' };
  }
  if (!params.walletAddress) {
    return { ok: false, reason: 'missing-wallet' };
  }
  if (params.networkMismatch) {
    return { ok: false, reason: 'network-mismatch' };
  }
  if (params.marketNetworkMismatch) {
    return { ok: false, reason: 'market-network-mismatch' };
  }
  if (params.listingId === null || params.listingId === undefined) {
    return { ok: false, reason: 'missing-listing' };
  }
  if (
    params.listingSeller &&
    isSameAddress(params.listingSeller, params.walletAddress)
  ) {
    return { ok: false, reason: 'seller-match' };
  }
  return { ok: true, reason: null };
};

export const getBuyActionValidationMessage = (
  reason: BuyActionValidationReason
) => {
  switch (reason) {
    case 'missing-market':
      return 'Select a market contract in the Market module first.';
    case 'missing-wallet':
      return 'Connect a wallet to buy.';
    case 'network-mismatch':
      return 'Network mismatch: switch wallet or market contract before buying.';
    case 'market-network-mismatch':
      return 'Market network must match the active NFT contract.';
    case 'missing-listing':
      return 'This inscription is not listed.';
    case 'seller-match':
      return 'You cannot buy your own listing.';
    default:
      return null;
  }
};
