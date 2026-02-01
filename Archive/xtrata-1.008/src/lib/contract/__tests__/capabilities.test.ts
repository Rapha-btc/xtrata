import { describe, expect, it } from 'vitest';
import { resolveContractCapabilities } from '../capabilities';

describe('contract capabilities', () => {
  it('resolves explicit v1.1.1 capabilities', () => {
    const capabilities = resolveContractCapabilities({ protocolVersion: '1.1.1' });
    expect(capabilities.version).toBe('1.1.1');
    expect(capabilities.feeModel).toBe('fee-unit');
    expect(capabilities.supportsPause).toBe(true);
    expect(capabilities.supportsAdminReadOnly).toBe(true);
    expect(capabilities.supportsNextTokenId).toBe(true);
    expect(capabilities.supportsChunkBatchRead).toBe(true);
  });

  it('infers v1.1.1 from contract name', () => {
    const capabilities = resolveContractCapabilities({
      contractName: 'xtrata-v1-1-1'
    });
    expect(capabilities.version).toBe('1.1.1');
  });

  it('defaults to v1.1.1 when version is missing', () => {
    const capabilities = resolveContractCapabilities({});
    expect(capabilities.version).toBe('1.1.1');
  });
});
