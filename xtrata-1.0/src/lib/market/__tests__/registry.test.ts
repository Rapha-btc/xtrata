import { describe, expect, it } from 'vitest';
import {
  getMarketContractId,
  getMarketRegistryEntry,
  MARKET_REGISTRY
} from '../registry';

const EXPECTED_STX_MARKET =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-stx-v1-0';
const EXPECTED_USDC_MARKET =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-usdc-v1-0';
const EXPECTED_SBTC_MARKET =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-sbtc-v1-0';
const EXPECTED_LEGACY_STX_MARKET =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-v1-1';

describe('market registry', () => {
  it('loads first-party STX, USDCx, and sBTC market entries', () => {
    expect(MARKET_REGISTRY.length).toBeGreaterThanOrEqual(5);
    expect(getMarketContractId(MARKET_REGISTRY[0]!)).toBe(EXPECTED_STX_MARKET);
    expect(getMarketRegistryEntry(EXPECTED_LEGACY_STX_MARKET)?.label).toContain(
      'Legacy'
    );

    const usdcEntry = getMarketRegistryEntry(EXPECTED_USDC_MARKET);
    expect(usdcEntry?.paymentTokenContractId).toBe(
      'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'
    );

    const sbtcEntry = getMarketRegistryEntry(EXPECTED_SBTC_MARKET);
    expect(sbtcEntry?.paymentTokenContractId).toBe(
      'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'
    );
  });
});
