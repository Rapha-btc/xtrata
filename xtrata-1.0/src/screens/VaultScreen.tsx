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
  buildDepositSbtcCall,
  buildMarkReservedCall,
  buildOpenVaultCall,
  createVaultClient
} from '../lib/vault/client';
import { parseVaultContractId } from '../lib/vault/contract';
import { VAULT_REGISTRY, getVaultContractId } from '../lib/vault/registry';
import { isSameAddress } from '../lib/market/actions';
import { getKnownFungibleAsset } from '../lib/contract/fungible-assets';
import { formatDecimalAmount, parseDecimalAmount } from '../lib/utils/amounts';

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

const formatTokenAmount = (
  value: bigint | null,
  decimals: number,
  symbol: string
) => {
  if (value === null) {
    return 'Unknown';
  }
  return `${formatDecimalAmount(value, decimals)} ${symbol}`;
};

type VaultScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type TxPayload = {
  txId: string;
};

type VaultStatus = {
  owner: string;
  coreContract: string;
  reserveToken: string;
  nextVaultId: bigint;
};

type VaultDetails = {
  vaultId: bigint;
  assetId: bigint;
  owner: string;
  amount: bigint;
  tier: bigint;
  reserved: boolean;
  createdAt: bigint;
  updatedAt: bigint;
  assetOwner: string | null;
  walletAccess: boolean;
};

