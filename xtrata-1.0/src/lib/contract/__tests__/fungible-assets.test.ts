import { describe, expect, it } from 'vitest';
import { getKnownFungibleAsset } from '../fungible-assets';

describe('known fungible assets', () => {
  it('resolves the official USDCx asset metadata', () => {
    expect(
      getKnownFungibleAsset('SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx')
    ).toEqual({
      address: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE',
      contractName: 'usdcx',
      network: 'mainnet',
      assetName: 'usdcx-token',
      symbol: 'USDCx',
      decimals: 6,
      priceAssetKey: 'usdc'
    });
  });

  it('returns null for unknown fungible assets', () => {
    expect(getKnownFungibleAsset('SP123.unknown-token')).toBeNull();
  });
});
