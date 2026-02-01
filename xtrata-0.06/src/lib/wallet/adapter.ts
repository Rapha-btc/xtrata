import { AppConfig, UserSession, type UserData } from '@stacks/auth';
import { showConnect, disconnect as disconnectProvider } from '@stacks/connect';
import { getNetworkFromAddress } from '../network/guard';
import type { NetworkType } from '../network/types';
import { createWalletSessionStore } from './session';
import type { WalletSession } from './types';

const DEFAULT_SCOPES = ['store_write'];
const MANIFEST_PATH = '/manifest.json';
const REQUIRED_NETWORK: NetworkType = 'mainnet';

type StxAddressProfile =
  | string
  | {
      mainnet?: string;
      testnet?: string;
      [key: string]: unknown;
    };

const normalizeCoreNodeNetwork = (coreNode?: string): NetworkType | undefined => {
  if (!coreNode) {
    return undefined;
  }
  const lower = coreNode.toLowerCase();
  if (lower.includes('testnet')) {
    return 'testnet';
  }
  if (lower.includes('mainnet')) {
    return 'mainnet';
  }
  return undefined;
};

const normalizeProfileNetwork = (stxAddress?: StxAddressProfile): NetworkType | undefined => {
  if (!stxAddress || typeof stxAddress === 'string') {
    return undefined;
  }
  const hasMainnet = typeof stxAddress.mainnet === 'string';
  const hasTestnet = typeof stxAddress.testnet === 'string';
  if (hasMainnet && !hasTestnet) {
    return 'mainnet';
  }
  if (hasTestnet && !hasMainnet) {
    return 'testnet';
  }
  return undefined;
};

const resolveProfileAddress = (
  stxAddress?: StxAddressProfile,
  network?: NetworkType
): string | undefined => {
  if (!stxAddress) {
    return undefined;
  }
  if (typeof stxAddress === 'string') {
    return stxAddress;
  }
  if (network && typeof stxAddress[network] === 'string') {
    return stxAddress[network];
  }
  if (typeof stxAddress.testnet === 'string') {
    return stxAddress.testnet;
  }
  if (typeof stxAddress.mainnet === 'string') {
    return stxAddress.mainnet;
  }
  return undefined;
};

const resolveActiveNetwork = (
  userData: UserData,
  stxAddress?: StxAddressProfile
): NetworkType | undefined => {
  return (
    normalizeCoreNodeNetwork(userData.coreNode) ??
    (userData.identityAddress
      ? getNetworkFromAddress(userData.identityAddress) ?? undefined
      : undefined) ??
    normalizeProfileNetwork(stxAddress)
  );
};

const resolveMainnetAddress = (
  stxAddress?: StxAddressProfile,
  identityAddress?: string
): string | undefined => {
  const profileMainnet = resolveProfileAddress(stxAddress, REQUIRED_NETWORK);
  if (
    profileMainnet &&
    getNetworkFromAddress(profileMainnet) === REQUIRED_NETWORK
  ) {
    return profileMainnet;
  }
  if (
    identityAddress &&
    getNetworkFromAddress(identityAddress) === REQUIRED_NETWORK
  ) {
    return identityAddress;
  }
  const fallback = resolveProfileAddress(stxAddress);
  if (fallback && getNetworkFromAddress(fallback) === REQUIRED_NETWORK) {
    return fallback;
  }
  return undefined;
};

export const deriveWalletSession = (userData: UserData): WalletSession => {
  const profile = (userData.profile ?? {}) as { stxAddress?: StxAddressProfile };
  const stxAddress = profile.stxAddress;
  const network = resolveActiveNetwork(userData, stxAddress);
  if (network && network !== REQUIRED_NETWORK) {
    return { isConnected: false };
  }

  const address = resolveMainnetAddress(stxAddress, userData.identityAddress);

  if (!address) {
    return { isConnected: false };
  }

  return {
    isConnected: true,
    address,
    network: REQUIRED_NETWORK
  };
};

const resolveIconUrl = (icon: string) => {
  if (icon.startsWith('http://') || icon.startsWith('https://')) {
    return icon;
  }
  if (typeof window !== 'undefined') {
    return new URL(icon, window.location.origin).toString();
  }
  return icon;
};

export const createStacksWalletAdapter = (params: {
  appName: string;
  appIcon: string;
}) => {
  const appConfig = new AppConfig(DEFAULT_SCOPES, undefined, '', MANIFEST_PATH);
  const userSession = new UserSession({ appConfig });
  const sessionStore = createWalletSessionStore();
  const clearSession = () => {
    userSession.signUserOut();
    disconnectProvider();
    sessionStore.clear();
  };

  const getSession = (): WalletSession => {
    if (userSession.isUserSignedIn()) {
      const session = deriveWalletSession(userSession.loadUserData());
      if (!session.isConnected) {
        clearSession();
        return sessionStore.load();
      }
      sessionStore.save(session);
      return session;
    }
    sessionStore.clear();
    return sessionStore.load();
  };

  const connect = async (): Promise<WalletSession> => {
    if (userSession.isUserSignedIn()) {
      const session = getSession();
      if (session.isConnected) {
        return session;
      }
    }
    return new Promise((resolve) => {
      showConnect({
        appDetails: {
          name: params.appName,
          icon: resolveIconUrl(params.appIcon)
        },
        manifestPath: MANIFEST_PATH,
        userSession,
        onFinish: (payload) => {
          const session = deriveWalletSession(payload.userSession.loadUserData());
          sessionStore.save(session);
          resolve(session);
        },
        onCancel: () => {
          resolve(getSession());
        }
      });
    });
  };

  const disconnect = async () => {
    clearSession();
  };

  return {
    connect,
    disconnect,
    getSession
  };
};
