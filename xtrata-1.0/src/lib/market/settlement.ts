import {
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  type PostCondition
} from '@stacks/transactions';
import type { ContractConfig } from '../contract/config';
import {
  getKnownFungibleAsset,
  type FungibleAssetConfig
} from '../contract/fungible-assets';
import {
  buildContractTransferPostCondition,
  buildFungibleSpendPostCondition
} from '../contract/post-conditions';
import { formatDecimalAmount, parseDecimalAmount } from '../utils/amounts';

const STX_DECIMALS = 6;
const STX_SYMBOL = 'STX';

const trimTrailingZeroes = (value: string) =>
  value.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');

export type MarketSettlementAsset =
  | {
      kind: 'unresolved';
      symbol: 'Token';
      decimals: null;
      paymentTokenContractId: undefined;
      token: null;
    }
  | {
      kind: 'stx';
      symbol: 'STX';
      decimals: 6;
      paymentTokenContractId: null;
      token: null;
    }
  | {
      kind: 'fungible-token';
      symbol: string;
      decimals: number | null;
      paymentTokenContractId: string;
      token: FungibleAssetConfig | null;
    };

export const getMarketSettlementAsset = (
  paymentTokenContractId: string | null | undefined
): MarketSettlementAsset => {
  if (paymentTokenContractId === undefined) {
    return {
      kind: 'unresolved',
      symbol: 'Token',
      decimals: null,
      paymentTokenContractId: undefined,
      token: null
    };
  }
  if (paymentTokenContractId === null) {
    return {
      kind: 'stx',
      symbol: STX_SYMBOL,
      decimals: STX_DECIMALS,
      paymentTokenContractId: null,
      token: null
    };
  }
  const token = getKnownFungibleAsset(paymentTokenContractId);
  return {
    kind: 'fungible-token',
    symbol: token?.symbol ?? 'Token',
    decimals: token?.decimals ?? null,
    paymentTokenContractId,
    token
  };
};

export const isMarketSettlementSupported = (
  settlement: MarketSettlementAsset
) =>
  settlement.kind === 'stx' ||
  (settlement.kind === 'fungible-token' && settlement.token !== null);

export const getMarketSettlementLabel = (
  settlement: MarketSettlementAsset
) => (settlement.kind === 'unresolved' ? 'Token' : settlement.symbol);

export const getMarketSettlementBadgeVariant = (
  settlement: MarketSettlementAsset
) => {
  if (settlement.kind === 'stx') {
    return 'badge--market-stx';
  }
  if (settlement.kind === 'fungible-token' && settlement.token?.symbol === 'USDCx') {
    return 'badge--market-usdcx';
  }
  if (settlement.kind === 'fungible-token' && settlement.token?.symbol === 'sBTC') {
    return 'badge--market-sbtc';
  }
  return 'badge--market-token';
};

export const getMarketSettlementSupportMessage = (
  settlement: MarketSettlementAsset
) => {
  if (settlement.kind === 'unresolved') {
    return 'Loading market settlement asset. Try again once market status is loaded.';
  }
  if (settlement.kind === 'fungible-token' && !settlement.token) {
    return `Unsupported payment token: ${settlement.paymentTokenContractId}. First-party UI currently supports STX, USDCx, and sBTC markets.`;
  }
  return null;
};

export const getMarketPriceInputLabel = (settlement: MarketSettlementAsset) =>
  `Price (${settlement.kind === 'unresolved' ? 'Token' : settlement.symbol})`;

export const parseMarketPriceInput = (
  raw: string,
  settlement: MarketSettlementAsset
) => {
  if (settlement.kind === 'unresolved' || settlement.decimals === null) {
    return null;
  }
  return parseDecimalAmount(raw, settlement.decimals);
};

export const formatMarketPrice = (
  amount: bigint | null | undefined,
  settlement: MarketSettlementAsset
) => {
  if (amount === null || amount === undefined) {
    return '—';
  }
  if (settlement.kind === 'unresolved' || settlement.decimals === null) {
    return `${amount.toString()} units`;
  }
  const value = trimTrailingZeroes(
    formatDecimalAmount(amount, settlement.decimals)
  );
  return `${value} ${settlement.symbol}`;
};

export const buildMarketBuyPostConditions = (params: {
  settlement: MarketSettlementAsset;
  buyerAddress: string;
  amount: bigint;
  nftContract: ContractConfig;
  senderContract: ContractConfig;
  tokenId: bigint;
}): PostCondition[] | null => {
  if (params.settlement.kind === 'unresolved') {
    return null;
  }
  const nftTransfer = buildContractTransferPostCondition({
    nftContract: params.nftContract,
    senderContract: params.senderContract,
    tokenId: params.tokenId
  });
  if (params.settlement.kind === 'stx') {
    return [
      makeStandardSTXPostCondition(
        params.buyerAddress,
        FungibleConditionCode.Equal,
        params.amount
      ),
      nftTransfer
    ];
  }
  if (!params.settlement.token) {
    return null;
  }
  return [
    buildFungibleSpendPostCondition({
      token: params.settlement.token,
      senderAddress: params.buyerAddress,
      amount: params.amount
    }),
    nftTransfer
  ];
};

export const getMarketBuyFailureMessage = (
  settlement: MarketSettlementAsset
) => {
  const symbol = settlement.kind === 'unresolved' ? 'funds' : settlement.symbol;
  return `Purchase failed: no ${symbol} was transferred. Check listing status and your balance.`;
};
