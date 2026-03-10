import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { showContractCall, type ContractCallOptions } from '@stacks/connect';
import { useQuery } from '@tanstack/react-query';
import { PostConditionMode, type PostCondition } from '@stacks/transactions';
import WalletTopBar from './components/WalletTopBar';
import TokenCardMedia from './components/TokenCardMedia';
import { getKnownFungibleAsset } from './lib/contract/fungible-assets';
import { buildFungibleSpendPostCondition } from './lib/contract/post-conditions';
import { createXtrataClient } from './lib/contract/client';
import { buildBuyWithUsdcCall, createCommerceClient } from './lib/commerce/client';
import { DORA_HACKS_DEMO_CONFIG } from './demo/doraHacksConfig';
import { isSameAddress } from './lib/market/actions';
import { getNetworkMismatch } from './lib/network/guard';
import { toStacksNetwork } from './lib/network/stacks';
import { formatDecimalAmount, parseDecimalAmount } from './lib/utils/amounts';
import { buildRuntimeOpenUrl } from './lib/viewer/runtime-open';
import { fetchTokenSummary, getTokenSummaryKey } from './lib/viewer/queries';
import type { TokenSummary } from './lib/viewer/types';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { buildDepositSbtcCall, buildOpenVaultCall, createVaultClient } from './lib/vault/client';

type TxPayload = {
  txId: string;
};

type DemoEvent = {
  id: number;
  timestamp: number;
  message: string;
};

type X402StatusResponse = {
  slug: string;
  address: string;
  unlocked: boolean;
  mode: 'commerce' | 'vault' | null;
  verifiedAt: number;
  txStatus: string | null;
};

type X402PaymentRequiredPayload = {
  error: 'payment_required';
  slug: string;
  title: string;
  assetId: string;
  accessMode: 'commerce' | 'vault' | 'either';
  message: string;
  sessionUrl: string;
  statusUrl: string;
  premiumUrl: string;
  commerce?: {
    contractId: string;
    listingId: string;
    assetId: string;
    price: {
      amount: string;
      symbol: string;
      decimals: number;
    };
  };
  vault?: {
    contractId: string;
    assetId: string;
    minimumTier: string;
    vaultId: string | null;
  };
};

type X402SessionResponse = {
  ok: boolean;
  slug: string;
  expiresAt: number;
  unlockUrl: string;
};

type CommerceListingView = {
  listingId: bigint;
  assetId: bigint;
  seller: string;
  price: bigint;
  active: boolean;
  walletEntitled: boolean;
  assetOwner: string | null;
};

type VaultView = {
  vaultId: bigint;
  assetId: bigint;
  owner: string;
  amount: bigint;
  tier: bigint;
  reserved: boolean;
};

const walletSessionStore = createWalletSessionStore();
const X402_STATUS_REFRESH_DELAY_MS = 4500;

