import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showContractCall } from '../lib/wallet/connect';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PostConditionMode,
  contractPrincipalCV,
  uintCV
} from '@stacks/transactions';
import { buildTransferCall, createXtrataClient } from '../lib/contract/client';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import { buildTransferPostCondition } from '../lib/contract/post-conditions';
import type { WalletSession } from '../lib/wallet/types';
import { getNetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import {
  buildActiveListingIndex,
  buildMarketListingKey,
  loadMarketActivity
} from '../lib/market/indexer';
import {
  MARKET_REGISTRY,
  getMarketContractId,
  getMarketRegistryEntry
} from '../lib/market/registry';
import {
  createMarketSelectionStore,
  MARKET_SELECTION_EVENT
} from '../lib/market/selection';
import { parseMarketContractId } from '../lib/market/contract';
import { createMarketClient } from '../lib/market/client';
import type { MarketActivityEvent } from '../lib/market/types';
import {
  formatMarketPriceWithUsd,
  getMarketPriceInputLabel,
  getMarketSettlementAsset,
  getMarketSettlementBadgeVariant,
  getMarketSettlementLabel,
  getMarketSettlementSupportMessage,
  isMarketSettlementSupported,
  parseMarketPriceInput
} from '../lib/market/settlement';
import { useUsdPriceBook } from '../lib/pricing/hooks';
import {
  getViewerKey,
  useLastTokenId,
  useTokenSummaries
} from '../lib/viewer/queries';
import { filterTokensByOwner } from '../lib/viewer/ownership';
import type { TokenSummary } from '../lib/viewer/types';
import { getContractId } from '../lib/contract/config';
import {
  getTransferValidationMessage,
  validateTransferRequest
} from '../lib/wallet/transfer';
import TokenCardMedia from '../components/TokenCardMedia';
import TokenContentPreview from '../components/TokenContentPreview';
import AddressLabel from '../components/AddressLabel';
import { getMediaKind } from '../lib/viewer/content';

const PAGE_SIZE = 16;
const marketSelectionStore = createMarketSelectionStore();

type MyWalletScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  senderAddress: string;
  lookupAddress?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isActiveTab: boolean;
};

const getMediaLabel = (mimeType: string | null | undefined) => {
  const kind = getMediaKind(mimeType ?? null);
  switch (kind) {
    case 'image':
      return 'IMAGE';
    case 'svg':
      return 'SVG';
    case 'audio':
      return 'AUDIO';
    case 'video':
      return 'VIDEO';
    case 'text':
      return 'TEXT';
    case 'html':
      return 'HTML';
    case 'binary':
      return 'BIN';
    default:
      return 'UNKNOWN';
  }
};

const OwnedTokenCard = (props: {
  token: TokenSummary;
  contractId: string;
  senderAddress: string;
  client: ReturnType<typeof createXtrataClient>;
  isSelected: boolean;
  isListed: boolean;
  listingBadgeLabel: string;
  listingBadgeVariant: string;
  onSelect: (id: bigint) => void;
  isActiveTab: boolean;
}) => {
  const mediaLabel = getMediaLabel(props.token.meta?.mimeType ?? null);
  const mediaTitle = props.token.meta?.mimeType ?? 'Unknown mime type';

  return (
    <button
      type="button"
      className={`token-card${props.isSelected ? ' token-card--active' : ''}`}
      onClick={() => props.onSelect(props.token.id)}
    >
      {props.isListed && (
        <span
          className={`token-card__badge token-card__badge--listed token-card__badge--market ${props.listingBadgeVariant}`}
          title={`Listed for sale in ${props.listingBadgeLabel}`}
          aria-hidden="true"
        >
          {props.listingBadgeLabel}
        </span>
      )}
      <div className="token-card__header" aria-hidden="true">
        <span className="token-card__id">#{props.token.id.toString()}</span>
      </div>
      <div className="token-card__media">
        <TokenCardMedia
          token={props.token}
          contractId={props.contractId}
          senderAddress={props.senderAddress}
          client={props.client}
          isActiveTab={props.isActiveTab}
        />
      </div>
      <div className="token-card__meta" aria-hidden="true">
        <span className="token-card__pill" title={mediaTitle}>
          {mediaLabel}
        </span>
      </div>
    </button>
  );
};

