import type { ClarityValue } from '@stacks/transactions';
import {
  expectOptional,
  expectPrincipal,
  expectTuple,
  expectUInt,
  getTupleValue,
  unwrapResponse
} from '../protocol/clarity';
import type { MarketListing } from './types';

const expectContractOk = (value: ClarityValue, context: string) => {
  const response = unwrapResponse(value, context);
  if (!response.ok) {
    throw new Error(`${context} failed`);
  }
  return response.value;
};

const parseListingTuple = (value: ClarityValue, context: string): MarketListing => {
  const tuple = expectTuple(value, context);
  return {
    seller: expectPrincipal(getTupleValue(tuple, 'seller', context), `${context}.seller`),
    nftContract: expectPrincipal(
      getTupleValue(tuple, 'nft-contract', context),
      `${context}.nft-contract`
    ),
    tokenId: expectUInt(getTupleValue(tuple, 'token-id', context), `${context}.token-id`),
    price: expectUInt(getTupleValue(tuple, 'price', context), `${context}.price`),
    createdAt: expectUInt(
      getTupleValue(tuple, 'created-at', context),
      `${context}.created-at`
    )
  };
};

const parseOptionalListing = (value: ClarityValue, context: string) => {
  const optional = expectOptional(value, context);
  if (!optional) {
    return null;
  }
  return parseListingTuple(optional, context);
};

export const parseGetMarketOwner = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-owner'), 'get-owner');

export const parseGetNftContract = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-nft-contract'), 'get-nft-contract');

export const parseGetPaymentToken = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-payment-token'), 'get-payment-token');

export const parseGetFeeBps = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-fee-bps'), 'get-fee-bps');

export const parseGetLastListingId = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-last-listing-id'), 'get-last-listing-id');

export const parseGetListing = (value: ClarityValue) =>
  parseOptionalListing(value, 'get-listing');

export const parseGetListingByToken = (value: ClarityValue) =>
  parseOptionalListing(value, 'get-listing-by-token');

export const parseGetListingIdByToken = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-listing-id-by-token');
  if (!optional) {
    return null;
  }
  return expectUInt(optional, 'get-listing-id-by-token');
};
