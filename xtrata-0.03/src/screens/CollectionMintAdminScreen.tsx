import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import {
  boolCV,
  callReadOnlyFunction,
  ClarityType,
  type ClarityValue,
  cvToValue,
  listCV,
  principalCV,
  tupleCV,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import { getNetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import { formatMicroStx, MICROSTX_PER_STX } from '../lib/contract/fees';

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

type CollectionMintAdminScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type TxPayload = {
  txId: string;
};

type CollectionMintStatus = {
  owner: string | null;
  paused: boolean | null;
  mintPrice: bigint | null;
  maxSupply: bigint | null;
  recipients: {
    artist: string;
    marketplace: string;
    operator: string;
  } | null;
  splits: {
    artist: bigint;
    marketplace: bigint;
    operator: bigint;
  } | null;
  allowlistEnabled: boolean | null;
  maxPerWallet: bigint | null;
};

type AllowlistEntry = {
  owner: string;
  allowance: bigint;
};

const parseStxInput = (value: string, allowZero = false) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed < 0 || (!allowZero && parsed === 0)) {
    return null;
  }
  return parsed;
};

const parseUintInput = (value: string, allowZero = false) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  if (!allowZero && parsed === 0) {
    return null;
  }
  return BigInt(Math.floor(parsed));
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

const toPrimitive = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (
    parsed &&
    typeof parsed === 'object' &&
    'value' in (parsed as Record<string, unknown>)
  ) {
    return (parsed as { value: string }).value;
  }
  return parsed as string | boolean | null;
};

const parseUint = (value: ClarityValue) => {
  const primitive = toPrimitive(value);
  if (primitive === null || primitive === undefined) {
    return null;
  }
  if (typeof primitive === 'bigint') {
    return primitive;
  }
  if (typeof primitive === 'number') {
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

const formatMicroStxValue = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) {
    return `${value.toString()} microSTX`;
  }
  return formatMicroStx(asNumber);
};

