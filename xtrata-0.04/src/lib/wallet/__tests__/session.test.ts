import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../storage';
import { createWalletSessionStore, walletSessionUtils } from '../session';

describe('wallet session store', () => {
  it('stores and restores sessions', () => {
    const storage = createMemoryStorage();
    const store = createWalletSessionStore(storage);

    store.save({
      isConnected: true,
      address: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      network: 'mainnet'
    });

    const loaded = store.load();
    expect(loaded.isConnected).toBe(true);
    expect(loaded.address).toBe('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
    expect(loaded.network).toBe('mainnet');
  });

  it('clears sessions', () => {
    const storage = createMemoryStorage();
    const store = createWalletSessionStore(storage);

    store.save({
      isConnected: true,
      address: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      network: 'mainnet'
    });
    store.clear();

    expect(store.load().isConnected).toBe(false);
  });

  it('normalizes invalid sessions', () => {
    const normalized = walletSessionUtils.normalizeSession({
      isConnected: true,
      address: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    });

    expect(normalized.isConnected).toBe(true);
    expect(normalized.network).toBe('mainnet');

    const disconnected = walletSessionUtils.normalizeSession({
      isConnected: false
    });
    expect(disconnected.isConnected).toBe(false);
  });

  it('drops testnet sessions', () => {
    const normalized = walletSessionUtils.normalizeSession({
      isConnected: true,
      address: 'ST10W2EEM757922QTVDZZ5CSEW55JEFNN33V2E7YA',
      network: 'testnet'
    });

    expect(normalized.isConnected).toBe(false);
  });
});
