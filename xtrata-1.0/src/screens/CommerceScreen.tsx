import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { showContractCall } from '../lib/wallet/connect';
import { PostConditionMode, validateStacksAddress, type PostCondition } from '@stacks/transactions';
import type { ContractCallOptions } from '@stacks/connect';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import { getNetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import { createXtrataClient } from '../lib/contract/client';
import { buildFungibleSpendPostCondition } from '../lib/contract/post-conditions';
import {
  getContractId,
  parseContractId,
  type ContractConfig
} from '../lib/contract/config';
import {
  buildBuyWithUsdcCall,
  buildCreateListingCall,
  buildSetListingActiveCall,
  createCommerceClient
} from '../lib/commerce/client';
import { parseCommerceContractId } from '../lib/commerce/contract';
import {
  COMMERCE_REGISTRY,
  getCommerceContractId
} from '../lib/commerce/registry';
import { isSameAddress } from '../lib/market/actions';
import { getKnownFungibleAsset } from '../lib/contract/fungible-assets';
import { parseDecimalAmount } from '../lib/utils/amounts';
import { formatTokenAmountWithUsd } from '../lib/pricing/format';
import { useUsdPriceBook } from '../lib/pricing/hooks';

const parseUintInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (!error) {
    return 'Unknown error';
  }
  return String(error);
};

export type CommerceScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
  variant?: 'full' | 'public';
  defaultCommerceContractId?: string;
};

type TxPayload = {
  txId: string;
};

type CommerceStatus = {
  owner: string;
  coreContract: string;
  paymentToken: string;
  nextListingId: bigint;
};

type CommerceListingDetails = {
  listingId: bigint;
  assetId: bigint;
  seller: string;
  price: bigint;
  active: boolean;
  createdAt: bigint;
  updatedAt: bigint;
  assetOwner: string | null;
  walletEntitled: boolean;
};

