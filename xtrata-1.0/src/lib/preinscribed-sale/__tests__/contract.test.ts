import { describe, expect, it } from 'vitest';
import { parsePreinscribedSaleContractId } from '../contract';

describe('pre-inscribed sale contract parser', () => {
  it('parses a valid pre-inscribed sale contract id', () => {
    const parsed = parsePreinscribedSaleContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-preinscribed-collection-sale-v1-0'
    );
    expect(parsed.error).toBeNull();
    expect(parsed.config?.address).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    );
    expect(parsed.config?.contractName).toBe(
      'xtrata-preinscribed-collection-sale-v1-0'
    );
    expect(parsed.config?.network).toBe('mainnet');
  });

  it('rejects missing contract name', () => {
    const parsed = parsePreinscribedSaleContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.'
    );
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Use format ADDRESS.CONTRACT-NAME.');
  });

  it('rejects invalid address', () => {
    const parsed = parsePreinscribedSaleContractId(
      'SP123.xtrata-preinscribed-collection-sale-v1-0'
    );
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Invalid Stacks address.');
  });
});
