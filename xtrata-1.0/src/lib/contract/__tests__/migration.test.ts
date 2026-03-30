import { describe, expect, it } from 'vitest';
import {
  getMigrationSourceContracts,
  resolveMigrationRoute
} from '../migration';
import type { ContractRegistryEntry } from '../registry';

const REGISTRY: ContractRegistryEntry[] = [
  {
    label: 'xtrata-v1-1-1',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v1-1-1',
    network: 'mainnet',
    protocolVersion: '1.1.1'
  },
  {
    label: 'xtrata-v2-1-0',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v2-1-0',
    network: 'mainnet',
    protocolVersion: '2.1.0',
    legacyContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
  },
  {
    label: 'xtrata-v2-1-1',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v2-1-1',
    network: 'mainnet',
    protocolVersion: '2.1.1',
    legacyContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
  },
  {
    label: 'xtrata-v3-0-0',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-v3-0-0',
    network: 'mainnet',
    protocolVersion: '3.0.0'
  }
];

describe('contract migration routes', () => {
  it('returns the legacy v1 source for v2 targets', () => {
    const sources = getMigrationSourceContracts(REGISTRY[1], REGISTRY);
    expect(sources.map((entry) => entry.contractName)).toEqual(['xtrata-v1-1-1']);
  });

  it('returns v1 and v2 sources for v3 targets', () => {
    const sources = getMigrationSourceContracts(REGISTRY[3], REGISTRY);
    expect(sources.map((entry) => entry.contractName)).toEqual([
      'xtrata-v1-1-1',
      'xtrata-v2-1-0',
      'xtrata-v2-1-1'
    ]);
  });

  it('resolves the correct v3 migration entrypoint for a v2.1.0 source', () => {
    const route = resolveMigrationRoute({
      source: REGISTRY[1],
      target: REGISTRY[3],
      registry: REGISTRY
    });
    expect(route?.functionName).toBe('migrate-from-v2-1-0');
  });

  it('rejects unsupported migration directions', () => {
    const route = resolveMigrationRoute({
      source: REGISTRY[2],
      target: REGISTRY[1],
      registry: REGISTRY
    });
    expect(route).toBeNull();
  });
});