export default function CommerceScreen(props: CommerceScreenProps) {
  const isPublicVariant = props.variant === 'public';
  const queryClient = useQueryClient();
  const usdPriceBook = useUsdPriceBook({
    enabled: !props.collapsed
  }).data ?? null;
  const defaultCommerceId =
    props.defaultCommerceContractId ?? getCommerceContractId(COMMERCE_REGISTRY[0]);
  const [commerceInput, setCommerceInput] = useState(() => defaultCommerceId);
  const [commerceContractId, setCommerceContractId] = useState(() => defaultCommerceId);
  const [listingIdInput, setListingIdInput] = useState('');
  const [lookupListingId, setLookupListingId] = useState<bigint | null>(null);
  const [entitlementAssetIdInput, setEntitlementAssetIdInput] = useState('');
  const [entitlementOwnerInput, setEntitlementOwnerInput] = useState(
    () => props.walletSession.address ?? ''
  );
  const [entitlementCheck, setEntitlementCheck] = useState<{
    assetId: bigint;
    owner: string;
  } | null>(null);
  const [createAssetIdInput, setCreateAssetIdInput] = useState('');
  const [createPriceInput, setCreatePriceInput] = useState('');
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [manageStatus, setManageStatus] = useState<string | null>(null);
  const [managePending, setManagePending] = useState(false);
  const [buyStatus, setBuyStatus] = useState<string | null>(null);
  const [buyPending, setBuyPending] = useState(false);

  useEffect(() => {
    if (props.walletSession.address && !entitlementOwnerInput.trim()) {
      setEntitlementOwnerInput(props.walletSession.address);
    }
  }, [props.walletSession.address, entitlementOwnerInput]);

  useEffect(() => {
    if (isPublicVariant) {
      if (commerceContractId !== defaultCommerceId) {
        setCommerceContractId(defaultCommerceId);
      }
      if (commerceInput !== defaultCommerceId) {
        setCommerceInput(defaultCommerceId);
      }
    }
  }, [commerceContractId, commerceInput, defaultCommerceId, isPublicVariant]);

  useEffect(() => {
    setLookupListingId(null);
    setListingIdInput('');
    setCreateStatus(null);
    setManageStatus(null);
    setBuyStatus(null);
  }, [commerceContractId]);

  const commerceRegistryIds = useMemo(
    () => COMMERCE_REGISTRY.map(getCommerceContractId),
    []
  );
  const commercePresetValue = commerceRegistryIds.includes(commerceInput.trim())
    ? commerceInput.trim()
    : '';
  const parsedCommerceInput = useMemo(
    () => parseCommerceContractId(commerceInput),
    [commerceInput]
  );
  const parsedCommerce = useMemo(
    () => parseCommerceContractId(commerceContractId),
    [commerceContractId]
  );
  const commerceContract = parsedCommerce.config;
  const commerceError = commerceInput.trim() ? parsedCommerceInput.error : null;
  const activeCommerceError = parsedCommerce.error;
  const commerceClient = useMemo(
    () => (commerceContract ? createCommerceClient({ contract: commerceContract }) : null),
    [commerceContract]
  );
  const commerceContractIdLabel = commerceContract ? getContractId(commerceContract) : null;
  const readOnlySender =
    props.walletSession.address ?? commerceContract?.address ?? props.contract.address;
  const commerceMismatch = commerceContract
    ? getNetworkMismatch(commerceContract.network, props.walletSession.network)
    : null;
  const commerceToCoreNetworkMismatch = commerceContract
    ? commerceContract.network !== props.contract.network
    : false;
  const canTransact =
    !!props.walletSession.address &&
    !!commerceContract &&
    !commerceMismatch &&
    !commerceToCoreNetworkMismatch;
  const activeCoreContractId = getContractId(props.contract);

  const statusQuery = useQuery({
    queryKey: ['commerce', commerceContractIdLabel, 'status'],
    enabled: !!commerceClient,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CommerceStatus> => {
      if (!commerceClient) {
        throw new Error('Commerce client unavailable');
      }
      const [owner, coreContract, paymentToken, nextListingId] = await Promise.all([
        commerceClient.getOwner(readOnlySender),
        commerceClient.getCoreContract(readOnlySender),
        commerceClient.getPaymentToken(readOnlySender),
        commerceClient.getNextListingId(readOnlySender)
      ]);
      return { owner, coreContract, paymentToken, nextListingId };
    }
  });

  const boundCoreContract = useMemo<ContractConfig>(() => {
    return parseContractId(statusQuery.data?.coreContract ?? '') ?? props.contract;
  }, [props.contract, statusQuery.data?.coreContract]);
  const boundCoreClient = useMemo(
    () => createXtrataClient({ contract: boundCoreContract }),
    [boundCoreContract]
  );
  const boundCoreContractId = getContractId(boundCoreContract);
  const paymentTokenAsset = getKnownFungibleAsset(statusQuery.data?.paymentToken ?? null);
  const paymentDecimals = paymentTokenAsset?.decimals ?? 6;
  const paymentSymbol = paymentTokenAsset?.symbol ?? 'USDCx';
  const linkedCoreMismatch =
    !!statusQuery.data?.coreContract && statusQuery.data.coreContract !== activeCoreContractId;

  const listingQuery = useQuery({
    queryKey: [
      'commerce',
      commerceContractIdLabel,
      'listing',
      lookupListingId?.toString() ?? 'none',
      boundCoreContractId,
      props.walletSession.address ?? 'guest'
    ],
    enabled: !!commerceClient && lookupListingId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CommerceListingDetails | null> => {
      if (!commerceClient || lookupListingId === null) {
        throw new Error('Listing lookup unavailable');
      }
      const listing = await commerceClient.getListing(lookupListingId, readOnlySender);
      if (!listing) {
        return null;
      }
      const [assetOwner, walletEntitled] = await Promise.all([
        boundCoreClient.getOwner(listing.assetId, readOnlySender),
        props.walletSession.address
          ? commerceClient.hasEntitlement(
              listing.assetId,
              props.walletSession.address,
              readOnlySender
            )
          : Promise.resolve(false)
      ]);
      return {
        listingId: lookupListingId,
        assetId: listing.assetId,
        seller: listing.seller,
        price: listing.price,
        active: listing.active,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        assetOwner,
        walletEntitled
      };
    }
  });

  const entitlementQuery = useQuery({
    queryKey: [
      'commerce',
      commerceContractIdLabel,
      'entitlement',
      entitlementCheck?.assetId.toString() ?? 'none',
      entitlementCheck?.owner ?? 'none'
    ],
    enabled: !!commerceClient && entitlementCheck !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!commerceClient || !entitlementCheck) {
        throw new Error('Entitlement lookup unavailable');
      }
      return commerceClient.hasEntitlement(
        entitlementCheck.assetId,
        entitlementCheck.owner,
        readOnlySender
      );
    }
  });

  const requestContractCall = (params: {
    call: ContractCallOptions;
    postConditionMode?: PostConditionMode;
    postConditions?: PostCondition[];
  }) => {
    if (!commerceContract) {
      return Promise.reject(new Error('Commerce contract missing.'));
    }
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        ...params.call,
        network: props.walletSession.network ?? commerceContract.network,
        stxAddress: props.walletSession.address,
        postConditionMode: params.postConditionMode,
        postConditions: params.postConditions,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () => reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  const handleUseCommerceContract = () => {
    if (!commerceInput.trim() || parsedCommerceInput.error) {
      return;
    }
    setCommerceContractId(commerceInput.trim());
    setCreateStatus(null);
    setManageStatus(null);
    setBuyStatus(null);
  };

  const handleClearCommerceContract = () => {
    setCommerceInput('');
    setCommerceContractId('');
  };

  const handleLookupListing = () => {
    const listingId = parseUintInput(listingIdInput);
    if (listingId === null) {
      setManageStatus('Enter a valid listing ID.');
      return;
    }
    setManageStatus(null);
    setBuyStatus(null);
    setLookupListingId(listingId);
  };

  const handleCheckEntitlement = () => {
    const assetId = parseUintInput(entitlementAssetIdInput);
    if (assetId === null) {
      setManageStatus('Enter a valid asset ID for entitlement lookup.');
      return;
    }
    const owner = entitlementOwnerInput.trim();
    if (!validateStacksAddress(owner)) {
      setManageStatus('Enter a valid Stacks address for entitlement lookup.');
      return;
    }
    setManageStatus(null);
    setEntitlementCheck({ assetId, owner });
  };

  const refreshCommerceQueries = () => {
    if (!commerceContractIdLabel) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['commerce', commerceContractIdLabel] });
    void queryClient.refetchQueries({
      queryKey: ['commerce', commerceContractIdLabel],
      type: 'active'
    });
  };

  const handleCreateListing = async () => {
    setCreateStatus(null);
    if (!commerceContract) {
      setCreateStatus('Set a commerce contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setCreateStatus('Connect a wallet to create a listing.');
      return;
    }
    if (commerceMismatch) {
      setCreateStatus(
        `Network mismatch: wallet on ${commerceMismatch.actual}, commerce is ${commerceMismatch.expected}.`
      );
      return;
    }
    if (commerceToCoreNetworkMismatch) {
      setCreateStatus('Commerce network must match the active core contract.');
      return;
    }
    const assetId = parseUintInput(createAssetIdInput);
    if (assetId === null) {
      setCreateStatus('Enter a valid asset ID.');
      return;
    }
    const price = parseDecimalAmount(createPriceInput, paymentDecimals);
    if (price === null) {
      setCreateStatus(`Enter a valid ${paymentSymbol} price.`);
      return;
    }

    setCreatePending(true);
    setCreateStatus('Preparing listing transaction...');
    try {
      const owner = await boundCoreClient.getOwner(assetId, readOnlySender);
      if (!owner) {
        setCreateStatus('Asset owner could not be resolved.');
        return;
      }
      if (!isSameAddress(owner, props.walletSession.address)) {
        setCreateStatus(`Only the current asset owner can list. Current owner is ${owner}.`);
        return;
      }
      const tx = await requestContractCall({
        call: buildCreateListingCall({
          contract: commerceContract,
          network: toStacksNetwork(commerceContract.network),
          assetId,
          price
        })
      });
      setCreateStatus(`Listing submitted: ${tx.txId}`);
      refreshCommerceQueries();
    } catch (error) {
      setCreateStatus(`Listing failed: ${getErrorMessage(error)}`);
    } finally {
      setCreatePending(false);
    }
  };

  const displayedListing = listingQuery.data;
  const canManageDisplayedListing =
    !!displayedListing &&
    !!props.walletSession.address &&
    canTransact &&
    (isSameAddress(displayedListing.seller, props.walletSession.address) ||
      isSameAddress(statusQuery.data?.owner ?? null, props.walletSession.address));
  const canBuyDisplayedListing =
    !!displayedListing &&
    !!paymentTokenAsset &&
    !!props.walletSession.address &&
    canTransact &&
    displayedListing.active &&
    !displayedListing.walletEntitled &&
    !isSameAddress(displayedListing.seller, props.walletSession.address) &&
    (!displayedListing.assetOwner || isSameAddress(displayedListing.assetOwner, displayedListing.seller));

  const handleToggleListingActive = async () => {
    setManageStatus(null);
    if (!displayedListing) {
      setManageStatus('Load a listing first.');
      return;
    }
    if (!commerceContract) {
      setManageStatus('Set a commerce contract ID first.');
      return;
    }
    if (!canManageDisplayedListing) {
      setManageStatus('Only the seller or contract owner can manage this listing.');
      return;
    }

    setManagePending(true);
    setManageStatus(displayedListing.active ? 'Submitting deactivation...' : 'Submitting activation...');
    try {
      const tx = await requestContractCall({
        call: buildSetListingActiveCall({
          contract: commerceContract,
          network: toStacksNetwork(commerceContract.network),
          listingId: displayedListing.listingId,
          active: !displayedListing.active
        })
      });
      setManageStatus(
        `${displayedListing.active ? 'Deactivation' : 'Activation'} submitted: ${tx.txId}`
      );
      refreshCommerceQueries();
    } catch (error) {
      setManageStatus(`Listing update failed: ${getErrorMessage(error)}`);
    } finally {
      setManagePending(false);
    }
  };

  const handleBuyListing = async () => {
    setBuyStatus(null);
    if (!displayedListing) {
      setBuyStatus('Load a listing first.');
      return;
    }
    if (!commerceContract) {
      setBuyStatus('Set a commerce contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setBuyStatus('Connect a wallet to buy.');
      return;
    }
    if (!paymentTokenAsset) {
      setBuyStatus('Unknown payment token metadata. Use the registered commerce contract for purchases.');
      return;
    }
    if (!displayedListing.active) {
      setBuyStatus('This listing is inactive.');
      return;
    }
    if (displayedListing.walletEntitled) {
      setBuyStatus('This wallet already has entitlement for the asset.');
      return;
    }
    if (displayedListing.assetOwner && !isSameAddress(displayedListing.assetOwner, displayedListing.seller)) {
      setBuyStatus(`Listing is stale. Current asset owner is ${displayedListing.assetOwner}.`);
      return;
    }
    if (isSameAddress(displayedListing.seller, props.walletSession.address)) {
      setBuyStatus('You cannot buy your own listing.');
      return;
    }

    setBuyPending(true);
    setBuyStatus('Preparing purchase...');
    try {
      const tx = await requestContractCall({
        call: buildBuyWithUsdcCall({
          contract: commerceContract,
          network: toStacksNetwork(commerceContract.network),
          listingId: displayedListing.listingId
        }),
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildFungibleSpendPostCondition({
            token: paymentTokenAsset,
            senderAddress: props.walletSession.address,
            amount: displayedListing.price
          })
        ]
      });
      setBuyStatus(`Purchase submitted: ${tx.txId}`);
      refreshCommerceQueries();
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes('post-condition')) {
        setBuyStatus('Purchase failed: no USDCx moved. Check listing state and wallet balance.');
      } else {
        setBuyStatus(`Purchase failed: ${message}`);
      }
    } finally {
      setBuyPending(false);
    }
  };

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="commerce"
    >
      <div className="panel__header">
        <div>
          <h2>Commerce</h2>
          <p>
            {isPublicVariant
              ? 'Look up commerce listings, buy USDCx entitlements, and verify access.'
              : 'Manage USDCx listings, buy entitlements, and verify asset access.'}
          </p>
        </div>
        <div className="panel__actions">
          {commerceContract && (
            <span className={`badge badge--${commerceContract.network}`}>
              {commerceContract.network}
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
              <h3>Commerce contract</h3>
              <label className="field">
                <span className="field__label">Registry</span>
                <select
                  className="select"
                  value={commercePresetValue}
                  onChange={(event) => setCommerceInput(event.target.value)}
                >
                  <option value="">Custom</option>
                  {COMMERCE_REGISTRY.map((entry) => {
                    const id = getCommerceContractId(entry);
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
                  placeholder="SP...xtrata-commerce"
                  value={commerceInput}
                  onChange={(event) => setCommerceInput(event.target.value)}
                />
              </label>
              {commerceError && <div className="field__error">{commerceError}</div>}
              {!commerceError && activeCommerceError && (
                <div className="field__error">{activeCommerceError}</div>
              )}
              <div className="market-controls">
                <button
                  className="button"
                  type="button"
                  onClick={handleUseCommerceContract}
                  disabled={!commerceInput.trim() || !!commerceError}
                >
                  Use contract
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleClearCommerceContract}
                  disabled={!commerceContractId}
                >
                  Clear
                </button>
              </div>
              {commerceContractIdLabel && (
                <div className="meta-grid">
                  <div>
                    <span className="meta-label">Commerce contract</span>
                    <span className="meta-value">{commerceContractIdLabel}</span>
                  </div>
                  <div>
                    <span className="meta-label">Active core contract</span>
                    <span className="meta-value">{activeCoreContractId}</span>
                  </div>
                </div>
              )}
              {commerceMismatch && (
                <div className="alert">
                  <div>
                    <strong>Network mismatch.</strong> Wallet is on {commerceMismatch.actual}, commerce is{' '}
                    {commerceMismatch.expected}.
                  </div>
                </div>
              )}
              {commerceToCoreNetworkMismatch && (
                <div className="alert">
                  <div>
                    <strong>Network mismatch.</strong> Commerce contract network must match the active core
                    contract.
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="market-block">
            <div className="market-block__header">
              <h3>Commerce status</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void statusQuery.refetch()}
                disabled={!commerceContract}
              >
                Refresh
              </button>
            </div>
            {statusQuery.isLoading && <p>Loading commerce status...</p>}
            {statusQuery.data && (
              <>
                <div className="meta-grid">
                  <div>
                    <span className="meta-label">Owner</span>
                    <span className="meta-value">{statusQuery.data.owner}</span>
                  </div>
                  <div>
                    <span className="meta-label">Linked core</span>
                    <span className="meta-value">{statusQuery.data.coreContract}</span>
                  </div>
                  <div>
                    <span className="meta-label">Payment token</span>
                    <span className="meta-value">{statusQuery.data.paymentToken}</span>
                  </div>
                  <div>
                    <span className="meta-label">Next listing ID</span>
                    <span className="meta-value">#{statusQuery.data.nextListingId.toString()}</span>
                  </div>
                </div>
                {paymentTokenAsset ? (
                  <div className="market-check market-check--ok">
                    <span className="meta-label">Wallet guard</span>
                    <span className="meta-value">
                      Exact {paymentTokenAsset.symbol} post-condition ready ({paymentTokenAsset.assetName})
                    </span>
                  </div>
                ) : (
                  <div className="market-check market-check--warn">
                    <span className="meta-label">Wallet guard</span>
                    <span className="meta-value">
                      Unknown token metadata. Read-only works, but buys are disabled for safety.
                    </span>
                  </div>
                )}
                {linkedCoreMismatch && (
                  <div className="alert">
                    <div>
                      <strong>Core link mismatch.</strong> This commerce contract is bound to{' '}
                      {statusQuery.data.coreContract}. Ownership checks in this module use that contract,
                      not the currently selected app contract.
                    </div>
                  </div>
                )}
              </>
            )}
            {statusQuery.error && (
              <div className="field__error">
                Unable to load commerce status: {getErrorMessage(statusQuery.error)}
              </div>
            )}
            <p className="field__hint">
              Commerce records entitlement only. It does not transfer the Xtrata asset itself.
            </p>
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Lookup listing</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleLookupListing}
                disabled={!commerceContract}
              >
                Load
              </button>
            </div>
            <label className="field">
              <span className="field__label">Listing ID</span>
              <div className="field__inline">
                <input
                  className="input"
                  placeholder="e.g. 0"
                  value={listingIdInput}
                  onChange={(event) => setListingIdInput(event.target.value)}
                />
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleLookupListing}
                  disabled={!commerceContract}
                >
                  Load
                </button>
              </div>
            </label>
            {listingQuery.isFetching && <p>Loading listing...</p>}
            {displayedListing && (
              <div className="market-listing-card market-listing-card--lookup">
                <div className="meta-grid meta-grid--dense">
                  <div>
                    <span className="meta-label">Listing ID</span>
                    <span className="meta-value">#{displayedListing.listingId.toString()}</span>
                  </div>
                  <div>
                    <span className="meta-label">Asset ID</span>
                    <span className="meta-value">#{displayedListing.assetId.toString()}</span>
                  </div>
                  <div>
                    <span className="meta-label">Seller</span>
                    <span className="meta-value">{displayedListing.seller}</span>
                  </div>
                  <div>
                    <span className="meta-label">Price</span>
                    <span className="meta-value">
                      {
                        formatTokenAmountWithUsd({
                          amount: displayedListing.price,
                          decimals: paymentDecimals,
                          symbol: paymentSymbol,
                          assetKey: paymentTokenAsset?.priceAssetKey ?? null,
                          priceBook: usdPriceBook
                        }).combined
                      }
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Active</span>
                    <span className="meta-value">{displayedListing.active ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Current asset owner</span>
                    <span className="meta-value">{displayedListing.assetOwner ?? 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Created</span>
                    <span className="meta-value">Block {displayedListing.createdAt.toString()}</span>
                  </div>
                  <div>
                    <span className="meta-label">Wallet entitled</span>
                    <span className="meta-value">{displayedListing.walletEntitled ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="market-checks">
                  <div
                    className={`market-check${
                      !displayedListing.assetOwner ||
                      isSameAddress(displayedListing.assetOwner, displayedListing.seller)
                        ? ' market-check--ok'
                        : ' market-check--warn'
                    }`}
                  >
                    <span className="meta-label">Listing control</span>
                    <span className="meta-value">
                      {!displayedListing.assetOwner
                        ? 'Owner unknown'
                        : isSameAddress(displayedListing.assetOwner, displayedListing.seller)
                          ? 'Seller still controls asset'
                          : 'Stale listing'}
                    </span>
                  </div>
                </div>
                <div className="market-listing-card__actions market-listing-card__actions--detail">
                  {!isPublicVariant && canManageDisplayedListing && (
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() => void handleToggleListingActive()}
                      disabled={managePending}
                    >
                      {managePending
                        ? displayedListing.active
                          ? 'Deactivating...'
                          : 'Activating...'
                        : displayedListing.active
                          ? 'Deactivate listing'
                          : 'Activate listing'}
                    </button>
                  )}
                  <button
                    className="button button--mini"
                    type="button"
                    onClick={() => void handleBuyListing()}
                    disabled={!canBuyDisplayedListing || buyPending}
                  >
                    {buyPending ? 'Buying...' : 'Buy entitlement'}
                  </button>
                </div>
                {manageStatus && <p className="field__hint">{manageStatus}</p>}
                {buyStatus && <p className="field__hint">{buyStatus}</p>}
              </div>
            )}
            {!displayedListing && lookupListingId !== null && !listingQuery.isFetching && (
              <p className="field__hint">No listing found.</p>
            )}
            {listingQuery.error && (
              <div className="field__error">
                Unable to load listing: {getErrorMessage(listingQuery.error)}
              </div>
            )}
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Entitlement check</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleCheckEntitlement}
                disabled={!commerceContract}
              >
                Check
              </button>
            </div>
            <label className="field">
              <span className="field__label">Asset ID</span>
              <input
                className="input"
                placeholder="e.g. 42"
                value={entitlementAssetIdInput}
                onChange={(event) => setEntitlementAssetIdInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Owner address</span>
              <input
                className="input"
                placeholder="SP..."
                value={entitlementOwnerInput}
                onChange={(event) => setEntitlementOwnerInput(event.target.value)}
              />
            </label>
            {entitlementQuery.isFetching && <p>Checking entitlement...</p>}
            {entitlementCheck && !entitlementQuery.isFetching && entitlementQuery.data !== undefined && (
              <div
                className={`market-check${entitlementQuery.data ? ' market-check--ok' : ' market-check--warn'}`}
              >
                <span className="meta-label">Result</span>
                <span className="meta-value">
                  {entitlementQuery.data ? 'Entitlement found' : 'No entitlement recorded'}
                </span>
              </div>
            )}
            {entitlementQuery.error && (
              <div className="field__error">
                Unable to check entitlement: {getErrorMessage(entitlementQuery.error)}
              </div>
            )}
          </div>

          {!isPublicVariant && (
            <div className="market-block" id="commerce-actions">
              <h3>Create listing</h3>
              <p className="field__hint">
                Price is entered in {paymentSymbol} and stored in the token&apos;s base units.
              </p>
              <div className="market-actions">
                <div className="market-action">
                  <label className="field">
                    <span className="field__label">Asset ID</span>
                    <input
                      className="input"
                      placeholder="Asset ID"
                      value={createAssetIdInput}
                      onChange={(event) => setCreateAssetIdInput(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Price ({paymentSymbol})</span>
                    <input
                      className="input"
                      placeholder={paymentDecimals === 6 ? '1.250000' : '1.25'}
                      value={createPriceInput}
                      onChange={(event) => setCreatePriceInput(event.target.value)}
                    />
                  </label>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void handleCreateListing()}
                    disabled={!canTransact || createPending}
                  >
                    {createPending ? 'Listing...' : 'Create listing'}
                  </button>
                  {createStatus && <p className="field__hint">{createStatus}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
