import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react';
import { showContractCall, showContractDeploy } from './lib/wallet/connect';
import { hexToBytes } from '@stacks/common';
import { useQueryClient } from '@tanstack/react-query';
import {
  BytesReader,
  deserializeCV,
  deserializePostCondition,
  FungibleConditionCode,
  makeContractSTXPostCondition,
  makeStandardSTXPostCondition,
  PostConditionMode,
  validateStacksAddress,
  type ClarityValue,
  type PostCondition
} from '@stacks/transactions';
import { getContractId } from './lib/contract/config';
import { CONTRACT_REGISTRY } from './lib/contract/registry';
import { createContractSelectionStore } from './lib/contract/selection';
import { createXtrataClient } from './lib/contract/client';
import {
  EMPTY_ADMIN_STATUS,
  useContractAdminStatus
} from './lib/contract/admin-status';
import { useBnsAddress } from './lib/bns/hooks';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getNetworkFromAddress, getNetworkMismatch } from './lib/network/guard';
import { getStacksExplorerContractUrl } from './lib/network/explorer';
import type { NetworkType } from './lib/network/types';
import { getViewerKey } from './lib/viewer/queries';
import { isRuntimeWalletBridgeTokenValid } from './lib/viewer/runtime-open';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { getWalletLookupState } from './lib/wallet/lookup';
import type { WalletSession } from './lib/wallet/types';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from './lib/theme/preferences';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import AddressLabel from './components/AddressLabel';
import WalletTopBar from './components/WalletTopBar';
import MintScreen from './screens/MintScreen';
import ViewerScreen, { type ViewerMode } from './screens/ViewerScreen';
import ContractAdminScreen from './screens/ContractAdminScreen';
import WalletLookupScreen from './screens/WalletLookupScreen';
import AdminDiagnosticsScreen from './screens/AdminDiagnosticsScreen';
import CampaignConsoleScreen from './screens/CampaignConsoleScreen';
import CollectionMintScreen from './screens/CollectionMintScreen';
import CollectionMintAdminScreen from './screens/CollectionMintAdminScreen';
import PreinscribedCollectionAdminScreen from './screens/PreinscribedCollectionAdminScreen';
import PreinscribedCollectionSaleScreen from './screens/PreinscribedCollectionSaleScreen';
import MarketScreen from './screens/MarketScreen';
import CommerceScreen from './screens/CommerceScreen';
import VaultScreen from './screens/VaultScreen';
import collectionMintTemplateSource from '../contracts/clarinet/contracts/xtrata-collection-mint-v1.4.clar?raw';
import {
  buildCollectionMintContractSource,
  COLLECTION_TEMPLATE_FIELD_KEYS,
  createCollectionTemplatePolicyStore,
  createDefaultCollectionTemplateDraft,
  createDefaultCollectionTemplatePolicy,
  type CollectionTemplateDraft,
  type CollectionTemplateFieldKey,
  type CollectionTemplatePolicy
} from './lib/deploy/collection-template';

const isV2Entry = (entry: { protocolVersion?: string; contractName?: string }) =>
  entry.protocolVersion === '2.1.0' ||
  entry.protocolVersion === '2.1.1' ||
  entry.contractName?.toLowerCase().includes('v2-1-0') === true ||
  entry.contractName?.toLowerCase().includes('v2-1-1') === true;

const SELECTABLE_CONTRACTS = CONTRACT_REGISTRY.filter(isV2Entry);
const ACTIVE_CONTRACTS =
  SELECTABLE_CONTRACTS.length > 0 ? SELECTABLE_CONTRACTS : CONTRACT_REGISTRY;
const contractSelectionStore = createContractSelectionStore(ACTIVE_CONTRACTS);
const ACTIVE_CONTRACT_IDS = new Set(
  ACTIVE_CONTRACTS.map((entry) => getContractId(entry))
);
const walletSessionStore = createWalletSessionStore();

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const TEMPLATE_GUIDE_PATH = 'docs/artist-guides/collection-template-deploy-guide.md';
type DeployMode = 'guided-template' | 'advanced-source';

const TEMPLATE_FIELD_LABELS: Record<CollectionTemplateFieldKey, string> = {
  coreContract: 'Core contract ID',
  defaultPaused: 'Default paused',
  defaultMintPriceStx: 'Default mint price (STX)',
  defaultMaxSupply: 'Default max supply',
  defaultAllowlistEnabled: 'Default allowlist enabled',
  defaultMaxPerWallet: 'Default max per wallet',
  reservationExpiryBlocks: 'Reservation expiry blocks',
  collectionName: 'Default collection name',
  collectionSymbol: 'Default collection symbol',
  collectionBaseUri: 'Default collection base URI',
  collectionDescription: 'Default collection description',
  defaultTokenUri: 'Default token URI'
};

const normalizeAddress = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
};

const addressesEqual = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight;
};
const SECTION_KEYS = [
  'wallet-lookup',
  'wallet-session',
  'active-contract',
  'deploy-contract',
  'contract-admin',
  'collection-mint-admin',
  'preinscribed-sale-admin',
  'preinscribed-sale',
  'admin-diagnostics',
  'campaign-console',
  'collection-mint',
  'mint',
  'collection-viewer',
  'market',
  'commerce',
  'vault'
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const buildCollapsedState = (collapsed: boolean) =>
  SECTION_KEYS.reduce(
    (acc, key) => {
      acc[key] = collapsed;
      return acc;
    },
    {} as Record<SectionKey, boolean>
  );

const normalizeContractName = (raw: string) => {
  const trimmed = raw.trim();
  const normalized = trimmed.replace(/\./g, '-');
  return {
    normalized,
    changed: normalized !== trimmed,
    valid: CONTRACT_NAME_PATTERN.test(normalized)
  };
};

const parseDeployContractName = (raw: string) => {
  const trimmed = raw.trim();
  const warnings: string[] = [];
  if (!trimmed) {
    return { name: null, address: null, reason: 'empty', warnings };
  }

  let address: string | null = null;
  let nameInput = trimmed;
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    const candidateAddress = parts[0]?.trim();
    if (candidateAddress && validateStacksAddress(candidateAddress)) {
      address = candidateAddress;
      nameInput = parts.slice(1).join('.').trim();
      if (!nameInput) {
        return { name: null, address, reason: 'missing-name', warnings };
      }
    }
  }

  const normalized = normalizeContractName(nameInput);
  if (normalized.changed) {
    warnings.push(`Normalized contract name: ${nameInput} -> ${normalized.normalized}`);
  }
  if (address) {
    warnings.push('Address prefix ignored; deployment uses the connected wallet.');
  }
  if (!normalized.valid) {
    return {
      name: null,
      address,
      reason: 'invalid-name',
      warnings,
      normalizedName: normalized.normalized
    };
  }

  return {
    name: normalized.normalized,
    address,
    reason: normalized.changed ? 'normalized-name' : 'name-only',
    warnings,
    normalizedName: normalized.normalized
  };
};

