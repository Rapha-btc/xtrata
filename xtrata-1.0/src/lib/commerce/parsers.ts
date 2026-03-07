import type { ClarityValue } from '@stacks/transactions';
import {
  expectBool,
  expectOptional,
  expectPrincipal,
  expectTuple,
  expectUInt,
  getTupleValue,
  unwrapResponse
} from '../protocol/clarity';
import type { CommerceListing } from './types';

const expectContractOk = (value: ClarityValue, context: string) => {
  const response = unwrapResponse(value, context);
  if (!response.ok) {
    throw new Error(`${context} failed`);
  }
  return response.value;
};

const parseListingTuple = (value: ClarityValue, context: string): CommerceListing => {
  const tuple = expectTuple(value, context);
  return {
    assetId: expectUInt(getTupleValue(tuple, 'asset-id', context), `${context}.asset-id`),
    seller: expectPrincipal(getTupleValue(tuple, 'seller', context), `${context}.seller`),
    price: expectUInt(getTupleValue(tuple, 'price', context), `${context}.price`),
    active: expectBool(getTupleValue(tuple, 'active', context), `${context}.active`),
    createdAt: expectUInt(
      getTupleValue(tuple, 'created-at', context),
      `${context}.created-at`
    ),
    updatedAt: expectUInt(
      getTupleValue(tuple, 'updated-at', context),
      `${context}.updated-at`
    )
  };
};

export const parseGetCommerceOwner = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-owner'), 'get-owner');

export const parseGetCommerceCoreContract = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-core-contract'), 'get-core-contract');

export const parseGetPaymentToken = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-payment-token'), 'get-payment-token');

export const parseGetNextListingId = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-next-listing-id'), 'get-next-listing-id');

export const parseGetListing = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-listing');
  if (!optional) {
    return null;
  }
  return parseListingTuple(optional, 'get-listing');
};

export const parseHasEntitlement = (value: ClarityValue) =>
  expectBool(expectContractOk(value, 'has-entitlement'), 'has-entitlement');