const parseAllowlistBatch = (raw: string) => {
  const entries: AllowlistEntry[] = [];
  const errors: string[] = [];
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Line ${index + 1} is missing an allowance.`);
      return;
    }
    const [address, allowanceRaw] = parts;
    if (!address || !validateStacksAddress(address)) {
      errors.push(`Line ${index + 1} has an invalid address.`);
      return;
    }
    const allowance = parseUintInput(allowanceRaw, true);
    if (allowance === null) {
      errors.push(`Line ${index + 1} has an invalid allowance.`);
      return;
    }
    entries.push({ owner: address, allowance });
  });

  if (entries.length > 50) {
    errors.push('Allowlist batch limit is 50 entries.');
  }

  return { entries, errors };
};

export default function CollectionMintAdminScreen(
  props: CollectionMintAdminScreenProps
) {
  const [collectionAddress, setCollectionAddress] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [status, setStatus] = useState<CollectionMintStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [coreAllowlisted, setCoreAllowlisted] = useState<boolean | null>(null);

  const [mintPriceInput, setMintPriceInput] = useState('');
  const [maxSupplyInput, setMaxSupplyInput] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [marketplaceInput, setMarketplaceInput] = useState('');
  const [operatorInput, setOperatorInput] = useState('');
  const [artistBpsInput, setArtistBpsInput] = useState('');
  const [marketplaceBpsInput, setMarketplaceBpsInput] = useState('');
  const [operatorBpsInput, setOperatorBpsInput] = useState('');
  const [allowlistEnabledInput, setAllowlistEnabledInput] = useState('');
  const [maxPerWalletInput, setMaxPerWalletInput] = useState('');
  const [allowlistAddressInput, setAllowlistAddressInput] = useState('');
  const [allowlistAllowanceInput, setAllowlistAllowanceInput] = useState('');
  const [allowlistBatchInput, setAllowlistBatchInput] = useState('');
  const [allowlistStatus, setAllowlistStatus] = useState<{
    exists: boolean;
    allowance: bigint | null;
    minted: bigint | null;
    reserved: bigint | null;
  } | null>(null);
  const [allowlistStatusMessage, setAllowlistStatusMessage] = useState<string | null>(
    null
  );
  const [allowlistStatusLoading, setAllowlistStatusLoading] = useState(false);
  const [transferOwnerInput, setTransferOwnerInput] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const canTransact = !!props.walletSession.address && !mismatch;

  const contractValid = useMemo(() => {
    if (!collectionAddress.trim() || !collectionName.trim()) {
      return false;
    }
    if (!validateStacksAddress(collectionAddress.trim())) {
      return false;
    }
    return CONTRACT_NAME_PATTERN.test(collectionName.trim());
  }, [collectionAddress, collectionName]);

  const collectionContract = useMemo(() => {
    if (!contractValid) {
      return null;
    }
    return {
      address: collectionAddress.trim(),
      contractName: collectionName.trim()
    };
  }, [collectionAddress, collectionName, contractValid]);

  const collectionContractId = collectionContract
    ? `${collectionContract.address}.${collectionContract.contractName}`
    : null;

  const coreSupportsAllowlist =
    props.contract.protocolVersion === '2.1.0' ||
    props.contract.contractName.includes('v2-1-0');

  const isCollectionOwner =
    !!props.walletSession.address &&
    !!status?.owner &&
    props.walletSession.address === status.owner;
  const canManageCollection = canTransact && (!status?.owner || isCollectionOwner);

  const callCollectionReadOnly = async (
    functionName: string,
    functionArgs: ClarityValue[] = []
  ) => {
    if (!collectionContract) {
      throw new Error('Collection contract is not set.');
    }
    const network = toStacksNetwork(props.contract.network);
    const sender = props.walletSession.address ?? props.contract.address;
    return callReadOnlyFunction({
      contractAddress: collectionContract.address,
      contractName: collectionContract.contractName,
      functionName,
      functionArgs,
      senderAddress: sender,
      network
    }).then(unwrapResponse);
  };

  useEffect(() => {
    setStatus(null);
    setCoreAllowlisted(null);
    setStatusMessage(null);
    setAllowlistStatus(null);
    setAllowlistStatusMessage(null);
  }, [collectionAddress, collectionName]);

  useEffect(() => {
    setAllowlistStatus(null);
    setAllowlistStatusMessage(null);
  }, [allowlistAddressInput]);

  useEffect(() => {
    if (!status) {
      return;
    }
    if (status.mintPrice !== null && !mintPriceInput.trim()) {
      const asNumber = Number(status.mintPrice) / MICROSTX_PER_STX;
      if (Number.isFinite(asNumber)) {
        setMintPriceInput(asNumber.toFixed(6));
      }
    }
    if (status.maxSupply !== null && !maxSupplyInput.trim()) {
      setMaxSupplyInput(status.maxSupply.toString());
    }
    if (status.recipients) {
      if (!artistInput.trim()) {
        setArtistInput(status.recipients.artist);
      }
      if (!marketplaceInput.trim()) {
        setMarketplaceInput(status.recipients.marketplace);
      }
      if (!operatorInput.trim()) {
        setOperatorInput(status.recipients.operator);
      }
    }
    if (status.splits) {
      if (!artistBpsInput.trim()) {
        setArtistBpsInput(status.splits.artist.toString());
      }
      if (!marketplaceBpsInput.trim()) {
        setMarketplaceBpsInput(status.splits.marketplace.toString());
      }
      if (!operatorBpsInput.trim()) {
        setOperatorBpsInput(status.splits.operator.toString());
      }
    }
    if (status.allowlistEnabled !== null && !allowlistEnabledInput.trim()) {
      setAllowlistEnabledInput(status.allowlistEnabled ? 'true' : 'false');
    }
    if (status.maxPerWallet !== null && !maxPerWalletInput.trim()) {
      setMaxPerWalletInput(status.maxPerWallet.toString());
    }
  }, [
    status,
    mintPriceInput,
    maxSupplyInput,
    artistInput,
    marketplaceInput,
    operatorInput,
    artistBpsInput,
    marketplaceBpsInput,
    operatorBpsInput,
    allowlistEnabledInput,
    maxPerWalletInput
  ]);

  const requestCollectionCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    if (!collectionContract) {
      return Promise.reject(new Error('Collection contract is not set.'));
    }
    const network = props.walletSession.network ?? props.contract.network;
    const stxAddress = props.walletSession.address;
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: collectionContract.address,
        contractName: collectionContract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network,
        stxAddress,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () => reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  const requestCoreCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    const network = props.walletSession.network ?? props.contract.network;
    const stxAddress = props.walletSession.address;
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: props.contract.address,
        contractName: props.contract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network,
        stxAddress,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () => reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  const loadStatus = async () => {
    if (!collectionContract) {
      setStatusMessage('Enter a collection contract address and name.');
      return;
    }
    setStatusLoading(true);
    setStatusMessage(null);
    setCoreAllowlisted(null);

    try {
      const [
        ownerCv,
        pausedCv,
        priceCv,
        supplyCv,
        recipientsCv,
        splitsCv,
        allowlistCv,
        maxPerWalletCv
      ] = await Promise.all([
        callCollectionReadOnly('get-owner'),
        callCollectionReadOnly('is-paused'),
        callCollectionReadOnly('get-mint-price'),
        callCollectionReadOnly('get-max-supply'),
        callCollectionReadOnly('get-recipients'),
        callCollectionReadOnly('get-splits'),
        callCollectionReadOnly('get-allowlist-enabled'),
        callCollectionReadOnly('get-max-per-wallet')
      ]);

      const recipientsRaw = cvToValue(recipientsCv) as Record<
        string,
        { value?: string }
      >;
      const splitsRaw = cvToValue(splitsCv) as Record<string, { value?: string }>;

      const nextStatus: CollectionMintStatus = {
        owner: toPrimitive(ownerCv) as string,
        paused: Boolean(toPrimitive(pausedCv)),
        mintPrice: parseUint(priceCv),
        maxSupply: parseUint(supplyCv),
        recipients: {
          artist: String(recipientsRaw.artist?.value ?? ''),
          marketplace: String(recipientsRaw.marketplace?.value ?? ''),
          operator: String(recipientsRaw.operator?.value ?? '')
        },
        splits: {
          artist: BigInt(splitsRaw.artist?.value ?? 0),
          marketplace: BigInt(splitsRaw.marketplace?.value ?? 0),
          operator: BigInt(splitsRaw.operator?.value ?? 0)
        },
        allowlistEnabled: Boolean(toPrimitive(allowlistCv)),
        maxPerWallet: parseUint(maxPerWalletCv)
      };

      setStatus(nextStatus);

      if (coreSupportsAllowlist && collectionContractId) {
        const network = toStacksNetwork(props.contract.network);
        const sender = props.walletSession.address ?? props.contract.address;
        const allowlistedCv = await callReadOnlyFunction({
          contractAddress: props.contract.address,
          contractName: props.contract.contractName,
          functionName: 'is-allowed-caller',
          functionArgs: [principalCV(collectionContractId)],
          senderAddress: sender,
          network
        }).then(unwrapResponse);
        setCoreAllowlisted(Boolean(toPrimitive(allowlistedCv)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed to load collection status: ${message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  const runAction = async (
    label: string,
    action: () => Promise<TxPayload>
  ) => {
    setPendingAction(label);
    setActionMessage(null);
    try {
      const payload = await action();
      setActionMessage(`${label} submitted: ${payload.txId}`);
      await loadStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionMessage(`${label} failed: ${message}`);
    } finally {
      setPendingAction(null);
    }
  };

  const handleSetMintPrice = async () => {
    const parsed = parseStxInput(mintPriceInput, true);
    if (parsed === null) {
      setActionMessage('Enter a valid mint price in STX (0 allowed).');
      return;
    }
    const micro = BigInt(Math.round(parsed * MICROSTX_PER_STX));
    await runAction('Set mint price', () =>
      requestCollectionCall({
        functionName: 'set-mint-price',
        functionArgs: [uintCV(micro)]
      })
    );
  };

  const handleSetMaxSupply = async () => {
    const parsed = parseUintInput(maxSupplyInput);
    if (parsed === null) {
      setActionMessage('Enter a valid max supply (> 0).');
      return;
    }
    await runAction('Set max supply', () =>
      requestCollectionCall({
        functionName: 'set-max-supply',
        functionArgs: [uintCV(parsed)]
      })
    );
  };

  const handleSetRecipients = async () => {
    if (
      !validateStacksAddress(artistInput.trim()) ||
      !validateStacksAddress(marketplaceInput.trim()) ||
      !validateStacksAddress(operatorInput.trim())
    ) {
      setActionMessage('Enter valid STX addresses for all recipients.');
      return;
    }
    await runAction('Set recipients', () =>
      requestCollectionCall({
        functionName: 'set-recipients',
        functionArgs: [
          principalCV(artistInput.trim()),
          principalCV(marketplaceInput.trim()),
          principalCV(operatorInput.trim())
        ]
      })
    );
  };

  const handleSetSplits = async () => {
    const artist = parseUintInput(artistBpsInput, true);
    const marketplace = parseUintInput(marketplaceBpsInput, true);
    const operator = parseUintInput(operatorBpsInput, true);
    if (artist === null || marketplace === null || operator === null) {
      setActionMessage('Enter valid split values in BPS.');
      return;
    }
    await runAction('Set splits', () =>
      requestCollectionCall({
        functionName: 'set-splits',
        functionArgs: [uintCV(artist), uintCV(marketplace), uintCV(operator)]
      })
    );
  };

  const handleSetAllowlistEnabled = async () => {
    const value = allowlistEnabledInput === 'true';
    await runAction('Set allowlist mode', () =>
      requestCollectionCall({
        functionName: 'set-allowlist-enabled',
        functionArgs: [boolCV(value)]
      })
    );
  };

  const handleSetMaxPerWallet = async () => {
    const parsed = parseUintInput(maxPerWalletInput, true);
    if (parsed === null) {
      setActionMessage('Enter a valid max per wallet (0 allowed).');
      return;
    }
    await runAction('Set max per wallet', () =>
      requestCollectionCall({
        functionName: 'set-max-per-wallet',
        functionArgs: [uintCV(parsed)]
      })
    );
  };

  const handleSetAllowlistEntry = async () => {
    if (!validateStacksAddress(allowlistAddressInput.trim())) {
      setActionMessage('Enter a valid allowlist address.');
      return;
    }
    const allowance = parseUintInput(allowlistAllowanceInput, true);
    if (allowance === null) {
      setActionMessage('Enter a valid allowance.');
      return;
    }
    await runAction('Update allowlist entry', () =>
      requestCollectionCall({
        functionName: 'set-allowlist',
        functionArgs: [
          principalCV(allowlistAddressInput.trim()),
          uintCV(allowance)
        ]
      })
    );
  };

  const handleClearAllowlistEntry = async () => {
    if (!validateStacksAddress(allowlistAddressInput.trim())) {
      setActionMessage('Enter a valid allowlist address.');
      return;
    }
    await runAction('Clear allowlist entry', () =>
      requestCollectionCall({
        functionName: 'clear-allowlist',
        functionArgs: [principalCV(allowlistAddressInput.trim())]
      })
    );
  };

  const handleSetAllowlistBatch = async () => {
    const parsed = parseAllowlistBatch(allowlistBatchInput);
    if (parsed.errors.length > 0) {
      setActionMessage(parsed.errors.join(' '));
      return;
    }
    if (parsed.entries.length === 0) {
      setActionMessage('Provide at least one allowlist entry.');
      return;
    }
    const entriesCv = listCV(
      parsed.entries.map((entry) =>
        tupleCV({
          owner: principalCV(entry.owner),
          allowance: uintCV(entry.allowance)
        })
      )
    );
    await runAction('Set allowlist batch', () =>
      requestCollectionCall({
        functionName: 'set-allowlist-batch',
        functionArgs: [entriesCv]
      })
    );
  };

  const handleLoadAllowlistStatus = async () => {
    if (!collectionContract) {
      setAllowlistStatusMessage('Enter a collection contract first.');
      return;
    }
    if (!validateStacksAddress(allowlistAddressInput.trim())) {
      setAllowlistStatusMessage('Enter a valid allowlist address.');
      return;
    }
    setAllowlistStatusLoading(true);
    setAllowlistStatusMessage(null);
    try {
      const address = allowlistAddressInput.trim();
      const entryCv = await callCollectionReadOnly('get-allowlist-entry', [
        principalCV(address)
      ]);
      let exists = false;
      let allowance: bigint | null = null;
      if (entryCv.type === ClarityType.OptionalSome) {
        exists = true;
        const entryRaw = cvToValue(entryCv.value) as {
          value?: { allowance?: { value?: string } };
        };
        const allowanceRaw = entryRaw?.value?.allowance?.value ?? null;
        if (allowanceRaw !== null) {
          allowance = BigInt(allowanceRaw);
        }
      }
      const statsCv = await callCollectionReadOnly('get-wallet-stats', [
        principalCV(address)
      ]);
      const statsRaw = cvToValue(statsCv) as {
        value?: {
          minted?: { value?: string };
          reserved?: { value?: string };
        };
      };
      const minted = statsRaw?.value?.minted?.value
        ? BigInt(statsRaw.value.minted.value)
        : 0n;
      const reserved = statsRaw?.value?.reserved?.value
        ? BigInt(statsRaw.value.reserved.value)
        : 0n;
      setAllowlistStatus({ exists, allowance, minted, reserved });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAllowlistStatusMessage(`Failed to load allowlist status: ${message}`);
    } finally {
      setAllowlistStatusLoading(false);
    }
  };

  const handlePauseToggle = async (value: boolean) => {
    await runAction(value ? 'Pause mint' : 'Unpause mint', () =>
      requestCollectionCall({
        functionName: 'set-paused',
        functionArgs: [boolCV(value)]
      })
    );
  };

  const handleTransferOwnership = async () => {
    if (!validateStacksAddress(transferOwnerInput.trim())) {
      setActionMessage('Enter a valid new owner address.');
      return;
    }
    await runAction('Transfer ownership', () =>
      requestCollectionCall({
        functionName: 'transfer-contract-ownership',
        functionArgs: [principalCV(transferOwnerInput.trim())]
      })
    );
  };

  const handleAllowlistCore = async (value: boolean) => {
    if (!collectionContractId) {
      setActionMessage('Enter a valid collection contract first.');
      return;
    }
    await runAction(value ? 'Allowlist in core' : 'Remove from core allowlist', () =>
      requestCoreCall({
        functionName: 'set-allowed-caller',
        functionArgs: [principalCV(collectionContractId), boolCV(value)]
      })
    );
  };

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="collection-mint-admin"
    >
      <div className="panel__header">
        <div>
          <h2>Collection mint admin</h2>
          <p>
            Configure per-collection mint contracts, then allowlist them in the
            core Xtrata contract when ready.
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
          <span className="meta-label">1. Identify collection contract</span>
          <label className="field">
            <span className="field__label">Collection contract address</span>
            <input
              className="input"
              placeholder="ST..."
              value={collectionAddress}
              onChange={(event) => setCollectionAddress(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Collection contract name</span>
            <input
              className="input"
              placeholder="xtrata-collection-mint-v1-0"
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
            />
            <span className="field__hint">
              Deploy the template first using the Deploy module, then enter the
              new contract here.
            </span>
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void loadStatus()}
              disabled={!collectionContract || statusLoading}
            >
              {statusLoading ? 'Loading...' : 'Load settings'}
            </button>
          </div>
          {statusMessage && <span className="meta-value">{statusMessage}</span>}
        </div>

        <div className="mint-panel">
          <span className="meta-label">Current settings</span>
          <div className="meta-grid meta-grid--dense">
            <div>
              <span className="meta-label">Owner</span>
              <span className="meta-value">
                {status?.owner ?? 'Unknown'}
              </span>
            </div>
            <div>
              <span className="meta-label">Paused</span>
              <span className="meta-value">
                {status?.paused === null || status?.paused === undefined
                  ? 'Unknown'
                  : status.paused
                    ? 'Yes'
                    : 'No'}
              </span>
            </div>
            <div>
              <span className="meta-label">Mint price</span>
              <span className="meta-value">
                {formatMicroStxValue(status?.mintPrice ?? null)}
              </span>
            </div>
            <div>
              <span className="meta-label">Max supply</span>
              <span className="meta-value">
                {status?.maxSupply?.toString() ?? 'Unknown'}
              </span>
            </div>
            <div>
              <span className="meta-label">Allowlist enabled</span>
              <span className="meta-value">
                {status?.allowlistEnabled === null ||
                status?.allowlistEnabled === undefined
                  ? 'Unknown'
                  : status.allowlistEnabled
                    ? 'Yes'
                    : 'No'}
              </span>
            </div>
            <div>
              <span className="meta-label">Max per wallet</span>
              <span className="meta-value">
                {status?.maxPerWallet?.toString() ?? 'Unknown'}
              </span>
            </div>
          </div>
          {status?.recipients && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Artist</span>
                <span className="meta-value">{status.recipients.artist}</span>
              </div>
              <div>
                <span className="meta-label">Marketplace</span>
                <span className="meta-value">
                  {status.recipients.marketplace}
                </span>
              </div>
              <div>
                <span className="meta-label">Operator</span>
                <span className="meta-value">{status.recipients.operator}</span>
              </div>
            </div>
          )}
          {status?.splits && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Artist split</span>
                <span className="meta-value">
                  {status.splits.artist.toString()} bps
                </span>
              </div>
              <div>
                <span className="meta-label">Marketplace split</span>
                <span className="meta-value">
                  {status.splits.marketplace.toString()} bps
                </span>
              </div>
              <div>
                <span className="meta-label">Operator split</span>
                <span className="meta-value">
                  {status.splits.operator.toString()} bps
                </span>
              </div>
            </div>
          )}
          {status?.owner && !isCollectionOwner && (
            <span className="meta-value">
              Connect the collection owner wallet to update settings.
            </span>
          )}
        </div>

        <div className="mint-panel">
          <span className="meta-label">2. Configure mint economics</span>
          <label className="field">
            <span className="field__label">Mint price (STX)</span>
            <input
              className="input"
              placeholder="0.000000"
              value={mintPriceInput}
              onChange={(event) => setMintPriceInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetMintPrice()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set mint price'
                ? 'Updating...'
                : 'Set mint price'}
            </button>
          </div>
          <label className="field">
            <span className="field__label">Max supply</span>
            <input
              className="input"
              placeholder="50"
              value={maxSupplyInput}
              onChange={(event) => setMaxSupplyInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetMaxSupply()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set max supply'
                ? 'Updating...'
                : 'Set max supply'}
            </button>
          </div>
          <div className="meta-grid meta-grid--dense">
            <label className="field">
              <span className="field__label">Artist recipient</span>
              <input
                className="input"
                placeholder="ST..."
                value={artistInput}
                onChange={(event) => setArtistInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Marketplace recipient</span>
              <input
                className="input"
                placeholder="ST..."
                value={marketplaceInput}
                onChange={(event) => setMarketplaceInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Operator recipient</span>
              <input
                className="input"
                placeholder="ST..."
                value={operatorInput}
                onChange={(event) => setOperatorInput(event.target.value)}
              />
            </label>
          </div>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetRecipients()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set recipients'
                ? 'Updating...'
                : 'Set recipients'}
            </button>
          </div>
          <div className="meta-grid meta-grid--dense">
            <label className="field">
              <span className="field__label">Artist split (bps)</span>
              <input
                className="input"
                placeholder="8000"
                value={artistBpsInput}
                onChange={(event) => setArtistBpsInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Marketplace split (bps)</span>
              <input
                className="input"
                placeholder="1000"
                value={marketplaceBpsInput}
                onChange={(event) => setMarketplaceBpsInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Operator split (bps)</span>
              <input
                className="input"
                placeholder="1000"
                value={operatorBpsInput}
                onChange={(event) => setOperatorBpsInput(event.target.value)}
              />
            </label>
          </div>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetSplits()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set splits' ? 'Updating...' : 'Set splits'}
            </button>
          </div>
        </div>

        <div className="mint-panel">
          <span className="meta-label">3. Allowlist + per-wallet controls</span>
          <label className="field">
            <span className="field__label">Allowlist enabled</span>
            <select
              className="select"
              value={allowlistEnabledInput || 'false'}
              onChange={(event) => setAllowlistEnabledInput(event.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetAllowlistEnabled()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set allowlist mode'
                ? 'Updating...'
                : 'Set allowlist mode'}
            </button>
          </div>
          <label className="field">
            <span className="field__label">Max per wallet (0 = no cap)</span>
            <input
              className="input"
              placeholder="0"
              value={maxPerWalletInput}
              onChange={(event) => setMaxPerWalletInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetMaxPerWallet()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set max per wallet'
                ? 'Updating...'
                : 'Set max per wallet'}
            </button>
          </div>
          <label className="field">
            <span className="field__label">Allowlist address</span>
            <input
              className="input"
              placeholder="ST..."
              value={allowlistAddressInput}
              onChange={(event) => setAllowlistAddressInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Allowance</span>
            <input
              className="input"
              placeholder="3"
              value={allowlistAllowanceInput}
              onChange={(event) => setAllowlistAllowanceInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetAllowlistEntry()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Update allowlist entry'
                ? 'Updating...'
                : 'Add/update entry'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleClearAllowlistEntry()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Clear allowlist entry'
                ? 'Clearing...'
                : 'Clear entry'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleLoadAllowlistStatus()}
              disabled={allowlistStatusLoading || !collectionContract}
            >
              {allowlistStatusLoading ? 'Checking...' : 'Check entry'}
            </button>
          </div>
          {allowlistStatus && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Allowlisted</span>
                <span className="meta-value">
                  {allowlistStatus.exists ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Allowance</span>
                <span className="meta-value">
                  {allowlistStatus.allowance !== null
                    ? allowlistStatus.allowance.toString()
                    : '—'}
                </span>
              </div>
              <div>
                <span className="meta-label">Minted</span>
                <span className="meta-value">
                  {allowlistStatus.minted?.toString() ?? '0'}
                </span>
              </div>
              <div>
                <span className="meta-label">Reserved</span>
                <span className="meta-value">
                  {allowlistStatus.reserved?.toString() ?? '0'}
                </span>
              </div>
            </div>
          )}
          {status?.allowlistEnabled && allowlistStatus && !allowlistStatus.exists && (
            <span className="meta-value">
              Allowlist is enabled. This address is not permitted to mint.
            </span>
          )}
          {allowlistStatusMessage && (
            <span className="meta-value">{allowlistStatusMessage}</span>
          )}
          <label className="field">
            <span className="field__label">Batch allowlist (one per line)</span>
            <textarea
              className="textarea"
              placeholder="ST... 3\nST... 1"
              value={allowlistBatchInput}
              onChange={(event) => setAllowlistBatchInput(event.target.value)}
            />
            <span className="field__hint">
              Format: address allowance. Max 50 entries per batch.
            </span>
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetAllowlistBatch()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set allowlist batch'
                ? 'Updating...'
                : 'Apply allowlist batch'}
            </button>
          </div>
        </div>

        <div className="mint-panel">
          <span className="meta-label">4. Pause + ownership</span>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handlePauseToggle(true)}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Pause mint' ? 'Pausing...' : 'Pause'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handlePauseToggle(false)}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Unpause mint' ? 'Unpausing...' : 'Unpause'}
            </button>
          </div>
          <label className="field">
            <span className="field__label">Transfer contract ownership</span>
            <input
              className="input"
              placeholder="ST..."
              value={transferOwnerInput}
              onChange={(event) => setTransferOwnerInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleTransferOwnership()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Transfer ownership'
                ? 'Transferring...'
                : 'Transfer ownership'}
            </button>
          </div>
        </div>

        <div className="mint-panel">
          <span className="meta-label">5. Allowlist in Xtrata core</span>
          <p className="meta-value">
            Core allowlisting is required before a collection contract can mint
            while the core contract is paused.
          </p>
          <div className="meta-grid meta-grid--dense">
            <div>
              <span className="meta-label">Core allowlisted</span>
              <span className="meta-value">
                {coreAllowlisted === null
                  ? 'Unknown'
                  : coreAllowlisted
                    ? 'Yes'
                    : 'No'}
              </span>
            </div>
          </div>
          {!coreSupportsAllowlist && (
            <span className="meta-value">
              Core allowlisting is only available on v2 contracts.
            </span>
          )}
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleAllowlistCore(true)}
              disabled={
                !coreSupportsAllowlist ||
                !canTransact ||
                !collectionContractId ||
                pendingAction !== null
              }
            >
              {pendingAction === 'Allowlist in core'
                ? 'Allowlisting...'
                : 'Allowlist contract'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleAllowlistCore(false)}
              disabled={
                !coreSupportsAllowlist ||
                !canTransact ||
                !collectionContractId ||
                pendingAction !== null
              }
            >
              {pendingAction === 'Remove from core allowlist'
                ? 'Removing...'
                : 'Remove allowlist'}
            </button>
          </div>
          {!canTransact && (
            <span className="meta-value">
              Connect a wallet on {props.contract.network} to make changes.
            </span>
          )}
        </div>

        {actionMessage && <div className="alert">{actionMessage}</div>}
        {mismatch && (
          <div className="alert">
            Switch wallet to {mismatch.expected} to manage contracts.
          </div>
        )}
      </div>
    </section>
  );
}
