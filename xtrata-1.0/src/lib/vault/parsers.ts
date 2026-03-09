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
import type { VaultRecord } from './types';

const expectContractOk = (value: ClarityValue, context: string) => {
  const response = unwrapResponse(value, context);
  if (!response.ok) {
    throw new Error(`${context} failed`);
  }
  return response.value;
};

const parseVaultTuple = (value: ClarityValue, context: string): VaultRecord => {
  const tuple = expectTuple(value, context);
  return {
    assetId: expectUInt(getTupleValue(tuple, 'asset-id', context), `${context}.asset-id`),
    owner: expectPrincipal(getTupleValue(tuple, 'owner', context), `${context}.owner`),
    amount: expectUInt(getTupleValue(tuple, 'amount', context), `${context}.amount`),
    tier: expectUInt(getTupleValue(tuple, 'tier', context), `${context}.tier`),
    reserved: expectBool(getTupleValue(tuple, 'reserved', context), `${context}.reserved`),
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

export const parseGetVaultOwner = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-owner'), 'get-owner');

export const parseGetVaultCoreContract = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-core-contract'), 'get-core-contract');

export const parseGetReserveToken = (value: ClarityValue) =>
  expectPrincipal(expectContractOk(value, 'get-reserve-token'), 'get-reserve-token');

export const parseGetNextVaultId = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-next-vault-id'), 'get-next-vault-id');

export const parseGetVault = (value: ClarityValue) => {
  const optional = expectOptional(value, 'get-vault');
  if (!optional) {
    return null;
  }
  return parseVaultTuple(optional, 'get-vault');
};

export const parseGetTierForAmount = (value: ClarityValue) =>
  expectUInt(expectContractOk(value, 'get-tier-for-amount'), 'get-tier-for-amount');

export const parseHasPremiumAccess = (value: ClarityValue) =>
  expectBool(expectContractOk(value, 'has-premium-access'), 'has-premium-access');
