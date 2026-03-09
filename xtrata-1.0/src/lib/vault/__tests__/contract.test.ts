import { describe, expect, it } from 'vitest';
import { parseVaultContractId } from '../contract';

describe('vault contract parser', () => {
  it('parses a valid vault contract id', () => {
    const parsed = parseVaultContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-vault'
    );
    expect(parsed.error).toBeNull();
    expect(parsed.config?.address).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
    );
    expect(parsed.config?.contractName).toBe('xtrata-vault');
    expect(parsed.config?.network).toBe('mainnet');
  });

  it('rejects missing contract name', () => {
    const parsed = parseVaultContractId(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.'
    );
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Use format ADDRESS.CONTRACT-NAME.');
  });

  it('rejects invalid address', () => {
    const parsed = parseVaultContractId('SP123.xtrata-vault');
    expect(parsed.config).toBeNull();
    expect(parsed.error).toBe('Invalid Stacks address.');
  });
});
