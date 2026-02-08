import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { showContractCall } from '@stacks/connect';
import {
  type ClarityValue,
  contractPrincipalCV,
  makeStandardSTXPostCondition,
  FungibleConditionCode,
  PostConditionMode,
  type PostCondition,
  uintCV
} from '@stacks/transactions';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import { getLegacyContract } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import { getContractId } from '../lib/contract/config';
import {
  buildContractTransferPostCondition,
  buildTransferPostCondition,
  DEFAULT_NFT_ASSET_NAME
} from '../lib/contract/post-conditions';
import { formatMicroStx, MICROSTX_PER_STX } from '../lib/contract/fees';
import { getNetworkMismatch } from '../lib/network/guard';
import { createXtrataClient } from '../lib/contract/client';
import { createMarketClient } from '../lib/market/client';
import {
  buildMarketListingKey,
  buildUnifiedActivityTimeline,
  loadMarketActivity,
  loadNftActivity
} from '../lib/market/indexer';
import { MARKET_REGISTRY, getMarketContractId } from '../lib/market/registry';
import { createMarketSelectionStore } from '../lib/market/selection';
import { parseMarketContractId } from '../lib/market/contract';
import { logInfo, logWarn } from '../lib/utils/logger';
import type {
  MarketListing,
  UnifiedActivityEvent
} from '../lib/market/types';
import { fetchTokenSummary, useTokenSummaries } from '../lib/viewer/queries';
import type { TokenSummary } from '../lib/viewer/types';
import TokenCardMedia from '../components/TokenCardMedia';

const ACTIVE_LISTINGS_LIMIT = 12;
const ACTIVE_LISTINGS_SCAN_LIMIT = 60;
const ACTIVE_LISTINGS_SCAN_STEP = 20;
const ACTIVE_LISTINGS_SCAN_MAX = 200;
const RECENT_ACTIVITY_LIMIT = 12;

const marketSelectionStore = createMarketSelectionStore();

export type MarketScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
  variant?: 'full' | 'public';
  marketContractIdOverride?: string;
};

