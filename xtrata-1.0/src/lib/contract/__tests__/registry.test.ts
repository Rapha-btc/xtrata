import { describe, expect, it } from 'vitest';
import { CONTRACT_REGISTRY } from '../registry';
import { getContractId } from '../config';

const EXPECTED_V11_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1';
const EXPECTED_V21_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
const EXPECTED_V211_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1';

describe('contract registry', () => {
  it('loads the default registry entry', () => {
    expect(CONTRACT_REGISTRY.length).toBeGreaterThan(0);
    const entry = CONTRACT_REGISTRY[0];
    expect(getContractId(entry)).toBe(EXPECTED_V11_CONTRACT_ID);
    expect(entry.network).toBe('mainnet');
    expect(entry.protocolVersion).toBe('1.1.1');
  });

  it('includes xtrata-v1-1-1, xtrata-v2-1-0, and xtrata-v2-1-1 entries', () => {
    expect(CONTRACT_REGISTRY.length).toBeGreaterThanOrEqual(3);
    const [v110, v210, v211] = CONTRACT_REGISTRY;

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

    expect(getContractId(v211)).toBe(EXPECTED_V211_CONTRACT_ID);
    expect(v211.contractName).toBe('xtrata-v2-1-1');
    expect(v211.address).toBe('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X');
    expect(v211.network).toBe('mainnet');
    expect(v211.protocolVersion).toBe('2.1.1');
  });
});
