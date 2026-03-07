import { describe, expect, it } from 'vitest';
import { parseCommerceContractId } from '../contract';

describe('commerce contract parser', () => {
  it('parses a valid commerce contract id', () => {
    const parsed = parseCommerceContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-commerce'
    );
    expect(parsed.error).toBeNull();
    expect(parsed.config?.address).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    );
    expect(parsed.config?.contractName).toBe('xtrata-commerce');
    expect(parsed.config?.network).toBe('mainnet');
  });

  it('rejects missing contract name', () => {
    const parsed = parseCommerceContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.'
    );
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Use format ADDRESS.CONTRACT-NAME.');
  });

  it('rejects invalid address', () => {
    const parsed = parseCommerceContractId('SP123.xtrata-commerce');
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Invalid Stacks address.');
  });
});
