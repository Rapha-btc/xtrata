import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSIONS,
  resolveContractCapabilities
} from '../capabilities.js';

describe('sdk capabilities compatibility', () => {
  it('exposes the supported protocol versions in stable order', () => {
    expect(PROTOCOL_VERSIONS).toEqual(['1.1.1', '2.1.0', '2.1.1']);
  });

  it('resolves capabilities by explicit protocol version', () => {
    const resolved = resolveContractCapabilities({ protocolVersion: '2.1.0' });
    expect(resolved.version).toBe('2.1.0');
    expect(resolved.supportsFeeUnit).toBe(true);
    expect(resolved.supportsChunkBatchRead).toBe(true);
    expect(resolved.supportsNextTokenId).toBe(true);
  });

  it('infers capabilities from contract name when protocol version is absent', () => {
    const resolved = resolveContractCapabilities({
      contractName: 'xtrata-v2-1-0'
    });
    expect(resolved.version).toBe('2.1.0');
  });

  it('infers capabilities for xtrata-v2-1-1', () => {
    const resolved = resolveContractCapabilities({
      contractName: 'xtrata-v2-1-1'
    });
    expect(resolved.version).toBe('2.1.1');
  });

  it('falls back safely for unknown contracts', () => {
    const resolved = resolveContractCapabilities({
      contractName: 'custom-xtrata-fork'
    });
    expect(resolved.version).toBe('1.1.1');
    expect(resolved.supportsPause).toBe(true);
  });
});