type TxPayload = {
  txId: string;
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

export default function MarketScreen(props: MarketScreenProps) {
  const isPublicVariant = props.variant === 'public';
  const defaultMarketId =
    props.marketContractIdOverride ?? getMarketContractId(MARKET_REGISTRY[0]);
  const initialMarketId = isPublicVariant
    ? defaultMarketId
    : marketSelectionStore.load() ?? defaultMarketId;
  const [marketInput, setMarketInput] = useState(
    () => initialMarketId
  );
  const [marketContractId, setMarketContractId] = useState(
    () => initialMarketId
  );
  const [statusKey, setStatusKey] = useState(0);
  const [activityKey, setActivityKey] = useState(0);
  const [activeListingsKey, setActiveListingsKey] = useState(0);
  const [activeListingsScanLimit, setActiveListingsScanLimit] = useState(
    ACTIVE_LISTINGS_SCAN_LIMIT
  );
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

  useEffect(() => {
    if (isPublicVariant) {
      if (marketContractId !== defaultMarketId) {
        setMarketContractId(defaultMarketId);
      }
      if (marketInput !== defaultMarketId) {
        setMarketInput(defaultMarketId);
      }
      return;
    }
    if (!marketSelectionStore.load()) {
      marketSelectionStore.save(defaultMarketId);
    }
  }, [defaultMarketId, isPublicVariant, marketContractId, marketInput]);

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
    setActivityKey(0);
    setActiveListingsKey(0);
    setActiveListingsScanLimit(ACTIVE_LISTINGS_SCAN_LIMIT);
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
  const legacyContract = useMemo(
    () => getLegacyContract(props.contract),
    [props.contract]
  );
  const legacyClient = useMemo(
    () =>
      legacyContract ? createXtrataClient({ contract: legacyContract }) : null,
    [legacyContract]
  );
  const legacyContractId = legacyContract ? getContractId(legacyContract) : null;

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
  const resolveListingClient = useCallback(
    (listingContractId?: string | null) => {
      if (
        listingContractId &&
        legacyContractId &&
        legacyClient &&
        listingContractId === legacyContractId
      ) {
        return legacyClient;
      }
      return nftClient;
    },
    [legacyClient, legacyContractId, nftClient]
  );

  const parseContractId = (contractId?: string | null) => {
    if (!contractId) {
      return null;
    }
    const [address, ...rest] = contractId.split('.');
    const contractName = rest.join('.');
    if (!address || !contractName) {
      return null;
    }
    return { address, contractName };
  };

  const resolveListingContractConfig = (listing?: MarketListing | null) => {
    const parsed = parseContractId(listing?.nftContract ?? null);
    if (parsed) {
      return {
        address: parsed.address,
        contractName: parsed.contractName,
        network: props.contract.network
      };
    }
    return props.contract;
  };

  type ActiveListing = MarketListing & {
    listingId: bigint;
    owner: string | null;
    status: 'escrowed' | 'stale' | 'unknown';
  };

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

  const activeListingsQuery = useQuery({
    queryKey: [
      'market',
      marketContractIdLabel,
      'active-listings',
      activeListingsKey,
      activeListingsScanLimit
    ],
    enabled: !!marketClient && !!marketContract && !props.collapsed,
    staleTime: 30_000,
    refetchInterval: props.collapsed ? false : 60_000,
    queryFn: async (): Promise<ActiveListing[]> => {
      if (!marketClient || !marketContractIdLabel) {
        return [];
      }
      const lastListingId = await marketClient.getLastListingId(readOnlySender);
      const listings: Array<{ listingId: bigint; listing: MarketListing }> = [];
      let cursor = lastListingId;
      let scanned = 0;
      while (
        cursor >= 0n &&
        scanned < activeListingsScanLimit &&
        listings.length < ACTIVE_LISTINGS_LIMIT
      ) {
        const listing = await marketClient.getListing(cursor, readOnlySender);
        if (listing) {
          listings.push({ listingId: cursor, listing });
        }
        if (cursor === 0n) {
          break;
        }
        cursor -= 1n;
        scanned += 1;
      }
      if (listings.length === 0) {
        return [];
      }
      const owners = await Promise.all(
        listings.map(async ({ listing }) => {
          try {
            const client = resolveListingClient(listing.nftContract);
            return await client.getOwner(listing.tokenId, readOnlySender);
          } catch (error) {
            return null;
          }
        })
      );
      return listings.map((entry, index) => {
        const owner = owners[index];
        const status =
          owner && marketContractIdLabel && owner === marketContractIdLabel
            ? 'escrowed'
            : owner
            ? 'stale'
            : 'unknown';
        return {
          listingId: entry.listingId,
          owner,
          status,
          ...entry.listing
        };
      });
    }
  });

  const marketActivityQuery = useQuery({
    queryKey: ['market', marketContractIdLabel, 'activity', activityKey],
    enabled: !!marketContract && !props.collapsed && !isPublicVariant,
    staleTime: 30_000,
    refetchInterval: props.collapsed ? false : 60_000,
    queryFn: async () => {
      if (!marketContract) {
        throw new Error('Market contract unavailable');
      }
      return loadMarketActivity({
        contract: marketContract,
        force: activityKey > 0
      });
    }
  });

  const nftActivityQuery = useQuery({
    queryKey: ['nft', nftContractId, DEFAULT_NFT_ASSET_NAME, 'activity', activityKey],
    enabled: !!props.contract && !props.collapsed && !isPublicVariant,
    staleTime: 30_000,
    refetchInterval: props.collapsed ? false : 60_000,
    queryFn: () =>
      loadNftActivity({
        contract: props.contract,
        assetName: DEFAULT_NFT_ASSET_NAME,
        force: activityKey > 0
      })
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

  const handleRefreshActivity = () => {
    if (!marketContract) {
      return;
    }
    setActivityKey((prev) => prev + 1);
  };

  const handleRefreshActiveListings = () => {
    if (!marketContract) {
      return;
    }
    setActiveListingsKey((prev) => prev + 1);
  };

  const handleLoadOlderListings = () => {
    setActiveListingsScanLimit((prev) =>
      Math.min(prev + ACTIVE_LISTINGS_SCAN_STEP, ACTIVE_LISTINGS_SCAN_MAX)
    );
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

  const handleBuy = async (params?: {
    listingId?: bigint | null;
    listing?: MarketListing;
  }) => {
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
    const listingId = params?.listingId ?? inputId ?? activeListingId;
    if (listingId === null) {
      setBuyStatus('Enter a listing ID or load a listing first.');
      return;
    }

    setBuyPending(true);
    setBuyStatus('Preparing purchase...');
    try {
      logInfo('market', 'Buy request', {
        listingId: listingId.toString(),
        buyer: props.walletSession.address ?? null
      });
      const listing =
        params?.listing ??
        (activeListing && activeListingId === listingId
          ? activeListing
          : await marketClient?.getListing(listingId, readOnlySender));
      if (!listing) {
        setBuyStatus('Listing not found.');
        return;
      }
      const listingContract = resolveListingContractConfig(listing);
      const listingClient = resolveListingClient(listing.nftContract);
      const owner = await listingClient.getOwner(
        listing.tokenId,
        readOnlySender
      );
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
      logInfo('market', 'Buy listing resolved', {
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
          nftContract: listingContract,
          senderContract: marketContract,
          tokenId: listing.tokenId
        })
      ];
      const tx = await requestContractCall({
        functionName: 'buy',
        functionArgs: [
          contractPrincipalCV(
            listingContract.address,
            listingContract.contractName
          ),
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
          buyer: props.walletSession.address ?? null
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

  const handleCancel = async (params?: {
    listingId?: bigint | null;
    listing?: MarketListing | null;
  }) => {
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
    const listingId = params?.listingId ?? inputId ?? activeListingId;
    if (listingId === null) {
      setCancelStatus('Enter a listing ID or load a listing first.');
      return;
    }

    setCancelPending(true);
    setCancelStatus('Submitting cancel transaction...');
    try {
      const listing =
        params?.listing ??
        (activeListing && activeListingId === listingId
          ? activeListing
          : await marketClient?.getListing(listingId, readOnlySender));
      if (!listing) {
        setCancelStatus('Listing not found.');
        return;
      }
      const listingContract = resolveListingContractConfig(listing);
      const postConditions = [
        buildContractTransferPostCondition({
          nftContract: listingContract,
          senderContract: marketContract,
          tokenId: listing.tokenId
        })
      ];
      const tx = await requestContractCall({
        functionName: 'cancel',
        functionArgs: [
          contractPrincipalCV(
            listingContract.address,
            listingContract.contractName
          ),
          uintCV(listingId)
        ],
        postConditionMode: PostConditionMode.Deny,
        postConditions
      });
      setCancelStatus(`Cancel submitted: ${tx.txId}`);
      setCancelListingIdInput(listingId.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCancelStatus(`Cancel failed: ${message}`);
    } finally {
      setCancelPending(false);
    }
  };

  const allowedNftMismatch =
    !!statusQuery.data?.nftContract &&
    statusQuery.data.nftContract !== nftContractId;
  const buyTargetListingId =
    parseUintInput(buyListingIdInput) ?? activeListingId ?? null;
  const activeListings = activeListingsQuery.data ?? [];
  const listingTokenGroups = useMemo(() => {
    const primary: bigint[] = [];
    const legacy: bigint[] = [];
    const seenPrimary = new Set<string>();
    const seenLegacy = new Set<string>();
    activeListings.forEach((listing) => {
      const key = listing.tokenId.toString();
      if (legacyContractId && listing.nftContract === legacyContractId) {
        if (seenLegacy.has(key)) {
          return;
        }
        seenLegacy.add(key);
        legacy.push(listing.tokenId);
        return;
      }
      if (seenPrimary.has(key)) {
        return;
      }
      seenPrimary.add(key);
      primary.push(listing.tokenId);
    });
    return { primary, legacy };
  }, [activeListings, legacyContractId]);
  const primaryListingTokens = useTokenSummaries({
    client: nftClient,
    senderAddress: readOnlySender,
    tokenIds: listingTokenGroups.primary,
    enabled:
      !!marketContract &&
      !props.collapsed &&
      listingTokenGroups.primary.length > 0
  });
  const legacyListingTokens = useTokenSummaries({
    client: legacyClient ?? nftClient,
    senderAddress: readOnlySender,
    tokenIds: listingTokenGroups.legacy,
    enabled:
      !!marketContract &&
      !!legacyClient &&
      !props.collapsed &&
      listingTokenGroups.legacy.length > 0
  });
  const listingTokenMap = useMemo(() => {
    const map = new Map<string, TokenSummary>();
    const addEntries = (
      tokenIds: bigint[],
      tokenQueries: ReturnType<typeof useTokenSummaries>['tokenQueries'],
      contractId: string
    ) => {
      tokenQueries.forEach((query, index) => {
        const id = tokenIds[index];
        if (id === undefined || !query.data) {
          return;
        }
        map.set(buildMarketListingKey(contractId, id), query.data);
      });
    };
    addEntries(
      primaryListingTokens.tokenIds,
      primaryListingTokens.tokenQueries,
      nftContractId
    );
    if (legacyContractId) {
      addEntries(
        legacyListingTokens.tokenIds,
        legacyListingTokens.tokenQueries,
        legacyContractId
      );
    }
    return map;
  }, [
    legacyContractId,
    legacyListingTokens.tokenIds,
    legacyListingTokens.tokenQueries,
    nftContractId,
    primaryListingTokens.tokenIds,
    primaryListingTokens.tokenQueries
  ]);
  const listingTokensLoading =
    primaryListingTokens.tokenQueries.some((query) => query.isLoading) ||
    legacyListingTokens.tokenQueries.some((query) => query.isLoading);
  const selectedActiveListing =
    buyTargetListingId !== null
      ? activeListings.find((listing) => listing.listingId === buyTargetListingId) ??
        null
      : null;
  const displayedListing =
    selectedActiveListing ??
    (activeListingId !== null && activeListing
      ? {
          listingId: activeListingId,
          owner: null,
          status: 'unknown' as const,
          ...activeListing
        }
      : null);
  const displayedListingKey = displayedListing
    ? buildMarketListingKey(
        displayedListing.nftContract ?? nftContractId,
        displayedListing.tokenId
      )
    : null;
  const lookupTokenFromMap = displayedListingKey
    ? listingTokenMap.get(displayedListingKey) ?? null
    : null;
  const lookupTokenQuery = useQuery({
    queryKey: [
      'market',
      marketContractIdLabel,
      'listing-token',
      displayedListing?.nftContract ?? nftContractId,
      displayedListing?.tokenId.toString() ?? 'none'
    ],
    enabled:
      !!displayedListing &&
      !!marketContract &&
      !props.collapsed &&
      !lookupTokenFromMap,
    queryFn: async () => {
      if (!displayedListing) {
        return null;
      }
      const client = resolveListingClient(displayedListing.nftContract);
      return fetchTokenSummary({
        client,
        id: displayedListing.tokenId,
        senderAddress: readOnlySender
      });
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false
  });
  const lookupToken = displayedListing
    ? lookupTokenFromMap ?? lookupTokenQuery.data ?? null
    : null;
  const lookupOwner = lookupToken?.owner ?? null;
  const lookupStatus =
    lookupOwner && marketContractIdLabel
      ? lookupOwner === marketContractIdLabel
        ? 'Escrowed'
        : 'Not escrowed'
      : 'Unknown';
  const listingPriceLabel = displayedListing
    ? formatMicroStx(Number(displayedListing.price))
    : '—';
  const buyPriceLabel = listingPriceLabel;
  const marketActivityItems = useMemo(
    () =>
      buildUnifiedActivityTimeline({
        marketEvents: marketActivityQuery.data?.events ?? [],
        nftEvents: [],
        nftContractId
      }).slice(0, RECENT_ACTIVITY_LIMIT),
    [marketActivityQuery.data?.events, nftContractId]
  );

  const nftActivityItems = useMemo(
    () =>
      buildUnifiedActivityTimeline({
        marketEvents: [],
        nftEvents: nftActivityQuery.data?.events ?? [],
        nftContractId
      }).slice(0, RECENT_ACTIVITY_LIMIT),
    [nftActivityQuery.data?.events, nftContractId]
  );

  const unifiedActivityItems = useMemo(
    () =>
      buildUnifiedActivityTimeline({
        marketEvents: marketActivityQuery.data?.events ?? [],
        nftEvents: nftActivityQuery.data?.events ?? [],
        nftContractId
      }).slice(0, RECENT_ACTIVITY_LIMIT),
    [
      marketActivityQuery.data?.events,
      nftActivityQuery.data?.events,
      nftContractId
    ]
  );

  const formatActivityHeadline = (event: UnifiedActivityEvent) => {
    switch (event.type) {
      case 'list':
        return 'Listed';
      case 'buy':
        return 'Sold';
      case 'cancel':
        return 'Cancelled';
      case 'inscribe':
        return 'Inscribed';
      case 'transfer':
        return 'Transfer';
      default:
        return 'Activity';
    }
  };

  const formatActivityDetail = (event: UnifiedActivityEvent, showSource?: boolean) => {
    const parts: string[] = [];
    if (event.listingId !== undefined) {
      parts.push(`#${event.listingId.toString()}`);
    }
    if (event.tokenId !== undefined) {
      parts.push(`Token ${event.tokenId.toString()}`);
    }
    if (event.price !== undefined) {
      parts.push(formatMicroStx(Number(event.price)));
    }
    if (showSource) {
      parts.push(event.source === 'market' ? 'Market' : 'NFT');
    }
    return parts.join(' · ');
  };

  const formatActivityTime = (event: UnifiedActivityEvent) => {
    if (event.timestamp) {
      return new Date(event.timestamp).toLocaleString();
    }
    if (event.blockHeight !== undefined) {
      return `Block ${event.blockHeight}`;
    }
    return '—';
  };

  const getActivityParties = (event: UnifiedActivityEvent) => {
    if (event.type === 'inscribe') {
      return {
        primaryLabel: 'Owner',
        primaryValue: event.to ?? event.buyer ?? event.seller ?? '—',
        secondaryLabel: 'Creator',
        secondaryValue: event.from ?? '—'
      };
    }
    if (event.type === 'transfer') {
      return {
        primaryLabel: 'From',
        primaryValue: event.from ?? '—',
        secondaryLabel: 'To',
        secondaryValue: event.to ?? '—'
      };
    }
    return {
      primaryLabel: 'Seller',
      primaryValue: event.seller ?? '—',
      secondaryLabel: 'Buyer',
      secondaryValue: event.buyer ?? '—'
    };
  };

  const formatListingStatus = (status: ActiveListing['status']) => {
    if (status === 'escrowed') {
      return 'Escrowed';
    }
    if (status === 'stale') {
      return 'Stale';
    }
    return 'Unknown';
  };

  const renderActivityBlock = (params: {
    title: string;
    items: UnifiedActivityEvent[];
    isLoading: boolean;
    hasError: boolean;
    emptyLabel: string;
    showSource?: boolean;
  }) => {
    return (
      <div className="market-block">
        <div className="market-block__header">
          <h3>{params.title}</h3>
          <button
            className="button button--ghost"
            type="button"
            onClick={handleRefreshActivity}
            disabled={!marketContract}
          >
            Refresh
          </button>
        </div>
        {params.isLoading && <p>Loading activity...</p>}
        {params.hasError && (
          <div className="field__error">Unable to load activity.</div>
        )}
        {!params.isLoading && params.items.length === 0 && (
          <p className="field__hint">{params.emptyLabel}</p>
        )}
        {params.items.map((event) => {
          const parties = getActivityParties(event);
          return (
            <div className="market-listing" key={event.id}>
              <div>
                <span className="meta-label">{formatActivityHeadline(event)}</span>
                <span className="meta-value">
                  {formatActivityDetail(event, params.showSource)}
                </span>
              </div>
              <div>
                <span className="meta-label">{parties.primaryLabel}</span>
                <span className="meta-value">{parties.primaryValue}</span>
              </div>
              <div>
                <span className="meta-label">{parties.secondaryLabel}</span>
                <span className="meta-value">{parties.secondaryValue}</span>
              </div>
              <div>
                <span className="meta-label">Time</span>
                <span className="meta-value">{formatActivityTime(event)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
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
          {!isPublicVariant && (
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
          )}


          {!isPublicVariant && (
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
          )}

          <div className="market-block">
            <div className="market-block__header">
              <h3>Active listings</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleRefreshActiveListings}
                disabled={!marketContract}
              >
                Refresh
              </button>
            </div>
            {activeListingsQuery.isFetching && <p>Loading active listings...</p>}
            {activeListingsQuery.error && (
              <div className="field__error">Unable to load active listings.</div>
            )}
            {!activeListingsQuery.isFetching && activeListings.length === 0 && (
              <p className="field__hint">
                No active listings found. Try loading older listings.
              </p>
            )}
            {activeListings.length > 0 && (
              <>
                {listingTokensLoading && (
                  <p className="field__hint">Loading listing previews...</p>
                )}
                <div className="market-listing-grid">
                  {activeListings.map((listing) => {
                    const listingKey = buildMarketListingKey(
                      listing.nftContract ?? nftContractId,
                      listing.tokenId
                    );
                    const token = listingTokenMap.get(listingKey) ?? null;
                    const tokenClient = resolveListingClient(listing.nftContract);
                    const tokenContractId =
                      listing.nftContract ?? nftContractId;
                    const isSeller =
                      !!props.walletSession.address &&
                      listing.seller === props.walletSession.address;
                    const canQuickBuy =
                      canTransact &&
                      listing.status === 'escrowed' &&
                      !isSeller &&
                      !buyPending;
                    return (
                      <div
                        className="market-listing-card"
                        key={listing.listingId.toString()}
                      >
                        <div className="market-listing-card__frame">
                          <div className="market-listing-card__media">
                            <div className="token-card__media">
                              {token ? (
                                <TokenCardMedia
                                  token={token}
                                  contractId={tokenContractId}
                                  senderAddress={readOnlySender}
                                  client={tokenClient}
                                  isActiveTab={!props.collapsed}
                                />
                              ) : (
                                <div className="token-card__placeholder">
                                  Loading preview...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="market-listing-card__meta">
                          <div>
                            <span className="meta-label">Listing</span>
                            <span className="meta-value">
                              #{listing.listingId.toString()}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Token</span>
                            <span className="meta-value">
                              #{listing.tokenId.toString()}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Price</span>
                            <span className="meta-value">
                              {formatMicroStx(Number(listing.price))}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Status</span>
                            <span className="meta-value">
                              {formatListingStatus(listing.status)}
                            </span>
                          </div>
                          {isSeller && (
                            <div>
                              <span className="meta-label">Actions</span>
                              <button
                                className="button button--ghost button--mini"
                                type="button"
                                onClick={() =>
                                  void handleCancel({
                                    listingId: listing.listingId,
                                    listing
                                  })
                                }
                                disabled={!canTransact || cancelPending}
                              >
                                {cancelPending ? 'Cancelling...' : 'Cancel'}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="market-listing-card__actions">
                          <button
                            className="button button--mini"
                            type="button"
                            onClick={() =>
                              void handleBuy({
                                listingId: listing.listingId,
                                listing
                              })
                            }
                            disabled={!canQuickBuy}
                          >
                            {isSeller
                              ? 'Your listing'
                              : listing.status !== 'escrowed'
                                ? 'Not escrowed'
                                : buyPending
                                  ? 'Buying...'
                                  : 'Buy now'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {marketContract && !activeListingsQuery.isFetching && (
              <div className="market-listing-card__actions">
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={handleLoadOlderListings}
                  disabled={activeListingsScanLimit >= ACTIVE_LISTINGS_SCAN_MAX}
                >
                  {activeListingsScanLimit >= ACTIVE_LISTINGS_SCAN_MAX
                    ? 'Max range loaded'
                    : `Load older listings (+${ACTIVE_LISTINGS_SCAN_STEP})`}
                </button>
                <span className="meta-value">
                  Scanning last {activeListingsScanLimit} listings
                </span>
              </div>
            )}
          </div>

          {!isPublicVariant && (
            <>
              {renderActivityBlock({
                title: 'Market activity',
                items: marketActivityItems,
                isLoading: marketActivityQuery.isFetching,
                hasError: !!marketActivityQuery.error,
                emptyLabel: 'No market activity yet.'
              })}
              {renderActivityBlock({
                title: 'NFT activity',
                items: nftActivityItems,
                isLoading: nftActivityQuery.isFetching,
                hasError: !!nftActivityQuery.error,
                emptyLabel: 'No NFT activity yet.'
              })}
              {renderActivityBlock({
                title: 'All activity',
                items: unifiedActivityItems,
                isLoading:
                  marketActivityQuery.isFetching ||
                  nftActivityQuery.isFetching,
                hasError: !!marketActivityQuery.error || !!nftActivityQuery.error,
                emptyLabel: 'No activity yet.',
                showSource: true
              })}
            </>
          )}

          {!isPublicVariant && (
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
              {displayedListing && (
                <div className="market-listing-card market-listing-card--lookup">
                  <div className="market-listing-card__media">
                    <div className="token-card__media">
                      {lookupToken ? (
                        <TokenCardMedia
                          token={lookupToken}
                          contractId={
                            displayedListing?.nftContract ?? nftContractId
                          }
                          senderAddress={readOnlySender}
                          client={resolveListingClient(
                            displayedListing?.nftContract
                          )}
                          isActiveTab={!props.collapsed}
                        />
                      ) : (
                        <div className="token-card__placeholder">
                          Loading preview...
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="meta-grid meta-grid--dense">
                    <div>
                      <span className="meta-label">Listing ID</span>
                      <span className="meta-value">
                        {displayedListing.listingId.toString()}
                      </span>
                    </div>
                    <div>
                      <span className="meta-label">Token</span>
                      <span className="meta-value">
                        #{displayedListing.tokenId.toString()}
                      </span>
                    </div>
                    <div>
                      <span className="meta-label">Price</span>
                      <span className="meta-value">{listingPriceLabel}</span>
                    </div>
                    <div>
                      <span className="meta-label">Seller</span>
                      <span className="meta-value">{displayedListing.seller}</span>
                    </div>
                    <div>
                      <span className="meta-label">Owner</span>
                      <span className="meta-value">{lookupOwner ?? 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="meta-label">Escrow status</span>
                      <span className="meta-value">{lookupStatus}</span>
                    </div>
                    <div>
                      <span className="meta-label">NFT contract</span>
                      <span className="meta-value">{displayedListing.nftContract}</span>
                    </div>
                    <div>
                      <span className="meta-label">Created</span>
                      <span className="meta-value">
                        Block {displayedListing.createdAt.toString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {!displayedListing && (listingLookupId || tokenLookupId) && (
                <p className="field__hint">No listing found.</p>
              )}
            </div>
          )}

          <div className="market-block">
            <h3>{isPublicVariant ? 'Listing tools' : 'Actions'}</h3>
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

              {!isPublicVariant && (
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
                  {buyTargetListingId !== null && (
                    <p className="field__hint">
                      Target listing: #{buyTargetListingId.toString()}
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
              )}

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
