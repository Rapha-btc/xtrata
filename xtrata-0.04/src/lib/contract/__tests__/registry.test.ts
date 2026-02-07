import { describe, expect, it } from 'vitest';
import { CONTRACT_REGISTRY } from '../registry';
import { getContractId } from '../config';

const EXPECTED_V11_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1';
const EXPECTED_V21_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';

describe('contract registry', () => {
  it('loads the default registry entry', () => {
    expect(CONTRACT_REGISTRY.length).toBeGreaterThan(0);
    const entry = CONTRACT_REGISTRY[0];
    expect(getContractId(entry)).toBe(EXPECTED_V11_CONTRACT_ID);
    expect(entry.network).toBe('mainnet');
    expect(entry.protocolVersion).toBe('1.1.1');
  });

  it('includes xtrata-v1-1-1 and xtrata-v2-1-0 entries', () => {
    expect(CONTRACT_REGISTRY.length).toBeGreaterThanOrEqual(2);
    const [v110, v210] = CONTRACT_REGISTRY;

    expect(getContractId(v110)).toBe(EXPECTED_V11_CONTRACT_ID);
    expect(v110.contractName).toBe('xtrata-v1-1-1');
    expect(v110.address).toBe('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X');
    expect(v110.network).toBe('mainnet');
    expect(v110.protocolVersion).toBe('1.1.1');

    expect(getContractId(v210)).toBe(EXPECTED_V21_CONTRACT_ID);
    expect(v210.contractName).toBe('xtrata-v2-1-0');
    expect(v210.address).toBe('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X');
    expect(v210.network).toBe('mainnet');
    expect(v210.protocolVersion).toBe('2.1.0');
  });
});
