import { AppConfig, UserSession, type UserData } from '@stacks/auth';
import {
  DEFAULT_PROVIDERS,
  disconnect as disconnectLegacyProvider,
  showConnect as legacyShowConnect,
  showContractCall as legacyShowContractCall,
  showContractDeploy as legacyShowContractDeploy,
  type ContractCallOptions,
  type ContractDeployOptions,
  type StacksProvider
} from '@stacks/connect';
import {
  clearSelectedProviderId,
  getInstalledProviders,
  getProviderFromId,
  getSelectedProviderId,
  type WebBTCProvider
} from '@stacks/connect-ui';
import { defineCustomElements } from '@stacks/connect-ui/loader';
import {
  deserializeTransaction,
  PostConditionMode,
  serializeCV,
  serializePostCondition,
  validateStacksAddress
} from '@stacks/transactions';
import { getNetworkFromAddress } from '../network/guard';
import type { NetworkType } from '../network/types';
import { bytesToHex } from '../utils/encoding';
import type { WalletSession } from './types';

export type { ContractCallOptions, ContractDeployOptions, StacksProvider };

const DEFAULT_SCOPES = ['store_write'];
const MANIFEST_PATH = '/manifest.json';
const USER_CANCEL_ERROR_CODES = new Set([4001, -32000, -31001]);

type ConnectModalElement = HTMLElement & {
  defaultProviders: WebBTCProvider[];
  installedProviders: WebBTCProvider[];
  persistSelection: boolean;
  callback?: (provider: StacksProvider) => void;
  cancelCallback?: () => void;
};

type WalletTxResult = {
  txId?: string;
  txid?: string;
  txRaw?: string;
  stacksTransaction?: unknown;
  [key: string]: unknown;
};

type WalletContractFunctionArg = ContractCallOptions['functionArgs'][number];
type WalletContractPostCondition = NonNullable<ContractCallOptions['postConditions']>[number];
type SerializableClarityValue = Parameters<typeof serializeCV>[0];
type SerializablePostCondition = Parameters<typeof serializePostCondition>[0];
const TX_RESULT_NESTED_KEYS = ['result', 'data', 'payload', 'response', 'params'] as const;
const TX_RESULT_RAW_KEYS = [
  'txRaw',
  'rawTx',
  'rawTransaction',
  'transaction',
  'hex',
  'serializedTx'
] as const;

type WalletActionBase = {
  appDetails?: ContractCallOptions['appDetails'];
  postConditionMode?: ContractCallOptions['postConditionMode'];
  postConditions?: ContractCallOptions['postConditions'];
  network?: ContractCallOptions['network'];
  anchorMode?: ContractCallOptions['anchorMode'];
  attachment?: ContractCallOptions['attachment'];
  fee?: ContractCallOptions['fee'] | bigint;
  stxAddress?: ContractCallOptions['stxAddress'];
  senderKey?: ContractCallOptions['senderKey'];
  nonce?: ContractCallOptions['nonce'] | string | bigint;
  authOrigin?: ContractCallOptions['authOrigin'];
  userSession?: ContractCallOptions['userSession'];
  sponsored?: boolean;
  onFinish?: (payload: WalletTxResult) => void;
  onCancel?: () => void;
};

type WalletContractCallOptions = WalletActionBase & {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ContractCallOptions['functionArgs'];
};

type WalletContractDeployOptions = WalletActionBase & {
  contractName: string;
  codeBody: string;
  clarityVersion?: number;
};

const disconnectedSession = (): WalletSession => ({ isConnected: false });

const stripHexPrefix = (value: string) =>
  value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;

const toNonEmptyText = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStandaloneTxId = (value: unknown) => {
  const text = toNonEmptyText(value);
  if (!text) {
    return null;
  }
  const normalized = stripHexPrefix(text);
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length !== 64) {
    return null;
  }
  return text.startsWith('0x') || text.startsWith('0X') ? text : `0x${normalized}`;
};

