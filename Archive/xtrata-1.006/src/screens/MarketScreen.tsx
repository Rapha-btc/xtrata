import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { showContractCall } from '@stacks/connect';
import {
  type ClarityValue,
  contractPrincipalCV,
  makeStandardSTXPostCondition,
  FungibleConditionCode,
  PostConditionMode,
  type PostCondition,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import type { ContractConfig } from '../lib/contract/config';
import { getContractId } from '../lib/contract/config';
import {
  buildContractTransferPostCondition,
  buildTransferPostCondition
} from '../lib/contract/post-conditions';
import { formatMicroStx, MICROSTX_PER_STX } from '../lib/contract/fees';
import { getNetworkMismatch, getNetworkFromAddress } from '../lib/network/guard';
import { getApiBaseUrl } from '../lib/network/config';
import { createXtrataClient } from '../lib/contract/client';
import { createMarketClient } from '../lib/market/client';
import { MARKET_REGISTRY, getMarketContractId } from '../lib/market/registry';
import { createMarketSelectionStore } from '../lib/market/selection';
import { logInfo, logWarn } from '../lib/utils/logger';

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const MIN_FEE_BUFFER_MICROSTX = 10_000n;
const BASIS_POINTS = 10_000n;

const marketSelectionStore = createMarketSelectionStore();

type MarketScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type TxPayload = {
  txId: string;
};

type ParsedMarketContract = {
  config: ContractConfig | null;
  error: string | null;
};

const parseMarketContractId = (value: string): ParsedMarketContract => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { config: null, error: 'Set a market contract ID first.' };
  }
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { config: null, error: 'Use format ADDRESS.CONTRACT-NAME.' };
  }
  const address = trimmed.slice(0, dotIndex).trim();
  const contractName = trimmed.slice(dotIndex + 1).trim();
  if (!validateStacksAddress(address)) {
    return { config: null, error: 'Invalid Stacks address.' };
  }
  if (!CONTRACT_NAME_PATTERN.test(contractName)) {
    return { config: null, error: 'Invalid contract name.' };
  }
  const network = getNetworkFromAddress(address);
  if (!network) {
    return { config: null, error: 'Could not infer network from address.' };
  }
  return { config: { address, contractName, network }, error: null };
};

const parseUintInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  try {
    return BigInt(trimmed);
  } catch (error) {
    return null;
  }
};

const parseStxInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const fetchStxBalance = async (address: string, network: NetworkType) => {
  const base = getApiBaseUrl(network);
  const response = await fetch(`${base}/v2/accounts/${address}?proof=0`);
  if (!response.ok) {
    throw new Error('Balance fetch failed');
  }
  const json = (await response.json()) as { balance?: string };
  const raw = json.balance ?? '0';
  return BigInt(raw);
};

