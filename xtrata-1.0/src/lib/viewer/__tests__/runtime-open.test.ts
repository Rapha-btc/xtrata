import { describe, expect, it } from 'vitest';
import {
  appendRuntimeWalletBridgeToken,
  buildRuntimeOpenUrl,
  createRuntimeWalletBridgeToken,
  isExecutableRuntimeMimeType,
  isRuntimeWalletBridgeTokenValid,
  markRuntimeOpenWarningShown,
  registerRuntimeWalletBridgeToken,
  shouldShowRuntimeOpenWarning
} from '../runtime-open';

describe('viewer runtime open helpers', () => {
  it('detects executable runtime mime types', () => {
    expect(isExecutableRuntimeMimeType('text/html')).toBe(true);
    expect(isExecutableRuntimeMimeType(' application/xhtml+xml ')).toBe(true);
    expect(isExecutableRuntimeMimeType('application/pdf')).toBe(false);
    expect(isExecutableRuntimeMimeType(null)).toBe(false);
  });

  it('builds runtime open urls with optional params', () => {
    const full = buildRuntimeOpenUrl({
      contractId: 'SP123.contract-name',
      tokenId: 42n,
      network: 'mainnet',
      fallbackContractId: 'SP999.legacy',
      sourceUrl: 'blob:https://xtrata.xyz/example'
    });
    const fullUrl = new URL(full, 'https://xtrata.xyz');
    expect(fullUrl.pathname).toBe('/runtime/');
    expect(fullUrl.searchParams.get('contractId')).toBe('SP123.contract-name');
    expect(fullUrl.searchParams.get('tokenId')).toBe('42');
    expect(fullUrl.searchParams.get('network')).toBe('mainnet');
    expect(fullUrl.searchParams.get('fallbackContractId')).toBe('SP999.legacy');
    expect(fullUrl.searchParams.get('source')).toBe(
      'blob:https://xtrata.xyz/example'
    );

    const minimal = buildRuntimeOpenUrl({
      contractId: 'SP123.contract-name',
      tokenId: 43n,
      network: 'testnet'
    });
    const minimalUrl = new URL(minimal, 'https://xtrata.xyz');
    expect(minimalUrl.searchParams.get('fallbackContractId')).toBeNull();
    expect(minimalUrl.searchParams.get('source')).toBeNull();
  });

  it('appends runtime wallet bridge token to runtime urls', () => {
    const input = '/runtime/?contractId=SP123.contract-name&tokenId=9&network=mainnet';
    const output = appendRuntimeWalletBridgeToken(input, 'token-123');
    const parsed = new URL(output, 'https://xtrata.xyz');
    expect(parsed.pathname).toBe('/runtime/');
    expect(parsed.searchParams.get('walletBridgeToken')).toBe('token-123');
  });

  it('creates non-empty runtime wallet bridge tokens', () => {
    const token = createRuntimeWalletBridgeToken();
    expect(token.trim().length).toBeGreaterThan(0);
  });

  it('tracks one-time runtime warning state', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return store.has(key) ? store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      }
    };

    expect(shouldShowRuntimeOpenWarning(storage)).toBe(true);
    markRuntimeOpenWarningShown(storage);
    expect(shouldShowRuntimeOpenWarning(storage)).toBe(false);
  });

  it('tolerates storage failures', () => {
    const brokenStorage = {
      getItem() {
        throw new Error('no read');
      },
      setItem() {
        throw new Error('no write');
      }
    };

    expect(shouldShowRuntimeOpenWarning(brokenStorage)).toBe(true);
    expect(() => markRuntimeOpenWarningShown(brokenStorage)).not.toThrow();
  });

  it('registers and validates runtime wallet bridge tokens', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return store.has(key) ? store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      }
    };

    expect(isRuntimeWalletBridgeTokenValid(storage, 'bridge-token')).toBe(false);
    registerRuntimeWalletBridgeToken(storage, 'bridge-token', 1000);
    expect(isRuntimeWalletBridgeTokenValid(storage, 'bridge-token')).toBe(true);
  });
});
