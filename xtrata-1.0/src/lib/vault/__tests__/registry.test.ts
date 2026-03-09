import { describe, expect, it } from 'vitest';
import { getVaultContractId, VAULT_REGISTRY } from '../registry';

const EXPECTED_VAULT_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-vault';

describe('vault registry', () => {
  it('loads the default vault registry entry', () => {
    expect(VAULT_REGISTRY.length).toBeGreaterThan(0);
    const entry = VAULT_REGISTRY[0];
    expect(getVaultContractId(entry)).toBe(EXPECTED_VAULT_CONTRACT_ID);
    expect(entry.label).toBe('Xtrata Vault');
    expect(entry.network).toBe('mainnet');
  });
});
