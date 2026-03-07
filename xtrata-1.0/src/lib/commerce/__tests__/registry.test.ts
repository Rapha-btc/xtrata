import { describe, expect, it } from 'vitest';
import { COMMERCE_REGISTRY, getCommerceContractId } from '../registry';

const EXPECTED_COMMERCE_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-commerce';

describe('commerce registry', () => {
  it('loads the default commerce registry entry', () => {
    expect(COMMERCE_REGISTRY.length).toBeGreaterThan(0);
    const entry = COMMERCE_REGISTRY[0];
    expect(getCommerceContractId(entry)).toBe(EXPECTED_COMMERCE_CONTRACT_ID);
    expect(entry.label).toBe('Xtrata Commerce');
    expect(entry.network).toBe('mainnet');
  });
});
