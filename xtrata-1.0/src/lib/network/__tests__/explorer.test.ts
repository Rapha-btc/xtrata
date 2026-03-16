import { describe, expect, it } from 'vitest';
import {
  getStacksExplorerAddressUrl,
  getStacksExplorerBnsUrl,
  getStacksExplorerContractUrl,
  getStacksExplorerTxUrl
} from '../explorer';

describe('network explorer urls', () => {
  it('builds explorer address URL from wallet address + inferred chain', () => {
    expect(
      getStacksExplorerAddressUrl('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')
    ).toBe(
      'https://explorer.hiro.so/address/SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B?chain=mainnet'
    );
  });

  it('builds explorer contract URL from contract ID', () => {
    expect(
      getStacksExplorerContractUrl(
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
        'mainnet'
      )
    ).toBe(
      'https://explorer.hiro.so/address/SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0?chain=mainnet'
    );
  });

  it('builds explorer bns URL from normalized name', () => {
    expect(getStacksExplorerBnsUrl(' Alice.BTC ', 'mainnet')).toBe(
      'https://explorer.hiro.so/name/alice.btc?chain=mainnet'
    );
  });

  it('returns null for unknown-chain values', () => {
    expect(getStacksExplorerAddressUrl('invalid-address')).toBeNull();
    expect(getStacksExplorerBnsUrl('alice.btc')).toBeNull();
  });

  it('normalizes tx IDs for tx links', () => {
    expect(
      getStacksExplorerTxUrl(
        '6dcf85f7f3f5887c8029d8be3b0ed2e96a4bcf7468ef4fd72b77ef6c9e6f5f65',
        'testnet'
      )
    ).toBe(
      'https://explorer.hiro.so/txid/0x6dcf85f7f3f5887c8029d8be3b0ed2e96a4bcf7468ef4fd72b77ef6c9e6f5f65?chain=testnet'
    );
  });
});