export default function MyWalletScreen(props: MyWalletScreenProps) {
  const usdPriceBook = useUsdPriceBook({
    enabled: props.isActiveTab && !props.collapsed
  }).data ?? null;
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const queryClient = useQueryClient();
  const contractId = getContractId(props.contract);
  const defaultMarketId = getMarketContractId(MARKET_REGISTRY[0]);
  const [marketContractId, setMarketContractId] = useState(
    () => marketSelectionStore.load() ?? defaultMarketId
  );
  const walletAddress = props.walletSession.address;
  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );

  useEffect(() => {
    if (!marketSelectionStore.load()) {
      marketSelectionStore.save(defaultMarketId);
    }
  }, [defaultMarketId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleSelection = () => {
      setMarketContractId(marketSelectionStore.load() ?? defaultMarketId);
    };
    window.addEventListener(MARKET_SELECTION_EVENT, handleSelection);
    return () => {
      window.removeEventListener(MARKET_SELECTION_EVENT, handleSelection);
    };
  }, [defaultMarketId]);

  const parsedMarket = useMemo(
    () => parseMarketContractId(marketContractId),
    [marketContractId]
  );
  const marketContract = parsedMarket.config;
  const marketContractIdLabel = marketContract ? getContractId(marketContract) : null;
  const marketRegistryEntry = getMarketRegistryEntry(marketContractIdLabel);
  const marketNetworkMismatch = marketContract
    ? marketContract.network !== props.contract.network
    : false;
  const marketMismatch = marketContract
    ? getNetworkMismatch(marketContract.network, props.walletSession.network)
    : null;
  const marketClient = useMemo(
    () => (marketContract ? createMarketClient({ contract: marketContract }) : null),
    [marketContract]
  );
  const marketPaymentTokenQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'payment-token'],
    enabled: !!marketClient && !!marketContractIdLabel && props.isActiveTab,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!marketClient) {
        return null;
      }
      return marketClient.getPaymentToken(props.senderAddress);
    }
  });
  const marketPaymentTokenContractId = marketPaymentTokenQuery.status === 'success'
    ? marketPaymentTokenQuery.data
    : marketRegistryEntry?.paymentTokenContractId;
  const marketSettlement = getMarketSettlementAsset(marketPaymentTokenContractId);
  const marketSettlementLabel = getMarketSettlementLabel(marketSettlement);
  const marketSettlementBadgeVariant =
    getMarketSettlementBadgeVariant(marketSettlement);
  const marketSettlementSupported = isMarketSettlementSupported(marketSettlement);
  const marketSettlementMessage =
    getMarketSettlementSupportMessage(marketSettlement);
  const marketPresetValue =
    marketRegistryEntry && marketContractIdLabel ? marketContractIdLabel : '';

  const targetAddress = props.lookupAddress ?? walletAddress ?? '';

  const lastTokenQuery = useLastTokenId({
    client,
    senderAddress: props.senderAddress,
    enabled: props.isActiveTab
  });

  const marketActivityQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'activity'],
    enabled:
      !!marketContract && !marketNetworkMismatch && props.isActiveTab,
    queryFn: () => loadMarketActivity({ contract: marketContract! }),
    staleTime: 30_000
  });

  const { tokenIds, tokenQueries } = useTokenSummaries({
    client,
    senderAddress: props.senderAddress,
    lastTokenId: lastTokenQuery.data,
    enabled: props.isActiveTab
  });

  const tokenSummaries = tokenQueries
    .map((query, index) => {
      const id = tokenIds[index];
      if (id === undefined || !query.data) {
        return null;
      }
      return query.data;
    })
    .filter((token): token is TokenSummary => !!token);

  const ownedTokens = useMemo(
    () => filterTokensByOwner(tokenSummaries, targetAddress),
    [tokenSummaries, targetAddress]
  );

  const activeListingIndex = useMemo(() => {
    if (!marketActivityQuery.data || !marketContractIdLabel || marketNetworkMismatch) {
      return new Map<string, MarketActivityEvent>();
    }
    return buildActiveListingIndex(marketActivityQuery.data.events, contractId);
  }, [
    marketActivityQuery.data,
    marketContractIdLabel,
    marketNetworkMismatch,
    contractId
  ]);

  const isTokenListed = useCallback(
    (token: TokenSummary | null) => {
      if (!token || !marketContractIdLabel) {
        return false;
      }
      if (token.owner !== marketContractIdLabel) {
        return false;
      }
      const key = buildMarketListingKey(contractId, token.id);
      return activeListingIndex.has(key);
    },
    [activeListingIndex, marketContractIdLabel, contractId]
  );
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [transferPending, setTransferPending] = useState(false);
  const [transferLog, setTransferLog] = useState<string[]>([]);
  const [listPriceInput, setListPriceInput] = useState('');
  const [listStatus, setListStatus] = useState<string | null>(null);
  const [listPending, setListPending] = useState(false);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [walletToolsOpen, setWalletToolsOpen] = useState(false);
  const initialPageSetRef = useRef(false);
  const walletScopeRef = useRef<string>('');
  const autoSelectRef = useRef(true);
  const walletToolsRef = useRef<HTMLDivElement | null>(null);

  const maxPage = useMemo(() => {
    if (ownedTokens.length === 0) {
      return 0;
    }
    return Math.max(0, Math.floor((ownedTokens.length - 1) / PAGE_SIZE));
  }, [ownedTokens.length]);

  const tokenListSettled =
    tokenQueries.length > 0 &&
    tokenQueries.every((query) => !query.isLoading);

  useEffect(() => {
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [pageIndex, maxPage]);

  useEffect(() => {
    const scopeKey = `${contractId}:${targetAddress ?? ''}`;
    if (walletScopeRef.current !== scopeKey) {
      walletScopeRef.current = scopeKey;
      initialPageSetRef.current = false;
      autoSelectRef.current = true;
      setSelectedTokenId(null);
      setTransferStatus(null);
    }
  }, [contractId, targetAddress]);

  useEffect(() => {
    if (ownedTokens.length === 0) {
      return;
    }
    if (initialPageSetRef.current) {
      return;
    }
    if (pageIndex !== maxPage) {
      setPageIndex(maxPage);
    }
    if (tokenListSettled) {
      initialPageSetRef.current = true;
    }
  }, [ownedTokens.length, pageIndex, maxPage, tokenListSettled]);

  useEffect(() => {
    autoSelectRef.current = true;
  }, [pageIndex]);

  useEffect(() => {
    setTransferStatus(null);
    setListStatus(null);
    setCancelStatus(null);
    setListPriceInput('');
  }, [selectedTokenId, walletAddress]);

  const pageTokens = useMemo(() => {
    if (ownedTokens.length === 0) {
      return [];
    }
    const start = pageIndex * PAGE_SIZE;
    return ownedTokens.slice(start, start + PAGE_SIZE);
  }, [ownedTokens, pageIndex]);

  const handleSelectToken = (id: bigint) => {
    autoSelectRef.current = false;
    setSelectedTokenId(id);
  };

  const pageTargetId =
    pageTokens.length > 0 ? pageTokens[pageTokens.length - 1].id : null;

  useEffect(() => {
    if (pageTokens.length === 0) {
      setSelectedTokenId(null);
      return;
    }
    if (autoSelectRef.current) {
      if (pageTargetId === null) {
        setSelectedTokenId(null);
        return;
      }
      if (selectedTokenId !== pageTargetId) {
        setSelectedTokenId(pageTargetId);
      }
      return;
    }
    if (
      selectedTokenId !== null &&
      pageTokens.find((token) => token.id === selectedTokenId)
    ) {
      return;
    }
    if (pageTargetId !== null) {
      setSelectedTokenId(pageTargetId);
    }
  }, [pageTokens, selectedTokenId, pageTargetId]);

  const selectedToken =
    pageTokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedListingKey =
    selectedToken && marketContractIdLabel
      ? buildMarketListingKey(contractId, selectedToken.id)
      : null;
  const selectedListing =
    selectedListingKey ? activeListingIndex.get(selectedListingKey) ?? null : null;
  const selectedListed =
    !!selectedListing && selectedToken?.owner === marketContractIdLabel;
  const listingStatusLabel = selectedListing
    ? selectedListed
      ? `Listed (#${selectedListing.listingId.toString()})`
      : `Listing record (#${selectedListing.listingId.toString()})`
    : 'Not listed';
  const listingPriceLabel =
    selectedListing?.price !== undefined
      ? formatMarketPriceWithUsd(
          selectedListing.price,
          marketSettlement,
          usdPriceBook
        )
      : null;
  const marketLabel = marketContractIdLabel ?? 'Select in Market module';
  const transferValidation = validateTransferRequest({
    senderAddress: walletAddress,
    recipientAddress: transferRecipient,
    tokenId: selectedToken?.id ?? null,
    networkMismatch: !!mismatch
  });
  const transferValidationMessage =
    getTransferValidationMessage(transferValidation);
  const recipientValidationError =
    transferValidation.reason === 'missing-recipient' ||
    transferValidation.reason === 'invalid-recipient' ||
    transferValidation.reason === 'self-recipient';

  const appendTransferLog = (message: string) => {
    setTransferLog((prev) => {
      const next = [...prev, message];
      return next.slice(-20);
    });
    // eslint-disable-next-line no-console
    console.log(`[transfer] ${message}`);
  };

  const refreshWallet = () => {
    void queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    void queryClient.refetchQueries({
      queryKey: getViewerKey(contractId),
      type: 'active'
    });
  };

  const refreshMarketActivity = () => {
    if (!marketContractIdLabel) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ['market', marketContractIdLabel, 'activity']
    });
    void queryClient.refetchQueries({
      queryKey: ['market', marketContractIdLabel, 'activity'],
      type: 'active'
    });
  };

  const handleTransfer = () => {
    if (!transferValidation.ok || !selectedToken) {
      const message =
        transferValidationMessage ?? 'Transfer blocked: invalid inputs.';
      setTransferStatus(message);
      appendTransferLog(`Transfer blocked: ${transferValidation.reason ?? 'invalid'}.`);
      return;
    }

    const senderAddress = walletAddress;
    if (!senderAddress) {
      setTransferStatus('Connect a wallet to transfer inscriptions.');
      appendTransferLog('Transfer blocked: missing wallet.');
      return;
    }

    const recipient = transferValidation.recipient ?? transferRecipient.trim();
    const network = props.walletSession.network ?? props.contract.network;
    const callOptions = buildTransferCall({
      contract: props.contract,
      network: toStacksNetwork(network),
      id: selectedToken.id,
      sender: senderAddress,
      recipient,
      overrides: {
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildTransferPostCondition({
            contract: props.contract,
            senderAddress,
            tokenId: selectedToken.id
          })
        ]
      }
    });

    setTransferPending(true);
    setTransferStatus('Waiting for wallet confirmation...');
    appendTransferLog(
      `Transferring #${selectedToken.id.toString()} to ${recipient}.`
    );

    try {
      showContractCall({
        ...callOptions,
        stxAddress: senderAddress,
        onFinish: (payload) => {
          setTransferPending(false);
          setTransferStatus(`Transfer submitted: ${payload.txId}`);
          appendTransferLog(`Transfer submitted. txId=${payload.txId}`);
          refreshWallet();
        },
        onCancel: () => {
          setTransferPending(false);
          setTransferStatus('Transfer cancelled or failed in wallet.');
          appendTransferLog('Transfer cancelled or failed in wallet.');
        }
      });
      appendTransferLog('Wallet prompt opened.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTransferPending(false);
      setTransferStatus(`Transfer failed: ${message}`);
      appendTransferLog(`Transfer failed: ${message}`);
    }
  };

  const handleList = () => {
    setListStatus(null);
    setCancelStatus(null);
    if (!marketContract) {
      setListStatus('Select a market contract in the Market module first.');
      return;
    }
    if (!walletAddress) {
      setListStatus('Connect a wallet to list.');
      return;
    }
    if (marketMismatch) {
      setListStatus(
        `Network mismatch: wallet on ${marketMismatch.actual}, market is ${marketMismatch.expected}.`
      );
      return;
    }
    if (marketNetworkMismatch) {
      setListStatus('Market network must match the active NFT contract.');
      return;
    }
    if (!selectedToken) {
      setListStatus('Select a token to list.');
      return;
    }
    if (selectedToken.owner && selectedToken.owner !== walletAddress) {
      setListStatus('Only the owner can list this inscription.');
      return;
    }
    if (selectedListed) {
      setListStatus('This inscription is already listed.');
      return;
    }

    if (!marketSettlementSupported) {
      setListStatus(marketSettlementMessage ?? 'Unsupported payment token.');
      return;
    }
    const priceAmount = parseMarketPriceInput(listPriceInput, marketSettlement);
    if (priceAmount === null) {
      setListStatus(`Enter a valid price in ${marketSettlement.symbol}.`);
      return;
    }

    setListPending(true);
    setListStatus('Waiting for wallet confirmation...');

    try {
      showContractCall({
        contractAddress: marketContract.address,
        contractName: marketContract.contractName,
        functionName: 'list-token',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          uintCV(selectedToken.id),
          uintCV(priceAmount)
        ],
        network: props.walletSession.network ?? marketContract.network,
        stxAddress: walletAddress,
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildTransferPostCondition({
            contract: props.contract,
            senderAddress: walletAddress,
            tokenId: selectedToken.id
          })
        ],
        onFinish: (payload) => {
          setListPending(false);
          setListStatus(`Listing submitted: ${payload.txId}`);
          refreshWallet();
          refreshMarketActivity();
        },
        onCancel: () => {
          setListPending(false);
          setListStatus('Listing cancelled or failed in wallet.');
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setListPending(false);
      setListStatus(`Listing failed: ${message}`);
    }
  };

  const handleOpenListingTools = () => {
    setWalletToolsOpen(true);
    requestAnimationFrame(() => {
      walletToolsRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  };

  const handleSelectMarketContract = useCallback((nextId: string) => {
    setListStatus(null);
    setCancelStatus(null);
    if (!nextId) {
      return;
    }
    setMarketContractId(nextId);
    marketSelectionStore.save(nextId);
  }, []);

  const handleCancel = () => {
    setCancelStatus(null);
    setListStatus(null);
    if (!marketContract) {
      setCancelStatus('Select a market contract in the Market module first.');
      return;
    }
    if (!walletAddress) {
      setCancelStatus('Connect a wallet to cancel.');
      return;
    }
    if (marketMismatch) {
      setCancelStatus(
        `Network mismatch: wallet on ${marketMismatch.actual}, market is ${marketMismatch.expected}.`
      );
      return;
    }
    if (marketNetworkMismatch) {
      setCancelStatus('Market network must match the active NFT contract.');
      return;
    }
    if (!selectedToken) {
      setCancelStatus('Select a token to cancel.');
      return;
    }
    if (!selectedListing) {
      setCancelStatus('This inscription is not listed.');
      return;
    }
    if (selectedListing.seller && selectedListing.seller !== walletAddress) {
      setCancelStatus('Only the seller can cancel this listing.');
      return;
    }

    setCancelPending(true);
    setCancelStatus('Waiting for wallet confirmation...');

    try {
      showContractCall({
        contractAddress: marketContract.address,
        contractName: marketContract.contractName,
        functionName: 'cancel',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          uintCV(selectedListing.listingId)
        ],
        network: props.walletSession.network ?? marketContract.network,
        stxAddress: walletAddress,
        onFinish: (payload) => {
          setCancelPending(false);
          setCancelStatus(`Cancel submitted: ${payload.txId}`);
          refreshWallet();
          refreshMarketActivity();
        },
        onCancel: () => {
          setCancelPending(false);
          setCancelStatus('Cancel cancelled or failed in wallet.');
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCancelPending(false);
      setCancelStatus(`Cancel failed: ${message}`);
    }
  };

  return (
    <section
      className={`wallet app-section app-section--fit${props.collapsed ? ' module--collapsed' : ''}`}
      id="my-wallet"
    >
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>My wallet</h2>
            <p>Shows tokens owned by the selected wallet address.</p>
          </div>
          <div className="panel__actions panel__actions--column">
            <button
              className="button button--ghost button--collapse"
              type="button"
              onClick={props.onToggleCollapse}
              aria-expanded={!props.collapsed}
            >
              {props.collapsed ? 'Expand' : 'Collapse'}
            </button>
            <div className="viewer-controls">
              <span className="badge badge--neutral">
                {ownedTokens.length} owned
              </span>
              <div className="viewer-controls__pagination">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() =>
                    setPageIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={pageIndex <= 0}
                >
                  Prev
                </button>
                <span className="viewer-controls__label">
                  Page {pageIndex + 1} of {maxPage + 1}
                </span>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() =>
                    setPageIndex((current) => Math.min(maxPage, current + 1))
                  }
                  disabled={pageIndex >= maxPage}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="panel__body wallet-panel__body">
          <div className="grid-panel">
            <div className="grid-panel__meta">
              {lastTokenQuery.isLoading && <p>Loading collection...</p>}
              {lastTokenQuery.isError && (
                <p>Unable to load collection for this contract.</p>
              )}
              {!lastTokenQuery.isLoading && !targetAddress && (
                <p>Enter a wallet address above or connect a wallet to view holdings.</p>
              )}
              {!lastTokenQuery.isLoading &&
                targetAddress &&
                ownedTokens.length === 0 && (
                  <p>No tokens owned by this address yet.</p>
                )}
            </div>
            {pageTokens.length > 0 && (
              <div className="square-frame">
                <div className="token-grid square-frame__content">
                    {pageTokens.map((token) => (
                      <OwnedTokenCard
                        key={token.id.toString()}
                        token={token}
                        contractId={contractId}
                        senderAddress={props.senderAddress}
                        client={client}
                        isSelected={token.id === selectedTokenId}
                        isListed={isTokenListed(token)}
                        listingBadgeLabel={marketSettlementLabel}
                        listingBadgeVariant={marketSettlementBadgeVariant}
                        onSelect={handleSelectToken}
                        isActiveTab={props.isActiveTab}
                      />
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Content preview</h2>
            <p>Shows the selected inscription from the current view.</p>
          </div>
        </div>
        <div className="panel__body detail-panel">
          <div className="detail-panel__preview">
            <div className="wallet-preview">
              {selectedToken ? (
                <TokenContentPreview
                  token={selectedToken}
                  contractId={contractId}
                  senderAddress={props.senderAddress}
                  client={client}
                  isActiveTab={props.isActiveTab}
                />
              ) : selectedTokenId !== null ? (
                <p>Loading token #{selectedTokenId.toString()}...</p>
              ) : (
                <p>Select a token to preview its content.</p>
              )}
              {selectedListing && (
                <button
                  type="button"
                  className={`wallet-preview__badge ${marketSettlementBadgeVariant}`}
                  onClick={handleOpenListingTools}
                  title="Open listing tools"
                >
                  {`Listed · ${marketSettlementLabel}`}
                </button>
              )}
            </div>
          </div>
          <div className="detail-panel__tools" ref={walletToolsRef}>
            <div className="transfer-panel wallet-tools__panel">
              <div>
                <h3>Listing tools</h3>
                <p>List or cancel the selected inscription.</p>
              </div>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Selected token</span>
                  <span className="meta-value">
                    {selectedToken ? `#${selectedToken.id.toString()}` : 'None'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Market contract</span>
                  {marketContractIdLabel ? (
                    <AddressLabel
                      address={marketContractIdLabel}
                      network={marketContract?.network ?? props.contract.network}
                      className="meta-value"
                    />
                  ) : (
                    <span className="meta-value">{marketLabel}</span>
                  )}
                </div>
                <div>
                  <span className="meta-label">Listing status</span>
                  <span className="meta-value">{listingStatusLabel}</span>
                </div>
                <div>
                  <span className="meta-label">Settlement</span>
                  <span className="market-badge-row">
                    <span
                      className={`badge badge--compact ${marketSettlementBadgeVariant}`}
                    >
                      {marketSettlementLabel}
                    </span>
                  </span>
                </div>
                {listingPriceLabel && (
                  <div>
                    <span className="meta-label">Listing price</span>
                    <span className="meta-value">{listingPriceLabel}</span>
                  </div>
                )}
              </div>
              {parsedMarket.error && (
                <span className="meta-value">{parsedMarket.error}</span>
              )}
              {marketNetworkMismatch && (
                <span className="meta-value">
                  Market network must match the active NFT contract.
                </span>
              )}
              <label className="field">
                <span className="field__label">Settlement market</span>
                <select
                  className="select"
                  value={marketPresetValue}
                  onChange={(event) =>
                    handleSelectMarketContract(event.target.value)
                  }
                  disabled={listPending || cancelPending}
                >
                  {!marketPresetValue && (
                    <option value="">Custom market (set in Market module)</option>
                  )}
                  {MARKET_REGISTRY.map((entry) => {
                    const id = getMarketContractId(entry);
                    const settlement = getMarketSettlementAsset(
                      entry.paymentTokenContractId
                    );
                    return (
                      <option key={id} value={id}>
                        {`${entry.label} · ${getMarketSettlementLabel(settlement)}`}
                      </option>
                    );
                  })}
                </select>
              </label>
              {!marketPresetValue && marketContractIdLabel && (
                <span className="meta-value">
                  Custom market active. Open the Market module to edit the raw
                  contract ID directly.
                </span>
              )}
              {!marketSettlementSupported && marketSettlementMessage && (
                <span className="meta-value">{marketSettlementMessage}</span>
              )}
              <label className="field">
                <span className="field__label">
                  {getMarketPriceInputLabel(marketSettlement)}
                </span>
                <input
                  className="input"
                  placeholder="0.25"
                  value={listPriceInput}
                  onChange={(event) => {
                    setListPriceInput(event.target.value);
                    setListStatus(null);
                  }}
                  disabled={listPending}
                />
              </label>
              {listStatus && <span className="meta-value">{listStatus}</span>}
              {cancelStatus && <span className="meta-value">{cancelStatus}</span>}
              <div className="transfer-panel__actions">
                <button
                  className="button button--mini"
                  type="button"
                  onClick={handleList}
                  disabled={
                    listPending ||
                    cancelPending ||
                    !selectedToken ||
                    !marketSettlementSupported
                  }
                >
                  {listPending ? 'Listing...' : 'List'}
                </button>
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={handleCancel}
                  disabled={
                    cancelPending ||
                    listPending ||
                    !selectedToken ||
                    !selectedListing
                  }
                >
                  {cancelPending ? 'Cancelling...' : 'Cancel listing'}
                </button>
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={() => {
                    setListPriceInput('');
                    setListStatus(null);
                    setCancelStatus(null);
                  }}
                  disabled={listPending || cancelPending}
                >
                  Clear
                </button>
              </div>
            </div>
            <details
              className="preview-drawer preview-drawer--advanced"
              open={walletToolsOpen}
              onToggle={(event) => setWalletToolsOpen(event.currentTarget.open)}
            >
              <summary>Advanced tools &amp; filters</summary>
              <div className="preview-drawer__body">
                <div className="transfer-panel">
                  <div>
                    <h3>Transfer inscription</h3>
                    <p>Send the selected inscription to another address.</p>
                  </div>
                  <div className="meta-grid">
                    <div>
                      <span className="meta-label">Selected token</span>
                      <span className="meta-value">
                        {selectedToken ? `#${selectedToken.id.toString()}` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="meta-label">Owner</span>
                      <AddressLabel
                        address={selectedToken?.owner}
                        network={props.contract.network}
                        className="meta-value"
                      />
                    </div>
                  </div>
                  <label className="field">
                    <span className="field__label">Recipient address</span>
                    <input
                      className="input"
                      placeholder="ST..."
                      value={transferRecipient}
                      onChange={(event) => {
                        setTransferRecipient(event.target.value);
                        setTransferStatus(null);
                      }}
                      disabled={transferPending}
                    />
                    {recipientValidationError && transferValidationMessage && (
                      <span className="meta-value">{transferValidationMessage}</span>
                    )}
                  </label>
                  {transferStatus && (
                    <span className="meta-value">{transferStatus}</span>
                  )}
                  {!transferStatus &&
                    !recipientValidationError &&
                    transferValidationMessage && (
                      <span className="meta-value">{transferValidationMessage}</span>
                    )}
                  <div className="transfer-panel__actions">
                    <button
                      className="button button--mini"
                      type="button"
                      onClick={handleTransfer}
                      disabled={!transferValidation.ok || transferPending}
                    >
                      {transferPending ? 'Transferring...' : 'Transfer'}
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() => {
                        setTransferRecipient('');
                        setTransferStatus(null);
                      }}
                      disabled={transferPending}
                    >
                      Clear
                    </button>
                  </div>
                  {transferLog.length > 0 && (
                    <div className="transfer-log">
                      {transferLog.map((entry, index) => (
                        <span
                          key={`${entry}-${index}`}
                          className="transfer-log__item"
                        >
                          {entry}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
