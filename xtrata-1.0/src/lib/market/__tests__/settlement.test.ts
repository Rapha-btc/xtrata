import { describe, expect, it } from 'vitest';
import { FungibleConditionCode, NonFungibleConditionCode } from '@stacks/transactions';
import {
  buildMarketBuyPostConditions,
  formatMarketPrice,
  formatMarketPriceWithUsd,
  getMarketSettlementBadgeVariant,
  getMarketBuyFailureMessage,
  getMarketPriceInputLabel,
  getMarketSettlementAsset,
  getMarketSettlementLabel,
  getMarketSettlementSupportMessage,
  isMarketSettlementSupported,
  parseMarketPriceInput
} from '../settlement';
import type { UsdPriceBook } from '../../pricing/types';

const nftContract = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-v2-1-0',
  network: 'mainnet' as const
};

const marketContract = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-market-usdc-v1-0',
  network: 'mainnet' as const
};

const now = Date.now();

const priceBook: UsdPriceBook = {
  provider: 'coingecko',
  generatedAt: now,
  prices: {
    stx: {
      usd: 0.2952,
      updatedAt: now,
      sourceId: 'stacks',
      isFallback: false
    },
    sbtc: {
      usd: 87_500.12,
      updatedAt: now,
      sourceId: 'sbtc',
      isFallback: false
    },
    usdc: {
      usd: 1.0001,
      updatedAt: now,
      sourceId: 'usd-coin',
      isFallback: false
    }
  }
};

describe('market settlement helpers', () => {
  it('treats null payment token as STX settlement', () => {
    const settlement = getMarketSettlementAsset(null);
    expect(settlement.kind).toBe('stx');
    expect(isMarketSettlementSupported(settlement)).toBe(true);
    expect(getMarketSettlementLabel(settlement)).toBe('STX');
    expect(getMarketSettlementBadgeVariant(settlement)).toBe('badge--market-stx');
    expect(getMarketPriceInputLabel(settlement)).toBe('Price (STX)');
    expect(parseMarketPriceInput('1.25', settlement)).toBe(1_250_000n);
    expect(formatMarketPrice(1_250_000n, settlement)).toBe('1.25 STX');
    expect(formatMarketPriceWithUsd(1_250_000n, settlement, priceBook)).toBe(
      '1.25 STX · ~$0.37'
    );
  });

  it('supports known USDCx settlements', () => {
    const settlement = getMarketSettlementAsset(
      'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
    );
    expect(settlement.kind).toBe('fungible-token');
    expect(isMarketSettlementSupported(settlement)).toBe(true);
    expect(getMarketSettlementLabel(settlement)).toBe('USDCx');
    expect(getMarketSettlementBadgeVariant(settlement)).toBe(
      'badge--market-usdcx'
    );
    expect(getMarketPriceInputLabel(settlement)).toBe('Price (USDCx)');
    expect(parseMarketPriceInput('2.5', settlement)).toBe(2_500_000n);
    expect(formatMarketPrice(2_500_000n, settlement)).toBe('2.5 USDCx');
    expect(formatMarketPriceWithUsd(2_500_000n, settlement, priceBook)).toBe(
      '2.5 USDCx · ~$2.50'
    );
  });

  it('supports known sBTC settlements', () => {
    const settlement = getMarketSettlementAsset(
      'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'
    );
    expect(getMarketSettlementBadgeVariant(settlement)).toBe('badge--market-sbtc');
    expect(parseMarketPriceInput('0.01', settlement)).toBe(1_000_000n);
    expect(formatMarketPrice(1_000_000n, settlement)).toBe('0.01 sBTC');
  });

  it('flags unsupported and unresolved settlement assets', () => {
    const unresolved = getMarketSettlementAsset(undefined);
    expect(isMarketSettlementSupported(unresolved)).toBe(false);
    expect(getMarketSettlementLabel(unresolved)).toBe('Token');
    expect(getMarketSettlementBadgeVariant(unresolved)).toBe('badge--market-token');
    expect(getMarketSettlementSupportMessage(unresolved)).toContain('Loading');

    const unknown = getMarketSettlementAsset(
      'SP000000000000000000002Q6VF78.some-token'
    );
    expect(isMarketSettlementSupported(unknown)).toBe(false);
    expect(getMarketSettlementBadgeVariant(unknown)).toBe('badge--market-token');
    expect(getMarketSettlementSupportMessage(unknown)).toContain(
      'Unsupported payment token'
    );
    expect(formatMarketPrice(123n, unresolved)).toBe('123 units');
  });

  it('builds STX and fungible-token post-conditions', () => {
    const stxConditions = buildMarketBuyPostConditions({
      settlement: getMarketSettlementAsset(null),
      buyerAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      amount: 1_250_000n,
      nftContract,
      senderContract: marketContract,
      tokenId: 12n
    });
    expect(stxConditions).not.toBeNull();
    expect(stxConditions).toHaveLength(2);

    const usdcConditions = buildMarketBuyPostConditions({
      settlement: getMarketSettlementAsset(
        'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
      ),
      buyerAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      amount: 2_500_000n,
      nftContract,
      senderContract: marketContract,
      tokenId: 12n
    });
    expect(usdcConditions).not.toBeNull();
    expect(usdcConditions).toHaveLength(2);
    expect(usdcConditions?.[0]?.conditionCode).toBe(FungibleConditionCode.Equal);
    expect(usdcConditions?.[1]?.conditionCode).toBe(
      NonFungibleConditionCode.Sends
    );
  });

  it('returns null post-conditions for unsupported settlements', () => {
    const unsupported = buildMarketBuyPostConditions({
      settlement: getMarketSettlementAsset(
        'SP000000000000000000002Q6VF78.some-token'
      ),
      buyerAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      amount: 1n,
      nftContract,
      senderContract: marketContract,
      tokenId: 12n
    });
    expect(unsupported).toBeNull();
    expect(
      getMarketBuyFailureMessage(
        getMarketSettlementAsset(
          'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
        )
      )
    ).toBe(
      'Purchase failed: no USDCx was transferred. Check listing status and your balance.'
    );
  });
});