const parseJsonResponse = async <T,>(response: Response) => {
  const text = await response.text();
  if (!text) {
    return null as T | null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Response is not valid JSON: ${text.slice(0, 160)}`);
  }
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error ?? 'Unknown error');
};

const formatTokenAmount = (value: bigint | null, decimals: number, symbol: string) => {
  if (value === null) {
    return 'Unknown';
  }
  return `${formatDecimalAmount(value, decimals)} ${symbol}`;
};

const formatTimestamp = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
};

const getRuntimeUrl = (contractId: string, tokenId: bigint) =>
  buildRuntimeOpenUrl({
    contractId,
    tokenId,
    network: 'mainnet'
  });

const DemoTokenStage = (props: {
  token: TokenSummary | null | undefined;
  contractId: string;
  senderAddress: string;
  client: ReturnType<typeof createXtrataClient>;
  isLoading: boolean;
  error: string | null;
  fallback?: ReactNode;
}) => {
  if (props.isLoading) {
    return (
      <div className="dora-demo__preview-empty">
        <p>Loading on-chain preview...</p>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="dora-demo__preview-empty">
        <p>{props.error}</p>
      </div>
    );
  }

  if (!props.token) {
    return (
      <div className="dora-demo__preview-empty">
        {props.fallback ?? <p>Demo asset not configured.</p>}
      </div>
    );
  }

  const mimeLabel = props.token.meta?.mimeType ?? 'Unknown mime type';

  return (
    <div className="token-card token-card--active dora-demo__token-card">
      <div className="token-card__header" aria-hidden="true">
        <span className="token-card__id">#{props.token.id.toString()}</span>
      </div>
      <div className="token-card__media">
        <TokenCardMedia
          token={props.token}
          contractId={props.contractId}
          senderAddress={props.senderAddress}
          client={props.client}
        />
      </div>
      <div className="token-card__meta" aria-hidden="true">
        <span className="token-card__pill" title={mimeLabel}>
          {mimeLabel}
        </span>
      </div>
    </div>
  );
};

export default function DoraHacksDemoPage() {
  const config = DORA_HACKS_DEMO_CONFIG;
  const [walletSession, setWalletSession] = useState(() => walletSessionStore.load());
  const [walletPending, setWalletPending] = useState(false);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [nextEventId, setNextEventId] = useState(0);
  const [commerceActionStatus, setCommerceActionStatus] = useState<string | null>(null);
  const [commerceActionPending, setCommerceActionPending] = useState(false);
  const [vaultActionStatus, setVaultActionStatus] = useState<string | null>(null);
  const [vaultActionPending, setVaultActionPending] = useState(false);
  const [activeVaultId, setActiveVaultId] = useState<bigint | null>(config.vault.vaultId);
  const [openAmountInput, setOpenAmountInput] = useState(config.vault.openAmountInput);
  const [depositAmountInput, setDepositAmountInput] = useState(config.vault.depositAmountInput);
  const [x402StatusMessage, setX402StatusMessage] = useState<string | null>(null);
  const [x402LockedPayload, setX402LockedPayload] = useState<X402PaymentRequiredPayload | null>(
    null
  );
  const [x402PremiumHtml, setX402PremiumHtml] = useState<string | null>(null);
  const [x402PremiumJson, setX402PremiumJson] = useState<Record<string, unknown> | null>(null);
  const [x402Pending, setX402Pending] = useState(false);
  const [x402LastTxId, setX402LastTxId] = useState<string | null>(null);
  const autoRefreshTimerRef = useRef<number | null>(null);
  const lastX402UnlockRef = useRef(false);

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'xtrata DoraHacks Demo',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23e05a2a"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const coreClient = useMemo(
    () => createXtrataClient({ contract: config.coreContract }),
    [config.coreContract]
  );
  const commerceClient = useMemo(
    () => createCommerceClient({ contract: config.commerce.contract }),
    [config.commerce.contract]
  );
  const vaultClient = useMemo(
    () => createVaultClient({ contract: config.vault.contract }),
    [config.vault.contract]
  );
  const readOnlySender = walletSession.address ?? config.coreContract.address;

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

  useEffect(() => {
    return () => {
      if (autoRefreshTimerRef.current !== null) {
        window.clearTimeout(autoRefreshTimerRef.current);
      }
    };
  }, []);

  const pushEvent = (message: string) => {
    setNextEventId((current) => {
      const nextId = current + 1;
      setEvents((existing) =>
        [
          { id: nextId, timestamp: Date.now(), message },
          ...existing
        ].slice(0, 12)
      );
      return nextId;
    });
  };

  const handleConnectWallet = async () => {
    setWalletPending(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
      pushEvent(
        session.address
          ? `Wallet connected: ${session.address}`
          : 'Wallet connection attempt completed.'
      );
    } finally {
      setWalletPending(false);
    }
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    try {
      await walletAdapter.disconnect();
      setWalletSession(walletAdapter.getSession());
      setX402LockedPayload(null);
      setX402PremiumHtml(null);
      setX402PremiumJson(null);
      pushEvent('Wallet disconnected.');
    } finally {
      setWalletPending(false);
    }
  };

  const requestContractCall = (params: {
    call: ContractCallOptions;
    network: 'mainnet' | 'testnet';
    postConditionMode?: PostConditionMode;
    postConditions?: PostCondition[];
  }) =>
    new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        ...params.call,
        network: walletSession.network ?? params.network,
        stxAddress: walletSession.address,
        postConditionMode: params.postConditionMode,
        postConditions: params.postConditions,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () => reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });

  const refreshX402StatusSoon = () => {
    if (autoRefreshTimerRef.current !== null) {
      window.clearTimeout(autoRefreshTimerRef.current);
    }
    autoRefreshTimerRef.current = window.setTimeout(() => {
      void x402StatusQuery.refetch();
    }, X402_STATUS_REFRESH_DELAY_MS);
  };

  const freeTokenQuery = useQuery({
    queryKey:
      config.freeAssetId !== null
        ? getTokenSummaryKey(config.coreContractId, config.freeAssetId)
        : ['dora-demo', 'token', 'free', 'missing'],
    enabled: config.freeAssetId !== null,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      fetchTokenSummary({
        client: coreClient,
        id: config.freeAssetId!,
        senderAddress: readOnlySender
      })
  });

  const commerceStatusQuery = useQuery({
    queryKey: ['dora-demo', 'commerce', config.commerce.contractId, 'status'],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [paymentToken, owner] = await Promise.all([
        commerceClient.getPaymentToken(readOnlySender),
        commerceClient.getOwner(readOnlySender)
      ]);
      return { paymentToken, owner };
    }
  });

  const commerceListingQuery = useQuery({
    queryKey: [
      'dora-demo',
      'commerce',
      config.commerce.contractId,
      'listing',
      config.commerce.listingId?.toString() ?? 'missing',
      walletSession.address ?? 'guest'
    ],
    enabled: config.commerce.listingId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CommerceListingView | null> => {
      const listing = await commerceClient.getListing(config.commerce.listingId!, readOnlySender);
      if (!listing) {
        return null;
      }
      const [walletEntitled, assetOwner] = await Promise.all([
        walletSession.address
          ? commerceClient.hasEntitlement(listing.assetId, walletSession.address, readOnlySender)
          : Promise.resolve(false),
        coreClient.getOwner(listing.assetId, readOnlySender)
      ]);
      return {
        listingId: config.commerce.listingId!,
        assetId: listing.assetId,
        seller: listing.seller,
        price: listing.price,
        active: listing.active,
        walletEntitled,
        assetOwner
      };
    }
  });

  const paidAssetId = config.commerce.teaserAssetId ?? commerceListingQuery.data?.assetId ?? null;
  const paidTokenQuery = useQuery({
    queryKey:
      paidAssetId !== null
        ? getTokenSummaryKey(config.coreContractId, paidAssetId)
        : ['dora-demo', 'token', 'commerce', 'missing'],
    enabled: paidAssetId !== null,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      fetchTokenSummary({
        client: coreClient,
        id: paidAssetId!,
        senderAddress: readOnlySender
      })
  });

  const vaultStatusQuery = useQuery({
    queryKey: ['dora-demo', 'vault', config.vault.contractId, 'status'],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [reserveToken, nextVaultId] = await Promise.all([
        vaultClient.getReserveToken(readOnlySender),
        vaultClient.getNextVaultId(readOnlySender)
      ]);
      return { reserveToken, nextVaultId };
    }
  });

  const vaultQuery = useQuery({
    queryKey: [
      'dora-demo',
      'vault',
      config.vault.contractId,
      'vault',
      activeVaultId?.toString() ?? 'missing'
    ],
    enabled: activeVaultId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<VaultView | null> => {
      const vault = await vaultClient.getVault(activeVaultId!, readOnlySender);
      if (!vault) {
        return null;
      }
      return {
        vaultId: activeVaultId!,
        assetId: vault.assetId,
        owner: vault.owner,
        amount: vault.amount,
        tier: vault.tier,
        reserved: vault.reserved
      };
    }
  });

  const vaultTokenQuery = useQuery({
    queryKey:
      config.vault.assetId !== null
        ? getTokenSummaryKey(config.coreContractId, config.vault.assetId)
        : ['dora-demo', 'token', 'vault', 'missing'],
    enabled: config.vault.assetId !== null,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      fetchTokenSummary({
        client: coreClient,
        id: config.vault.assetId!,
        senderAddress: readOnlySender
      })
  });

  const premiumAccessQuery = useQuery({
    queryKey: [
      'dora-demo',
      'vault',
      config.vault.contractId,
      'premium',
      config.vault.assetId?.toString() ?? 'missing',
      walletSession.address ?? 'guest'
    ],
    enabled: !!walletSession.address && config.vault.assetId !== null,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () =>
      vaultClient.hasPremiumAccess(config.vault.assetId!, walletSession.address!, readOnlySender)
  });

  const x402StatusQuery = useQuery({
    queryKey: [
      'dora-demo',
      'x402',
      'status',
      config.x402.slug,
      walletSession.address ?? 'guest',
      x402LastTxId ?? 'none'
    ],
    enabled: !!walletSession.address,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<X402StatusResponse> => {
      const url = new URL(config.x402.statusUrl, window.location.origin);
      url.searchParams.set('slug', config.x402.slug);
      url.searchParams.set('address', walletSession.address!);
      if (x402LastTxId) {
        url.searchParams.set('txId', x402LastTxId);
      }
      const response = await fetch(url.toString(), { credentials: 'include' });
      const payload = await parseJsonResponse<X402StatusResponse | { error?: string }>(response);
      if (!response.ok) {
        throw new Error(
          (payload && 'error' in payload && payload.error) || 'Unable to load x402 status.'
        );
      }
      return payload as X402StatusResponse;
    }
  });

  useEffect(() => {
    if (!walletSession.isConnected || !walletSession.address) {
      lastX402UnlockRef.current = false;
      return;
    }
    if (x402StatusQuery.data?.unlocked && !lastX402UnlockRef.current) {
      lastX402UnlockRef.current = true;
      setX402StatusMessage('On-chain access verified. Request a premium session to unlock content.');
      pushEvent(
        `x402 access verified for ${walletSession.address} via ${x402StatusQuery.data.mode ?? 'unknown'}`
      );
      return;
    }
    if (!x402StatusQuery.data?.unlocked) {
      lastX402UnlockRef.current = false;
    }
  }, [walletSession.address, walletSession.isConnected, x402StatusQuery.data]);

  const paymentTokenAsset = getKnownFungibleAsset(commerceStatusQuery.data?.paymentToken ?? null);
  const reserveTokenAsset = getKnownFungibleAsset(vaultStatusQuery.data?.reserveToken ?? null);
  const commerceMismatch = getNetworkMismatch(
    config.commerce.contract.network,
    walletSession.network
  );
  const vaultMismatch = getNetworkMismatch(config.vault.contract.network, walletSession.network);

  const handleBuyCommerce = async () => {
    setCommerceActionStatus(null);
    if (!walletSession.address) {
      setCommerceActionStatus('Connect a wallet to buy the USDCx entry.');
      return;
    }
    if (!commerceListingQuery.data) {
      setCommerceActionStatus('Load the commerce listing first.');
      return;
    }
    if (!paymentTokenAsset) {
      setCommerceActionStatus('Unknown USDCx token metadata. Check the commerce contract.');
      return;
    }
    if (commerceMismatch) {
      setCommerceActionStatus(
        `Network mismatch: wallet on ${commerceMismatch.actual}, commerce is ${commerceMismatch.expected}.`
      );
      return;
    }
    if (!commerceListingQuery.data.active) {
      setCommerceActionStatus('This listing is inactive.');
      return;
    }
    if (commerceListingQuery.data.walletEntitled) {
      setCommerceActionStatus('This wallet already has entitlement for the paid asset.');
      return;
    }
    if (isSameAddress(commerceListingQuery.data.seller, walletSession.address)) {
      setCommerceActionStatus('Use a different wallet to buy this listing.');
      return;
    }

    setCommerceActionPending(true);
    setCommerceActionStatus('Preparing USDCx purchase...');
    try {
      const tx = await requestContractCall({
        call: buildBuyWithUsdcCall({
          contract: config.commerce.contract,
          network: toStacksNetwork(config.commerce.contract.network),
          listingId: commerceListingQuery.data.listingId
        }),
        network: config.commerce.contract.network,
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildFungibleSpendPostCondition({
            token: paymentTokenAsset,
            senderAddress: walletSession.address,
            amount: commerceListingQuery.data.price
          })
        ]
      });
      setCommerceActionStatus(`Purchase submitted: ${tx.txId}`);
      setX402LastTxId(tx.txId);
      pushEvent(`USDCx purchase submitted for listing #${commerceListingQuery.data.listingId}.`);
      void commerceListingQuery.refetch();
      void x402StatusQuery.refetch();
      refreshX402StatusSoon();
    } catch (error) {
      setCommerceActionStatus(`Purchase failed: ${getErrorMessage(error)}`);
    } finally {
      setCommerceActionPending(false);
    }
  };

  const handleOpenVault = async () => {
    setVaultActionStatus(null);
    if (!walletSession.address) {
      setVaultActionStatus('Connect a wallet to open the vault.');
      return;
    }
    if (!reserveTokenAsset) {
      setVaultActionStatus('Unknown sBTC token metadata. Check the vault contract.');
      return;
    }
    if (vaultMismatch) {
      setVaultActionStatus(
        `Network mismatch: wallet on ${vaultMismatch.actual}, vault is ${vaultMismatch.expected}.`
      );
      return;
    }
    if (config.vault.assetId === null) {
      setVaultActionStatus('Set VITE_DORA_HACKS_VAULT_ASSET_ID first.');
      return;
    }
    const initialAmount = parseDecimalAmount(openAmountInput, reserveTokenAsset.decimals);
    if (initialAmount === null) {
      setVaultActionStatus(`Enter a valid ${reserveTokenAsset.symbol} amount.`);
      return;
    }

    setVaultActionPending(true);
    setVaultActionStatus('Preparing vault open...');
    try {
      const owner = await coreClient.getOwner(config.vault.assetId, readOnlySender);
      if (!owner || !isSameAddress(owner, walletSession.address)) {
        setVaultActionStatus(
          owner
            ? `Only the current asset owner can open a vault. Current owner is ${owner}.`
            : 'Asset owner could not be resolved.'
        );
        return;
      }
      const predictedVaultId = vaultStatusQuery.data?.nextVaultId ?? null;
      const tx = await requestContractCall({
        call: buildOpenVaultCall({
          contract: config.vault.contract,
          network: toStacksNetwork(config.vault.contract.network),
          assetId: config.vault.assetId,
          initialAmount
        }),
        network: config.vault.contract.network,
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildFungibleSpendPostCondition({
            token: reserveTokenAsset,
            senderAddress: walletSession.address,
            amount: initialAmount
          })
        ]
      });
      if (predictedVaultId !== null) {
        setActiveVaultId(predictedVaultId);
      }
      setVaultActionStatus(`Vault open submitted: ${tx.txId}`);
      setX402LastTxId(tx.txId);
      pushEvent(`Vault open submitted for asset #${config.vault.assetId.toString()}.`);
      void vaultStatusQuery.refetch();
      void vaultQuery.refetch();
      void premiumAccessQuery.refetch();
      void x402StatusQuery.refetch();
      refreshX402StatusSoon();
    } catch (error) {
      setVaultActionStatus(`Vault open failed: ${getErrorMessage(error)}`);
    } finally {
      setVaultActionPending(false);
    }
  };

  const handleDepositVault = async () => {
    setVaultActionStatus(null);
    if (!walletSession.address) {
      setVaultActionStatus('Connect a wallet to deposit sBTC.');
      return;
    }
    if (!reserveTokenAsset) {
      setVaultActionStatus('Unknown sBTC token metadata. Check the vault contract.');
      return;
    }
    if (!vaultQuery.data) {
      setVaultActionStatus('Load an active vault first.');
      return;
    }
    if (!isSameAddress(vaultQuery.data.owner, walletSession.address)) {
      setVaultActionStatus('Only the active asset owner can deposit into this vault.');
      return;
    }
    const amount = parseDecimalAmount(depositAmountInput, reserveTokenAsset.decimals);
    if (amount === null) {
      setVaultActionStatus(`Enter a valid ${reserveTokenAsset.symbol} amount.`);
      return;
    }

    setVaultActionPending(true);
    setVaultActionStatus('Preparing sBTC deposit...');
    try {
      const tx = await requestContractCall({
        call: buildDepositSbtcCall({
          contract: config.vault.contract,
          network: toStacksNetwork(config.vault.contract.network),
          vaultId: vaultQuery.data.vaultId,
          amount
        }),
        network: config.vault.contract.network,
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildFungibleSpendPostCondition({
            token: reserveTokenAsset,
            senderAddress: walletSession.address,
            amount
          })
        ]
      });
      setVaultActionStatus(`Deposit submitted: ${tx.txId}`);
      setX402LastTxId(tx.txId);
      pushEvent(`sBTC deposit submitted for vault #${vaultQuery.data.vaultId.toString()}.`);
      void vaultQuery.refetch();
      void premiumAccessQuery.refetch();
      void x402StatusQuery.refetch();
      refreshX402StatusSoon();
    } catch (error) {
      setVaultActionStatus(`Deposit failed: ${getErrorMessage(error)}`);
    } finally {
      setVaultActionPending(false);
    }
  };

  const loadPremiumRoute = async () => {
    setX402Pending(true);
    setX402StatusMessage('Loading premium route...');
    try {
      const response = await fetch(config.x402.premiumUrl, { credentials: 'include' });

      if (response.status === 402) {
        const payload = await parseJsonResponse<X402PaymentRequiredPayload>(response);
        setX402LockedPayload(payload);
        setX402PremiumHtml(null);
        setX402PremiumJson(null);
        setX402StatusMessage('x402 returned 402 Payment Required. Unlock access first.');
        pushEvent('x402 gateway returned 402 for the premium route.');
        return;
      }

      if (!response.ok) {
        const payload = await parseJsonResponse<{ error?: string }>(response);
        throw new Error(payload?.error ?? `Premium route failed with HTTP ${response.status}.`);
      }

      const contentType = response.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        const payload = await parseJsonResponse<Record<string, unknown>>(response);
        setX402PremiumJson(payload ?? null);
        setX402PremiumHtml(null);
      } else {
        setX402PremiumHtml(await response.text());
        setX402PremiumJson(null);
      }
      setX402LockedPayload(null);
      setX402StatusMessage('Premium route loaded successfully.');
      pushEvent('Premium x402 route unlocked and rendered.');
    } catch (error) {
      setX402StatusMessage(`Premium route failed: ${getErrorMessage(error)}`);
    } finally {
      setX402Pending(false);
    }
  };

  const handleIssueX402Session = async () => {
    setX402Pending(true);
    setX402StatusMessage('Requesting premium session...');
    try {
      const response = await fetch(config.x402.sessionUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug: config.x402.slug,
          address: walletSession.address,
          txId: x402LastTxId
        })
      });

      if (response.status === 402) {
        const payload = await parseJsonResponse<X402PaymentRequiredPayload>(response);
        setX402LockedPayload(payload);
        setX402StatusMessage('Session request denied. On-chain access is still missing.');
        pushEvent('x402 session request returned 402.');
        return;
      }

      if (response.status === 409) {
        const payload = await parseJsonResponse<{ txStatus?: string }>(response);
        setX402StatusMessage(
          payload?.txStatus
            ? `Transaction still pending: ${payload.txStatus}. Refresh access state shortly.`
            : 'Transaction is still pending. Refresh access state shortly.'
        );
        pushEvent('x402 session request is waiting for transaction confirmation.');
        return;
      }

      if (!response.ok) {
        const payload = await parseJsonResponse<{ error?: string }>(response);
        throw new Error(payload?.error ?? `Session request failed with HTTP ${response.status}.`);
      }

      const payload = await parseJsonResponse<X402SessionResponse>(response);
      setX402LockedPayload(null);
      setX402StatusMessage(
        payload?.expiresAt
          ? `Premium session issued until ${formatTimestamp(payload.expiresAt)}.`
          : 'Premium session issued.'
      );
      pushEvent('x402 session cookie issued for the premium route.');
      await loadPremiumRoute();
    } catch (error) {
      setX402StatusMessage(`Session request failed: ${getErrorMessage(error)}`);
    } finally {
      setX402Pending(false);
    }
  };

  const handleRefreshX402Status = async () => {
    setX402StatusMessage('Refreshing on-chain access state...');
    try {
      const result = await x402StatusQuery.refetch();
      if (result.data?.unlocked) {
        setX402StatusMessage('On-chain access is confirmed. Request a session token.');
      } else {
        setX402StatusMessage('Access still locked. Complete the unlock flow and try again.');
      }
    } catch (error) {
      setX402StatusMessage(`Unable to refresh access state: ${getErrorMessage(error)}`);
    }
  };

  const paymentPriceLabel =
    paymentTokenAsset && commerceListingQuery.data
      ? formatTokenAmount(
          commerceListingQuery.data.price,
          paymentTokenAsset.decimals,
          paymentTokenAsset.symbol
        )
      : 'Unknown';
  const reserveAmountLabel =
    reserveTokenAsset && vaultQuery.data
      ? formatTokenAmount(vaultQuery.data.amount, reserveTokenAsset.decimals, reserveTokenAsset.symbol)
      : 'Unknown';

  return (
    <div className="app dora-demo">
      <header className="app__header">
        <section className="panel dora-demo__hero">
          <div className="dora-demo__hero-copy">
            <p className="dora-demo__eyebrow">DoraHacks Working Demo</p>
            <h1 className="app__title">
              XTRATA <span className="app__title-tag">Commerce Layer</span>
            </h1>
            <p className="dora-demo__subline">
              One page showing permanent on-chain media, USDCx entitlement commerce,
              sBTC premium reserve access, and x402-gated delivery.
            </p>
            <div className="dora-demo__hero-badges">
              <span className="badge badge--mainnet">Xtrata Core</span>
              <span className="badge badge--market-usdcx">USDCx Commerce</span>
              <span className="badge badge--market-sbtc">sBTC Vault</span>
              <span className="badge badge--neutral">x402 Gateway</span>
            </div>
          </div>
          <div className="dora-demo__hero-meta">
            <div className="dora-demo__meta-card">
              <span className="meta-label">Core contract</span>
              <span className="meta-value">{config.coreContractId}</span>
            </div>
            <div className="dora-demo__meta-card">
              <span className="meta-label">Commerce contract</span>
              <span className="meta-value">{config.commerce.contractId}</span>
            </div>
            <div className="dora-demo__meta-card">
              <span className="meta-label">Vault contract</span>
              <span className="meta-value">{config.vault.contractId}</span>
            </div>
            <div className="dora-demo__meta-card">
              <span className="meta-label">x402 slug</span>
              <span className="meta-value">{config.x402.slug}</span>
            </div>
          </div>
        </section>
        <WalletTopBar
          walletSession={walletSession}
          walletPending={walletPending}
          onConnect={handleConnectWallet}
          onDisconnect={handleDisconnectWallet}
          className="dora-demo__wallet-bar"
        />
        {config.errors.length > 0 && (
          <section className="panel dora-demo__config-panel">
            <div className="panel__header">
              <div>
                <h2>Demo Configuration</h2>
                <p>The page is live, but a few asset IDs still need to be configured.</p>
              </div>
            </div>
            <div className="panel__body">
              <ul className="dora-demo__config-list">
                {config.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </header>

      <main className="app__main">
        <div className="app__modules app__modules--compact dora-demo__modules">
          <section className="panel dora-demo__panel">
            <div className="panel__header">
              <div>
                <h2>Free Asset</h2>
                <p>Baseline on-chain media preview with no payment required.</p>
              </div>
              {config.freeAssetId !== null && (
                <span className="badge badge--neutral">#{config.freeAssetId.toString()}</span>
              )}
            </div>
            <div className="panel__body">
              <div className="dora-demo__preview-frame">
                <DemoTokenStage
                  token={freeTokenQuery.data}
                  contractId={config.coreContractId}
                  senderAddress={readOnlySender}
                  client={coreClient}
                  isLoading={freeTokenQuery.isLoading}
                  error={freeTokenQuery.error instanceof Error ? freeTokenQuery.error.message : null}
                />
              </div>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Status</span>
                  <span className="meta-value">On-chain, no payment required</span>
                </div>
                <div>
                  <span className="meta-label">Contract</span>
                  <span className="meta-value">{config.coreContract.contractName}</span>
                </div>
              </div>
              <div className="dora-demo__actions">
                <a
                  className="button button--ghost"
                  href={
                    config.freeAssetId !== null
                      ? getRuntimeUrl(config.coreContractId, config.freeAssetId)
                      : '#'
                  }
                >
                  Open free asset
                </a>
              </div>
            </div>
          </section>

          <section className="panel dora-demo__panel">
            <div className="panel__header">
              <div>
                <h2>USDCx Commerce</h2>
                <p>Buy access without transferring NFT ownership.</p>
              </div>
              {commerceListingQuery.data && (
                <span className="badge badge--market-usdcx">
                  Listing #{commerceListingQuery.data.listingId.toString()}
                </span>
              )}
            </div>
            <div className="panel__body">
              <div className="dora-demo__preview-frame">
                <DemoTokenStage
                  token={paidTokenQuery.data}
                  contractId={config.coreContractId}
                  senderAddress={readOnlySender}
                  client={coreClient}
                  isLoading={paidTokenQuery.isLoading || commerceListingQuery.isLoading}
                  error={
                    paidTokenQuery.error instanceof Error
                      ? paidTokenQuery.error.message
                      : commerceListingQuery.error instanceof Error
                        ? commerceListingQuery.error.message
                        : null
                  }
                  fallback={<p>Set the listing ID and optional teaser asset ID for this card.</p>}
                />
              </div>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Price</span>
                  <span className="meta-value">{paymentPriceLabel}</span>
                </div>
                <div>
                  <span className="meta-label">Entitlement</span>
                  <span className="meta-value">
                    {commerceListingQuery.data?.walletEntitled ? 'Unlocked for this wallet' : 'Locked'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Seller</span>
                  <span className="meta-value">{commerceListingQuery.data?.seller ?? 'Unknown'}</span>
                </div>
                <div>
                  <span className="meta-label">Listing state</span>
                  <span className="meta-value">
                    {commerceListingQuery.data?.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              {commerceActionStatus && <div className="field__hint">{commerceActionStatus}</div>}
              <div className="dora-demo__actions">
                <button
                  type="button"
                  className="button"
                  onClick={handleBuyCommerce}
                  disabled={commerceActionPending || !commerceListingQuery.data}
                >
                  {commerceActionPending ? 'Submitting...' : 'Buy with USDCx'}
                </button>
                {paidAssetId !== null && (
                  <a
                    className="button button--ghost"
                    href={getRuntimeUrl(config.coreContractId, paidAssetId)}
                  >
                    Open paid asset
                  </a>
                )}
              </div>
            </div>
          </section>

          <section className="panel dora-demo__panel">
            <div className="panel__header">
              <div>
                <h2>sBTC Vault</h2>
                <p>Bitcoin-backed premium reserve access tied to the asset owner.</p>
              </div>
              {activeVaultId !== null && (
                <span className="badge badge--market-sbtc">Vault #{activeVaultId.toString()}</span>
              )}
            </div>
            <div className="panel__body">
              <div className="dora-demo__preview-frame">
                <DemoTokenStage
                  token={vaultTokenQuery.data}
                  contractId={config.coreContractId}
                  senderAddress={readOnlySender}
                  client={coreClient}
                  isLoading={vaultTokenQuery.isLoading}
                  error={vaultTokenQuery.error instanceof Error ? vaultTokenQuery.error.message : null}
                  fallback={<p>Set VITE_DORA_HACKS_VAULT_ASSET_ID to load the premium asset.</p>}
                />
              </div>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Premium access</span>
                  <span className="meta-value">
                    {walletSession.address
                      ? premiumAccessQuery.data
                        ? 'Unlocked for connected owner'
                        : 'Locked'
                      : 'Connect wallet'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Tier</span>
                  <span className="meta-value">
                    {vaultQuery.data ? `Tier ${vaultQuery.data.tier.toString()}` : 'No vault loaded'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Reserve</span>
                  <span className="meta-value">{reserveAmountLabel}</span>
                </div>
                <div>
                  <span className="meta-label">Vault state</span>
                  <span className="meta-value">
                    {vaultQuery.data ? (vaultQuery.data.reserved ? 'Reserved' : 'Open') : 'Not opened'}
                  </span>
                </div>
              </div>
              <div className="dora-demo__inline-fields">
                {activeVaultId === null ? (
                  <label className="field">
                    <span className="field__label">Initial sBTC amount</span>
                    <input
                      className="input"
                      type="text"
                      value={openAmountInput}
                      onChange={(event) => setOpenAmountInput(event.target.value)}
                    />
                  </label>
                ) : (
                  <label className="field">
                    <span className="field__label">Deposit amount</span>
                    <input
                      className="input"
                      type="text"
                      value={depositAmountInput}
                      onChange={(event) => setDepositAmountInput(event.target.value)}
                    />
                  </label>
                )}
              </div>
              {vaultActionStatus && <div className="field__hint">{vaultActionStatus}</div>}
              <div className="dora-demo__actions">
                <button
                  type="button"
                  className="button"
                  onClick={activeVaultId === null ? handleOpenVault : handleDepositVault}
                  disabled={vaultActionPending || config.vault.assetId === null}
                >
                  {vaultActionPending
                    ? 'Submitting...'
                    : activeVaultId === null
                      ? 'Open vault'
                      : 'Deposit sBTC'}
                </button>
                {config.vault.assetId !== null && (
                  <a
                    className="button button--ghost"
                    href={getRuntimeUrl(config.coreContractId, config.vault.assetId)}
                  >
                    Open premium asset
                  </a>
                )}
              </div>
            </div>
          </section>

          <section className="panel dora-demo__panel dora-demo__panel--wide">
            <div className="panel__header">
              <div>
                <h2>x402 Premium Route</h2>
                <p>Protected content route that issues `402 Payment Required` until access is verified.</p>
              </div>
              <span className="badge badge--neutral">{config.x402.slug}</span>
            </div>
            <div className="panel__body dora-demo__x402-body">
              <div className="dora-demo__x402-stage">
                {x402PremiumHtml ? (
                  <iframe
                    className="dora-demo__premium-frame"
                    sandbox=""
                    srcDoc={x402PremiumHtml}
                    title="Unlocked x402 premium content"
                  />
                ) : x402PremiumJson ? (
                  <pre className="dora-demo__premium-json">
                    {JSON.stringify(x402PremiumJson, null, 2)}
                  </pre>
                ) : (
                  <div className="dora-demo__preview-empty">
                    <p>Premium route has not been loaded yet.</p>
                  </div>
                )}
              </div>
              <div className="dora-demo__x402-controls">
                <div className="meta-grid">
                  <div>
                    <span className="meta-label">Wallet access</span>
                    <span className="meta-value">
                      {walletSession.address
                        ? x402StatusQuery.data?.unlocked
                          ? `Unlocked via ${x402StatusQuery.data.mode ?? 'unknown'}`
                          : 'Locked'
                        : 'Connect wallet'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Last tx</span>
                    <span className="meta-value">{x402LastTxId ?? 'None'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Gateway status</span>
                    <span className="meta-value">{x402StatusQuery.data?.txStatus ?? 'Idle'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Premium route</span>
                    <span className="meta-value">{config.x402.premiumUrl}</span>
                  </div>
                </div>

                {x402StatusMessage && <div className="field__hint">{x402StatusMessage}</div>}

                {x402LockedPayload && (
                  <div className="dora-demo__locked-note">
                    <strong>402 Payment Required</strong>
                    <p>{x402LockedPayload.message}</p>
                  </div>
                )}

                <div className="dora-demo__actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void loadPremiumRoute()}
                    disabled={x402Pending}
                  >
                    {x402Pending ? 'Working...' : 'Load premium route'}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void handleIssueX402Session()}
                    disabled={x402Pending || !walletSession.address}
                  >
                    Request session
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void handleRefreshX402Status()}
                    disabled={!walletSession.address}
                  >
                    Refresh access state
                  </button>
                  {x402LockedPayload?.commerce && (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={handleBuyCommerce}
                      disabled={commerceActionPending}
                    >
                      Unlock with USDCx
                    </button>
                  )}
                  {x402LockedPayload?.vault && (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={activeVaultId === null ? handleOpenVault : handleDepositVault}
                      disabled={vaultActionPending || config.vault.assetId === null}
                    >
                      {activeVaultId === null ? 'Unlock with sBTC vault' : 'Top up sBTC'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel dora-demo__panel dora-demo__panel--wide">
            <div className="panel__header">
              <div>
                <h2>Event Rail</h2>
                <p>Compact proof trail for the live demo flow.</p>
              </div>
            </div>
            <div className="panel__body">
              {events.length === 0 ? (
                <p className="dora-demo__event-empty">
                  Connect a wallet or run an action to start the event rail.
                </p>
              ) : (
                <ol className="dora-demo__event-list">
                  {events.map((event) => (
                    <li key={event.id} className="dora-demo__event-item">
                      <span className="dora-demo__event-time">{formatTimestamp(event.timestamp)}</span>
                      <span className="dora-demo__event-message">{event.message}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