const RUNTIME_WALLET_BRIDGE_REQUEST_TYPE = 'xtrata:wallet:request';
const RUNTIME_WALLET_BRIDGE_RESPONSE_TYPE = 'xtrata:wallet:response';

const RUNTIME_WALLET_CONNECT_METHODS = new Set([
  'stx_requestAccounts',
  'requestAccounts',
  'stx_connect',
  'connect',
  'wallet_connect'
]);

const RUNTIME_WALLET_READ_METHODS = new Set([
  'stx_getAddresses',
  'getAddresses',
  'stx_getAccounts',
  'getAccounts',
  'wallet_getAccount'
]);

const RUNTIME_WALLET_NETWORK_METHODS = new Set(['stx_getNetwork', 'getNetwork']);

const RUNTIME_WALLET_DISCONNECT_METHODS = new Set([
  'stx_disconnect',
  'wallet_disconnect',
  'disconnect',
  'deactivate'
]);

const RUNTIME_WALLET_CONTRACT_CALL_METHODS = new Set([
  'stx_callContract',
  'stx_callContractV2'
]);

type RuntimeWalletBridgeRequestMessage = {
  type: string;
  requestId?: unknown;
  bridgeToken?: unknown;
  method?: unknown;
  params?: unknown;
};

type RuntimeWalletBridgeResponseMessage = {
  type: string;
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: {
    message: string;
    code?: number;
  };
};

type RuntimeWalletBridgeError = Error & { code?: number };

type RuntimeWalletContractCallRequest = {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  network: NetworkType;
  postConditionMode: PostConditionMode;
  postConditions?: PostCondition[];
};

const createRuntimeWalletBridgeError = (
  message: string,
  code?: number
): RuntimeWalletBridgeError => {
  const error = new Error(message) as RuntimeWalletBridgeError;
  if (typeof code === 'number') {
    error.code = code;
  }
  return error;
};

const normalizeRuntimeHex = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return `0x${trimmed.slice(2)}`;
  }
  return `0x${trimmed}`;
};

const normalizeRuntimeNetwork = (
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
  } else if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.network === 'string') {
      return normalizeRuntimeNetwork(candidate.network, fallback);
    }
    const api =
      (typeof candidate.coreApiUrl === 'string' && candidate.coreApiUrl) ||
      (typeof candidate.url === 'string' && candidate.url) ||
      '';
    if (api) {
      return normalizeRuntimeNetwork(api, fallback);
    }
  }
  return fallback;
};

const normalizeRuntimeUint = (value: unknown, label: string) => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw createRuntimeWalletBridgeError(`${label} must be an unsigned integer.`, -32602);
    }
    return value.toString(10);
  }
  const text = String(value ?? '').trim();
  if (!/^[0-9]+$/.test(text)) {
    throw createRuntimeWalletBridgeError(`${label} must be an unsigned integer.`, -32602);
  }
  return text.replace(/^0+(\d)/, '$1');
};

const normalizeRuntimeFungibleConditionCode = (value: unknown): FungibleConditionCode => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (
      value >= FungibleConditionCode.Equal &&
      value <= FungibleConditionCode.LessEqual
    ) {
      return value as FungibleConditionCode;
    }
  }

  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!text) {
    return FungibleConditionCode.LessEqual;
  }
  if (/^[0-9]+$/.test(text)) {
    return normalizeRuntimeFungibleConditionCode(Number.parseInt(text, 10));
  }
  if (text === 'equal' || text === 'eq') {
    return FungibleConditionCode.Equal;
  }
  if (text === 'greater' || text === 'gt') {
    return FungibleConditionCode.Greater;
  }
  if (
    text === 'greater_equal' ||
    text === 'greaterequal' ||
    text === 'gte'
  ) {
    return FungibleConditionCode.GreaterEqual;
  }
  if (text === 'less' || text === 'lt') {
    return FungibleConditionCode.Less;
  }
  if (text === 'less_equal' || text === 'lessequal' || text === 'lte') {
    return FungibleConditionCode.LessEqual;
  }

  throw createRuntimeWalletBridgeError('Unsupported post condition code.', -32602);
};

const parseRuntimeContractIdentifier = (value: string) => {
  const trimmed = value.trim();
  const separator = trimmed.indexOf('.');
  if (separator <= 0 || separator >= trimmed.length - 1) {
    return null;
  }
  return {
    contractAddress: trimmed.slice(0, separator).trim(),
    contractName: trimmed.slice(separator + 1).trim()
  };
};

