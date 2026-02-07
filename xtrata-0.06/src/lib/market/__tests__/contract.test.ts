import { describe, expect, it } from 'vitest';
import { parseMarketContractId } from '../contract';

describe('market contract parser', () => {
  it('parses a valid market contract id', () => {
    const parsed = parseMarketContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-market-v1-1'
    );
    expect(parsed.error).toBeNull();
    expect(parsed.config?.address).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    );
    expect(parsed.config?.contractName).toBe('xtrata-market-v1-1');
    expect(parsed.config?.network).toBe('mainnet');
  });

  it('rejects missing contract name', () => {
    const parsed = parseMarketContractId('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.');
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Use format ADDRESS.CONTRACT-NAME.');
  });

  it('rejects invalid address', () => {
    const parsed = parseMarketContractId('SP123.xtrata-market-v1-1');
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Invalid Stacks address.');
  });
});
