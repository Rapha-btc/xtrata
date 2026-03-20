import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '../lib/wallet/connect';
import {
  bufferCV,
  boolCV,
  callReadOnlyFunction,
  ClarityType,
  contractPrincipalCV,
  type ClarityValue,
  cvToValue,
  listCV,
  principalCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import { getNetworkMismatch } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import { formatMicroStx, MICROSTX_PER_STX } from '../lib/contract/fees';
import {
  normalizeDependencyIds,
  parseDependencyInput,
  validateDependencyIds
} from '../lib/mint/dependencies';

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
  mintedCount: bigint | null;
  reservedCount: bigint | null;
  reservationExpiryBlocks: bigint | null;
  finalized: boolean | null;
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
  defaultDependencies: bigint[] | null;
};

type AllowlistEntry = {
  owner: string;
  allowance: bigint;
};

type RegisteredTokenUriEntry = {
  hashHex: string;
  tokenUri: string;
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

const parseUintList = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (!Array.isArray(parsed)) {
    return null;
  }
  const values: bigint[] = [];
  for (const entry of parsed) {
    if (typeof entry === 'bigint') {
      values.push(entry);
      continue;
    }
    if (typeof entry === 'number') {
      values.push(BigInt(Math.floor(entry)));
      continue;
    }
    if (typeof entry === 'string') {
      try {
        values.push(BigInt(entry));
      } catch {
        return null;
      }
      continue;
    }
    if (
      entry &&
      typeof entry === 'object' &&
      'value' in (entry as Record<string, unknown>)
    ) {
      const raw = (entry as { value?: string }).value;
      if (!raw) {
        return null;
      }
      try {
        values.push(BigInt(raw));
      } catch {
        return null;
      }
      continue;
    }
    return null;
  }
  return values;
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

const ASCII_PATTERN = /^[\x00-\x7F]*$/;

const isAscii = (value: string) => ASCII_PATTERN.test(value);

const normalizeHashHex = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    return null;
  }
  return normalized;
};

const hashHexToBufferCv = (hashHex: string) => {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(hashHex.slice(index * 2, index * 2 + 2), 16);
  }
  return bufferCV(bytes);
};

const parseRegisteredUriBatch = (raw: string) => {
  const entries: RegisteredTokenUriEntry[] = [];
  const errors: string[] = [];
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const match = line.match(/^([^,\s]+)[,\s]+(.+)$/);
    if (!match) {
      errors.push(`Line ${index + 1} must be "hash uri".`);
      return;
    }
    const hashHex = normalizeHashHex(match[1] ?? '');
    if (!hashHex) {
      errors.push(`Line ${index + 1} has an invalid hash (expect 64 hex chars).`);
      return;
    }
    const tokenUri = (match[2] ?? '').trim();
    if (!tokenUri) {
      errors.push(`Line ${index + 1} is missing a token URI.`);
      return;
    }
    if (tokenUri.length > 256) {
      errors.push(`Line ${index + 1} token URI exceeds 256 chars.`);
      return;
    }
    if (!isAscii(tokenUri)) {
      errors.push(`Line ${index + 1} token URI must be ASCII.`);
      return;
    }
    entries.push({ hashHex, tokenUri });
  });

  if (entries.length > 200) {
    errors.push('Registered token URI batch limit is 200 entries.');
  }

  return { entries, errors };
};

const isMissingFunctionError = (message: string) =>
  /NoSuchPublicFunction|NoSuchContractFunction|does not exist|Unknown function/i.test(
    message
  );

type InfoTipProps = {
  text: string;
  label: string;
};

const InfoTip = ({ text, label }: InfoTipProps) => (
  <span className="info-tip">
    <button type="button" className="info-tip__icon" aria-label={label}>
      i
    </button>
    <span className="info-tip__bubble" role="tooltip">
      {text}
    </span>
  </span>
);

type LabelWithInfoProps = {
  label: string;
  info: string;
  tone: 'field' | 'meta';
};