const parseRuntimePostCondition = (value: unknown): PostCondition => {
  if (typeof value === 'string') {
    try {
      const bytes = hexToBytes(normalizeRuntimeHex(value));
      return deserializePostCondition(new BytesReader(bytes));
    } catch (error) {
      throw createRuntimeWalletBridgeError(
        'Post condition hex payload is invalid.',
        -32602
      );
    }
  }

  if (!value || typeof value !== 'object') {
    throw createRuntimeWalletBridgeError('Unsupported post condition payload.', -32602);
  }

  const payload = value as Record<string, unknown>;
  const type = String(payload.type ?? '').toLowerCase();
  if (type && type !== 'stx') {
    throw createRuntimeWalletBridgeError('Only STX post conditions are supported.', -32602);
  }

  const principal = String(payload.principal ?? payload.address ?? '').trim();
  if (!principal) {
    throw createRuntimeWalletBridgeError('Post condition principal is required.', -32602);
  }

  const amount = BigInt(normalizeRuntimeUint(payload.amount, 'Post condition amount'));
  const conditionCode = normalizeRuntimeFungibleConditionCode(
    payload.conditionCode ?? payload.condition
  );

  const contractPrincipal = parseRuntimeContractIdentifier(principal);
  if (contractPrincipal) {
    return makeContractSTXPostCondition(
      contractPrincipal.contractAddress,
      contractPrincipal.contractName,
      conditionCode,
      amount
    );
  }
  if (!validateStacksAddress(principal)) {
    throw createRuntimeWalletBridgeError('Post condition principal is invalid.', -32602);
  }
  return makeStandardSTXPostCondition(principal, conditionCode, amount);
};

const parseRuntimePostConditions = (value: unknown): PostCondition[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map((entry) => parseRuntimePostCondition(entry));
};

const parseRuntimeFunctionArgs = (value: unknown): ClarityValue[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw createRuntimeWalletBridgeError(
        `Contract call argument #${index + 1} must be a Clarity hex string.`,
        -32602
      );
    }
    try {
      return deserializeCV(normalizeRuntimeHex(entry));
    } catch (error) {
      throw createRuntimeWalletBridgeError(
        `Contract call argument #${index + 1} is not valid Clarity hex.`,
        -32602
      );
    }
  });
};

const parseRuntimePostConditionMode = (value: unknown): PostConditionMode => {
  if (value === PostConditionMode.Allow || value === PostConditionMode.Deny) {
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value === PostConditionMode.Allow || value === PostConditionMode.Deny) {
      return value;
    }
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'allow') {
      return PostConditionMode.Allow;
    }
    if (lower === 'deny') {
      return PostConditionMode.Deny;
    }
  }
  return PostConditionMode.Allow;
};

const parseRuntimeContractCallRequest = (
  params: unknown,
  fallbackNetwork: NetworkType
): RuntimeWalletContractCallRequest => {
  const payload = Array.isArray(params) ? params[0] : params;
  if (!payload || typeof payload !== 'object') {
    throw createRuntimeWalletBridgeError('Contract call params are missing.', -32602);
  }

  const record = payload as Record<string, unknown>;
  let contractAddress = String(record.contractAddress ?? '').trim();
  let contractName = String(record.contractName ?? '').trim();

  if ((!contractAddress || !contractName) && typeof record.contract === 'string') {
    const parsedContract = parseRuntimeContractIdentifier(record.contract);
    if (parsedContract) {
      contractAddress = parsedContract.contractAddress;
      contractName = parsedContract.contractName;
    }
  }

  if (!validateStacksAddress(contractAddress)) {
    throw createRuntimeWalletBridgeError('Contract address is invalid.', -32602);
  }
  if (!contractName) {
    throw createRuntimeWalletBridgeError('Contract name is required.', -32602);
  }

  const functionName = String(record.functionName ?? '').trim();
  if (!functionName) {
    throw createRuntimeWalletBridgeError('Function name is required.', -32602);
  }

  return {
    contractAddress,
    contractName,
    functionName,
    functionArgs: parseRuntimeFunctionArgs(record.functionArgs),
    network: normalizeRuntimeNetwork(record.network, fallbackNetwork),
    postConditionMode: parseRuntimePostConditionMode(record.postConditionMode),
    postConditions: parseRuntimePostConditions(record.postConditions)
  };
};

