import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { showContractCall } from '../lib/wallet/connect';
import {
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  PostConditionMode,
  principalCV,
  uintCV,
  type ClarityValue,
  type PostCondition
} from '@stacks/transactions';
import AddressLabel from '../components/AddressLabel';
import { getContractId } from '../lib/contract/config';
import {
  buildContractTransferPostCondition
} from '../lib/contract/post-conditions';
import { createXtrataClient } from '../lib/contract/client';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import { getNetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import { formatMicroStxWithUsd } from '../lib/pricing/format';
import { useUsdPriceBook } from '../lib/pricing/hooks';
import { parsePreinscribedSaleContractId } from '../lib/preinscribed-sale/contract';
import type { WalletSession } from '../lib/wallet/types';

type PreinscribedCollectionSaleScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
  defaultSaleContractId?: string;
};

type TxPayload = {
  txId: string;
};

type SaleStatus = {
  owner: string | null;
  paused: boolean | null;
  price: bigint | null;
  allowlistEnabled: boolean | null;
  maxPerWallet: bigint | null;
  saleStartBlock: bigint | null;
  saleEndBlock: bigint | null;
  availableCount: bigint | null;
  soldCount: bigint | null;
  allowedCoreContract: string | null;
  walletBought: bigint | null;
  walletAllowance: bigint | null;
};

type InventoryStatus = {
  tokenId: bigint;
  exists: boolean;
  available: boolean | null;
  sold: boolean | null;
  seller: string | null;
  buyer: string | null;
  depositedAt: bigint | null;
  soldAt: bigint | null;
  owner: string | null;
  escrowed: boolean | null;
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
  } catch {
    return null;
  }
};

const unwrapResponse = (value: ClarityValue) => {
  if (value.type === ClarityType.ResponseOk) {
    return value.value;
  }
  if (value.type === ClarityType.ResponseErr) {
    const parsed = cvToValue(value.value) as { value?: string } | string;
    const detail =
      typeof parsed === 'string'
        ? parsed
        : parsed && typeof parsed === 'object' && 'value' in parsed
          ? parsed.value
          : 'Unknown error';
    throw new Error(`Read-only error: ${detail}`);
  }
  return value;
};

const readTupleField = (raw: unknown, key: string) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const asRecord = raw as Record<string, unknown>;
  const direct = asRecord[key];
  if (
    direct &&
    typeof direct === 'object' &&
    'value' in (direct as Record<string, unknown>)
  ) {
    return (direct as { value?: unknown }).value ?? null;
  }
  const nested = asRecord.value;
  if (nested && typeof nested === 'object') {
    const nestedValue = (nested as Record<string, unknown>)[key];
    if (
      nestedValue &&
      typeof nestedValue === 'object' &&
      'value' in (nestedValue as Record<string, unknown>)
    ) {
      return (nestedValue as { value?: unknown }).value ?? null;
    }
    return nestedValue ?? null;
  }
  return direct ?? null;
};

const unwrapValue = (value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    'value' in (value as Record<string, unknown>)
  ) {
    return (value as { value?: unknown }).value ?? null;
  }
  return value;
};

const parseBoolValue = (value: unknown): boolean | null => {
  const primitive = unwrapValue(value);
  if (typeof primitive === 'boolean') {
    return primitive;
  }
  if (typeof primitive === 'string') {
    if (primitive === 'true') {
      return true;
    }
    if (primitive === 'false') {
      return false;
    }
  }
  return null;
};

const parseBigintValue = (value: unknown): bigint | null => {
  const primitive = unwrapValue(value);
  if (primitive === null || primitive === undefined) {
    return null;
  }
  if (typeof primitive === 'bigint') {
    return primitive;
  }
  if (typeof primitive === 'number') {
    if (!Number.isFinite(primitive)) {
      return null;
    }
    return BigInt(Math.floor(primitive));
  }
  if (typeof primitive === 'string') {
    try {
      return BigInt(primitive);
    } catch {
      return null;
    }
  }
  return null;
};