const LabelWithInfo = ({ label, info, tone }: LabelWithInfoProps) => {
  const className =
    tone === 'field' ? 'field__label info-label' : 'meta-label info-label';
  return (
    <span className={className}>
      <span>{label}</span>
      <InfoTip text={info} label={`About ${label}`} />
    </span>
  );
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
  const [recipientEditorInput, setRecipientEditorInput] = useState('');
  const [recipientEditorMarketplaceInput, setRecipientEditorMarketplaceInput] =
    useState('false');
  const [recipientEditorOperatorInput, setRecipientEditorOperatorInput] =
    useState('false');
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
  const [reservationExpiryInput, setReservationExpiryInput] = useState('');
  const [reservationOwnerInput, setReservationOwnerInput] = useState('');
  const [reservationHashInput, setReservationHashInput] = useState('');
  const [reservationStatus, setReservationStatus] = useState<{
    exists: boolean;
    createdAt: bigint | null;
    phaseId: bigint | null;
  } | null>(null);
  const [reservationStatusMessage, setReservationStatusMessage] =
    useState<string | null>(null);
  const [reservationStatusLoading, setReservationStatusLoading] = useState(false);
  const [uriControlsSupported, setUriControlsSupported] = useState<boolean | null>(
    null
  );
  const [defaultDependenciesSupported, setDefaultDependenciesSupported] =
    useState<boolean | null>(null);
  const [defaultDependenciesInput, setDefaultDependenciesInput] = useState('');
  const [defaultTokenUriInput, setDefaultTokenUriInput] = useState('');
  const [registeredTokenUriHashInput, setRegisteredTokenUriHashInput] =
    useState('');
  const [registeredTokenUriValueInput, setRegisteredTokenUriValueInput] =
    useState('');
  const [registeredTokenUriBatchInput, setRegisteredTokenUriBatchInput] =
    useState('');
  const [registeredTokenUriStatus, setRegisteredTokenUriStatus] = useState<{
    exists: boolean;
    tokenUri: string | null;
  } | null>(null);
  const [registeredTokenUriStatusMessage, setRegisteredTokenUriStatusMessage] =
    useState<string | null>(null);
  const [registeredTokenUriStatusLoading, setRegisteredTokenUriStatusLoading] =
    useState(false);
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
    props.contract.protocolVersion === '2.1.1' ||
    props.contract.contractName.includes('v2-1-0') ||
    props.contract.contractName.includes('v2-1-1');

  const isCollectionOwner =
    !!props.walletSession.address &&
    !!status?.owner &&
    props.walletSession.address === status.owner;
  const isFinalized = status?.finalized === true;
  const canManageCollection =
    canTransact && (!status?.owner || isCollectionOwner) && !isFinalized;
  const canManageRecipientEditors =
    canTransact && !isFinalized && !!collectionContract;

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
    setReservationStatus(null);
    setReservationStatusMessage(null);
    setUriControlsSupported(null);
    setDefaultDependenciesSupported(null);
    setDefaultDependenciesInput('');
    setDefaultTokenUriInput('');
    setRegisteredTokenUriHashInput('');
    setRegisteredTokenUriValueInput('');
    setRegisteredTokenUriBatchInput('');
    setRegisteredTokenUriStatus(null);
    setRegisteredTokenUriStatusMessage(null);
  }, [collectionAddress, collectionName]);

  useEffect(() => {
    setAllowlistStatus(null);
    setAllowlistStatusMessage(null);
  }, [allowlistAddressInput]);

  useEffect(() => {
    setReservationStatus(null);
    setReservationStatusMessage(null);
  }, [reservationOwnerInput, reservationHashInput]);

  useEffect(() => {
    setRegisteredTokenUriStatus(null);
    setRegisteredTokenUriStatusMessage(null);
  }, [registeredTokenUriHashInput]);

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
    const statusDefaultDependencies = status.defaultDependencies;
    if (
      Array.isArray(statusDefaultDependencies) &&
      !defaultDependenciesInput.trim()
    ) {
      setDefaultDependenciesInput(
        statusDefaultDependencies.map((id) => id.toString()).join(', ')
      );
    }
    if (
      status.reservationExpiryBlocks !== null &&
      !reservationExpiryInput.trim()
    ) {
      setReservationExpiryInput(status.reservationExpiryBlocks.toString());
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
    maxPerWalletInput,
    defaultDependenciesInput,
    reservationExpiryInput
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
        mintedCv,
        reservedCv,
        reservationExpiryCv,
        finalizedCv,
        recipientsCv,
        splitsCv,
        allowlistCv,
        maxPerWalletCv
      ] = await Promise.all([
        callCollectionReadOnly('get-owner'),
        callCollectionReadOnly('is-paused'),
        callCollectionReadOnly('get-mint-price'),
        callCollectionReadOnly('get-max-supply'),
        callCollectionReadOnly('get-minted-count'),
        callCollectionReadOnly('get-reserved-count'),
        callCollectionReadOnly('get-reservation-expiry-blocks'),
        callCollectionReadOnly('get-finalized'),
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
        mintedCount: parseUint(mintedCv),
        reservedCount: parseUint(reservedCv),
        reservationExpiryBlocks: parseUint(reservationExpiryCv),
        finalized: Boolean(toPrimitive(finalizedCv)),
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
        maxPerWallet: parseUint(maxPerWalletCv),
        defaultDependencies: null
      };

      try {
        const defaultDependenciesCv = await callCollectionReadOnly(
          'get-default-dependencies'
        );
        nextStatus.defaultDependencies = parseUintList(defaultDependenciesCv) ?? [];
        setDefaultDependenciesSupported(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isMissingFunctionError(message)) {
          nextStatus.defaultDependencies = [];
          setDefaultDependenciesSupported(false);
        } else {
          throw error;
        }
      }

      setStatus(nextStatus);

      try {
        const defaultTokenUriCv = await callCollectionReadOnly(
          'get-default-token-uri'
        );
        const defaultTokenUri = toPrimitive(defaultTokenUriCv);
        if (typeof defaultTokenUri === 'string') {
          setUriControlsSupported(true);
          if (!defaultTokenUriInput.trim()) {
            setDefaultTokenUriInput(defaultTokenUri);
          }
        } else {
          setUriControlsSupported(false);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isMissingFunctionError(message)) {
          setUriControlsSupported(false);
        }
      }

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

  const handleSetRecipientEditorAccess = async () => {
    const editor = recipientEditorInput.trim();
    if (!validateStacksAddress(editor)) {
      setActionMessage('Enter a valid recipient editor wallet address.');
      return;
    }
    await runAction('Set recipient editor access', () =>
      requestCollectionCall({
        functionName: 'set-recipient-editor-access',
        functionArgs: [
          contractPrincipalCV(props.contract.address, props.contract.contractName),
          principalCV(editor),
          boolCV(recipientEditorMarketplaceInput === 'true'),
          boolCV(recipientEditorOperatorInput === 'true')
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

  const getReservationTargetInputs = () => {
    const owner = reservationOwnerInput.trim();
    if (!validateStacksAddress(owner)) {
      setReservationStatusMessage('Enter a valid reservation owner address.');
      return null;
    }
    const hashHex = normalizeHashHex(reservationHashInput);
    if (!hashHex) {
      setReservationStatusMessage(
        'Enter a valid reservation hash (64 hex chars, optional 0x prefix).'
      );
      return null;
    }
    return { owner, hashHex };
  };

  const handleSetReservationExpiry = async () => {
    const parsed = parseUintInput(reservationExpiryInput, true);
    if (parsed === null) {
      setActionMessage('Enter a valid reservation expiry in blocks (0+).');
      return;
    }
    await runAction('Set reservation expiry', () =>
      requestCollectionCall({
        functionName: 'set-reservation-expiry-blocks',
        functionArgs: [uintCV(parsed)]
      })
    );
  };

  const handleLoadReservationStatus = async () => {
    if (!collectionContract) {
      setReservationStatusMessage('Enter a collection contract first.');
      return;
    }
    const target = getReservationTargetInputs();
    if (!target) {
      return;
    }
    setReservationStatusLoading(true);
    setReservationStatusMessage(null);
    try {
      const reservationCv = await callCollectionReadOnly('get-reservation', [
        principalCV(target.owner),
        hashHexToBufferCv(target.hashHex)
      ]);
      if (reservationCv.type === ClarityType.OptionalSome) {
        const raw = cvToValue(reservationCv.value) as {
          value?: {
            'created-at'?: { value?: string };
            'phase-id'?: { value?: string };
          };
          'created-at'?: { value?: string };
          'phase-id'?: { value?: string };
        };
        const createdAtRaw =
          raw?.value?.['created-at']?.value ?? raw?.['created-at']?.value ?? null;
        const phaseIdRaw =
          raw?.value?.['phase-id']?.value ?? raw?.['phase-id']?.value ?? null;
        setReservationStatus({
          exists: true,
          createdAt: createdAtRaw ? BigInt(createdAtRaw) : null,
          phaseId: phaseIdRaw ? BigInt(phaseIdRaw) : null
        });
      } else {
        setReservationStatus({ exists: false, createdAt: null, phaseId: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReservationStatusMessage(`Failed to load reservation: ${message}`);
    } finally {
      setReservationStatusLoading(false);
    }
  };

  const handleReleaseExpiredReservation = async () => {
    const target = getReservationTargetInputs();
    if (!target) {
      return;
    }
    await runAction('Release expired reservation', () =>
      requestCollectionCall({
        functionName: 'release-expired-reservation',
        functionArgs: [
          principalCV(target.owner),
          hashHexToBufferCv(target.hashHex)
        ]
      })
    );
  };

  const handleReleaseReservation = async () => {
    const target = getReservationTargetInputs();
    if (!target) {
      return;
    }
    await runAction('Release reservation', () =>
      requestCollectionCall({
        functionName: 'release-reservation',
        functionArgs: [
          principalCV(target.owner),
          hashHexToBufferCv(target.hashHex)
        ]
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

  const getRegisteredHashInput = () => {
    const normalized = normalizeHashHex(registeredTokenUriHashInput);
    if (!normalized) {
      setActionMessage('Enter a valid hash (64 hex chars, optional 0x prefix).');
      return null;
    }
    return normalized;
  };

  const handleSetDefaultTokenUri = async () => {
    const tokenUri = defaultTokenUriInput.trim();
    if (tokenUri.length > 256) {
      setActionMessage('Default token URI must be 256 chars or fewer.');
      return;
    }
    if (!isAscii(tokenUri)) {
      setActionMessage('Default token URI must be ASCII.');
      return;
    }
    await runAction('Set default token URI', () =>
      requestCollectionCall({
        functionName: 'set-default-token-uri',
        functionArgs: [stringAsciiCV(tokenUri)]
      })
    );
  };

  const handleSetDefaultDependencies = async () => {
    const parsed = parseDependencyInput(defaultDependenciesInput);
    if (parsed.invalidTokens.length > 0) {
      setActionMessage(
        `Invalid dependency inscription IDs: ${parsed.invalidTokens.join(', ')}`
      );
      return;
    }
    const normalized = normalizeDependencyIds(parsed.ids);
    const validation = validateDependencyIds(normalized);
    if (!validation.ok) {
      if (validation.reason === 'max-50') {
        setActionMessage('You can set up to 50 dependency inscription IDs.');
        return;
      }
      setActionMessage('Dependency inscription IDs are invalid.');
      return;
    }
    await runAction('Set default dependencies', () =>
      requestCollectionCall({
        functionName: 'set-default-dependencies',
        functionArgs: [listCV(normalized.map((id) => uintCV(id)))]
      })
    );
  };

  const handleSetRegisteredTokenUri = async () => {
    const hashHex = getRegisteredHashInput();
    if (!hashHex) {
      return;
    }
    const tokenUri = registeredTokenUriValueInput.trim();
    if (!tokenUri) {
      setActionMessage('Enter a token URI for this hash.');
      return;
    }
    if (tokenUri.length > 256) {
      setActionMessage('Token URI must be 256 chars or fewer.');
      return;
    }
    if (!isAscii(tokenUri)) {
      setActionMessage('Token URI must be ASCII.');
      return;
    }
    await runAction('Set registered token URI', () =>
      requestCollectionCall({
        functionName: 'set-registered-token-uri',
        functionArgs: [hashHexToBufferCv(hashHex), stringAsciiCV(tokenUri)]
      })
    );
  };

  const handleClearRegisteredTokenUri = async () => {
    const hashHex = getRegisteredHashInput();
    if (!hashHex) {
      return;
    }
    await runAction('Clear registered token URI', () =>
      requestCollectionCall({
        functionName: 'clear-registered-token-uri',
        functionArgs: [hashHexToBufferCv(hashHex)]
      })
    );
  };

  const handleLoadRegisteredTokenUriStatus = async () => {
    if (!collectionContract) {
      setRegisteredTokenUriStatusMessage('Enter a collection contract first.');
      return;
    }
    const hashHex = normalizeHashHex(registeredTokenUriHashInput);
    if (!hashHex) {
      setRegisteredTokenUriStatusMessage(
        'Enter a valid hash (64 hex chars, optional 0x prefix).'
      );
      return;
    }
    setRegisteredTokenUriStatusLoading(true);
    setRegisteredTokenUriStatusMessage(null);
    try {
      const entryCv = await callCollectionReadOnly('get-registered-token-uri', [
        hashHexToBufferCv(hashHex)
      ]);
      if (entryCv.type === ClarityType.OptionalSome) {
        const entryRaw = cvToValue(entryCv.value) as {
          value?: { 'token-uri'?: { value?: string } };
          'token-uri'?: { value?: string };
        };
        const tokenUri =
          entryRaw?.value?.['token-uri']?.value ??
          entryRaw?.['token-uri']?.value ??
          null;
        setRegisteredTokenUriStatus({
          exists: true,
          tokenUri: tokenUri ?? null
        });
        if (tokenUri && !registeredTokenUriValueInput.trim()) {
          setRegisteredTokenUriValueInput(tokenUri);
        }
      } else {
        setRegisteredTokenUriStatus({ exists: false, tokenUri: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isMissingFunctionError(message)) {
        setUriControlsSupported(false);
      }
      setRegisteredTokenUriStatusMessage(
        `Failed to load registered URI: ${message}`
      );
    } finally {
      setRegisteredTokenUriStatusLoading(false);
    }
  };

  const handleSetRegisteredTokenUriBatch = async () => {
    const parsed = parseRegisteredUriBatch(registeredTokenUriBatchInput);
    if (parsed.errors.length > 0) {
      setActionMessage(parsed.errors.join(' '));
      return;
    }
    if (parsed.entries.length === 0) {
      setActionMessage('Provide at least one hash + token URI entry.');
      return;
    }
    const entriesCv = listCV(
      parsed.entries.map((entry) =>
        tupleCV({
          hash: hashHexToBufferCv(entry.hashHex),
          'token-uri': stringAsciiCV(entry.tokenUri)
        })
      )
    );
    await runAction('Set registered token URI batch', () =>
      requestCollectionCall({
        functionName: 'set-registered-token-uri-batch',
        functionArgs: [entriesCv]
      })
    );
  };

  const handlePauseToggle = async (value: boolean) => {
    await runAction(value ? 'Pause mint' : 'Unpause mint', () =>
      requestCollectionCall({
        functionName: 'set-paused',
        functionArgs: [boolCV(value)]
      })
    );
  };

  const handleFinalize = async () => {
    await runAction('Finalize contract', () =>
      requestCollectionCall({
        functionName: 'finalize',
        functionArgs: []
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

  const statusDefaultDependencies = status?.defaultDependencies;
  const defaultDependencyCount = Array.isArray(statusDefaultDependencies)
    ? statusDefaultDependencies.length
    : null;

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="collection-mint-admin"
    >
      <div className="panel__header">
        <div>
          <div className="info-heading">
            <h2>Collection mint admin</h2>
            <InfoTip
              label="About collection mint admin"
              text="Admin controls for deployed collection mint contracts, including pricing, allowlist policy, URI mapping, ownership, and core allowlisting."
            />
          </div>
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
          <LabelWithInfo
            tone="meta"
            label="1. Identify collection contract"
            info="Set the deployed collection mint contract address and contract name you want to manage in this panel."
          />
          <label className="field">
            <LabelWithInfo
              tone="field"
              label="Collection contract address"
              info="The Stacks address that owns the deployed collection mint contract."
            />
            <input
              className="input"
              placeholder="ST..."
              value={collectionAddress}
              onChange={(event) => setCollectionAddress(event.target.value)}
            />
          </label>
          <label className="field">
            <LabelWithInfo
              tone="field"
              label="Collection contract name"
              info="The exact deployed contract name, for example xtrata-collection-mint-v1-4."
            />
            <input
              className="input"
              placeholder="xtrata-collection-mint-v1-4"
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
          <LabelWithInfo
            tone="meta"
            label="Current settings"
            info="Live on-chain values read from the selected collection contract."
          />
          <div className="meta-grid meta-grid--dense">
            <div>
              <LabelWithInfo
                tone="meta"
                label="Owner"
                info="Wallet that can update admin settings when the contract is not finalized."
              />
              <span className="meta-value">
                {status?.owner ?? 'Unknown'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Paused"
                info="When paused, mint calls are blocked until unpaused by the owner."
              />
              <span className="meta-value">
                {status?.paused === null || status?.paused === undefined
                  ? 'Unknown'
                  : status.paused
                    ? 'Yes'
                    : 'No'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Mint price"
                info="Current mint cost per token in STX."
              />
              <span className="meta-value">
                {formatMicroStxValue(status?.mintPrice ?? null)}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Max supply"
                info="Maximum number of tokens this collection contract can mint."
              />
              <span className="meta-value">
                {status?.maxSupply?.toString() ?? 'Unknown'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Minted"
                info="Count of tokens already minted through this collection contract."
              />
              <span className="meta-value">
                {status?.mintedCount?.toString() ?? 'Unknown'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Reserved"
                info="Active mint reservations that are not yet sealed."
              />
              <span className="meta-value">
                {status?.reservedCount?.toString() ?? 'Unknown'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Reservation expiry (blocks)"
                info="How long reservations can stay open before admin can release them as expired."
              />
              <span className="meta-value">
                {status?.reservationExpiryBlocks?.toString() ?? 'Unknown'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Allowlist enabled"
                info="If enabled, only addresses with an allowance entry can reserve and mint."
              />
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
              <LabelWithInfo
                tone="meta"
                label="Finalized"
                info="Finalized contracts are permanently locked and cannot mint or change settings."
              />
              <span className="meta-value">
                {status?.finalized === null || status?.finalized === undefined
                  ? 'Unknown'
                  : status.finalized
                    ? 'Yes'
                    : 'No'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Max per wallet"
                info="Per-address mint cap. A value of 0 means no wallet cap."
              />
              <span className="meta-value">
                {status?.maxPerWallet?.toString() ?? 'Unknown'}
              </span>
            </div>
            <div>
              <LabelWithInfo
                tone="meta"
                label="Default dependency IDs"
                info="Dependency inscription IDs automatically attached to every mint when set."
              />
              <span className="meta-value">
                {defaultDependencyCount === null
                  ? 'Unknown'
                  : defaultDependencyCount === 0
                    ? 'None'
                    : `${defaultDependencyCount} set`}
              </span>
            </div>
            {uriControlsSupported && (
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Default token URI"
                  info="URI returned when no registered hash override exists and no mint-supplied URI is used."
                />
                <span className="meta-value">
                  {defaultTokenUriInput || '(blank)'}
                </span>
              </div>
            )}
          </div>
          {status?.recipients && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Artist"
                  info="Recipient address for the artist payout split."
                />
                <span className="meta-value address-value--full">
                  {status.recipients.artist}
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Marketplace"
                  info="Recipient address for marketplace payout split."
                />
                <span className="meta-value address-value--full">
                  {status.recipients.marketplace}
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Operator"
                  info="Recipient address for operator payout split."
                />
                <span className="meta-value address-value--full">
                  {status.recipients.operator}
                </span>
              </div>
            </div>
          )}
          {status?.splits && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Artist split"
                  info="Artist payout basis points out of 10,000."
                />
                <span className="meta-value">
                  {status.splits.artist.toString()} bps
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Marketplace split"
                  info="Marketplace payout basis points out of 10,000."
                />
                <span className="meta-value">
                  {status.splits.marketplace.toString()} bps
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Operator split"
                  info="Operator payout basis points out of 10,000."
                />
                <span className="meta-value">
                  {status.splits.operator.toString()} bps
                </span>
              </div>
            </div>
          )}
          {status?.finalized && (
            <span className="meta-value">
              Contract finalized. All settings and minting are locked.
            </span>
          )}
          {status?.owner && !isCollectionOwner && (
            <span className="meta-value">
              Connect the collection owner wallet to update owner-gated settings.
            </span>
          )}
        </div>

        <div className="mint-panel">
          <LabelWithInfo
            tone="meta"
            label="2. Configure mint economics"
            info="Set mint price, supply caps, payout recipients, and payout splits."
          />
          <label className="field">
            <LabelWithInfo
              tone="field"
              label="Mint price (STX)"
              info="Price paid by each minter for one token."
            />
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
            <LabelWithInfo
              tone="field"
              label="Max supply"
              info="Hard cap on total mints from this collection contract."
            />
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
            <label className="field field--address">
              <LabelWithInfo
                tone="field"
                label="Artist recipient"
                info="Stacks address that receives the artist share of each mint."
              />
              <input
                className="input input--address-fit"
                placeholder="ST..."
                value={artistInput}
                onChange={(event) => setArtistInput(event.target.value)}
              />
            </label>
            <label className="field field--address">
              <LabelWithInfo
                tone="field"
                label="Marketplace recipient"
                info="Stacks address that receives the marketplace share of each mint."
              />
              <input
                className="input input--address-fit"
                placeholder="ST..."
                value={marketplaceInput}
                onChange={(event) => setMarketplaceInput(event.target.value)}
              />
            </label>
            <label className="field field--address">
              <LabelWithInfo
                tone="field"
                label="Operator recipient"
                info="Stacks address that receives the operator share of each mint."
              />
              <input
                className="input input--address-fit"
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
            <label className="field field--address">
              <LabelWithInfo
                tone="field"
                label="Recipient editor wallet"
                info="Wallet that may be granted access to update marketplace and/or operator recipients."
              />
              <input
                className="input input--address-fit"
                placeholder="ST..."
                value={recipientEditorInput}
                onChange={(event) => setRecipientEditorInput(event.target.value)}
              />
            </label>
            <label className="field">
              <LabelWithInfo
                tone="field"
                label="Can edit marketplace recipient"
                info="Enable to allow this wallet to call set-marketplace-recipient in v1.3."
              />
              <select
                className="input"
                value={recipientEditorMarketplaceInput}
                onChange={(event) =>
                  setRecipientEditorMarketplaceInput(event.target.value)
                }
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>
            <label className="field">
              <LabelWithInfo
                tone="field"
                label="Can edit operator recipient"
                info="Enable to allow this wallet to call set-operator-recipient in v1.3."
              />
              <select
                className="input"
                value={recipientEditorOperatorInput}
                onChange={(event) =>
                  setRecipientEditorOperatorInput(event.target.value)
                }
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>
          </div>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetRecipientEditorAccess()}
              disabled={!canManageRecipientEditors || pendingAction !== null}
            >
              {pendingAction === 'Set recipient editor access'
                ? 'Updating...'
                : 'Set recipient editor access'}
            </button>
            <span className="field__hint">
              Requires the connected wallet to be admin of the linked core Xtrata
              contract.
            </span>
          </div>
          <div className="meta-grid meta-grid--dense">
            <label className="field">
              <LabelWithInfo
                tone="field"
                label="Artist split (bps)"
                info="Artist share in basis points. Combined splits must equal 10,000."
              />
              <input
                className="input"
                placeholder="8000"
                value={artistBpsInput}
                onChange={(event) => setArtistBpsInput(event.target.value)}
              />
            </label>
            <label className="field">
              <LabelWithInfo
                tone="field"
                label="Marketplace split (bps)"
                info="Marketplace share in basis points. Combined splits must equal 10,000."
              />
              <input
                className="input"
                placeholder="1000"
                value={marketplaceBpsInput}
                onChange={(event) => setMarketplaceBpsInput(event.target.value)}
              />
            </label>
            <label className="field">
              <LabelWithInfo
                tone="field"
                label="Operator split (bps)"
                info="Operator share in basis points. Combined splits must equal 10,000."
              />
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
          <LabelWithInfo
            tone="meta"
            label="3. Default dependencies"
            info="Apply one shared dependency list to every mint from this collection contract."
          />
          {defaultDependenciesSupported === false && (
            <span className="meta-value">
              This collection contract does not expose default dependency controls.
            </span>
          )}
          {defaultDependenciesSupported !== false && (
            <>
              <p className="meta-value">
                When default dependencies are set, upload can still be batched, but
                final sealing must run one transaction per item so each mint can
                include the dependency links.
              </p>
              <label className="field">
                <LabelWithInfo
                  tone="field"
                  label="Dependency inscription IDs"
                  info="Comma, space, or newline separated inscription IDs to attach to every mint."
                />
                <textarea
                  className="textarea"
                  placeholder="12, 144, 2048"
                  value={defaultDependenciesInput}
                  onChange={(event) => setDefaultDependenciesInput(event.target.value)}
                />
                <span className="field__hint">
                  Leave blank to disable default dependencies. Max 50 IDs.
                </span>
              </label>
              <div className="mint-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSetDefaultDependencies()}
                  disabled={!canManageCollection || pendingAction !== null}
                >
                  {pendingAction === 'Set default dependencies'
                    ? 'Updating...'
                    : 'Set default dependencies'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mint-panel">
          <LabelWithInfo
            tone="meta"
            label="4. Token URI controls (v1.1+)"
            info="Configure default and hash-registered token URIs for deterministic token metadata routing."
          />
          {uriControlsSupported === false && (
            <span className="meta-value">
              This collection contract does not expose v1.1 URI controls.
            </span>
          )}
          {uriControlsSupported !== false && (
            <>
              <p className="meta-value">
                URI precedence: registered hash URI, then default URI, then
                mint-supplied URI fallback.
              </p>
              <label className="field">
                <LabelWithInfo
                  tone="field"
                  label="Default token URI (blank allows mint-supplied fallback)"
                  info="Project-wide default metadata URI. Leave blank to use URI supplied during mint."
                />
                <input
                  className="input"
                  placeholder="data:text/plain,project-default"
                  value={defaultTokenUriInput}
                  onChange={(event) => setDefaultTokenUriInput(event.target.value)}
                />
              </label>
              <div className="mint-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSetDefaultTokenUri()}
                  disabled={!canManageCollection || pendingAction !== null}
                >
                  {pendingAction === 'Set default token URI'
                    ? 'Updating...'
                    : 'Set default URI'}
                </button>
              </div>
              <div className="meta-grid meta-grid--dense">
                <label className="field">
                  <LabelWithInfo
                    tone="field"
                    label="Content hash (32-byte hex)"
                    info="SHA-256 content hash key used to register a specific token URI override."
                  />
                  <input
                    className="input"
                    placeholder="0x..."
                    value={registeredTokenUriHashInput}
                    onChange={(event) =>
                      setRegisteredTokenUriHashInput(event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <LabelWithInfo
                    tone="field"
                    label="Registered token URI"
                    info="Token URI mapped to the content hash above."
                  />
                  <input
                    className="input"
                    placeholder="ar://..."
                    value={registeredTokenUriValueInput}
                    onChange={(event) =>
                      setRegisteredTokenUriValueInput(event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="mint-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSetRegisteredTokenUri()}
                  disabled={!canManageCollection || pendingAction !== null}
                >
                  {pendingAction === 'Set registered token URI'
                    ? 'Updating...'
                    : 'Add/update registered URI'}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void handleClearRegisteredTokenUri()}
                  disabled={!canManageCollection || pendingAction !== null}
                >
                  {pendingAction === 'Clear registered token URI'
                    ? 'Clearing...'
                    : 'Clear registered URI'}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void handleLoadRegisteredTokenUriStatus()}
                  disabled={registeredTokenUriStatusLoading || !collectionContract}
                >
                  {registeredTokenUriStatusLoading ? 'Checking...' : 'Check hash'}
                </button>
              </div>
              {registeredTokenUriStatus && (
                <div className="meta-grid meta-grid--dense">
                  <div>
                    <LabelWithInfo
                      tone="meta"
                      label="Registered"
                      info="Whether the selected hash currently has a stored URI override."
                    />
                    <span className="meta-value">
                      {registeredTokenUriStatus.exists ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <LabelWithInfo
                      tone="meta"
                      label="Resolved URI"
                      info="URI value currently resolved for the selected content hash."
                    />
                    <span className="meta-value">
                      {registeredTokenUriStatus.tokenUri ?? '—'}
                    </span>
                  </div>
                </div>
              )}
              {registeredTokenUriStatusMessage && (
                <span className="meta-value">{registeredTokenUriStatusMessage}</span>
              )}
              <label className="field">
                <LabelWithInfo
                  tone="field"
                  label="Batch register URIs (one per line)"
                  info="Bulk hash-to-URI registration. Use one line per entry in the format hash URI."
                />
                <textarea
                  className="textarea"
                  placeholder="0xHASH ar://tx-id"
                  value={registeredTokenUriBatchInput}
                  onChange={(event) =>
                    setRegisteredTokenUriBatchInput(event.target.value)
                  }
                />
                <span className="field__hint">
                  Format: hash URI. Max 200 entries per batch.
                </span>
              </label>
              <div className="mint-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSetRegisteredTokenUriBatch()}
                  disabled={!canManageCollection || pendingAction !== null}
                >
                  {pendingAction === 'Set registered token URI batch'
                    ? 'Updating...'
                    : 'Apply URI batch'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mint-panel">
          <LabelWithInfo
            tone="meta"
            label="5. Allowlist + per-wallet controls"
            info="Configure who can mint and how many mints each wallet can reserve."
          />
          <label className="field">
            <LabelWithInfo
              tone="field"
              label="Allowlist enabled"
              info="Toggle gated minting. Enabled means only listed addresses can mint."
            />
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
            <LabelWithInfo
              tone="field"
              label="Max per wallet (0 = no cap)"
              info="Maximum tokens each wallet can mint from this collection. Use 0 for no wallet cap."
            />
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
            <LabelWithInfo
              tone="field"
              label="Allowlist address"
              info="Stacks address to inspect, add, update, or remove in the allowlist."
            />
            <input
              className="input"
              placeholder="ST..."
              value={allowlistAddressInput}
              onChange={(event) => setAllowlistAddressInput(event.target.value)}
            />
          </label>
          <label className="field">
            <LabelWithInfo
              tone="field"
              label="Allowance"
              info="Maximum mints allowed for the selected address when allowlist mode is enabled."
            />
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
                <LabelWithInfo
                  tone="meta"
                  label="Allowlisted"
                  info="Shows whether the selected address currently has an allowlist entry."
                />
                <span className="meta-value">
                  {allowlistStatus.exists ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Allowance"
                  info="Configured mint allowance for the selected address."
                />
                <span className="meta-value">
                  {allowlistStatus.allowance !== null
                    ? allowlistStatus.allowance.toString()
                    : '—'}
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Minted"
                  info="Number of mints already completed by the selected allowlist address."
                />
                <span className="meta-value">
                  {allowlistStatus.minted?.toString() ?? '0'}
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Reserved"
                  info="Number of active mint reservations currently held by this address."
                />
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
            <LabelWithInfo
              tone="field"
              label="Batch allowlist (one per line)"
              info="Bulk allowlist update in the format address allowance, one entry per line."
            />
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
          <LabelWithInfo
            tone="meta"
            label="6. Reservation safety + recovery"
            info="Configure reservation timeout and release stale reservations to keep supply moving."
          />
          <label className="field">
            <LabelWithInfo
              tone="field"
              label="Reservation expiry (blocks)"
              info="Number of blocks before reservations can be released as expired. Around 120 blocks is roughly 20 minutes on fast blocks."
            />
            <input
              className="input"
              placeholder="120"
              value={reservationExpiryInput}
              onChange={(event) => setReservationExpiryInput(event.target.value)}
            />
            <span className="field__hint">
              Set this to your desired timeout policy for incomplete mints.
            </span>
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetReservationExpiry()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Set reservation expiry'
                ? 'Updating...'
                : 'Set reservation expiry'}
            </button>
          </div>
          <div className="meta-grid meta-grid--dense">
            <label className="field">
              <LabelWithInfo
                tone="field"
                label="Reservation owner"
                info="Wallet that started the reservation."
              />
              <input
                className="input"
                placeholder="ST..."
                value={reservationOwnerInput}
                onChange={(event) => setReservationOwnerInput(event.target.value)}
              />
            </label>
            <label className="field">
              <LabelWithInfo
                tone="field"
                label="Reservation hash"
                info="Expected-hash of the in-progress mint session."
              />
              <input
                className="input"
                placeholder="0x..."
                value={reservationHashInput}
                onChange={(event) => setReservationHashInput(event.target.value)}
              />
            </label>
          </div>
          <div className="mint-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleLoadReservationStatus()}
              disabled={reservationStatusLoading || !collectionContract}
            >
              {reservationStatusLoading ? 'Checking...' : 'Check reservation'}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void handleReleaseExpiredReservation()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Release expired reservation'
                ? 'Releasing...'
                : 'Release expired'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleReleaseReservation()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Release reservation'
                ? 'Releasing...'
                : 'Force release'}
            </button>
          </div>
          {reservationStatus && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Reservation exists"
                  info="Whether this reservation is still active on-chain."
                />
                <span className="meta-value">
                  {reservationStatus.exists ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Created block"
                  info="Block height where this reservation was created."
                />
                <span className="meta-value">
                  {reservationStatus.createdAt?.toString() ?? '—'}
                </span>
              </div>
              <div>
                <LabelWithInfo
                  tone="meta"
                  label="Phase"
                  info="Active phase id recorded for this reservation."
                />
                <span className="meta-value">
                  {reservationStatus.phaseId?.toString() ?? '—'}
                </span>
              </div>
            </div>
          )}
          {reservationStatusMessage && (
            <span className="meta-value">{reservationStatusMessage}</span>
          )}
        </div>

        <div className="mint-panel">
          <LabelWithInfo
            tone="meta"
            label="6. Pause + ownership"
            info="Emergency controls for pausing minting, finalizing the contract, and transferring ownership."
          />
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
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleFinalize()}
              disabled={!canManageCollection || pendingAction !== null}
            >
              {pendingAction === 'Finalize contract'
                ? 'Finalizing...'
                : 'Finalize contract'}
            </button>
          </div>
          <p className="meta-value">
            Finalize when minted = max supply and reserved = 0 to permanently lock
            settings and minting.
          </p>
          <label className="field">
            <LabelWithInfo
              tone="field"
              label="Transfer contract ownership"
              info="Set a new owner address. The current owner must submit this transaction."
            />
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
          <LabelWithInfo
            tone="meta"
            label="7. Allowlist in Xtrata core"
            info="Register this collection contract in the core contract allowlist so it can mint while core is paused."
          />
          <p className="meta-value">
            Core allowlisting is required before a collection contract can mint
            while the core contract is paused.
          </p>
          <div className="meta-grid meta-grid--dense">
            <div>
              <LabelWithInfo
                tone="meta"
                label="Core allowlisted"
                info="Whether this collection contract is currently enabled in Xtrata core allowlist."
              />
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
