import { validateStacksAddress } from '@stacks/transactions';
import { getNetworkFromAddress } from './network.js';
import type { ContractConfig } from './types.js';

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const STX_AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

export type ParsedMarketContract = {
  config: ContractConfig | null;
  error: string | null;
};

const parseContractIdByLabel = (
  value: string,
  missingMessage: string
): ParsedMarketContract => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { config: null, error: missingMessage };
  }

  const dotIndex = trimmed.indexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { config: null, error: 'Use format ADDRESS.CONTRACT-NAME.' };
  }

  const address = trimmed.slice(0, dotIndex).trim();
  const contractName = trimmed.slice(dotIndex + 1).trim();

  if (!validateStacksAddress(address)) {
    return { config: null, error: 'Invalid Stacks address.' };
  }
  if (!CONTRACT_NAME_PATTERN.test(contractName)) {
    return { config: null, error: 'Invalid contract name.' };
  }

  const network = getNetworkFromAddress(address);
  if (!network) {
    return { config: null, error: 'Could not infer network from address.' };
  }

  return {
    config: {
      address,
      contractName,
      network
    },
    error: null
  };
};

export const parseMarketContractId = (value: string): ParsedMarketContract =>
  parseContractIdByLabel(value, 'Set a market contract ID first.');

export const parsePreinscribedSaleContractId = (
  value: string
): ParsedMarketContract =>
  parseContractIdByLabel(value, 'Set a pre-inscribed sale contract ID first.');

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
  const microStx = whole * 1_000_000n + fractional;
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
      priceMicroStx: bigint;
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
  const priceMicroStx = parsePriceMicroStx(params.priceInput);
  if (priceMicroStx === null) {
    return { ok: false, reason: 'invalid-price' };
  }
  return { ok: true, reason: null, priceMicroStx };
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