const toRuntimeWalletSessionResponse = (
  session: WalletSession,
  fallbackNetwork: NetworkType
) => {
  if (!session.isConnected || !session.address) {
    return {
      addresses: [],
      accounts: [],
      network: fallbackNetwork
    };
  }

  const network =
    session.network ??
    getNetworkFromAddress(session.address) ??
    fallbackNetwork;
  const stxAddress = network === 'testnet'
    ? { testnet: session.address }
    : { mainnet: session.address };

  return {
    address: session.address,
    selectedAddress: session.address,
    identityAddress: session.address,
    addresses: [session.address],
    accounts: [session.address],
    stxAddress,
    network
  };
};

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialTheme()
  );
  const [selectedContract, setSelectedContract] = useState(() =>
    contractSelectionStore.load()
  );
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [deployMode, setDeployMode] = useState<DeployMode>('guided-template');
  const [deployName, setDeployName] = useState('');
  const [deploySource, setDeploySource] = useState('');
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployPending, setDeployPending] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [templatePolicyStatus, setTemplatePolicyStatus] = useState<string | null>(
    null
  );
  const [walletPending, setWalletPending] = useState(false);
  const [viewerFocusKey, setViewerFocusKey] = useState<number | null>(null);
  const [parentDraftIds, setParentDraftIds] = useState<bigint[]>([]);
  const [walletLookupInput, setWalletLookupInput] = useState('');
  const [walletLookupTouched, setWalletLookupTouched] = useState(false);
  const [collectionAdminPrefill, setCollectionAdminPrefill] = useState<{
    key: number;
    contractAddress: string | null;
    contractName: string;
  } | null>(null);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('collection');
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const initial = buildCollapsedState(true);
    initial['collection-viewer'] = false;
    return initial;
  });
  const tabGuard = useActiveTabGuard();
  const [templatePolicy, setTemplatePolicy] = useState<CollectionTemplatePolicy>(
    () => createDefaultCollectionTemplatePolicy(getContractId(selectedContract))
  );
  const [templateDraft, setTemplateDraft] = useState<CollectionTemplateDraft>(() =>
    createDefaultCollectionTemplateDraft(getContractId(selectedContract))
  );

  const queryClient = useQueryClient();

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'xtrata v15.1',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const hasHiroApiKey =
    typeof __XSTRATA_HAS_HIRO_KEY__ !== 'undefined' &&
    __XSTRATA_HAS_HIRO_KEY__;
  const mismatch = getNetworkMismatch(
    selectedContract.network,
    walletSession.network
  );
  const contractId = getContractId(selectedContract);
  const contractExplorerUrl = useMemo(
    () => getStacksExplorerContractUrl(contractId, selectedContract.network),
    [contractId, selectedContract.network]
  );
  const readOnlySender =
    walletSession.address ?? selectedContract.address;
  const templatePolicyStore = useMemo(
    () => createCollectionTemplatePolicyStore(contractId),
    [contractId]
  );
  const coreAdminClient = useMemo(
    () => createXtrataClient({ contract: selectedContract }),
    [selectedContract]
  );
  const coreAdminStatusQuery = useContractAdminStatus({
    client: coreAdminClient,
    senderAddress: readOnlySender
  });
  const coreAdminStatus = coreAdminStatusQuery.data ?? EMPTY_ADMIN_STATUS;
  const canManageTemplatePolicy =
    !!walletSession.address &&
    !mismatch &&
    addressesEqual(coreAdminStatus.admin, walletSession.address);
  const templateBuild = useMemo(
    () =>
      buildCollectionMintContractSource({
        templateSource: collectionMintTemplateSource,
        draft: templateDraft,
        policy: templatePolicy,
        fallbackCoreContractId: contractId
      }),
    [contractId, templateDraft, templatePolicy]
  );
  const baseLookupState = useMemo(
    () => getWalletLookupState(walletLookupInput, walletSession.address ?? null),
    [walletLookupInput, walletSession.address]
  );
  const bnsLookupQuery = useBnsAddress({
    name: baseLookupState.lookupName,
    network: selectedContract.network,
    enabled: !!baseLookupState.lookupName
  });
  const bnsLookupStatus = baseLookupState.lookupName
    ? bnsLookupQuery.isLoading
      ? 'loading'
      : bnsLookupQuery.isError
        ? 'error'
        : bnsLookupQuery.data?.address
          ? 'resolved'
          : 'missing'
    : 'idle';
  const bnsLookupError =
    bnsLookupQuery.error instanceof Error ? bnsLookupQuery.error.message : null;
  const walletLookupState = useMemo(
    () =>
      getWalletLookupState(walletLookupInput, walletSession.address ?? null, {
        resolvedNameAddress: bnsLookupQuery.data?.address ?? null,
        bnsStatus: bnsLookupStatus,
        bnsError: bnsLookupError
      }),
    [
      walletLookupInput,
      walletSession.address,
      bnsLookupQuery.data?.address,
      bnsLookupStatus,
      bnsLookupError
    ]
  );
  const compatibleContract = walletSession.network
    ? ACTIVE_CONTRACTS.find((entry) => entry.network === walletSession.network)
    : null;

  const handleContractChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    const next =
      ACTIVE_CONTRACTS.find((entry) => getContractId(entry) === nextId) ??
      ACTIVE_CONTRACTS[0];
    setSelectedContract(next);
    contractSelectionStore.save(next);
  };

  const handleAddParentDraft = (id: bigint) => {
    setParentDraftIds((current) => {
      if (current.some((value) => value === id)) {
        return current;
      }
      const next = [...current, id];
      next.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return next;
    });
  };

  const handleClearParentDrafts = () => {
    setParentDraftIds([]);
  };

  const handleResolveMismatch = async () => {
    if (compatibleContract) {
      setSelectedContract(compatibleContract);
      contractSelectionStore.save(compatibleContract);
      return;
    }
    setWalletPending(true);
    try {
      await walletAdapter.disconnect();
    } finally {
      setWalletSession(walletAdapter.getSession());
      setWalletPending(false);
    }
  };

  useEffect(() => {
    setParentDraftIds([]);
  }, [contractId]);

  useEffect(() => {
    const loaded = templatePolicyStore.load();
    const base =
      loaded ?? createDefaultCollectionTemplatePolicy(contractId);
    const nextPolicy = {
      ...base,
      defaults: {
        ...base.defaults,
        coreContract: base.defaults.coreContract || contractId
      }
    };
    setTemplatePolicy(nextPolicy);
    setTemplateDraft(nextPolicy.defaults);
    setTemplatePolicyStatus(null);
  }, [contractId, templatePolicyStore]);
  const walletStatus = walletSession.isConnected ? 'Connected' : 'Disconnected';
  const walletNetwork = walletSession.network ?? 'unknown';
  const showRateLimitWarning = rateLimitWarning && !hasHiroApiKey;
  const deployNetwork = walletSession.network ?? selectedContract.network;

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCollapseAll = () => {
    setCollapsedSections(buildCollapsedState(true));
  };

  const handleExpandAll = () => {
    setCollapsedSections(buildCollapsedState(false));
  };

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTheme = coerceThemeMode(event.target.value);
    setThemeMode(nextTheme);
    applyThemeToDocument(nextTheme);
    writeThemePreference(nextTheme);
  };

  const handleNavJump = (
    event: MouseEvent<HTMLAnchorElement>,
    key: SectionKey
  ) => {
    event.preventDefault();
    setCollapsedSections((prev) => ({ ...prev, [key]: false }));
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const anchor = document.getElementById(key);
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        window.history.replaceState(null, '', `#${key}`);
      });
    }
  };

  useEffect(() => {
    if (hasHiroApiKey) {
      return;
    }
    const handler = () => {
      setRateLimitWarning(true);
    };
    window.addEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    return () => {
      window.removeEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    };
  }, [hasHiroApiKey]);

  useEffect(() => {
    const currentId = getContractId(selectedContract);
    if (ACTIVE_CONTRACT_IDS.has(currentId)) {
      return;
    }
    const next = ACTIVE_CONTRACTS[0];
    if (!next) {
      return;
    }
    setSelectedContract(next);
    contractSelectionStore.save(next);
  }, [selectedContract]);

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleRuntimeWalletBridgeRequest = (
      event: MessageEvent<RuntimeWalletBridgeRequestMessage>
    ) => {
      const payload = event.data;
      if (
        !payload ||
        typeof payload !== 'object' ||
        payload.type !== RUNTIME_WALLET_BRIDGE_REQUEST_TYPE
      ) {
        return;
      }

      const requestId =
        typeof payload.requestId === 'string' ? payload.requestId.trim() : '';

      const sendResponse = (response: RuntimeWalletBridgeResponseMessage) => {
        const target = event.source;
        if (!target || typeof (target as Window).postMessage !== 'function') {
          return;
        }
        const targetOrigin =
          event.origin && event.origin !== 'null' ? event.origin : '*';
        (target as Window).postMessage(response, targetOrigin);
      };

      if (!requestId) {
        sendResponse({
          type: RUNTIME_WALLET_BRIDGE_RESPONSE_TYPE,
          requestId: 'unknown',
          ok: false,
          error: { message: 'Missing runtime wallet bridge request id.', code: -32600 }
        });
        return;
      }

      if (event.origin !== window.location.origin) {
        sendResponse({
          type: RUNTIME_WALLET_BRIDGE_RESPONSE_TYPE,
          requestId,
          ok: false,
          error: {
            message: `Runtime wallet bridge origin mismatch (${event.origin}).`,
            code: -32600
          }
        });
        return;
      }

      const bridgeToken =
        typeof payload.bridgeToken === 'string' ? payload.bridgeToken : '';
      const tokenStorage =
        typeof window.sessionStorage === 'undefined'
          ? null
          : window.sessionStorage;
      if (!isRuntimeWalletBridgeTokenValid(tokenStorage, bridgeToken)) {
        sendResponse({
          type: RUNTIME_WALLET_BRIDGE_RESPONSE_TYPE,
          requestId,
          ok: false,
          error: {
            message: 'Runtime wallet bridge token is missing or expired.',
            code: -32600
          }
        });
        return;
      }

      const method = typeof payload.method === 'string' ? payload.method.trim() : '';
      if (!method) {
        sendResponse({
          type: RUNTIME_WALLET_BRIDGE_RESPONSE_TYPE,
          requestId,
          ok: false,
          error: { message: 'Runtime wallet bridge method is required.', code: -32600 }
        });
        return;
      }

      const resolveResponse = async () => {
        const fallbackNetwork = selectedContract.network;

        if (RUNTIME_WALLET_READ_METHODS.has(method)) {
          return toRuntimeWalletSessionResponse(
            walletAdapter.getSession(),
            fallbackNetwork
          );
        }

        if (RUNTIME_WALLET_NETWORK_METHODS.has(method)) {
          const session = walletAdapter.getSession();
          return {
            network:
              session.network ??
              (session.address
                ? getNetworkFromAddress(session.address) ?? fallbackNetwork
                : fallbackNetwork)
          };
        }

        if (RUNTIME_WALLET_DISCONNECT_METHODS.has(method)) {
          await walletAdapter.disconnect();
          const session = walletAdapter.getSession();
          setWalletSession(session);
          return {
            ok: true,
            ...toRuntimeWalletSessionResponse(session, fallbackNetwork)
          };
        }

        if (RUNTIME_WALLET_CONNECT_METHODS.has(method)) {
          const priorSession = walletAdapter.getSession();
          const session = await walletAdapter.connect();
          setWalletSession(session);
          if (!session.isConnected && !priorSession.isConnected) {
            throw createRuntimeWalletBridgeError(
              'Wallet connection was cancelled by the user.',
              4001
            );
          }
          return toRuntimeWalletSessionResponse(session, fallbackNetwork);
        }

        if (RUNTIME_WALLET_CONTRACT_CALL_METHODS.has(method)) {
          const request = parseRuntimeContractCallRequest(
            payload.params,
            fallbackNetwork
          );
          let session = walletAdapter.getSession();
          const wasConnected = session.isConnected;
          if (!session.isConnected) {
            session = await walletAdapter.connect();
            setWalletSession(session);
          }
          if (!session.isConnected || !session.address) {
            throw createRuntimeWalletBridgeError(
              wasConnected
                ? 'Wallet session is unavailable for contract call.'
                : 'Wallet transaction was cancelled by the user.',
              4001
            );
          }
          if (session.network && request.network !== session.network) {
            throw createRuntimeWalletBridgeError(
              `Wallet network mismatch: wallet=${session.network}, request=${request.network}.`,
              -32602
            );
          }
          return await new Promise((resolve, reject) => {
            showContractCall({
              contractAddress: request.contractAddress,
              contractName: request.contractName,
              functionName: request.functionName,
              functionArgs: request.functionArgs,
              network: request.network,
              stxAddress: session.address,
              postConditionMode: request.postConditionMode,
              postConditions: request.postConditions,
              onFinish: (result) => resolve(result),
              onCancel: () =>
                reject(
                  createRuntimeWalletBridgeError(
                    'Wallet transaction was cancelled by the user.',
                    4001
                  )
                )
            });
          });
        }

        throw createRuntimeWalletBridgeError(
          `Runtime wallet bridge method is unsupported: ${method}.`,
          -32601
        );
      };

      void resolveResponse()
        .then((result) => {
          sendResponse({
            type: RUNTIME_WALLET_BRIDGE_RESPONSE_TYPE,
            requestId,
            ok: true,
            result
          });
        })
        .catch((error) => {
          const bridgeError = error as RuntimeWalletBridgeError;
          sendResponse({
            type: RUNTIME_WALLET_BRIDGE_RESPONSE_TYPE,
            requestId,
            ok: false,
            error: {
              message:
                bridgeError instanceof Error
                  ? bridgeError.message
                  : String(bridgeError),
              code:
                typeof bridgeError?.code === 'number'
                  ? bridgeError.code
                  : undefined
            }
          });
        });
    };

    window.addEventListener('message', handleRuntimeWalletBridgeRequest);
    return () => {
      window.removeEventListener('message', handleRuntimeWalletBridgeRequest);
    };
  }, [walletAdapter, selectedContract.network]);

  const handleConnectWallet = async () => {
    setWalletPending(true);
    const session = await walletAdapter.connect();
    setWalletSession(session);
    setWalletPending(false);
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    await walletAdapter.disconnect();
    setWalletSession(walletAdapter.getSession());
    setWalletPending(false);
  };

  const handleWalletLookupSearch = () => {
    setViewerMode('wallet');
    setCollapsedSections((prev) => ({ ...prev, 'collection-viewer': false }));
    const anchor = document.getElementById('collection-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleClearWalletLookup = () => {
    setWalletLookupInput('');
    setWalletLookupTouched(false);
  };

  const appendDeployLog = (message: string) => {
    setDeployLog((prev) => {
      const next = [...prev, message];
      return next.slice(-20);
    });
    // eslint-disable-next-line no-console
    console.log(`[deploy] ${message}`);
  };

  const isTemplateFieldEditable = (field: CollectionTemplateFieldKey) =>
    !templatePolicy.locked || templatePolicy.editableFields[field];

  const setTemplateField = <K extends CollectionTemplateFieldKey>(
    key: K,
    value: CollectionTemplateDraft[K]
  ) => {
    if (!isTemplateFieldEditable(key)) {
      return;
    }
    setTemplateDraft((prev) => ({ ...prev, [key]: value }));
    setDeployStatus(null);
  };

  const saveTemplatePolicy = (next: CollectionTemplatePolicy) => {
    const payload = {
      ...next,
      updatedAt: new Date().toISOString()
    };
    templatePolicyStore.save(payload);
    setTemplatePolicy(payload);
    setTemplatePolicyStatus('Template policy saved.');
  };

  const resetTemplatePolicy = () => {
    templatePolicyStore.reset();
    const next = createDefaultCollectionTemplatePolicy(contractId);
    setTemplatePolicy(next);
    setTemplateDraft(next.defaults);
    setTemplatePolicyStatus('Template policy reset to defaults.');
  };

  const applyCurrentDraftAsPolicyDefaults = () => {
    const next = {
      ...templatePolicy,
      defaults: {
        ...templateDraft,
        coreContract: templateDraft.coreContract.trim() || contractId
      }
    };
    saveTemplatePolicy(next);
    setTemplateDraft(next.defaults);
    setTemplatePolicyStatus('Policy defaults updated from current template values.');
  };

  const handleDeployContract = () => {
    const source = deploySource.trim();
    if (!source) {
      setDeployStatus('Paste the Clarity contract source before deploying.');
      appendDeployLog('Deploy blocked: missing source.');
      return;
    }
    const parsed = parseDeployContractName(deployName);
    if (parsed.warnings.length > 0) {
      parsed.warnings.forEach((warning) => appendDeployLog(warning));
    }
    if (!parsed.name) {
      setDeployStatus(
        'Contract name must use letters, numbers, hyphens/underscores, and no dots.'
      );
      appendDeployLog(
        `Deploy blocked: invalid name (${parsed.reason ?? 'unknown'}).`
      );
      if (parsed.normalizedName && !parsed.address) {
        setDeployName(parsed.normalizedName);
      }
      return;
    }
    if (parsed.normalizedName && !parsed.address) {
      setDeployName(parsed.normalizedName);
    }

    setDeployPending(true);
    setDeployStatus('Waiting for wallet confirmation...');
    appendDeployLog(`Deploying ${parsed.name} (${parsed.reason}) on ${deployNetwork}.`);
    appendDeployLog(`Source length: ${source.length} chars.`);

    try {
      showContractDeploy({
        contractName: parsed.name,
        codeBody: source,
        network: deployNetwork,
        onFinish: (payload) => {
          setDeployPending(false);
          setDeployStatus(`Deployment submitted: ${payload.txId}`);
          appendDeployLog(`Deployment submitted. txId=${payload.txId}`);
        },
        onCancel: () => {
          setDeployPending(false);
          setDeployStatus('Deployment cancelled or failed in wallet.');
          appendDeployLog('Deployment cancelled or failed in wallet.');
        }
      });
      appendDeployLog('Wallet prompt opened.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeployPending(false);
      setDeployStatus(`Deployment failed: ${message}`);
      appendDeployLog(`Deployment failed: ${message}`);
    }
  };

  const handleInscriptionSealed = (payload: { txId: string }) => {
    setViewerFocusKey((prev) => (prev ?? 0) + 1);
    setViewerMode('collection');
    queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    const anchor = document.getElementById('collection-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line no-console
    console.log(`[mint] Seal submitted, txId=${payload.txId}`);
  };

  return (
    <div className="app">
      <header className="app__header">
        <span className="eyebrow">Contract-driven UI rebuild</span>
        <div className="app__header-row">
          <h1>xtrata v15.1</h1>
          <div className="app__toolbar app__toolbar--admin">
            <div className="app__admin-nav-groups" aria-label="Admin section navigation">
              <section className="app__admin-nav-group app__admin-nav-group--user-tools">
                <p className="app__admin-nav-title">User Tools</p>
                <div className="app__admin-nav-links">
                  <a
                    className="button button--ghost app__nav-link"
                    href="#wallet-lookup"
                    onClick={(event) => handleNavJump(event, 'wallet-lookup')}
                  >
                    Wallet lookup
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#wallet-session"
                    onClick={(event) => handleNavJump(event, 'wallet-session')}
                  >
                    Wallet session
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#active-contract"
                    onClick={(event) => handleNavJump(event, 'active-contract')}
                  >
                    Active contract
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#collection-viewer"
                    onClick={(event) => handleNavJump(event, 'collection-viewer')}
                  >
                    Viewer
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#market"
                    onClick={(event) => handleNavJump(event, 'market')}
                  >
                    Market
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#commerce"
                    onClick={(event) => handleNavJump(event, 'commerce')}
                  >
                    Commerce
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#vault"
                    onClick={(event) => handleNavJump(event, 'vault')}
                  >
                    Vault
                  </a>
                </div>
              </section>

              <section className="app__admin-nav-group app__admin-nav-group--minting">
                <p className="app__admin-nav-title">Minting</p>
                <div className="app__admin-nav-links">
                  <a
                    className="button button--ghost app__nav-link"
                    href="#collection-mint"
                    onClick={(event) => handleNavJump(event, 'collection-mint')}
                  >
                    Batch mint
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#mint"
                    onClick={(event) => handleNavJump(event, 'mint')}
                  >
                    Mint
                  </a>
                </div>
              </section>

              <section className="app__admin-nav-group app__admin-nav-group--controls">
                <p className="app__admin-nav-title">Admin Controls</p>
                <div className="app__admin-nav-links">
                  <a
                    className="button button--ghost app__nav-link"
                    href="#deploy-contract"
                    onClick={(event) => handleNavJump(event, 'deploy-contract')}
                  >
                    Deploy
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#contract-admin"
                    onClick={(event) => handleNavJump(event, 'contract-admin')}
                  >
                    Contract admin
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#collection-mint-admin"
                    onClick={(event) => handleNavJump(event, 'collection-mint-admin')}
                  >
                    Collection mint admin
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#preinscribed-sale-admin"
                    onClick={(event) => handleNavJump(event, 'preinscribed-sale-admin')}
                  >
                    Pre-inscribed sale admin
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#preinscribed-sale"
                    onClick={(event) => handleNavJump(event, 'preinscribed-sale')}
                  >
                    Pre-inscribed sale buyer
                  </a>
                </div>
              </section>

              <section className="app__admin-nav-group app__admin-nav-group--ops">
                <p className="app__admin-nav-title">Ops and Insights</p>
                <div className="app__admin-nav-links">
                  <a
                    className="button button--ghost app__nav-link"
                    href="#admin-diagnostics"
                    onClick={(event) => handleNavJump(event, 'admin-diagnostics')}
                  >
                    Diagnostics
                  </a>
                  <a
                    className="button button--ghost app__nav-link"
                    href="#campaign-console"
                    onClick={(event) => handleNavJump(event, 'campaign-console')}
                  >
                    Campaign console
                  </a>
                </div>
              </section>
            </div>
            <div className="app__controls">
              <div className="app__controls-group">
                <label className="theme-select" htmlFor="admin-theme-select">
                  <span className="theme-select__label">Theme</span>
                  <select
                    id="admin-theme-select"
                    className="theme-select__control"
                    value={themeMode}
                    onChange={handleThemeChange}
                    onInput={handleThemeChange}
                  >
                    {THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleCollapseAll}
                >
                  Collapse all
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleExpandAll}
                >
                  Expand all
                </button>
              </div>
            </div>
          </div>
        </div>
        <p className="meta-value">
          Logged in as:{' '}
          <AddressLabel
            className="meta-value"
            address={walletSession.address}
            network={walletSession.network}
            fallback="Not connected"
          />
        </p>
        <p>
          Select the deployed contract and keep the UI aligned with the wallet
          network.
        </p>
        <WalletTopBar
          walletSession={walletSession}
          walletPending={walletPending}
          onConnect={handleConnectWallet}
          onDisconnect={handleDisconnectWallet}
        />
      </header>
      {!tabGuard.isActive && (
        <div className="app__notice">
          <div className="alert">
            <div>
              <strong>Another xtrata tab is active.</strong> This tab is paused
              to avoid loading conflicts.
            </div>
            <button
              className="button"
              type="button"
              onClick={tabGuard.takeControl}
            >
              Make this tab active
            </button>
          </div>
        </div>
      )}
      <main className="app__main">
        <div className="app__modules app__modules--compact">
          <WalletLookupScreen
            walletSession={walletSession}
            lookupState={walletLookupState}
            lookupTouched={walletLookupTouched}
            onLookupTouched={setWalletLookupTouched}
            onLookupInputChange={setWalletLookupInput}
            onSearch={handleWalletLookupSearch}
            collapsed={collapsedSections['wallet-lookup']}
            onToggleCollapse={() => toggleSection('wallet-lookup')}
          />

          <section
            className={`panel app-section panel--compact wallet-session-panel${collapsedSections['wallet-session'] ? ' panel--collapsed' : ''}`}
            id="wallet-session"
          >
            <div className="panel__header">
              <div>
                <h2>Wallet</h2>
                <AddressLabel
                  className="wallet-session__inline-address"
                  address={walletSession.address}
                  network={walletSession.network}
                  fallback="Not connected"
                />
              </div>
              <div className="panel__actions">
                <span className="badge badge--neutral">{walletStatus}</span>
                {walletSession.isConnected ? (
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={handleDisconnectWallet}
                    disabled={walletPending}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    className="button"
                    type="button"
                    onClick={handleConnectWallet}
                    disabled={walletPending}
                  >
                    Connect wallet
                  </button>
                )}
                <button
                  className="button button--ghost button--collapse"
                  type="button"
                  onClick={() => toggleSection('wallet-session')}
                  aria-expanded={!collapsedSections['wallet-session']}
                >
                  {collapsedSections['wallet-session'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Address</span>
                  <AddressLabel
                    className="meta-value"
                    address={walletSession.address}
                    network={walletSession.network}
                    fallback="Not connected"
                  />
                </div>
                <div>
                  <span className="meta-label">Wallet network</span>
                  <span className="meta-value">{walletNetwork}</span>
                </div>
              </div>
              {mismatch && (
                <div className="alert">
                  <div>
                    <strong>Network mismatch.</strong> Wallet is on{' '}
                    {mismatch.actual}, contract is {mismatch.expected}.
                  </div>
                  <button
                    className="button"
                    onClick={handleResolveMismatch}
                    disabled={walletPending}
                  >
                    {compatibleContract
                      ? `Switch to ${compatibleContract.label}`
                      : 'Disconnect wallet'}
                  </button>
                </div>
              )}
              {showRateLimitWarning && (
                <div className="alert">
                  <div>
                    <strong>Rate limit detected.</strong> No Hiro API key is
                    configured for the dev proxy. Set HIRO_API_KEYS (or
                    HIRO_API_KEY) in .env.local and restart the dev server.
                  </div>
                  <button
                    className="button button--ghost"
                    onClick={() => setRateLimitWarning(false)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </section>

        <section
          className={`panel app-section panel--compact${collapsedSections['active-contract'] !== false ? ' panel--collapsed' : ''}`}
          id="active-contract"
        >
            <div className="panel__header">
              <div>
                <h2>Active contract</h2>
                <p>Choose which deployed contract the UI targets.</p>
              </div>
              <div className="panel__actions">
                <span className={`badge badge--${selectedContract.network}`}>
                  {selectedContract.network}
                </span>
                <button
                  className="button button--ghost button--collapse"
                  type="button"
                  onClick={() => toggleSection('active-contract')}
                  aria-expanded={!collapsedSections['active-contract']}
                >
                  {collapsedSections['active-contract'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <label className="field">
                <span className="field__label">Contract registry</span>
                <select
                  className="select"
                  value={contractId}
                  onChange={handleContractChange}
                >
                  {ACTIVE_CONTRACTS.map((entry) => {
                    const id = getContractId(entry);
                    return (
                      <option key={id} value={id}>
                        {entry.label}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Contract ID</span>
                  {contractExplorerUrl ? (
                    <a
                      className="meta-value active-contract__link"
                      href={contractExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {contractId}
                    </a>
                  ) : (
                    <span className="meta-value">{contractId}</span>
                  )}
                </div>
                <div>
                  <span className="meta-label">Network</span>
                  <span className="meta-value">{selectedContract.network}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <ViewerScreen
          contract={selectedContract}
          senderAddress={readOnlySender}
          walletSession={walletSession}
          walletLookupState={walletLookupState}
          focusKey={viewerFocusKey ?? undefined}
          collapsed={collapsedSections['collection-viewer']}
          onToggleCollapse={() => toggleSection('collection-viewer')}
          isActiveTab={tabGuard.isActive}
          mode={viewerMode}
          onModeChange={setViewerMode}
          onClearWalletLookup={handleClearWalletLookup}
          onAddParentDraft={handleAddParentDraft}
          modeLabels={{ collection: 'Chain', wallet: 'Wallet' }}
          viewerTitles={{ collection: 'Chain viewer', wallet: 'Wallet viewer' }}
        />

        <MarketScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections.market}
          onToggleCollapse={() => toggleSection('market')}
        />

        <CommerceScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['commerce']}
          onToggleCollapse={() => toggleSection('commerce')}
        />

        <VaultScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['vault']}
          onToggleCollapse={() => toggleSection('vault')}
        />

        <section
          className={`panel app-section${collapsedSections['deploy-contract'] ? ' panel--collapsed' : ''}`}
          id="deploy-contract"
        >
          <div className="panel__header">
            <div>
              <h2>Deploy contract</h2>
              <p>Paste the Clarity source and deploy via your wallet.</p>
            </div>
            <div className="panel__actions">
              <span className={`badge badge--${deployNetwork}`}>
                {deployNetwork}
              </span>
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => toggleSection('deploy-contract')}
                aria-expanded={!collapsedSections['deploy-contract']}
              >
                {collapsedSections['deploy-contract'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <label className="field">
              <span className="field__label">Contract name</span>
              <input
                className="input"
                placeholder="xtrata-v2-1-0"
                value={deployName}
                onChange={(event) => {
                  setDeployName(event.target.value);
                  setDeployStatus(null);
                }}
              />
            </label>
            <label className="field">
              <span className="field__label">Contract source (Clarity)</span>
              <textarea
                className="textarea"
                placeholder="Paste the full Clarity contract source here."
                value={deploySource}
                onChange={(event) => {
                  setDeploySource(event.target.value);
                  setDeployStatus(null);
                }}
              />
            </label>
            <p>
              Deployment uses the connected wallet network when available; if no
              wallet is connected, the selected contract network is used.
            </p>
            <div className="deploy-actions">
              <button
                className="button"
                type="button"
                onClick={handleDeployContract}
                disabled={deployPending}
              >
                {deployPending ? 'Deploying...' : 'Deploy contract'}
              </button>
            </div>
            {deployStatus && <p>{deployStatus}</p>}
            {deployLog.length > 0 && (
              <div className="deploy-log">
                {deployLog.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="deploy-log__item">
                    {entry}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <ContractAdminScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['contract-admin']}
          onToggleCollapse={() => toggleSection('contract-admin')}
        />

        <CollectionMintAdminScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['collection-mint-admin']}
          onToggleCollapse={() => toggleSection('collection-mint-admin')}
        />

        <PreinscribedCollectionAdminScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['preinscribed-sale-admin']}
          onToggleCollapse={() => toggleSection('preinscribed-sale-admin')}
        />

        <PreinscribedCollectionSaleScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['preinscribed-sale']}
          onToggleCollapse={() => toggleSection('preinscribed-sale')}
          defaultSaleContractId={`${selectedContract.address}.xtrata-preinscribed-collection-sale-v1-0`}
        />

        <AdminDiagnosticsScreen
          contractId={contractId}
          contractNetwork={selectedContract.network}
          walletAddress={walletSession.address ?? null}
          walletNetwork={walletSession.network ?? null}
          readOnlySender={readOnlySender}
          isActiveTab={tabGuard.isActive}
          collapsed={collapsedSections['admin-diagnostics']}
          onToggleCollapse={() => toggleSection('admin-diagnostics')}
        />

        <CampaignConsoleScreen
          collapsed={collapsedSections['campaign-console']}
          onToggleCollapse={() => toggleSection('campaign-console')}
        />

        <CollectionMintScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['collection-mint']}
          onToggleCollapse={() => toggleSection('collection-mint')}
        />

        <MintScreen
          contract={selectedContract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={collapsedSections.mint}
          onToggleCollapse={() => toggleSection('mint')}
          parentDraftIds={parentDraftIds}
          onClearParentDrafts={handleClearParentDrafts}
        />
      </main>
    </div>
  );
}