const parseStringValue = (value: unknown): string | null => {
  const primitive = unwrapValue(value);
  if (primitive === null || primitive === undefined) {
    return null;
  }
  if (typeof primitive === 'object') {
    const asRecord = primitive as Record<string, unknown>;
    const address = asRecord.address;
    const contractName = asRecord.contractName;
    if (typeof address === 'string' && typeof contractName === 'string') {
      return `${address}.${contractName}`;
    }
    if (typeof address === 'string') {
      return address;
    }
  }
  return String(primitive);
};

export default function PreinscribedCollectionSaleScreen(
  props: PreinscribedCollectionSaleScreenProps
) {
  const usdPriceBook = useUsdPriceBook({
    enabled: !props.collapsed
  }).data ?? null;
  const [saleContractInput, setSaleContractInput] = useState(
    props.defaultSaleContractId ?? ''
  );
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [lookupTokenId, setLookupTokenId] = useState<bigint | null>(null);
  const [lookupRefreshKey, setLookupRefreshKey] = useState(0);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [buyPending, setBuyPending] = useState(false);
  const [buyStatus, setBuyStatus] = useState<string | null>(null);

  const parsedSaleContract = useMemo(
    () => parsePreinscribedSaleContractId(saleContractInput),
    [saleContractInput]
  );
  const saleContract = parsedSaleContract.config;
  const saleContractId = saleContract ? getContractId(saleContract) : null;
  const coreContractId = getContractId(props.contract);
  const readOnlySender = props.walletSession.address ?? props.contract.address;
  const saleMismatch = saleContract
    ? getNetworkMismatch(saleContract.network, props.walletSession.network)
    : null;
  const saleToCoreNetworkMismatch = saleContract
    ? saleContract.network !== props.contract.network
    : false;
  const nftClient = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const parsedTokenId = parseUintInput(tokenIdInput);

  useEffect(() => {
    if (!props.defaultSaleContractId) {
      return;
    }
    if (saleContractInput.trim()) {
      return;
    }
    setSaleContractInput(props.defaultSaleContractId);
  }, [props.defaultSaleContractId, saleContractInput]);

  useEffect(() => {
    setLookupTokenId(null);
    setLookupMessage(null);
    setBuyStatus(null);
  }, [saleContractId]);

  const callSaleReadOnly = useCallback(
    async (functionName: string, functionArgs: ClarityValue[] = []) => {
      if (!saleContract) {
        throw new Error('Sale contract is not set.');
      }
      const network = toStacksNetwork(saleContract.network);
      const result = await callReadOnlyFunction({
        contractAddress: saleContract.address,
        contractName: saleContract.contractName,
        functionName,
        functionArgs,
        senderAddress: readOnlySender,
        network
      });
      return unwrapResponse(result);
    },
    [readOnlySender, saleContract]
  );

  const requestSaleCall = useCallback(
    (options: {
      functionName: string;
      functionArgs: ClarityValue[];
      postConditions?: PostCondition[];
    }) => {
      if (!saleContract) {
        return Promise.reject(new Error('Sale contract is missing.'));
      }
      const network = props.walletSession.network ?? saleContract.network;
      const stxAddress = props.walletSession.address;
      return new Promise<TxPayload>((resolve, reject) => {
        showContractCall({
          contractAddress: saleContract.address,
          contractName: saleContract.contractName,
          functionName: options.functionName,
          functionArgs: options.functionArgs,
          postConditionMode: options.postConditions
            ? PostConditionMode.Deny
            : undefined,
          postConditions: options.postConditions,
          network,
          stxAddress,
          onFinish: (payload) => resolve(payload as TxPayload),
          onCancel: () =>
            reject(new Error('Wallet cancelled or failed to broadcast.'))
        });
      });
    },
    [props.walletSession.address, props.walletSession.network, saleContract]
  );

  const statusQuery = useQuery({
    queryKey: [
      'preinscribed-sale',
      saleContractId,
      'status',
      readOnlySender,
      props.walletSession.address ?? 'none',
      statusRefreshKey
    ],
    enabled: !!saleContract && !props.collapsed,
    queryFn: async (): Promise<SaleStatus> => {
      const [
        ownerCv,
        pausedCv,
        priceCv,
        allowlistCv,
        maxPerWalletCv,
        windowCv,
        countsCv,
        allowedCoreContractCv
      ] = await Promise.all([
        callSaleReadOnly('get-owner'),
        callSaleReadOnly('get-paused'),
        callSaleReadOnly('get-price'),
        callSaleReadOnly('get-allowlist-enabled'),
        callSaleReadOnly('get-max-per-wallet'),
        callSaleReadOnly('get-sale-window'),
        callSaleReadOnly('get-counts'),
        callSaleReadOnly('get-allowed-xtrata-contract')
      ]);

      const windowRaw = cvToValue(windowCv);
      const countsRaw = cvToValue(countsCv);
      let walletBought: bigint | null = null;
      let walletAllowance: bigint | null = null;

      if (props.walletSession.address) {
        const [walletStatsCv, allowlistEntryCv] = await Promise.all([
          callSaleReadOnly('get-wallet-stats', [
            principalCV(props.walletSession.address)
          ]).catch(() => null),
          callSaleReadOnly('get-allowlist-entry', [
            principalCV(props.walletSession.address)
          ]).catch(() => null)
        ]);

        if (walletStatsCv) {
          const statsRaw = cvToValue(walletStatsCv);
          walletBought = parseBigintValue(readTupleField(statsRaw, 'bought'));
        }
        if (
          allowlistEntryCv &&
          allowlistEntryCv.type === ClarityType.OptionalSome
        ) {
          const allowanceRaw = cvToValue(allowlistEntryCv.value);
          walletAllowance = parseBigintValue(
            readTupleField(allowanceRaw, 'allowance')
          );
        }
      }

      return {
        owner: parseStringValue(cvToValue(ownerCv)),
        paused: parseBoolValue(cvToValue(pausedCv)),
        price: parseBigintValue(cvToValue(priceCv)),
        allowlistEnabled: parseBoolValue(cvToValue(allowlistCv)),
        maxPerWallet: parseBigintValue(cvToValue(maxPerWalletCv)),
        saleStartBlock: parseBigintValue(readTupleField(windowRaw, 'start-block')),
        saleEndBlock: parseBigintValue(readTupleField(windowRaw, 'end-block')),
        availableCount: parseBigintValue(readTupleField(countsRaw, 'available')),
        soldCount: parseBigintValue(readTupleField(countsRaw, 'sold')),
        allowedCoreContract: parseStringValue(cvToValue(allowedCoreContractCv)),
        walletBought,
        walletAllowance
      };
    }
  });

  const inventoryQuery = useQuery({
    queryKey: [
      'preinscribed-sale',
      saleContractId,
      'inventory',
      lookupTokenId?.toString() ?? 'none',
      readOnlySender,
      lookupRefreshKey
    ],
    enabled: !!saleContract && lookupTokenId !== null && !props.collapsed,
    queryFn: async (): Promise<InventoryStatus> => {
      if (!saleContract || lookupTokenId === null) {
        throw new Error('Missing sale contract or token ID.');
      }
      const [inventoryCv, availableCv, owner] = await Promise.all([
        callSaleReadOnly('get-inventory', [uintCV(lookupTokenId)]),
        callSaleReadOnly('is-token-available', [uintCV(lookupTokenId)]),
        nftClient.getOwner(lookupTokenId, readOnlySender).catch(() => null)
      ]);

      const isAvailable = parseBoolValue(cvToValue(availableCv));
      const escrowed =
        owner !== null && saleContractId ? owner === saleContractId : null;

      if (inventoryCv.type === ClarityType.OptionalNone) {
        return {
          tokenId: lookupTokenId,
          exists: false,
          available: isAvailable,
          sold: null,
          seller: null,
          buyer: null,
          depositedAt: null,
          soldAt: null,
          owner,
          escrowed
        };
      }
      if (inventoryCv.type !== ClarityType.OptionalSome) {
        return {
          tokenId: lookupTokenId,
          exists: false,
          available: isAvailable,
          sold: null,
          seller: null,
          buyer: null,
          depositedAt: null,
          soldAt: null,
          owner,
          escrowed
        };
      }

      const inventoryRaw = cvToValue(inventoryCv.value);
      return {
        tokenId: lookupTokenId,
        exists: true,
        available:
          isAvailable ?? parseBoolValue(readTupleField(inventoryRaw, 'available')),
        sold: parseBoolValue(readTupleField(inventoryRaw, 'sold')),
        seller: parseStringValue(readTupleField(inventoryRaw, 'seller')),
        buyer: parseStringValue(readTupleField(inventoryRaw, 'buyer')),
        depositedAt: parseBigintValue(readTupleField(inventoryRaw, 'deposited-at')),
        soldAt: parseBigintValue(readTupleField(inventoryRaw, 'sold-at')),
        owner,
        escrowed
      };
    }
  });

  const coreContractMismatch =
    !!statusQuery.data?.allowedCoreContract &&
    statusQuery.data.allowedCoreContract !== coreContractId;

  const canBuy =
    !!saleContract &&
    !!props.walletSession.address &&
    !saleMismatch &&
    !saleToCoreNetworkMismatch &&
    !coreContractMismatch &&
    parsedTokenId !== null &&
    statusQuery.data?.paused !== true &&
    !buyPending;

  const handleRefreshStatus = () => {
    if (!saleContract) {
      return;
    }
    setStatusRefreshKey((current) => current + 1);
    setBuyStatus(null);
  };

  const handleLookupToken = () => {
    const tokenId = parseUintInput(tokenIdInput);
    if (tokenId === null) {
      setLookupMessage('Enter a valid token ID.');
      return;
    }
    setLookupMessage(null);
    setLookupTokenId(tokenId);
    setLookupRefreshKey((current) => current + 1);
  };

  const handleBuy = async () => {
    setBuyStatus(null);
    if (!saleContract) {
      setBuyStatus('Set a valid sale contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setBuyStatus('Connect a wallet to buy.');
      return;
    }
    if (saleMismatch) {
      setBuyStatus(
        `Network mismatch: wallet on ${saleMismatch.actual}, sale contract is ${saleMismatch.expected}.`
      );
      return;
    }
    if (saleToCoreNetworkMismatch) {
      setBuyStatus('Sale contract network must match the active NFT contract.');
      return;
    }
    if (coreContractMismatch) {
      setBuyStatus(
        `Sale contract is locked to ${statusQuery.data?.allowedCoreContract}, not ${coreContractId}.`
      );
      return;
    }
    const tokenId = parseUintInput(tokenIdInput);
    if (tokenId === null) {
      setBuyStatus('Enter a valid token ID.');
      return;
    }

    setBuyPending(true);
    setBuyStatus('Preparing purchase...');
    try {
      const [availableCv, priceCv] = await Promise.all([
        callSaleReadOnly('is-token-available', [uintCV(tokenId)]),
        callSaleReadOnly('get-price')
      ]);
      const available = parseBoolValue(cvToValue(availableCv));
      if (!available) {
        setBuyStatus('Token is not available in sale inventory.');
        return;
      }
      const price = parseBigintValue(cvToValue(priceCv)) ?? 0n;
      const postConditions: PostCondition[] = [
        makeStandardSTXPostCondition(
          props.walletSession.address,
          FungibleConditionCode.Equal,
          price
        ),
        buildContractTransferPostCondition({
          nftContract: props.contract,
          senderContract: saleContract,
          tokenId
        })
      ];
      const tx = await requestSaleCall({
        functionName: 'buy',
        functionArgs: [uintCV(tokenId)],
        postConditions
      });
      setBuyStatus(`Purchase submitted: ${tx.txId}`);
      setStatusRefreshKey((current) => current + 1);
      setLookupTokenId(tokenId);
      setLookupRefreshKey((current) => current + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('post-condition')) {
        setBuyStatus(
          'Purchase failed: no protected asset transfer occurred. Check price, availability, and wallet balance.'
        );
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
      id="preinscribed-sale"
    >
      <div className="panel__header">
        <div>
          <h2>Pre-inscribed sale</h2>
          <p>
            Buy pre-inscribed tokens from dedicated escrow sale contracts.
          </p>
        </div>
        <div className="panel__actions">
          <span className={`badge badge--${props.contract.network}`}>
            {props.contract.network}
          </span>
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
        <div className="mint-panel">
          <span className="meta-label">1. Sale contract</span>
          <label className="field">
            <span className="field__label">Contract ID</span>
            <input
              className="input"
              placeholder="SP...xtrata-preinscribed-collection-sale-v1-0"
              value={saleContractInput}
              onChange={(event) => setSaleContractInput(event.target.value)}
            />
            <span className="field__hint">Use format ADDRESS.CONTRACT-NAME.</span>
          </label>
          {saleContractInput.trim() && parsedSaleContract.error && (
            <div className="field__error">{parsedSaleContract.error}</div>
          )}
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={handleRefreshStatus}
              disabled={!saleContract || statusQuery.isFetching}
            >
              {statusQuery.isFetching ? 'Loading...' : 'Load sale status'}
            </button>
          </div>
        </div>

        {saleMismatch && (
          <div className="alert">
            <div>
              <strong>Network mismatch.</strong> Wallet is on {saleMismatch.actual},
              but the sale contract is on {saleMismatch.expected}.
            </div>
          </div>
        )}
        {saleToCoreNetworkMismatch && (
          <div className="alert">
            <div>
              <strong>Contract mismatch.</strong> Sale contract network does not
              match the active NFT contract network.
            </div>
          </div>
        )}
        {coreContractMismatch && (
          <div className="alert">
            <div>
              <strong>Allowed contract mismatch.</strong> Sale contract is locked
              to {statusQuery.data?.allowedCoreContract}, while active NFT contract
              is {coreContractId}.
            </div>
          </div>
        )}

        <div className="mint-panel">
          <span className="meta-label">2. Sale status</span>
          {statusQuery.isFetching && <p>Loading sale status...</p>}
          {statusQuery.error && (
            <div className="field__error">
              {statusQuery.error instanceof Error
                ? statusQuery.error.message
                : 'Unable to load sale status.'}
            </div>
          )}
          {statusQuery.data && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Owner</span>
                <AddressLabel
                  className="meta-value"
                  address={statusQuery.data.owner}
                  network={saleContract?.network}
                  fallback="Unknown"
                />
              </div>
              <div>
                <span className="meta-label">Paused</span>
                <span className="meta-value">
                  {statusQuery.data.paused === null
                    ? 'Unknown'
                    : statusQuery.data.paused
                      ? 'Yes'
                      : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Price</span>
                <span className="meta-value">
                  {formatMicroStxWithUsd(
                    statusQuery.data.price,
                    usdPriceBook
                  ).combined}
                </span>
              </div>
              <div>
                <span className="meta-label">Allowlist</span>
                <span className="meta-value">
                  {statusQuery.data.allowlistEnabled === null
                    ? 'Unknown'
                    : statusQuery.data.allowlistEnabled
                      ? 'Enabled'
                      : 'Disabled'}
                </span>
              </div>
              <div>
                <span className="meta-label">Max per wallet</span>
                <span className="meta-value">
                  {statusQuery.data.maxPerWallet?.toString() ?? 'Unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Sale window</span>
                <span className="meta-value">
                  {(statusQuery.data.saleStartBlock ?? 0n).toString()} -{' '}
                  {(statusQuery.data.saleEndBlock ?? 0n).toString()}
                </span>
              </div>
              <div>
                <span className="meta-label">Available</span>
                <span className="meta-value">
                  {statusQuery.data.availableCount?.toString() ?? 'Unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Sold</span>
                <span className="meta-value">
                  {statusQuery.data.soldCount?.toString() ?? 'Unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Allowed core contract</span>
                <span className="meta-value">
                  {statusQuery.data.allowedCoreContract ?? 'Unknown'}
                </span>
              </div>
              {props.walletSession.address && (
                <div>
                  <span className="meta-label">You purchased</span>
                  <span className="meta-value">
                    {statusQuery.data.walletBought?.toString() ?? '0'}
                  </span>
                </div>
              )}
              {props.walletSession.address && (
                <div>
                  <span className="meta-label">Your allowlist allowance</span>
                  <span className="meta-value">
                    {statusQuery.data.walletAllowance?.toString() ?? 'Not set'}
                  </span>
                </div>
              )}
            </div>
          )}
          {!statusQuery.isFetching && !statusQuery.data && !statusQuery.error && (
            <p className="field__hint">Enter a sale contract and load status.</p>
          )}
        </div>

        <div className="mint-panel">
          <span className="meta-label">3. Buy by token ID</span>
          <label className="field">
            <span className="field__label">Token ID</span>
            <input
              className="input"
              placeholder="0"
              value={tokenIdInput}
              onChange={(event) => setTokenIdInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={handleLookupToken}
              disabled={!saleContract || inventoryQuery.isFetching}
            >
              {inventoryQuery.isFetching ? 'Checking...' : 'Check availability'}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void handleBuy()}
              disabled={!canBuy}
            >
              {buyPending ? 'Submitting...' : 'Buy token'}
            </button>
          </div>
          {lookupMessage && <span className="field__error">{lookupMessage}</span>}
          {inventoryQuery.error && (
            <span className="field__error">
              {inventoryQuery.error instanceof Error
                ? inventoryQuery.error.message
                : 'Unable to load inventory status.'}
            </span>
          )}
          {inventoryQuery.data && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Token</span>
                <span className="meta-value">
                  #{inventoryQuery.data.tokenId.toString()}
                </span>
              </div>
              <div>
                <span className="meta-label">Inventory entry</span>
                <span className="meta-value">
                  {inventoryQuery.data.exists ? 'Exists' : 'Not found'}
                </span>
              </div>
              <div>
                <span className="meta-label">Available</span>
                <span className="meta-value">
                  {inventoryQuery.data.available === null
                    ? 'Unknown'
                    : inventoryQuery.data.available
                      ? 'Yes'
                      : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Sold</span>
                <span className="meta-value">
                  {inventoryQuery.data.sold === null
                    ? 'Unknown'
                    : inventoryQuery.data.sold
                      ? 'Yes'
                      : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Current owner</span>
                <AddressLabel
                  className="meta-value"
                  address={inventoryQuery.data.owner}
                  network={props.contract.network}
                  fallback="Unknown"
                />
              </div>
              <div>
                <span className="meta-label">Escrowed in sale contract</span>
                <span className="meta-value">
                  {inventoryQuery.data.escrowed === null
                    ? 'Unknown'
                    : inventoryQuery.data.escrowed
                      ? 'Yes'
                      : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Seller</span>
                <AddressLabel
                  className="meta-value"
                  address={inventoryQuery.data.seller}
                  network={saleContract?.network}
                  fallback="Unknown"
                />
              </div>
              <div>
                <span className="meta-label">Buyer</span>
                <AddressLabel
                  className="meta-value"
                  address={inventoryQuery.data.buyer}
                  network={saleContract?.network}
                  fallback="Not sold"
                />
              </div>
              <div>
                <span className="meta-label">Deposited at block</span>
                <span className="meta-value">
                  {inventoryQuery.data.depositedAt?.toString() ?? '—'}
                </span>
              </div>
              <div>
                <span className="meta-label">Sold at block</span>
                <span className="meta-value">
                  {inventoryQuery.data.soldAt?.toString() ?? '—'}
                </span>
              </div>
            </div>
          )}
          {buyStatus && <p className="field__hint">{buyStatus}</p>}
          <p className="field__hint">
            Purchase uses post-conditions to cap STX spend to the exact sale
            price and require NFT transfer from sale escrow.
          </p>
        </div>
      </div>
    </section>
  );
}