const normalizeRawTxHex = (value: unknown) => {
  const text = toNonEmptyText(value);
  if (!text) {
    return null;
  }
  const normalized = stripHexPrefix(text);
  if (
    normalized.length < 128 ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(normalized)
  ) {
    return null;
  }
  return normalized;
};

const normalizeNetwork = (
  value: unknown,
  fallback: NetworkType = 'mainnet'
): NetworkType => {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('testnet') || lower === 'test') {
      return 'testnet';
    }
    if (lower.includes('mainnet') || lower === 'main') {
      return 'mainnet';
    }
  }
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.network === 'string') {
      return normalizeNetwork(candidate.network, fallback);
    }
    const api =
      (typeof candidate.coreApiUrl === 'string' && candidate.coreApiUrl) ||
      (typeof candidate.url === 'string' && candidate.url) ||
      '';
    if (api) {
      return normalizeNetwork(api, fallback);
    }
  }
  return fallback;
};

const normalizeBigIntLike = (value: unknown) => {
  if (typeof value === 'undefined' || value === null) {
    return undefined;
  }
  if (typeof value === 'bigint') {
    return value.toString(10);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const normalizeFunctionArg = (value: WalletContractFunctionArg) =>
  typeof value === 'string'
    ? stripHexPrefix(value)
    : bytesToHex(serializeCV(value as SerializableClarityValue));

const normalizePostCondition = (value: WalletContractPostCondition) =>
  typeof value === 'string'
    ? stripHexPrefix(value)
    : bytesToHex(serializePostCondition(value as SerializablePostCondition));

const normalizePostConditionMode = (value?: PostConditionMode) =>
  value === PostConditionMode.Allow ? 'allow' : 'deny';

const extractStacksAddress = (payload: unknown, depth = 0): string | null => {
  if (depth > 8) {
    return null;
  }
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return validateStacksAddress(trimmed) ? trimmed : null;
  }
  if (!payload) {
    return null;
  }
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractStacksAddress(entry, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  if (typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const keys = [
    'address',
    'selectedAddress',
    'identityAddress',
    'stxAddress',
    'addresses',
    'accounts',
    'result',
    'profile',
    'authResponsePayload',
    'userData'
  ];

  for (const key of keys) {
    if (!(key in candidate)) {
      continue;
    }
    const nested = extractStacksAddress(candidate[key], depth + 1);
    if (nested) {
      return nested;
    }
  }

  if (typeof candidate.mainnet === 'string' && validateStacksAddress(candidate.mainnet)) {
    return candidate.mainnet.trim();
  }
  if (typeof candidate.testnet === 'string' && validateStacksAddress(candidate.testnet)) {
    return candidate.testnet.trim();
  }

  return null;
};

const deriveWalletSession = (userData: UserData): WalletSession => {
  const profile = (userData.profile ?? {}) as {
    stxAddress?:
      | string
      | {
          mainnet?: string;
          testnet?: string;
          [key: string]: unknown;
        };
  };

  const profileAddress =
    typeof profile.stxAddress === 'string'
      ? profile.stxAddress
      : typeof profile.stxAddress?.mainnet === 'string'
        ? profile.stxAddress.mainnet
        : userData.identityAddress;

  const address =
    typeof profileAddress === 'string' && validateStacksAddress(profileAddress)
      ? profileAddress.trim()
      : null;

  if (!address) {
    return disconnectedSession();
  }

  const network = getNetworkFromAddress(address);
  if (network !== 'mainnet') {
    return disconnectedSession();
  }

  return {
    isConnected: true,
    address,
    network
  };
};

const toWalletSession = (
  payload: unknown,
  fallbackNetwork: NetworkType = 'mainnet'
): WalletSession => {
  const address = extractStacksAddress(payload);
  if (!address) {
    return disconnectedSession();
  }
  const network = getNetworkFromAddress(address) ?? normalizeNetwork(payload, fallbackNetwork);
  if (network !== 'mainnet') {
    return disconnectedSession();
  }
  return {
    isConnected: true,
    address,
    network
  };
};

const isMethodUnsupportedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('method not found') ||
    lower.includes('unsupported') ||
    lower.includes('not implemented') ||
    lower.includes('request function is not implemented')
  );
};

const isUserCancelledError = (error: unknown) => {
  if (error && typeof error === 'object') {
    const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
    if (typeof code === 'number' && USER_CANCEL_ERROR_CODES.has(code)) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('cancel') ||
    lower.includes('reject') ||
    lower.includes('denied') ||
    lower.includes('closed')
  );
};

const requestProvider = async (
  provider: StacksProvider,
  method: string,
  params?: Record<string, unknown>
) => {
  if (typeof provider.request !== 'function') {
    throw new Error(`Wallet provider does not support request("${method}").`);
  }
  return provider.request(method, params as unknown as any[]);
};

const deriveTxIdFromRawPayload = (value: unknown) => {
  const rawTxHex = normalizeRawTxHex(value);
  if (!rawTxHex) {
    return null;
  }
  try {
    const txId = deserializeTransaction(rawTxHex).txid();
    return txId.startsWith('0x') ? txId : `0x${txId}`;
  } catch {
    return null;
  }
};

const normalizeTxResultPayload = (
  payload: unknown,
  depth = 0
): WalletTxResult | null => {
  if (depth > 6 || typeof payload === 'undefined' || payload === null) {
    return null;
  }

  const standaloneTxId =
    normalizeStandaloneTxId(payload) ?? deriveTxIdFromRawPayload(payload);
  if (standaloneTxId) {
    return {
      txId: standaloneTxId,
      txid: standaloneTxId
    };
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = normalizeTxResultPayload(entry, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const explicitTxId =
    toNonEmptyText(candidate.txId) ||
    toNonEmptyText(candidate.txid) ||
    toNonEmptyText(candidate.transactionId);
  if (explicitTxId) {
    return {
      ...candidate,
      txId: explicitTxId,
      txid: explicitTxId
    };
  }

  for (const key of TX_RESULT_RAW_KEYS) {
    const txId = deriveTxIdFromRawPayload(candidate[key]);
    if (txId) {
      return {
        ...candidate,
        txId,
        txid: txId,
        txRaw: toNonEmptyText(candidate[key]) ?? undefined
      };
    }
  }

  for (const key of TX_RESULT_NESTED_KEYS) {
    const nestedPayload = candidate[key];
    const nested = normalizeTxResultPayload(nestedPayload, depth + 1);
    if (nested) {
      return {
        ...candidate,
        ...(nestedPayload && typeof nestedPayload === 'object'
          ? (nestedPayload as Record<string, unknown>)
          : {}),
        ...nested,
        txId: nested.txId,
        txid: nested.txid ?? nested.txId
      };
    }
  }

  return null;
};

const normalizeTxResult = (payload: unknown): WalletTxResult => {
  const normalized = normalizeTxResultPayload(payload);
  if (normalized) {
    return normalized;
  }
  throw new Error('Wallet response did not include a transaction id.');
};

const toLegacyContractCallOptions = (
  options: WalletContractCallOptions
): ContractCallOptions =>
  (options.sponsored === true
    ? { ...options, sponsored: true }
    : { ...options, sponsored: false }) as ContractCallOptions;

const toLegacyContractDeployOptions = (
  options: WalletContractDeployOptions
): ContractDeployOptions =>
  (options.sponsored === true
    ? { ...options, sponsored: true }
    : { ...options, sponsored: false }) as ContractDeployOptions;

const buildContractCallParams = (options: WalletContractCallOptions) => {
  const postConditions =
    options.postConditions && options.postConditions.length > 0
      ? options.postConditions.map((entry) =>
          normalizePostCondition(entry)
        )
      : undefined;

  return {
    contract: `${options.contractAddress}.${options.contractName}`,
    functionName: options.functionName,
    functionArgs: options.functionArgs.map((entry) => normalizeFunctionArg(entry)),
    network: normalizeNetwork(options.network),
    address: options.stxAddress,
    fee: normalizeBigIntLike(options.fee),
    nonce: normalizeBigIntLike(options.nonce),
    sponsored: options.sponsored ?? false,
    postConditionMode: normalizePostConditionMode(options.postConditionMode),
    postConditions
  };
};

const buildContractDeployParams = (options: WalletContractDeployOptions) => {
  const postConditions =
    options.postConditions && options.postConditions.length > 0
      ? options.postConditions.map((entry) =>
          normalizePostCondition(entry)
        )
      : undefined;

  return {
    name: options.contractName,
    clarityCode: options.codeBody,
    clarityVersion: options.clarityVersion,
    network: normalizeNetwork(options.network),
    address: options.stxAddress,
    fee: normalizeBigIntLike(options.fee),
    nonce: normalizeBigIntLike(options.nonce),
    sponsored: options.sponsored ?? false,
    postConditionMode: normalizePostConditionMode(options.postConditionMode),
    postConditions
  };
};

const requestLeatherContractCall = async (
  provider: StacksProvider,
  options: WalletContractCallOptions
) => {
  const response = await requestProvider(
    provider,
    'stx_callContract',
    buildContractCallParams(options)
  );
  return normalizeTxResult(response);
};

const requestLeatherContractDeploy = async (
  provider: StacksProvider,
  options: WalletContractDeployOptions
) => {
  const response = await requestProvider(
    provider,
    'stx_deployContract',
    buildContractDeployParams(options)
  );
  return normalizeTxResult(response);
};

const connectViaRequest = async (provider: StacksProvider) => {
  const attempts = [
    'stx_getAddresses',
    'getAddresses',
    'stx_getAccounts',
    'getAccounts',
    'wallet_getAccount',
    'wallet_connect',
    'stx_requestAccounts',
    'requestAccounts',
    'connect',
    'wallet_connect'
  ];

  let lastError: unknown = null;
  for (const method of attempts) {
    try {
      const response = await requestProvider(provider, method);
      const session = toWalletSession(response);
      if (session.isConnected) {
        return session;
      }
    } catch (error) {
      lastError = error;
      if (isUserCancelledError(error)) {
        return disconnectedSession();
      }
      if (isMethodUnsupportedError(error)) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return disconnectedSession();
};

const connectViaLegacyAuth = async (
  params: {
    appName: string;
    appIcon: string;
  },
  provider: StacksProvider
) => {
  const appConfig = new AppConfig(DEFAULT_SCOPES, undefined, '', MANIFEST_PATH);
  const userSession = new UserSession({ appConfig });

  return new Promise<WalletSession>((resolve) => {
    legacyShowConnect(
      {
        appDetails: {
          name: params.appName,
          icon: params.appIcon
        },
        manifestPath: MANIFEST_PATH,
        userSession,
        onFinish: (payload) => {
          resolve(deriveWalletSession(payload.userSession.loadUserData()));
        },
        onCancel: () => {
          resolve(disconnectedSession());
        }
      },
      provider
    );
  });
};

const selectProvider = (options?: {
  forceWalletSelect?: boolean;
  persistSelection?: boolean;
}) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve<StacksProvider | null>(null);
  }

  const forceWalletSelect = options?.forceWalletSelect ?? false;
  const persistSelection = options?.persistSelection ?? true;

  if (!forceWalletSelect) {
    const selectedProvider = getStacksProvider();
    if (selectedProvider) {
      return Promise.resolve(selectedProvider);
    }
  }

  defineCustomElements(window);

  return new Promise<StacksProvider | null>((resolve) => {
    const modal = document.createElement('connect-modal') as unknown as ConnectModalElement;
    const defaultProviders = DEFAULT_PROVIDERS as WebBTCProvider[];
    const installedProviders = getInstalledProviders(defaultProviders);
    const previousOverflow = document.body.style.overflow;

    const cleanup = () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      modal.remove();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      cleanup();
      resolve(null);
    };

    modal.defaultProviders = defaultProviders;
    modal.installedProviders = installedProviders;
    modal.persistSelection = persistSelection;
    modal.callback = (provider) => {
      cleanup();
      resolve(provider);
    };
    modal.cancelCallback = () => {
      cleanup();
      resolve(null);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(modal);
  });
};

export const isLeatherProviderId = (providerId: string | null | undefined) =>
  typeof providerId === 'string' && providerId.toLowerCase().includes('leather');

export const getStacksProvider = (): StacksProvider | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const selectedProviderId = getSelectedProviderId();
  const selectedProvider = selectedProviderId
    ? (getProviderFromId(selectedProviderId) as StacksProvider | undefined)
    : undefined;

  if (selectedProvider) {
    return selectedProvider;
  }

  const walletWindow = window as typeof window & {
    LeatherProvider?: StacksProvider;
    XverseProviders?: { StacksProvider?: StacksProvider };
    BlockstackProvider?: StacksProvider;
    StacksProvider?: StacksProvider;
  };

  return (
    walletWindow.LeatherProvider ??
    walletWindow.XverseProviders?.StacksProvider ??
    walletWindow.StacksProvider ??
    walletWindow.BlockstackProvider
  );
};

export const connectWallet = async (params: {
  appName: string;
  appIcon: string;
}): Promise<WalletSession> => {
  const provider = await selectProvider({ forceWalletSelect: true });
  if (!provider) {
    return disconnectedSession();
  }

  const providerId = getSelectedProviderId();
  if (isLeatherProviderId(providerId)) {
    try {
      return await connectViaRequest(provider);
    } catch (error) {
      if (!isMethodUnsupportedError(error)) {
        if (isUserCancelledError(error)) {
          return disconnectedSession();
        }
        throw error;
      }
    }
  }

  return connectViaLegacyAuth(params, provider);
};

export const disconnectWallet = async () => {
  const provider = getStacksProvider();
  if (provider && isLeatherProviderId(getSelectedProviderId())) {
    for (const method of [
      'stx_disconnect',
      'wallet_disconnect',
      'disconnect',
      'deactivate'
    ]) {
      try {
        await requestProvider(provider, method);
        break;
      } catch (error) {
        if (isUserCancelledError(error) || isMethodUnsupportedError(error)) {
          continue;
        }
      }
    }
  }

  disconnectLegacyProvider();
  clearSelectedProviderId();
};

export const showContractCall = (
  options: WalletContractCallOptions,
  provider?: StacksProvider
) => {
  const activeProvider = provider ?? getStacksProvider();
  const providerId = getSelectedProviderId();
  const legacyOptions = toLegacyContractCallOptions(options);

  if (!activeProvider || !isLeatherProviderId(providerId)) {
    return legacyShowContractCall(legacyOptions, provider);
  }

  return void requestLeatherContractCall(activeProvider, options)
    .then((payload) => {
      options.onFinish?.(payload);
    })
    .catch((error) => {
      if (isMethodUnsupportedError(error)) {
        legacyShowContractCall(legacyOptions, activeProvider);
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[wallet] contract call request failed', error);
      options.onCancel?.();
    });
};

export const showContractDeploy = (
  options: WalletContractDeployOptions,
  provider?: StacksProvider
) => {
  const activeProvider = provider ?? getStacksProvider();
  const providerId = getSelectedProviderId();
  const legacyOptions = toLegacyContractDeployOptions(options);

  if (!activeProvider || !isLeatherProviderId(providerId)) {
    return legacyShowContractDeploy(legacyOptions, provider);
  }

  return void requestLeatherContractDeploy(activeProvider, options)
    .then((payload) => {
      options.onFinish?.(payload);
    })
    .catch((error) => {
      if (isMethodUnsupportedError(error)) {
        legacyShowContractDeploy(legacyOptions, activeProvider);
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[wallet] contract deploy request failed', error);
      options.onCancel?.();
    });
};

export const __testing = {
  buildContractCallParams,
  buildContractDeployParams,
  extractStacksAddress,
  isMethodUnsupportedError,
  isUserCancelledError,
  normalizeNetwork,
  normalizeTxResultPayload,
  normalizeTxResult
};
