import { describe, expect, it } from 'vitest';
import { getContractId, parseContractId } from '../config';
import { getNetworkFromAddress, getNetworkMismatch } from '../network';

describe('sdk config', () => {
  it('parses contract id and infers network', () => {
    const parsed = parseContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );

    expect(parsed.error).toBeNull();
    expect(parsed.config?.network).toBe('mainnet');
    expect(parsed.config && getContractId(parsed.config)).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
  });

  it('detects network mismatch', () => {
    expect(
      getNetworkMismatch('mainnet', getNetworkFromAddress('ST10W2EEM757922QTVDZZ5CSEW55JEFNN33V2E7YA'))
    ).toEqual({ expected: 'mainnet', actual: 'testnet' });
  });
});
