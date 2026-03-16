import { createWalletSessionStore } from './session';
import { connectWallet, disconnectWallet } from './connect';
import type { WalletSession } from './types';

export const createStacksWalletAdapter = (params: {
  appName: string;
  appIcon: string;
}) => {
  const sessionStore = createWalletSessionStore();
  const clearSession = () => {
    sessionStore.clear();
  };

  const getSession = (): WalletSession => sessionStore.load();

  const connect = async (): Promise<WalletSession> => {
    const current = getSession();
    if (current.isConnected) {
      return current;
    }

    const session = await connectWallet({
      appName: params.appName,
      appIcon: params.appIcon
    });
    sessionStore.save(session);
    return session;
  };

  const disconnect = async () => {
    await disconnectWallet();
    clearSession();
  };

  return {
    connect,
    disconnect,
    getSession
  };
};