export default function MarketScreen(props: MarketScreenProps) {
  const defaultMarketId = getMarketContractId(MARKET_REGISTRY[0]);
  const [marketInput, setMarketInput] = useState(
    () => marketSelectionStore.load() ?? defaultMarketId
  );
  const [marketContractId, setMarketContractId] = useState(
    () => marketSelectionStore.load() ?? defaultMarketId
  );
  const [statusKey, setStatusKey] = useState(0);
  const [listingIdInput, setListingIdInput] = useState('');
  const [tokenLookupInput, setTokenLookupInput] = useState('');
  const [listingLookupId, setListingLookupId] = useState<bigint | null>(null);
  const [tokenLookupId, setTokenLookupId] = useState<bigint | null>(null);
  const [listTokenIdInput, setListTokenIdInput] = useState('');
  const [listPriceInput, setListPriceInput] = useState('');
  const [buyListingIdInput, setBuyListingIdInput] = useState('');
  const [cancelListingIdInput, setCancelListingIdInput] = useState('');
  const [buyListingTouched, setBuyListingTouched] = useState(false);
  const [cancelListingTouched, setCancelListingTouched] = useState(false);
  const [listStatus, setListStatus] = useState<string | null>(null);
  const [buyStatus, setBuyStatus] = useState<string | null>(null);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const [listPending, setListPending] = useState(false);
  const [buyPending, setBuyPending] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [preflightKey, setPreflightKey] = useState(0);
  const [preflightListingId, setPreflightListingId] = useState<bigint | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!marketSelectionStore.load()) {
      marketSelectionStore.save(defaultMarketId);
    }
  }, [defaultMarketId]);

  const marketRegistryIds = useMemo(
    () => MARKET_REGISTRY.map(getMarketContractId),
    []
  );
  const marketPresetValue = marketRegistryIds.includes(marketInput.trim())
    ? marketInput.trim()
    : '';

  useEffect(() => {
    setListingLookupId(null);
    setTokenLookupId(null);
    setListingIdInput('');
    setTokenLookupInput('');
    setListTokenIdInput('');
    setListPriceInput('');
    setBuyListingIdInput('');
    setCancelListingIdInput('');
    setBuyListingTouched(false);
    setCancelListingTouched(false);
    setListStatus(null);
    setBuyStatus(null);
    setCancelStatus(null);
    setPreflightKey(0);
    setPreflightListingId(null);
    setPreflightStatus(null);
  }, [marketContractId]);

  const parsedMarketInput = useMemo(
    () => parseMarketContractId(marketInput),
    [marketInput]
  );
  const parsedMarket = useMemo(
    () => parseMarketContractId(marketContractId),
    [marketContractId]
  );
  const marketContract = parsedMarket.config;
  const marketError = marketInput.trim() ? parsedMarketInput.error : null;
  const activeMarketError = parsedMarket.error;
  const marketClient = useMemo(
    () => (marketContract ? createMarketClient({ contract: marketContract }) : null),
    [marketContract]
  );
  const nftClient = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );

  const buyerAddress = props.walletSession.address ?? null;
  const readOnlySender =
    props.walletSession.address ?? marketContract?.address ?? props.contract.address;
  const marketMismatch = marketContract
    ? getNetworkMismatch(marketContract.network, props.walletSession.network)
    : null;
  const marketContractIdLabel = marketContract ? getContractId(marketContract) : null;
  const nftContractId = getContractId(props.contract);
  const nftNetworkMismatch =
    marketContract && marketContract.network !== props.contract.network;
  const canTransact =
    !!props.walletSession.address &&
    !marketMismatch &&
    !!marketContract &&
    !nftNetworkMismatch;

  const statusQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'status', statusKey],
    enabled: !!marketClient && statusKey > 0,
    queryFn: async () => {
      if (!marketClient) {
        throw new Error('Market client unavailable');
      }
      const sender = readOnlySender;
      const [owner, nftContract, feeBps, lastListingId] = await Promise.all([
        marketClient.getOwner(sender),
        marketClient.getNftContract(sender),
        marketClient.getFeeBps(sender),
        marketClient.getLastListingId(sender)
      ]);
      return { owner, nftContract, feeBps, lastListingId };
    }
  });

  const listingQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'listing', listingLookupId?.toString() ?? 'none'],
    enabled: !!marketClient && listingLookupId !== null,
    queryFn: async () => {
      if (!marketClient || listingLookupId === null) {
        return null;
      }
      return marketClient.getListing(listingLookupId, readOnlySender);
    }
  });

  const tokenLookupQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'token-lookup', tokenLookupId?.toString() ?? 'none'],
    enabled: !!marketClient && tokenLookupId !== null,
    queryFn: async () => {
      if (!marketClient || tokenLookupId === null) {
        return { listingId: null, listing: null };
      }
      const listingId = await marketClient.getListingIdByToken(
        nftContractId,
        tokenLookupId,
        readOnlySender
      );
      if (listingId === null) {
        return { listingId: null, listing: null };
      }
      const listing = await marketClient.getListing(listingId, readOnlySender);
      return { listingId, listing };
    }
  });

  const activeListing = listingQuery.data ?? tokenLookupQuery.data?.listing ?? null;
  const activeListingId = listingQuery.data
    ? listingLookupId
    : tokenLookupQuery.data?.listingId ?? null;

  useEffect(() => {
    if (activeListingId === null) {
      return;
    }
    if (!buyListingTouched && !buyListingIdInput.trim()) {
      setBuyListingIdInput(activeListingId.toString());
    }
    if (!cancelListingTouched && !cancelListingIdInput.trim()) {
      setCancelListingIdInput(activeListingId.toString());
    }
  }, [
    activeListingId,
    buyListingTouched,
    buyListingIdInput,
    cancelListingTouched,
    cancelListingIdInput
  ]);

  const preflightQuery = useQuery({
    queryKey: [
      'market',
      marketContractIdLabel,
      'preflight',
      preflightListingId?.toString() ?? 'none',
      preflightKey
    ],
    enabled:
      !!marketClient &&
      !!marketContract &&
      preflightKey > 0 &&
      preflightListingId !== null,
    queryFn: async () => {
      if (!marketClient || !marketContract || preflightListingId === null) {
        return null;
      }
      const listing = await marketClient.getListing(
        preflightListingId,
        readOnlySender
      );
      if (!listing) {
        return {
          listingId: preflightListingId,
          listing: null,
          owner: null,
          balance: null
        };
      }
      const owner = await nftClient.getOwner(listing.tokenId, readOnlySender);
      let balance: bigint | null = null;
      if (props.walletSession.address) {
        try {
          balance = await fetchStxBalance(
            props.walletSession.address,
            marketContract.network
          );
        } catch (error) {
          balance = null;
        }
      }
      return {
        listingId: preflightListingId,
        listing,
        owner,
        balance
      };
    }
  });

  const handleSaveMarketContract = () => {
    const parsed = parseMarketContractId(marketInput);
    if (parsed.error || !parsed.config) {
      return;
    }
    const trimmed = marketInput.trim();
    setMarketContractId(trimmed);
    marketSelectionStore.save(trimmed);
  };

  const handleClearMarketContract = () => {
    setMarketInput('');
    setMarketContractId('');
    marketSelectionStore.clear();
  };

  const handleRefreshStatus = () => {
    if (!marketContract) {
      return;
    }
    setStatusKey((prev) => prev + 1);
  };


  const handleLookupListing = () => {
    const parsed = parseUintInput(listingIdInput);
    if (parsed === null) {
      return;
    }
    setListingLookupId(parsed);
  };

  const handleLookupToken = () => {
    const parsed = parseUintInput(tokenLookupInput);
    if (parsed === null) {
      return;
    }
    setTokenLookupId(parsed);
  };

  const handleRunPreflight = () => {
    const candidate =
      parseUintInput(listingIdInput) ??
      activeListingId ??
      tokenLookupQuery.data?.listingId ??
      null;
    if (candidate === null) {
      setPreflightStatus('Enter a listing ID or load a listing first.');
      return;
    }
    setPreflightListingId(candidate);
    setPreflightKey((prev) => prev + 1);
    setPreflightStatus(null);
  };

  const requestContractCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
    postConditionMode?: PostConditionMode;
    postConditions?: PostCondition[];
  }) => {
    if (!marketContract) {
      return Promise.reject(new Error('Market contract missing.'));
    }
    const network = props.walletSession.network ?? marketContract.network;
    const stxAddress = props.walletSession.address;
    logInfo('market', 'Requesting contract call', {
      contractId: marketContractIdLabel,
      functionName: options.functionName,
      network,
      sender: stxAddress ?? null
    });
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: marketContract.address,
        contractName: marketContract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network,
        stxAddress,
        postConditionMode: options.postConditionMode,
        postConditions: options.postConditions,
        onFinish: (payload) => {
          const resolved = payload as TxPayload;
          logInfo('market', 'Contract call broadcast', {
            contractId: marketContractIdLabel,
            functionName: options.functionName,
            txId: resolved.txId
          });
          resolve(resolved);
        },
        onCancel: () => {
          logWarn('market', 'Contract call cancelled', {
            contractId: marketContractIdLabel,
            functionName: options.functionName
          });
          reject(new Error('Wallet cancelled or failed to broadcast.'));
        }
      });
    });
  };

  const handleList = async () => {
    setListStatus(null);
    if (!marketContract) {
      setListStatus('Set a market contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setListStatus('Connect a wallet to list.');
      return;
    }
    if (marketMismatch) {
      setListStatus(
        `Network mismatch: wallet on ${marketMismatch.actual}, market is ${marketMismatch.expected}.`
      );
      return;
    }
    if (nftNetworkMismatch) {
      setListStatus('Market network must match the active NFT contract.');
      return;
    }
    const tokenId = parseUintInput(listTokenIdInput);
    if (tokenId === null) {
      setListStatus('Enter a valid token ID.');
      return;
    }
    const stxAmount = parseStxInput(listPriceInput);
    if (stxAmount === null) {
      setListStatus('Enter a valid price in STX.');
      return;
    }
    const priceMicro = Math.round(stxAmount * MICROSTX_PER_STX);
    if (priceMicro <= 0) {
      setListStatus('Price must be greater than 0.');
      return;
    }

    setListPending(true);
    setListStatus('Submitting listing transaction...');
    try {
      const postConditions = [
        buildTransferPostCondition({
          contract: props.contract,
          senderAddress: props.walletSession.address,
          tokenId
        })
      ];
      const tx = await requestContractCall({
        functionName: 'list-token',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          uintCV(tokenId),
          uintCV(BigInt(priceMicro))
        ],
        postConditionMode: PostConditionMode.Deny,
        postConditions
      });
      setListStatus(`Listing submitted: ${tx.txId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setListStatus(`Listing failed: ${message}`);
    } finally {
      setListPending(false);
    }
  };

  const handleBuy = async () => {
    setBuyStatus(null);
    if (!marketContract) {
      setBuyStatus('Set a market contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setBuyStatus('Connect a wallet to buy.');
      return;
    }
    if (marketMismatch) {
      setBuyStatus(
        `Network mismatch: wallet on ${marketMismatch.actual}, market is ${marketMismatch.expected}.`
      );
      return;
    }
    if (nftNetworkMismatch) {
      setBuyStatus('Market network must match the active NFT contract.');
      return;
    }

    const inputId = parseUintInput(buyListingIdInput);
    const listingId = inputId ?? activeListingId;
    if (listingId === null) {
      setBuyStatus('Enter a listing ID or load a listing first.');
      return;
    }
    if (preflightListingId !== listingId) {
      setBuyStatus(`Run checks for listing #${listingId.toString()} before buying.`);
      return;
    }
    if (preflightQuery.isFetching) {
      setBuyStatus('Wait for checks to finish before buying.');
      return;
    }
    if (preflightSelfBuy) {
      setBuyStatus('You cannot buy your own listing.');
      return;
    }
    if (preflightBalance !== null && preflightListing && !preflightBalanceOk) {
      setBuyStatus('Buyer balance is below the listing price.');
      return;
    }
    if (
      preflightBalance !== null &&
      preflightListing &&
      !preflightBalanceWithBufferOk
    ) {
      setBuyStatus(
        `Buyer balance may be too low to cover network fees. Add at least ${formatMicroStx(
          Number(MIN_FEE_BUFFER_MICROSTX)
        )} buffer.`
      );
      return;
    }

    setBuyPending(true);
    setBuyStatus('Preparing purchase...');
    try {
      logInfo('market', 'Buy request', {
        listingId: listingId.toString(),
        buyer: props.walletSession.address ?? null,
        preflightListingId: preflightListingId?.toString() ?? null,
        preflightMatchesBuy
      });
      const listing =
        activeListing && activeListingId === listingId
          ? activeListing
          : await marketClient?.getListing(listingId, readOnlySender);
      if (!listing) {
        setBuyStatus('Listing not found.');
        return;
      }
      if (listing.nftContract !== nftContractId) {
        setBuyStatus(`Listing belongs to ${listing.nftContract}.`);
        return;
      }
      const owner = await nftClient.getOwner(listing.tokenId, readOnlySender);
      if (!owner) {
        setBuyStatus('Token is not minted or owner is unavailable.');
        return;
      }
      if (marketContractIdLabel && owner !== marketContractIdLabel) {
        setBuyStatus(`Listing is stale. Current owner is ${owner}.`);
        return;
      }
      if (listing.seller === props.walletSession.address) {
        setBuyStatus('You cannot buy your own listing.');
        return;
      }
      logInfo('market', 'Buy preflight resolved', {
        listingId: listingId.toString(),
        tokenId: listing.tokenId.toString(),
        listingContract: listing.nftContract,
        owner,
        marketContract: marketContractIdLabel,
        buyer: props.walletSession.address ?? null,
        seller: listing.seller,
        price: listing.price.toString()
      });
      const postConditions = [
        makeStandardSTXPostCondition(
          props.walletSession.address,
          FungibleConditionCode.Equal,
          listing.price
        ),
        buildContractTransferPostCondition({
          nftContract: props.contract,
          senderContract: marketContract,
          tokenId: listing.tokenId
        })
      ];
      const tx = await requestContractCall({
        functionName: 'buy',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          uintCV(listingId)
        ],
        postConditionMode: PostConditionMode.Deny,
        postConditions
      });
      setBuyStatus(`Purchase submitted: ${tx.txId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('post-condition')) {
        logWarn('market', 'Buy post-condition failure', {
          listingId: listingId.toString(),
          buyer: props.walletSession.address ?? null,
          seller: preflightSeller,
          price: preflightListing?.price.toString() ?? null
        });
        setBuyStatus(
          'Purchase failed: no STX was transferred. Check listing status and your balance.'
        );
      } else {
        logWarn('market', 'Buy failed', {
          listingId: listingId.toString(),
          buyer: props.walletSession.address ?? null,
          error: message
        });
        setBuyStatus(`Purchase failed: ${message}`);
      }
    } finally {
      setBuyPending(false);
    }
  };

  const handleCancel = async () => {
    setCancelStatus(null);
    if (!marketContract) {
      setCancelStatus('Set a market contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setCancelStatus('Connect a wallet to cancel.');
      return;
    }
    if (marketMismatch) {
      setCancelStatus(
        `Network mismatch: wallet on ${marketMismatch.actual}, market is ${marketMismatch.expected}.`
      );
      return;
    }
    if (nftNetworkMismatch) {
      setCancelStatus('Market network must match the active NFT contract.');
      return;
    }

    const inputId = parseUintInput(cancelListingIdInput);
    const listingId = inputId ?? activeListingId;
    if (listingId === null) {
      setCancelStatus('Enter a listing ID or load a listing first.');
      return;
    }

    setCancelPending(true);
    setCancelStatus('Submitting cancel transaction...');
    try {
      const tx = await requestContractCall({
        functionName: 'cancel',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          uintCV(listingId)
        ]
      });
      setCancelStatus(`Cancel submitted: ${tx.txId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCancelStatus(`Cancel failed: ${message}`);
    } finally {
      setCancelPending(false);
    }
  };

  const listingPriceLabel = activeListing
    ? formatMicroStx(Number(activeListing.price))
    : '—';
  const allowedNftMismatch =
    !!statusQuery.data?.nftContract &&
    statusQuery.data.nftContract !== nftContractId;
  const preflight = preflightQuery.data;
  const preflightListing = preflight?.listing ?? null;
  const preflightOwner = preflight?.owner ?? null;
  const preflightBalance = preflight?.balance ?? null;
  const preflightEscrowOk =
    !!preflightListing &&
    !!preflightOwner &&
    !!marketContractIdLabel &&
    preflightOwner === marketContractIdLabel;
  const preflightContractOk =
    !!preflightListing && preflightListing.nftContract === nftContractId;
  const preflightBalanceOk =
    preflightBalance !== null &&
    !!preflightListing &&
    preflightBalance >= preflightListing.price;
  const preflightBalanceWithBufferOk =
    preflightBalance !== null &&
    !!preflightListing &&
    preflightBalance >= preflightListing.price + MIN_FEE_BUFFER_MICROSTX;
  const preflightBuyer = buyerAddress;
  const preflightSeller = preflightListing?.seller ?? null;
  const preflightSelfBuy =
    !!preflightBuyer && !!preflightSeller && preflightBuyer === preflightSeller;
  const feeBpsValue = statusQuery.data?.feeBps ?? null;
  const preflightFee =
    preflightListing && feeBpsValue !== null
      ? (preflightListing.price * feeBpsValue) / BASIS_POINTS
      : null;
  const preflightBuyTarget =
    parseUintInput(buyListingIdInput) ?? activeListingId ?? null;
  const preflightMatchesBuy =
    preflightListingId !== null &&
    preflightBuyTarget !== null &&
    preflightListingId === preflightBuyTarget;
  const buyPriceLabel = preflightListing
    ? formatMicroStx(Number(preflightListing.price))
    : listingPriceLabel;

  const buildCheckClass = (state: boolean | null) => {
    if (state === true) {
      return 'market-check market-check--ok';
    }
    if (state === false) {
      return 'market-check market-check--warn';
    }
    return 'market-check';
  };

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="market"
    >
      <div className="panel__header">
        <div>
          <h2>Market</h2>
          <p>List, buy, and cancel SIP-009 listings via the market contract.</p>
        </div>
        <div className="panel__actions">
          {marketContract && (
            <span className={`badge badge--${marketContract.network}`}>
              {marketContract.network}
            </span>
          )}
          <button
            className="button button--ghost button--collapse"
            type="button"
            onClick={props.onToggleCollapse}
            aria-expanded={!props.collapsed}
          >
            {props.collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      <div className="panel__body">
        <div className="market-grid">
          <div className="market-block">
            <h3>Market contract</h3>
            <label className="field">
              <span className="field__label">Registry</span>
              <select
                className="select"
                value={marketPresetValue}
                onChange={(event) => setMarketInput(event.target.value)}
              >
                <option value="">Custom</option>
                {MARKET_REGISTRY.map((entry) => {
                  const id = getMarketContractId(entry);
                  return (
                    <option key={id} value={id}>
                      {entry.label}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Contract ID</span>
              <input
                className="input"
                placeholder="SP...xtrata-market-v1-1"
                value={marketInput}
                onChange={(event) => setMarketInput(event.target.value)}
              />
            </label>
            {marketError && <div className="field__error">{marketError}</div>}
            {!marketError && activeMarketError && (
              <div className="field__error">{activeMarketError}</div>
            )}
            <div className="market-controls">
              <button
                className="button"
                type="button"
                onClick={handleSaveMarketContract}
                disabled={!marketInput.trim() || !!marketError}
              >
                Use contract
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleClearMarketContract}
                disabled={!marketContractId}
              >
                Clear
              </button>
            </div>
            {marketContractIdLabel && (
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Market contract</span>
                  <span className="meta-value">{marketContractIdLabel}</span>
                </div>
                <div>
                  <span className="meta-label">NFT contract</span>
                  <span className="meta-value">{nftContractId}</span>
                </div>
              </div>
            )}
            {marketMismatch && (
              <div className="alert">
                <div>
                  <strong>Network mismatch.</strong> Wallet is on{' '}
                  {marketMismatch.actual}, market is {marketMismatch.expected}.
                </div>
              </div>
            )}
            {nftNetworkMismatch && (
              <div className="alert">
                <div>
                  <strong>Network mismatch.</strong> Market contract network must
                  match the active NFT contract.
                </div>
              </div>
            )}
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Market status</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleRefreshStatus}
                disabled={!marketContract}
              >
                Refresh
              </button>
            </div>
            {statusQuery.isFetching && <p>Loading market status...</p>}
            {statusQuery.data && (
              <>
                <div className="meta-grid">
                  <div>
                    <span className="meta-label">Owner</span>
                    <span className="meta-value">{statusQuery.data.owner}</span>
                  </div>
                  <div>
                    <span className="meta-label">Allowed NFT</span>
                    <span className="meta-value">
                      {statusQuery.data.nftContract}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Fee</span>
                    <span className="meta-value">{statusQuery.data.feeBps} bps</span>
                  </div>
                  <div>
                    <span className="meta-label">Last listing</span>
                    <span className="meta-value">
                      {statusQuery.data.lastListingId.toString()}
                    </span>
                  </div>
                </div>
                {allowedNftMismatch && (
                  <div className="alert">
                    <div>
                      <strong>Allowed contract mismatch.</strong> This market
                      contract is locked to {statusQuery.data.nftContract}. To
                      support a different NFT contract, redeploy the market
                      contract with the updated allowed contract constant.
                    </div>
                  </div>
                )}
              </>
            )}
            {statusQuery.error && (
              <div className="field__error">Unable to load market status.</div>
            )}
          </div>

          <div className="market-block">
            <h3>Lookup listing</h3>
            <label className="field">
              <span className="field__label">Listing ID</span>
              <div className="field__inline">
                <input
                  className="input"
                  placeholder="e.g. 12"
                  value={listingIdInput}
                  onChange={(event) => setListingIdInput(event.target.value)}
                />
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleLookupListing}
                  disabled={!marketContract}
                >
                  Load
                </button>
              </div>
            </label>
            <label className="field">
              <span className="field__label">Token ID</span>
              <div className="field__inline">
                <input
                  className="input"
                  placeholder="e.g. 42"
                  value={tokenLookupInput}
                  onChange={(event) => setTokenLookupInput(event.target.value)}
                />
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleLookupToken}
                  disabled={!marketContract}
                >
                  Find
                </button>
              </div>
            </label>
            {(listingQuery.isFetching || tokenLookupQuery.isFetching) && (
              <p>Loading listing...</p>
            )}
            {activeListing && (
              <div className="market-listing">
                <div>
                  <span className="meta-label">Listing ID</span>
                  <span className="meta-value">
                    {activeListingId ? activeListingId.toString() : '—'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Token</span>
                  <span className="meta-value">#{activeListing.tokenId.toString()}</span>
                </div>
                <div>
                  <span className="meta-label">Price</span>
                  <span className="meta-value">{listingPriceLabel}</span>
                </div>
                <div>
                  <span className="meta-label">Seller</span>
                  <span className="meta-value">{activeListing.seller}</span>
                </div>
              </div>
            )}
            {!activeListing && (listingLookupId || tokenLookupId) && (
              <p className="field__hint">No listing found.</p>
            )}
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Pre-flight checks</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleRunPreflight}
                disabled={!marketContract}
              >
                Run checks
              </button>
            </div>
            {preflightStatus && <p className="field__hint">{preflightStatus}</p>}
            {preflightQuery.isFetching && <p>Running checks...</p>}
            {preflightQuery.isError && (
              <div className="field__error">Pre-flight checks failed.</div>
            )}
            <div className="market-checks">
              <div className={buildCheckClass(preflightListing ? true : preflight ? false : null)}>
                <span>Listing loaded</span>
                <span className="badge badge--neutral">
                  {preflight
                    ? preflightListing
                      ? 'OK'
                      : 'Missing'
                    : 'Pending'}
                </span>
              </div>
              <div
                className={buildCheckClass(
                  preflightListingId !== null && preflightBuyTarget !== null
                    ? preflightMatchesBuy
                    : null
                )}
              >
                <span>Checks match buy target</span>
                <span className="badge badge--neutral">
                  {preflightListingId !== null && preflightBuyTarget !== null
                    ? preflightMatchesBuy
                      ? 'OK'
                      : 'Mismatch'
                    : 'Pending'}
                </span>
              </div>
              <div className={buildCheckClass(preflightContractOk ? true : preflightListing ? false : null)}>
                <span>NFT contract matches</span>
                <span className="badge badge--neutral">
                  {preflightListing
                    ? preflightContractOk
                      ? 'OK'
                      : 'Mismatch'
                    : 'Pending'}
                </span>
              </div>
              <div className={buildCheckClass(preflightEscrowOk ? true : preflightOwner ? false : null)}>
                <span>Escrow owner is market</span>
                <span className="badge badge--neutral">
                  {preflightOwner
                    ? preflightEscrowOk
                      ? 'Escrowed'
                      : 'Not escrowed'
                    : 'Pending'}
                </span>
              </div>
              <div
                className={buildCheckClass(
                  preflightBuyer && preflightSeller ? !preflightSelfBuy : null
                )}
              >
                <span>Buyer is not seller</span>
                <span className="badge badge--neutral">
                  {preflightBuyer && preflightSeller
                    ? preflightSelfBuy
                      ? 'Same wallet'
                      : 'OK'
                    : 'Pending'}
                </span>
              </div>
              <div className={buildCheckClass(preflightBalanceOk ? true : preflightBalance !== null ? false : null)}>
                <span>Buyer balance ≥ price</span>
                <span className="badge badge--neutral">
                  {preflightBalance !== null && preflightListing
                    ? preflightBalanceOk
                      ? 'OK'
                      : 'Low'
                    : 'Pending'}
                </span>
              </div>
            </div>
            {preflightListing && (
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Listing ID</span>
                  <span className="meta-value">
                    {preflight.listingId.toString()}
                  </span>
                </div>
              <div>
                <span className="meta-label">Price</span>
                <span className="meta-value">
                  {formatMicroStx(Number(preflightListing.price))}
                </span>
              </div>
              <div>
                <span className="meta-label">Market fee (included)</span>
                <span className="meta-value">
                  {preflightFee !== null
                    ? formatMicroStx(Number(preflightFee))
                    : 'Unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Token ID</span>
                <span className="meta-value">
                  #{preflightListing.tokenId.toString()}
                </span>
              </div>
              <div>
                <span className="meta-label">Buyer</span>
                <span className="meta-value">{preflightBuyer ?? 'Unknown'}</span>
              </div>
              <div>
                <span className="meta-label">Seller</span>
                <span className="meta-value">{preflightSeller ?? 'Unknown'}</span>
              </div>
              <div>
                <span className="meta-label">Escrow owner</span>
                <span className="meta-value">{preflightOwner ?? 'Unknown'}</span>
              </div>
              <div>
                  <span className="meta-label">Buyer balance</span>
                  <span className="meta-value">
                    {preflightBalance !== null
                      ? formatMicroStx(Number(preflightBalance))
                      : 'Unknown'}
                  </span>
              </div>
              <div>
                <span className="meta-label">Balance ≥ price + miner buffer</span>
                <span className="meta-value">
                  {preflightBalance !== null
                    ? preflightBalanceWithBufferOk
                      ? 'Likely'
                      : 'Possibly low'
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            )}
            {preflightListing && !preflightEscrowOk && (
              <div className="alert">
                <div>
                  <strong>Listing may be stale.</strong> The token is not owned
                  by the market contract. Cancel and re-list to refresh escrow.
                </div>
              </div>
            )}
            {preflightListing && preflightSelfBuy && (
              <div className="alert">
                <div>
                  <strong>Self purchase blocked.</strong> Switch to a different
                  wallet before buying this listing.
                </div>
              </div>
            )}
            {preflightListing &&
              preflightBuyTarget !== null &&
              !preflightMatchesBuy && (
                <div className="alert">
                  <div>
                    <strong>Checks mismatch.</strong> Pre-flight ran for listing
                    #{preflight.listingId.toString()}, but Buy is targeting #
                    {preflightBuyTarget.toString()}.
                  </div>
                </div>
              )}
          </div>

          <div className="market-block">
            <h3>Actions</h3>
            <div className="market-actions">
              <div className="market-action">
                <strong>List</strong>
                <label className="field">
                  <span className="field__label">Token ID</span>
                  <input
                    className="input"
                    placeholder="Token ID"
                    value={listTokenIdInput}
                    onChange={(event) => setListTokenIdInput(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Price (STX)</span>
                  <input
                    className="input"
                    placeholder="1.25"
                    value={listPriceInput}
                    onChange={(event) => setListPriceInput(event.target.value)}
                  />
                </label>
                <button
                  className="button"
                  type="button"
                  onClick={handleList}
                  disabled={!canTransact || listPending}
                >
                  {listPending ? 'Listing...' : 'Create listing'}
                </button>
                {listStatus && <p className="field__hint">{listStatus}</p>}
              </div>

              <div className="market-action">
                <strong>Buy</strong>
                <label className="field">
                  <span className="field__label">Listing ID</span>
                  <input
                    className="input"
                    placeholder="Listing ID"
                    value={buyListingIdInput}
                    onChange={(event) => {
                      setBuyListingTouched(true);
                      setBuyListingIdInput(event.target.value);
                    }}
                  />
                </label>
                {preflightBuyTarget !== null && (
                  <p className="field__hint">
                    Target listing: #{preflightBuyTarget.toString()}
                  </p>
                )}
                {buyPriceLabel !== '—' && (
                  <p className="field__hint">
                    Post condition: buyer spends exactly {buyPriceLabel} (network fee is extra).
                  </p>
                )}
                <button
                  className="button"
                  type="button"
                  onClick={handleBuy}
                  disabled={!canTransact || buyPending}
                >
                  {buyPending ? 'Buying...' : 'Buy now'}
                </button>
                {buyStatus && <p className="field__hint">{buyStatus}</p>}
              </div>

              <div className="market-action">
                <strong>Cancel</strong>
                <label className="field">
                  <span className="field__label">Listing ID</span>
                  <input
                    className="input"
                    placeholder="Listing ID"
                    value={cancelListingIdInput}
                    onChange={(event) => {
                      setCancelListingTouched(true);
                      setCancelListingIdInput(event.target.value);
                    }}
                  />
                </label>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleCancel}
                  disabled={!canTransact || cancelPending}
                >
                  {cancelPending ? 'Cancelling...' : 'Cancel listing'}
                </button>
                {cancelStatus && <p className="field__hint">{cancelStatus}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
