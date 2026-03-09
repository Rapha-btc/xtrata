import { describe, expect, it } from 'vitest';
import { getContractId, parseContractId } from '../config';

describe('contract config helpers', () => {
  it('builds a contract id', () => {
    expect(
      getContractId({
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      })
    ).toBe('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0');
  });

  it('parses a valid contract id', () => {
    expect(
      parseContractId('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0')
    ).toEqual({
      address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      contractName: 'xtrata-v2-1-0',
      network: 'mainnet'
    });
  });

  it('returns null for invalid contract ids', () => {
    expect(parseContractId('')).toBeNull();
    expect(parseContractId('SP123')).toBeNull();
    expect(parseContractId('SP123.invalid')).toBeNull();
  });
});