export default function VaultScreen(props: VaultScreenProps) {
  const queryClient = useQueryClient();
  const defaultVaultId = getVaultContractId(VAULT_REGISTRY[0]);
  const [vaultInput, setVaultInput] = useState(() => defaultVaultId);
  const [vaultContractId, setVaultContractId] = useState(() => defaultVaultId);
  const [vaultIdInput, setVaultIdInput] = useState('');
  const [lookupVaultId, setLookupVaultId] = useState<bigint | null>(null);
  const [tierAmountInput, setTierAmountInput] = useState('');
  const [tierAmountCheck, setTierAmountCheck] = useState<bigint | null>(null);
  const [premiumAssetIdInput, setPremiumAssetIdInput] = useState('');
  const [premiumOwnerInput, setPremiumOwnerInput] = useState(
    () => props.walletSession.address ?? ''
  );
  const [premiumCheck, setPremiumCheck] = useState<{
    assetId: bigint;
    owner: string;
  } | null>(null);
  const [openAssetIdInput, setOpenAssetIdInput] = useState('');
  const [openAmountInput, setOpenAmountInput] = useState('');
  const [depositAmountInput, setDepositAmountInput] = useState('');
  const [openStatus, setOpenStatus] = useState<string | null>(null);
  const [openPending, setOpenPending] = useState(false);
  const [manageStatus, setManageStatus] = useState<string | null>(null);
  const [managePending, setManagePending] = useState(false);

  useEffect(() => {
    if (props.walletSession.address && !premiumOwnerInput.trim()) {
      setPremiumOwnerInput(props.walletSession.address);
    }
  }, [premiumOwnerInput, props.walletSession.address]);

  useEffect(() => {
    setLookupVaultId(null);
    setVaultIdInput('');
    setDepositAmountInput('');
    setOpenStatus(null);
    setManageStatus(null);
  }, [vaultContractId]);

  const vaultRegistryIds = useMemo(() => VAULT_REGISTRY.map(getVaultContractId), []);
  const vaultPresetValue = vaultRegistryIds.includes(vaultInput.trim()) ? vaultInput.trim() : '';
  const parsedVaultInput = useMemo(() => parseVaultContractId(vaultInput), [vaultInput]);
  const parsedVault = useMemo(() => parseVaultContractId(vaultContractId), [vaultContractId]);
  const vaultContract = parsedVault.config;
  const vaultError = vaultInput.trim() ? parsedVaultInput.error : null;
  const activeVaultError = parsedVault.error;
  const vaultClient = useMemo(
    () => (vaultContract ? createVaultClient({ contract: vaultContract }) : null),
    [vaultContract]
  );
  const vaultContractIdLabel = vaultContract ? getContractId(vaultContract) : null;
  const readOnlySender =
    props.walletSession.address ?? vaultContract?.address ?? props.contract.address;
  const vaultMismatch = vaultContract
    ? getNetworkMismatch(vaultContract.network, props.walletSession.network)
    : null;
  const vaultToCoreNetworkMismatch = vaultContract
    ? vaultContract.network !== props.contract.network
    : false;
  const canTransact =
    !!props.walletSession.address && !!vaultContract && !vaultMismatch && !vaultToCoreNetworkMismatch;
  const activeCoreContractId = getContractId(props.contract);

  const statusQuery = useQuery({
    queryKey: ['vault', vaultContractIdLabel, 'status'],
    enabled: !!vaultClient,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<VaultStatus> => {
      if (!vaultClient) {
        throw new Error('Vault client unavailable');
      }
      const [owner, coreContract, reserveToken, nextVaultId] = await Promise.all([
        vaultClient.getOwner(readOnlySender),
        vaultClient.getCoreContract(readOnlySender),
        vaultClient.getReserveToken(readOnlySender),
        vaultClient.getNextVaultId(readOnlySender)
      ]);
      return { owner, coreContract, reserveToken, nextVaultId };
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
  const reserveTokenAsset = getKnownFungibleAsset(statusQuery.data?.reserveToken ?? null);
  const reserveDecimals = reserveTokenAsset?.decimals ?? 8;
  const reserveSymbol = reserveTokenAsset?.symbol ?? 'sBTC';
  const linkedCoreMismatch =
    !!statusQuery.data?.coreContract && statusQuery.data.coreContract !== activeCoreContractId;

  const vaultQuery = useQuery({
    queryKey: [
      'vault',
      vaultContractIdLabel,
      'vault',
      lookupVaultId?.toString() ?? 'none',
      boundCoreContractId,
      props.walletSession.address ?? 'guest'
    ],
    enabled: !!vaultClient && lookupVaultId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<VaultDetails | null> => {
      if (!vaultClient || lookupVaultId === null) {
        throw new Error('Vault lookup unavailable');
      }
      const vault = await vaultClient.getVault(lookupVaultId, readOnlySender);
      if (!vault) {
        return null;
      }
      const [assetOwner, walletAccess] = await Promise.all([
        boundCoreClient.getOwner(vault.assetId, readOnlySender),
        props.walletSession.address
          ? vaultClient.hasPremiumAccess(vault.assetId, props.walletSession.address, readOnlySender)
          : Promise.resolve(false)
      ]);
      return {
        vaultId: lookupVaultId,
        assetId: vault.assetId,
        owner: vault.owner,
        amount: vault.amount,
        tier: vault.tier,
        reserved: vault.reserved,
        createdAt: vault.createdAt,
        updatedAt: vault.updatedAt,
        assetOwner,
        walletAccess
      };
    }
  });

  const tierQuery = useQuery({
    queryKey: ['vault', vaultContractIdLabel, 'tier', tierAmountCheck?.toString() ?? 'none'],
    enabled: !!vaultClient && tierAmountCheck !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!vaultClient || tierAmountCheck === null) {
        throw new Error('Tier lookup unavailable');
      }
      return vaultClient.getTierForAmount(tierAmountCheck, readOnlySender);
    }
  });

  const premiumQuery = useQuery({
    queryKey: [
      'vault',
      vaultContractIdLabel,
      'premium',
      premiumCheck?.assetId.toString() ?? 'none',
      premiumCheck?.owner ?? 'none'
    ],
    enabled: !!vaultClient && premiumCheck !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!vaultClient || !premiumCheck) {
        throw new Error('Premium lookup unavailable');
      }
      return vaultClient.hasPremiumAccess(
        premiumCheck.assetId,
        premiumCheck.owner,
        readOnlySender
      );
    }
  });

  const requestContractCall = (params: {
    call: ContractCallOptions;
    postConditionMode?: PostConditionMode;
    postConditions?: PostCondition[];
  }) => {
    if (!vaultContract) {
      return Promise.reject(new Error('Vault contract missing.'));
    }
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        ...params.call,
        network: props.walletSession.network ?? vaultContract.network,
        stxAddress: props.walletSession.address,
        postConditionMode: params.postConditionMode,
        postConditions: params.postConditions,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () => reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  const refreshVaultQueries = () => {
    if (!vaultContractIdLabel) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['vault', vaultContractIdLabel] });
    void queryClient.refetchQueries({ queryKey: ['vault', vaultContractIdLabel], type: 'active' });
  };

  const handleUseVaultContract = () => {
    if (!vaultInput.trim() || parsedVaultInput.error) {
      return;
    }
    setVaultContractId(vaultInput.trim());
    setOpenStatus(null);
    setManageStatus(null);
  };

  const handleClearVaultContract = () => {
    setVaultInput('');
    setVaultContractId('');
  };

  const handleLookupVault = () => {
    const vaultId = parseUintInput(vaultIdInput);
    if (vaultId === null) {
      setManageStatus('Enter a valid vault ID.');
      return;
    }
    setManageStatus(null);
    setLookupVaultId(vaultId);
  };

  const handleCheckTier = () => {
    const amount = parseDecimalAmount(tierAmountInput, reserveDecimals, true);
    if (amount === null) {
      setManageStatus(`Enter a valid ${reserveSymbol} amount for tier lookup.`);
      return;
    }
    setManageStatus(null);
    setTierAmountCheck(amount);
  };

  const handleCheckPremiumAccess = () => {
    const assetId = parseUintInput(premiumAssetIdInput);
    if (assetId === null) {
      setManageStatus('Enter a valid asset ID for premium access lookup.');
      return;
    }
    const owner = premiumOwnerInput.trim();
    if (!validateStacksAddress(owner)) {
      setManageStatus('Enter a valid Stacks address for premium access lookup.');
      return;
    }
    setManageStatus(null);
    setPremiumCheck({ assetId, owner });
  };

  const handleOpenVault = async () => {
    setOpenStatus(null);
    if (!vaultContract) {
      setOpenStatus('Set a vault contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setOpenStatus('Connect a wallet to open a vault.');
      return;
    }
    if (vaultMismatch) {
      setOpenStatus(
        `Network mismatch: wallet on ${vaultMismatch.actual}, vault is ${vaultMismatch.expected}.`
      );
      return;
    }
    if (vaultToCoreNetworkMismatch) {
      setOpenStatus('Vault network must match the active core contract.');
      return;
    }
    if (!reserveTokenAsset) {
      setOpenStatus('Unknown reserve token metadata. Use the registered vault contract to deposit safely.');
      return;
    }
    const assetId = parseUintInput(openAssetIdInput);
    if (assetId === null) {
      setOpenStatus('Enter a valid asset ID.');
      return;
    }
    const initialAmount = parseDecimalAmount(openAmountInput, reserveDecimals);
    if (initialAmount === null) {
      setOpenStatus(`Enter a valid ${reserveSymbol} amount.`);
      return;
    }

    setOpenPending(true);
    setOpenStatus('Preparing vault transaction...');
    try {
      const owner = await boundCoreClient.getOwner(assetId, readOnlySender);
      if (!owner) {
        setOpenStatus('Asset owner could not be resolved.');
        return;
      }
      if (!isSameAddress(owner, props.walletSession.address)) {
        setOpenStatus(`Only the current asset owner can open a vault. Current owner is ${owner}.`);
        return;
      }
      const tx = await requestContractCall({
        call: buildOpenVaultCall({
          contract: vaultContract,
          network: toStacksNetwork(vaultContract.network),
          assetId,
          initialAmount
        }),
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildFungibleSpendPostCondition({
            token: reserveTokenAsset,
            senderAddress: props.walletSession.address,
            amount: initialAmount
          })
        ]
      });
      setOpenStatus(`Vault open submitted: ${tx.txId}`);
      refreshVaultQueries();
    } catch (error) {
      setOpenStatus(`Vault open failed: ${getErrorMessage(error)}`);
    } finally {
      setOpenPending(false);
    }
  };

  const displayedVault = vaultQuery.data;
  const canManageDisplayedVault =
    !!displayedVault &&
    !!props.walletSession.address &&
    canTransact &&
    isSameAddress(displayedVault.owner, props.walletSession.address) &&
    (!displayedVault.assetOwner || isSameAddress(displayedVault.assetOwner, displayedVault.owner));

  const handleDeposit = async () => {
    setManageStatus(null);
    if (!displayedVault) {
      setManageStatus('Load a vault first.');
      return;
    }
    if (!vaultContract) {
      setManageStatus('Set a vault contract ID first.');
      return;
    }
    if (!props.walletSession.address) {
      setManageStatus('Connect a wallet to deposit.');
      return;
    }
    if (!reserveTokenAsset) {
      setManageStatus('Unknown reserve token metadata. Use the registered vault contract to deposit safely.');
      return;
    }
    if (!canManageDisplayedVault) {
      setManageStatus('Only the active asset owner can deposit into this vault.');
      return;
    }
    const amount = parseDecimalAmount(depositAmountInput, reserveDecimals);
    if (amount === null) {
      setManageStatus(`Enter a valid ${reserveSymbol} amount.`);
      return;
    }

    setManagePending(true);
    setManageStatus('Preparing deposit...');
    try {
      const tx = await requestContractCall({
        call: buildDepositSbtcCall({
          contract: vaultContract,
          network: toStacksNetwork(vaultContract.network),
          vaultId: displayedVault.vaultId,
          amount
        }),
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          buildFungibleSpendPostCondition({
            token: reserveTokenAsset,
            senderAddress: props.walletSession.address,
            amount
          })
        ]
      });
      setManageStatus(`Deposit submitted: ${tx.txId}`);
      refreshVaultQueries();
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes('post-condition')) {
        setManageStatus(`Deposit failed: no ${reserveSymbol} moved. Check wallet balance and vault state.`);
      } else {
        setManageStatus(`Deposit failed: ${message}`);
      }
    } finally {
      setManagePending(false);
    }
  };

  const handleToggleReserved = async () => {
    setManageStatus(null);
    if (!displayedVault) {
      setManageStatus('Load a vault first.');
      return;
    }
    if (!vaultContract) {
      setManageStatus('Set a vault contract ID first.');
      return;
    }
    if (!canManageDisplayedVault) {
      setManageStatus('Only the active asset owner can manage reserve state.');
      return;
    }

    setManagePending(true);
    setManageStatus(displayedVault.reserved ? 'Clearing reserve marker...' : 'Setting reserve marker...');
    try {
      const tx = await requestContractCall({
        call: buildMarkReservedCall({
          contract: vaultContract,
          network: toStacksNetwork(vaultContract.network),
          vaultId: displayedVault.vaultId,
          reserved: !displayedVault.reserved
        })
      });
      setManageStatus(`${displayedVault.reserved ? 'Reserve clear' : 'Reserve update'} submitted: ${tx.txId}`);
      refreshVaultQueries();
    } catch (error) {
      setManageStatus(`Reserve update failed: ${getErrorMessage(error)}`);
    } finally {
      setManagePending(false);
    }
  };

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="vault"
    >
      <div className="panel__header">
        <div>
          <h2>Vault</h2>
          <p>Open sBTC reserve vaults, top them up, and verify premium access tiers.</p>
        </div>
        <div className="panel__actions">
          {vaultContract && (
            <span className={`badge badge--${vaultContract.network}`}>{vaultContract.network}</span>
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
            <h3>Vault contract</h3>
            <label className="field">
              <span className="field__label">Registry</span>
              <select
                className="select"
                value={vaultPresetValue}
                onChange={(event) => setVaultInput(event.target.value)}
              >
                <option value="">Custom</option>
                {VAULT_REGISTRY.map((entry) => {
                  const id = getVaultContractId(entry);
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
                placeholder="SP...xtrata-vault"
                value={vaultInput}
                onChange={(event) => setVaultInput(event.target.value)}
              />
            </label>
            {vaultError && <div className="field__error">{vaultError}</div>}
            {!vaultError && activeVaultError && <div className="field__error">{activeVaultError}</div>}
            <div className="market-controls">
              <button
                className="button"
                type="button"
                onClick={handleUseVaultContract}
                disabled={!vaultInput.trim() || !!vaultError}
              >
                Use contract
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleClearVaultContract}
                disabled={!vaultContractId}
              >
                Clear
              </button>
            </div>
            {vaultContractIdLabel && (
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Vault contract</span>
                  <span className="meta-value">{vaultContractIdLabel}</span>
                </div>
                <div>
                  <span className="meta-label">Active core contract</span>
                  <span className="meta-value">{activeCoreContractId}</span>
                </div>
              </div>
            )}
            {vaultMismatch && (
              <div className="alert">
                <div>
                  <strong>Network mismatch.</strong> Wallet is on {vaultMismatch.actual}, vault is{' '}
                  {vaultMismatch.expected}.
                </div>
              </div>
            )}
            {vaultToCoreNetworkMismatch && (
              <div className="alert">
                <div>
                  <strong>Network mismatch.</strong> Vault contract network must match the active core
                  contract.
                </div>
              </div>
            )}
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Vault status</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void statusQuery.refetch()}
                disabled={!vaultContract}
              >
                Refresh
              </button>
            </div>
            {statusQuery.isLoading && <p>Loading vault status...</p>}
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
                    <span className="meta-label">Reserve token</span>
                    <span className="meta-value">{statusQuery.data.reserveToken}</span>
                  </div>
                  <div>
                    <span className="meta-label">Next vault ID</span>
                    <span className="meta-value">#{statusQuery.data.nextVaultId.toString()}</span>
                  </div>
                </div>
                {reserveTokenAsset ? (
                  <div className="market-check market-check--ok">
                    <span className="meta-label">Wallet guard</span>
                    <span className="meta-value">
                      Exact {reserveTokenAsset.symbol} post-condition ready ({reserveTokenAsset.assetName})
                    </span>
                  </div>
                ) : (
                  <div className="market-check market-check--warn">
                    <span className="meta-label">Wallet guard</span>
                    <span className="meta-value">
                      Unknown reserve token metadata. Deposits are disabled for safety.
                    </span>
                  </div>
                )}
                {linkedCoreMismatch && (
                  <div className="alert">
                    <div>
                      <strong>Core link mismatch.</strong> This vault contract is bound to{' '}
                      {statusQuery.data.coreContract}. Ownership checks in this module use that contract,
                      not the currently selected app contract.
                    </div>
                  </div>
                )}
              </>
            )}
            {statusQuery.error && (
              <div className="field__error">
                Unable to load vault status: {getErrorMessage(statusQuery.error)}
              </div>
            )}
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Lookup vault</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleLookupVault}
                disabled={!vaultContract}
              >
                Load
              </button>
            </div>
            <label className="field">
              <span className="field__label">Vault ID</span>
              <div className="field__inline">
                <input
                  className="input"
                  placeholder="e.g. 0"
                  value={vaultIdInput}
                  onChange={(event) => setVaultIdInput(event.target.value)}
                />
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleLookupVault}
                  disabled={!vaultContract}
                >
                  Load
                </button>
              </div>
            </label>
            {vaultQuery.isFetching && <p>Loading vault...</p>}
            {displayedVault && (
              <div className="market-listing-card market-listing-card--lookup">
                <div className="meta-grid meta-grid--dense">
                  <div>
                    <span className="meta-label">Vault ID</span>
                    <span className="meta-value">#{displayedVault.vaultId.toString()}</span>
                  </div>
                  <div>
                    <span className="meta-label">Asset ID</span>
                    <span className="meta-value">#{displayedVault.assetId.toString()}</span>
                  </div>
                  <div>
                    <span className="meta-label">Owner</span>
                    <span className="meta-value">{displayedVault.owner}</span>
                  </div>
                  <div>
                    <span className="meta-label">Deposit</span>
                    <span className="meta-value">
                      {formatTokenAmount(displayedVault.amount, reserveDecimals, reserveSymbol)}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Tier</span>
                    <span className="meta-value">{displayedVault.tier.toString()}</span>
                  </div>
                  <div>
                    <span className="meta-label">Reserved</span>
                    <span className="meta-value">{displayedVault.reserved ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Current asset owner</span>
                    <span className="meta-value">{displayedVault.assetOwner ?? 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Wallet premium access</span>
                    <span className="meta-value">{displayedVault.walletAccess ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="market-checks">
                  <div
                    className={`market-check${
                      !displayedVault.assetOwner ||
                      isSameAddress(displayedVault.assetOwner, displayedVault.owner)
                        ? ' market-check--ok'
                        : ' market-check--warn'
                    }`}
                  >
                    <span className="meta-label">Vault control</span>
                    <span className="meta-value">
                      {!displayedVault.assetOwner
                        ? 'Owner unknown'
                        : isSameAddress(displayedVault.assetOwner, displayedVault.owner)
                          ? 'Vault owner still controls asset'
                          : 'Asset owner changed'}
                    </span>
                  </div>
                </div>
                <label className="field">
                  <span className="field__label">Deposit amount ({reserveSymbol})</span>
                  <input
                    className="input"
                    placeholder={reserveDecimals === 8 ? '0.10000000' : '1.0'}
                    value={depositAmountInput}
                    onChange={(event) => setDepositAmountInput(event.target.value)}
                  />
                </label>
                <div className="market-listing-card__actions market-listing-card__actions--detail">
                  <button
                    className="button button--mini"
                    type="button"
                    onClick={() => void handleDeposit()}
                    disabled={!canManageDisplayedVault || !reserveTokenAsset || managePending}
                  >
                    {managePending ? 'Submitting...' : 'Deposit sBTC'}
                  </button>
                  <button
                    className="button button--ghost button--mini"
                    type="button"
                    onClick={() => void handleToggleReserved()}
                    disabled={!canManageDisplayedVault || managePending}
                  >
                    {displayedVault.reserved ? 'Clear reserve marker' : 'Mark reserved'}
                  </button>
                </div>
                {manageStatus && <p className="field__hint">{manageStatus}</p>}
              </div>
            )}
            {!displayedVault && lookupVaultId !== null && !vaultQuery.isFetching && (
              <p className="field__hint">No vault found.</p>
            )}
            {vaultQuery.error && (
              <div className="field__error">
                Unable to load vault: {getErrorMessage(vaultQuery.error)}
              </div>
            )}
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Tier calculator</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleCheckTier}
                disabled={!vaultContract}
              >
                Check
              </button>
            </div>
            <label className="field">
              <span className="field__label">Amount ({reserveSymbol})</span>
              <input
                className="input"
                placeholder={reserveDecimals === 8 ? '0.10000000' : '1.0'}
                value={tierAmountInput}
                onChange={(event) => setTierAmountInput(event.target.value)}
              />
            </label>
            {tierQuery.isFetching && <p>Checking tier...</p>}
            {tierAmountCheck !== null && !tierQuery.isFetching && tierQuery.data !== undefined && (
              <div className="market-check market-check--ok">
                <span className="meta-label">Tier</span>
                <span className="meta-value">{tierQuery.data.toString()}</span>
              </div>
            )}
            {tierQuery.error && (
              <div className="field__error">Unable to load tier: {getErrorMessage(tierQuery.error)}</div>
            )}
          </div>

          <div className="market-block">
            <div className="market-block__header">
              <h3>Premium access check</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleCheckPremiumAccess}
                disabled={!vaultContract}
              >
                Check
              </button>
            </div>
            <label className="field">
              <span className="field__label">Asset ID</span>
              <input
                className="input"
                placeholder="e.g. 42"
                value={premiumAssetIdInput}
                onChange={(event) => setPremiumAssetIdInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Owner address</span>
              <input
                className="input"
                placeholder="SP..."
                value={premiumOwnerInput}
                onChange={(event) => setPremiumOwnerInput(event.target.value)}
              />
            </label>
            {premiumQuery.isFetching && <p>Checking premium access...</p>}
            {premiumCheck && !premiumQuery.isFetching && premiumQuery.data !== undefined && (
              <div className={`market-check${premiumQuery.data ? ' market-check--ok' : ' market-check--warn'}`}>
                <span className="meta-label">Result</span>
                <span className="meta-value">
                  {premiumQuery.data ? 'Premium access available' : 'No premium access'}
                </span>
              </div>
            )}
            {premiumQuery.error && (
              <div className="field__error">
                Unable to check premium access: {getErrorMessage(premiumQuery.error)}
              </div>
            )}
          </div>

          <div className="market-block" id="vault-actions">
            <h3>Open vault</h3>
            <p className="field__hint">
              Vaults lock reserve deposits only. This MVP does not support withdrawals.
            </p>
            <div className="market-actions">
              <div className="market-action">
                <label className="field">
                  <span className="field__label">Asset ID</span>
                  <input
                    className="input"
                    placeholder="Asset ID"
                    value={openAssetIdInput}
                    onChange={(event) => setOpenAssetIdInput(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Initial deposit ({reserveSymbol})</span>
                  <input
                    className="input"
                    placeholder={reserveDecimals === 8 ? '0.10000000' : '1.0'}
                    value={openAmountInput}
                    onChange={(event) => setOpenAmountInput(event.target.value)}
                  />
                </label>
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleOpenVault()}
                  disabled={!canTransact || !reserveTokenAsset || openPending}
                >
                  {openPending ? 'Opening...' : 'Open vault'}
                </button>
                {openStatus && <p className="field__hint">{openStatus}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
