import { describe, expect, it } from 'vitest';
import {
  getNetworkFromAddress,
  getNetworkMismatch,
  isNetworkMatch
} from '../guard';

describe('network guard', () => {
  it('detects network from address prefix', () => {
    expect(getNetworkFromAddress('ST10W2EEM757922QTVDZZ5CSEW55JEFNN33V2E7YA')).toBe('testnet');
    expect(getNetworkFromAddress('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')).toBe('mainnet');
    expect(getNetworkFromAddress('SN2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B')).toBe('testnet');
    expect(getNetworkFromAddress('SM12345')).toBe('mainnet');
  });

  it('detects network from contract principal', () => {
    expect(
      getNetworkFromAddress(
        'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
      )
    ).toBe('mainnet');
  });

  it('reports network mismatch', () => {
    expect(isNetworkMatch('mainnet', 'mainnet')).toBe(true);
    expect(isNetworkMatch('mainnet', 'testnet')).toBe(false);
    expect(getNetworkMismatch('mainnet', 'testnet')).toEqual({
      expected: 'mainnet',
      actual: 'testnet'
    });
    expect(getNetworkMismatch('mainnet', 'mainnet')).toBeNull();
  });
});
