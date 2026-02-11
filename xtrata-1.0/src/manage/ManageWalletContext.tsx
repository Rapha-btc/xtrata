import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import { createStacksWalletAdapter } from '../lib/wallet/adapter';
import { createWalletSessionStore } from '../lib/wallet/session';
import type { WalletSession } from '../lib/wallet/types';

const walletSessionStore = createWalletSessionStore();

type ManageWalletContextValue = {
  walletAdapter: ReturnType<typeof createStacksWalletAdapter>;
  walletSession: WalletSession;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const ManageWalletContext = createContext<ManageWalletContextValue | null>(null);

export const useManageWallet = () => {
  const context = useContext(ManageWalletContext);
  if (!context) {
    throw new Error('useManageWallet must be used within a ManageWalletProvider');
  }
  return context;
};

type ManageWalletProviderProps = {
  children: ReactNode;
};

export function ManageWalletProvider({ children }: ManageWalletProviderProps) {
  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'Xtrata Collection Manager',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );
  const [walletSession, setWalletSession] = useState(walletSessionStore.load());

  useEffect(() => {
    const session = walletAdapter.getSession();
    setWalletSession(session);
    walletSessionStore.save(session);
  }, [walletAdapter]);

  const connect = async () => {
    const session = await walletAdapter.connect();
    walletSessionStore.save(session);
    setWalletSession(session);
  };

  const disconnect = async () => {
    await walletAdapter.disconnect();
    const session = walletAdapter.getSession();
    walletSessionStore.save(session);
    setWalletSession(session);
  };

  const value = useMemo(
    () => ({ walletAdapter, walletSession, connect, disconnect }),
    [walletAdapter, walletSession]
  );

  return <ManageWalletContext.Provider value={value}>{children}</ManageWalletContext.Provider>;
}
