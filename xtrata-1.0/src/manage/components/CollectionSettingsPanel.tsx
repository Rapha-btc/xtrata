import { useCallback, useEffect, useMemo, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import {
  boolCV,
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  listCV,
  principalCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
  validateStacksAddress,
  type ClarityValue
} from '@stacks/transactions';
import { toStacksNetwork } from '../../lib/network/stacks';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import { useManageWallet } from '../ManageWalletContext';
import InfoTooltip from './InfoTooltip';

const ASCII_PATTERN = /^[\x00-\x7F]*$/;
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const UINT_PATTERN = /^\d+$/;
const STX_PATTERN = /^\d+(?:\.\d{0,6})?$/;
const MICROSTX_PER_STX = 1_000_000n;

type CollectionPayload = {
  display_name?: string | null;
  artist_address?: string | null;
  contract_address?: string | null;
  state?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ContractSummary = {
  owner: string | null;
  pendingOwner: string | null;
  operatorAdmin: string | null;
  financeAdmin: string | null;
  paused: boolean | null;
  finalized: boolean | null;
  mintPriceMicroStx: bigint | null;
};

type TxPayload = {
  txId: string;
};

type ActionField = {
  key: string;
  label: string;
  type:
    | 'principal'
    | 'uint'
    | 'stx'
    | 'bool'
    | 'ascii'
    | 'hash32'
    | 'uintList'
    | 'allowlistBatch'
    | 'registeredUriBatch';
  allowZero?: boolean;
  allowEmpty?: boolean;
  maxLength?: number;
  maxItems?: number;
  placeholder?: string;
  hint?: string;
};

type MutableAction = {
  key: string;
  label: string;
  group: string;
  functionName: string;
  description: string;
  fields: ActionField[];
};

const MUTABLE_ACTIONS: MutableAction[] = [
  {
    key: 'set-mint-price',
    label: 'Set mint price',
    group: 'Pricing and Payouts',
    functionName: 'set-mint-price',
    description: 'Update the primary mint price.',
    fields: [
      {
        key: 'amount',
        label: 'Mint price (STX)',
        type: 'stx',
        allowZero: true,
        hint: 'Up to 6 decimals.'
      }
    ]
  },
  {
    key: 'set-recipients',
    label: 'Set payout recipients',
    group: 'Pricing and Payouts',
    functionName: 'set-recipients',
    description: 'Set artist, marketplace, and operator payout addresses.',
    fields: [
      { key: 'artist', label: 'Artist address', type: 'principal' },
      { key: 'marketplace', label: 'Marketplace address', type: 'principal' },
      { key: 'operator', label: 'Operator address', type: 'principal' }
    ]
  },
  {
    key: 'set-splits',
    label: 'Set payout splits',
    group: 'Pricing and Payouts',
    functionName: 'set-splits',
    description: 'Set artist, marketplace, and operator basis points.',
    fields: [
      { key: 'artist', label: 'Artist BPS', type: 'uint', allowZero: true },
      {
        key: 'marketplace',
        label: 'Marketplace BPS',
        type: 'uint',
        allowZero: true
      },
      { key: 'operator', label: 'Operator BPS', type: 'uint', allowZero: true }
    ]
  },
  {
    key: 'set-max-supply',
    label: 'Set max supply',
    group: 'Pricing and Payouts',
    functionName: 'set-max-supply',
    description: 'Set max supply (owner-only and typically one-time).',
    fields: [{ key: 'amount', label: 'Max supply', type: 'uint' }]
  },
  {
    key: 'finalize',
    label: 'Finalize contract',
    group: 'Pricing and Payouts',
    functionName: 'finalize',
    description: 'Lock the contract once sold out and reservations are cleared.',
    fields: []
  },
  {
    key: 'set-operator-admin',
    label: 'Set operator admin',
    group: 'Ownership and Roles',
    functionName: 'set-operator-admin',
    description: 'Assign operator admin role.',
    fields: [{ key: 'operator', label: 'Operator admin address', type: 'principal' }]
  },
  {
    key: 'set-finance-admin',
    label: 'Set finance admin',
    group: 'Ownership and Roles',
    functionName: 'set-finance-admin',
    description: 'Assign finance admin role.',
    fields: [{ key: 'finance', label: 'Finance admin address', type: 'principal' }]
  },
  {
    key: 'initiate-contract-ownership-transfer',
    label: 'Initiate ownership transfer',
    group: 'Ownership and Roles',
    functionName: 'initiate-contract-ownership-transfer',
    description: 'Begin two-step ownership transfer to a pending owner.',
    fields: [{ key: 'new-owner', label: 'New owner address', type: 'principal' }]
  },
  {
    key: 'cancel-contract-ownership-transfer',
    label: 'Cancel ownership transfer',
    group: 'Ownership and Roles',
    functionName: 'cancel-contract-ownership-transfer',
    description: 'Cancel pending ownership transfer.',
    fields: []
  },
  {
    key: 'accept-contract-ownership',
    label: 'Accept ownership',
    group: 'Ownership and Roles',
    functionName: 'accept-contract-ownership',
    description: 'Pending owner accepts transfer.',
    fields: []
  },
  {
    key: 'transfer-contract-ownership',
    label: 'Transfer ownership (alias)',
    group: 'Ownership and Roles',
    functionName: 'transfer-contract-ownership',
    description: 'Backward-compatible alias for ownership transfer initiation.',
    fields: [{ key: 'new-owner', label: 'New owner address', type: 'principal' }]
  },
  {
    key: 'set-collection-metadata',
    label: 'Set collection metadata',
    group: 'Collection Configuration',
    functionName: 'set-collection-metadata',
    description: 'Update name, symbol, URI, description, and reveal block.',
    fields: [
      {
        key: 'name',
        label: 'Collection name',
        type: 'ascii',
        maxLength: 64
      },
      {
        key: 'symbol',
        label: 'Collection symbol',
        type: 'ascii',
        maxLength: 16
      },
      {
        key: 'base-uri',
        label: 'Base URI',
        type: 'ascii',
        maxLength: 256,
        allowEmpty: true
      },
      {
        key: 'description',
        label: 'Description',
        type: 'ascii',
        maxLength: 256,
        allowEmpty: true
      },
      {
        key: 'reveal-at',
        label: 'Reveal block',
        type: 'uint',
        allowZero: true
      }
    ]
  },
  {
    key: 'set-reservation-expiry-blocks',
    label: 'Set reservation expiry blocks',
    group: 'Collection Configuration',
    functionName: 'set-reservation-expiry-blocks',
    description: 'Set reservation timeout in block count.',
    fields: [
      {
        key: 'expiry',
        label: 'Expiry blocks',
        type: 'uint',
        allowZero: true
      }
    ]
  },
  {
    key: 'set-default-token-uri',
    label: 'Set default token URI',
    group: 'Collection Configuration',
    functionName: 'set-default-token-uri',
    description: 'Set fallback token URI used for mints.',
    fields: [
      {
        key: 'token-uri',
        label: 'Default token URI',
        type: 'ascii',
        maxLength: 256,
        allowEmpty: true
      }
    ]
  },
  {
    key: 'set-default-dependencies',
    label: 'Set default parent IDs',
    group: 'Collection Configuration',
    functionName: 'set-default-dependencies',
    description: 'Set parent inscription IDs applied by default.',
    fields: [
      {
        key: 'dependencies',
        label: 'Parent IDs',
        type: 'uintList',
        maxItems: 50,
        placeholder: 'Example: 40, 56, 57',
        hint: 'Comma, space, or newline separated token IDs.'
      }
    ]
  },
  {
    key: 'set-registered-token-uri',
    label: 'Set registered token URI',
    group: 'Collection Configuration',
    functionName: 'set-registered-token-uri',
    description: 'Map one inscription hash to a specific URI.',
    fields: [
      {
        key: 'hash',
        label: 'Inscription hash',
        type: 'hash32'
      },
      {
        key: 'token-uri',
        label: 'Token URI',
        type: 'ascii',
        maxLength: 256
      }
    ]
  },
  {
    key: 'clear-registered-token-uri',
    label: 'Clear registered token URI',
    group: 'Collection Configuration',
    functionName: 'clear-registered-token-uri',
    description: 'Remove one inscription hash URI mapping.',
    fields: [{ key: 'hash', label: 'Inscription hash', type: 'hash32' }]
  },
  {
    key: 'set-registered-token-uri-batch',
    label: 'Set registered URI batch',
    group: 'Collection Configuration',
    functionName: 'set-registered-token-uri-batch',
    description: 'Set hash->URI mappings in one call.',
    fields: [
      {
        key: 'entries',
        label: 'Batch entries',
        type: 'registeredUriBatch',
        maxItems: 200,
        placeholder: 'hash uri (one per line)',
        hint: 'Each line: 64-char hash then URI.'
      }
    ]
  },
  {
    key: 'set-paused',
    label: 'Set paused state',
    group: 'Collection Configuration',
    functionName: 'set-paused',
    description: 'Pause or unpause minting.',
    fields: [{ key: 'value', label: 'Paused', type: 'bool', allowZero: true }]
  },
  {
    key: 'set-phase',
    label: 'Set phase',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-phase',
    description: 'Create/update one mint phase.',
    fields: [
      { key: 'phase-id', label: 'Phase ID', type: 'uint' },
      { key: 'enabled', label: 'Enabled', type: 'bool' },
      {
        key: 'start-block',
        label: 'Start block',
        type: 'uint',
        allowZero: true
      },
      {
        key: 'end-block',
        label: 'End block',
        type: 'uint',
        allowZero: true
      },
      {
        key: 'phase-price',
        label: 'Phase mint price (STX)',
        type: 'stx',
        allowZero: true
      },
      {
        key: 'phase-max-per-wallet',
        label: 'Phase max per wallet',
        type: 'uint',
        allowZero: true
      },
      {
        key: 'phase-max-supply',
        label: 'Phase max supply',
        type: 'uint',
        allowZero: true
      },
      {
        key: 'allowlist-mode',
        label: 'Allowlist mode (0/1/2)',
        type: 'uint',
        allowZero: true
      }
    ]
  },
  {
    key: 'clear-phase',
    label: 'Clear phase',
    group: 'Phase and Allowlist Controls',
    functionName: 'clear-phase',
    description: 'Delete a phase definition.',
    fields: [{ key: 'phase-id', label: 'Phase ID', type: 'uint' }]
  },
  {
    key: 'set-active-phase',
    label: 'Set active phase',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-active-phase',
    description: 'Point minting to active phase (0 disables active phase).',
    fields: [
      {
        key: 'phase-id',
        label: 'Active phase ID',
        type: 'uint',
        allowZero: true
      }
    ]
  },
  {
    key: 'set-allowlist-enabled',
    label: 'Set allowlist enabled',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-allowlist-enabled',
    description: 'Enable or disable global allowlist checks.',
    fields: [{ key: 'value', label: 'Allowlist enabled', type: 'bool' }]
  },
  {
    key: 'set-max-per-wallet',
    label: 'Set max per wallet',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-max-per-wallet',
    description: 'Set global max mints per wallet (0 = unlimited).',
    fields: [
      { key: 'amount', label: 'Max per wallet', type: 'uint', allowZero: true }
    ]
  },
  {
    key: 'set-allowlist',
    label: 'Set allowlist entry',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-allowlist',
    description: 'Set one wallet allowlist allowance.',
    fields: [
      { key: 'owner', label: 'Wallet address', type: 'principal' },
      {
        key: 'allowance',
        label: 'Allowance',
        type: 'uint',
        allowZero: true
      }
    ]
  },
  {
    key: 'clear-allowlist',
    label: 'Clear allowlist entry',
    group: 'Phase and Allowlist Controls',
    functionName: 'clear-allowlist',
    description: 'Remove one wallet from allowlist.',
    fields: [{ key: 'owner', label: 'Wallet address', type: 'principal' }]
  },
  {
    key: 'set-allowlist-batch',
    label: 'Set allowlist batch',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-allowlist-batch',
    description: 'Set many allowlist entries in one call.',
    fields: [
      {
        key: 'entries',
        label: 'Batch entries',
        type: 'allowlistBatch',
        maxItems: 200,
        placeholder: 'SP... allowance (one per line)',
        hint: 'Each line: wallet address and allowance.'
      }
    ]
  },
  {
    key: 'set-phase-allowlist',
    label: 'Set phase allowlist entry',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-phase-allowlist',
    description: 'Set one wallet allowance for a specific phase.',
    fields: [
      { key: 'phase-id', label: 'Phase ID', type: 'uint' },
      { key: 'owner', label: 'Wallet address', type: 'principal' },
      {
        key: 'allowance',
        label: 'Allowance',
        type: 'uint',
        allowZero: true
      }
    ]
  },
  {
    key: 'clear-phase-allowlist',
    label: 'Clear phase allowlist entry',
    group: 'Phase and Allowlist Controls',
    functionName: 'clear-phase-allowlist',
    description: 'Remove one wallet from phase allowlist.',
    fields: [
      { key: 'phase-id', label: 'Phase ID', type: 'uint' },
      { key: 'owner', label: 'Wallet address', type: 'principal' }
    ]
  },
  {
    key: 'set-phase-allowlist-batch',
    label: 'Set phase allowlist batch',
    group: 'Phase and Allowlist Controls',
    functionName: 'set-phase-allowlist-batch',
    description: 'Set many allowlist entries for one phase.',
    fields: [
      { key: 'phase-id', label: 'Phase ID', type: 'uint' },
      {
        key: 'entries',
        label: 'Batch entries',
        type: 'allowlistBatch',
        maxItems: 200,
        placeholder: 'SP... allowance (one per line)'
      }
    ]
  },
  {
    key: 'release-reservation',
    label: 'Release reservation',
    group: 'Reservation Operations',
    functionName: 'release-reservation',
    description: 'Admin release by owner + inscription hash.',
    fields: [
      { key: 'owner', label: 'Wallet address', type: 'principal' },
      { key: 'hash', label: 'Inscription hash', type: 'hash32' }
    ]
  },
  {
    key: 'release-expired-reservation',
    label: 'Release expired reservation',
    group: 'Reservation Operations',
    functionName: 'release-expired-reservation',
    description: 'Release reservation only when expiry is reached.',
    fields: [
      { key: 'owner', label: 'Wallet address', type: 'principal' },
      { key: 'hash', label: 'Inscription hash', type: 'hash32' }
    ]
  },
  {
    key: 'cancel-reservation',
    label: 'Cancel reservation (caller-owned)',
    group: 'Reservation Operations',
    functionName: 'cancel-reservation',
    description: 'Cancel reservation by hash for current tx-sender.',
    fields: [{ key: 'hash', label: 'Inscription hash', type: 'hash32' }]
  }
];

const toRecord = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const toPrimitive = (value: ClarityValue): unknown => {
  const parsed = cvToValue(value) as unknown;
  if (
    parsed &&
    typeof parsed === 'object' &&
    'value' in (parsed as Record<string, unknown>)
  ) {
    return (parsed as { value: unknown }).value;
  }
  return parsed;
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
          : 'Unknown contract error';
    throw new Error(String(detail));
  }
  return value;
};

const parseUintInput = (value: string, allowZero = false): bigint | null => {
  const trimmed = value.trim();
  if (!UINT_PATTERN.test(trimmed)) {
    return null;
  }
  try {
    const parsed = BigInt(trimmed);
    if (!allowZero && parsed === 0n) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const parseStxToMicro = (value: string, allowZero = false): bigint | null => {
  const trimmed = value.trim();
  if (!STX_PATTERN.test(trimmed)) {
    return null;
  }
  const [wholePart, fractionalPart = ''] = trimmed.split('.');
  try {
    const whole = BigInt(wholePart);
    const fractional = BigInt((fractionalPart + '000000').slice(0, 6));
    const micro = whole * MICROSTX_PER_STX + fractional;
    if (!allowZero && micro === 0n) {
      return null;
    }
    return micro;
  } catch {
    return null;
  }
};

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

const parseUintList = (raw: string, maxItems: number) => {
  if (!raw.trim()) {
    return { values: [] as bigint[], errors: [] as string[] };
  }
  const values: bigint[] = [];
  const errors: string[] = [];
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  tokens.forEach((token, index) => {
    const parsed = parseUintInput(token, true);
    if (parsed === null) {
      errors.push(`Invalid numeric token ID at item ${index + 1}.`);
      return;
    }
    values.push(parsed);
  });

  if (values.length > maxItems) {
    errors.push(`List supports up to ${maxItems} IDs.`);
  }

  return { values, errors };
};

const parseAllowlistBatch = (raw: string, maxItems: number) => {
  const entries: Array<{ owner: string; allowance: bigint }> = [];
  const errors: string[] = [];
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Line ${index + 1} must include address and allowance.`);
      return;
    }
    const [address, allowanceRaw] = parts;
    if (!address || !validateStacksAddress(address)) {
      errors.push(`Line ${index + 1} has an invalid STX address.`);
      return;
    }
    const allowance = parseUintInput(allowanceRaw, true);
    if (allowance === null) {
      errors.push(`Line ${index + 1} has an invalid allowance.`);
      return;
    }
    entries.push({ owner: address.trim(), allowance });
  });

  if (entries.length > maxItems) {
    errors.push(`Batch supports up to ${maxItems} entries.`);
  }

  return { entries, errors };
};

const parseRegisteredUriBatch = (raw: string, maxItems: number) => {
  const entries: Array<{ hashHex: string; tokenUri: string }> = [];
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
      errors.push(`Line ${index + 1} has an invalid hash.`);
      return;
    }
    const tokenUri = (match[2] ?? '').trim();
    if (!tokenUri) {
      errors.push(`Line ${index + 1} is missing token URI.`);
      return;
    }
    if (tokenUri.length > 256) {
      errors.push(`Line ${index + 1} token URI exceeds 256 chars.`);
      return;
    }
    if (!ASCII_PATTERN.test(tokenUri)) {
      errors.push(`Line ${index + 1} token URI must be ASCII.`);
      return;
    }
    entries.push({ hashHex, tokenUri });
  });

  if (entries.length > maxItems) {
    errors.push(`Batch supports up to ${maxItems} entries.`);
  }

  return { entries, errors };
};

const formatMicroStx = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  const whole = value / MICROSTX_PER_STX;
  const fraction = value % MICROSTX_PER_STX;
  const fractionText = fraction.toString().padStart(6, '0');
  return `${whole.toString()}.${fractionText} STX`;
};

const getActionGroups = (actions: MutableAction[]) => {
  const groups = new Map<string, MutableAction[]>();
  actions.forEach((action) => {
    const current = groups.get(action.group) ?? [];
    current.push(action);
    groups.set(action.group, current);
  });
  return Array.from(groups.entries());
};

const getDefaultInputs = (params: {
  action: MutableAction;
  collectionName: string;
  collectionSymbol: string;
  collectionDescription: string;
  supply: string;
  mintPriceStx: string;
  parentIds: string;
  artistAddress: string;
  contractAddress: string;
  walletAddress: string;
}) => {
  const defaults: Record<string, string> = {};
  params.action.fields.forEach((field) => {
    let nextValue = '';
    if (field.type === 'bool') {
      nextValue = 'false';
    }
    if (field.key === 'artist' && field.type === 'principal') {
      nextValue = params.artistAddress || params.walletAddress;
    }
    if (
      (field.key === 'marketplace' || field.key === 'operator') &&
      field.type === 'principal'
    ) {
      nextValue = params.contractAddress;
    }
    if (params.action.functionName === 'set-collection-metadata') {
      if (field.key === 'name') {
        nextValue = params.collectionName;
      }
      if (field.key === 'symbol') {
        nextValue = params.collectionSymbol;
      }
      if (field.key === 'description') {
        nextValue = params.collectionDescription;
      }
      if (field.key === 'reveal-at') {
        nextValue = '0';
      }
    }
    if (
      params.action.functionName === 'set-mint-price' &&
      field.key === 'amount' &&
      params.mintPriceStx
    ) {
      nextValue = params.mintPriceStx;
    }
    if (
      params.action.functionName === 'set-max-supply' &&
      field.key === 'amount' &&
      params.supply
    ) {
      nextValue = params.supply;
    }
    if (
      params.action.functionName === 'set-default-dependencies' &&
      field.key === 'dependencies'
    ) {
      nextValue = params.parentIds;
    }
    defaults[field.key] = nextValue;
  });
  return defaults;
};

type CollectionSettingsPanelProps = {
  activeCollectionId?: string;
};

export default function CollectionSettingsPanel(props: CollectionSettingsPanelProps) {
  const [collectionId, setCollectionId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [artistAddress, setArtistAddress] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [contractName, setContractName] = useState('');
  const [state, setState] = useState('draft');
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [selectedActionKey, setSelectedActionKey] = useState(
    MUTABLE_ACTIONS[0]?.key ?? ''
  );
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const { walletSession, walletAdapter, connect } = useManageWallet();
  const normalizedActiveCollectionId = useMemo(
    () => props.activeCollectionId?.trim() ?? '',
    [props.activeCollectionId]
  );

  const metadataRecord = useMemo(() => toRecord(metadata), [metadata]);
  const metadataCollection = useMemo(
    () => toRecord(metadataRecord?.collection),
    [metadataRecord]
  );
  const collectionNameFromMetadata = toText(metadataCollection?.name);
  const collectionSymbolFromMetadata = toText(metadataCollection?.symbol);
  const collectionDescriptionFromMetadata = toText(metadataCollection?.description);
  const collectionSupplyFromMetadata = toText(metadataCollection?.supply);
  const collectionMintPriceStx = toText(metadataCollection?.mintPriceStx);
  const collectionParentIds = useMemo(() => {
    const value = metadataCollection?.parentInscriptionIds;
    if (!Array.isArray(value)) {
      return '';
    }
    return value
      .map((entry) => toText(entry))
      .filter(Boolean)
      .join(', ');
  }, [metadataCollection]);

  const selectedAction = useMemo(
    () => MUTABLE_ACTIONS.find((action) => action.key === selectedActionKey) ?? null,
    [selectedActionKey]
  );
  const actionGroups = useMemo(() => getActionGroups(MUTABLE_ACTIONS), []);

  useEffect(() => {
    if (!selectedAction) {
      setActionInputs({});
      return;
    }
    setActionInputs(
      getDefaultInputs({
        action: selectedAction,
        collectionName: collectionNameFromMetadata || displayName,
        collectionSymbol: collectionSymbolFromMetadata,
        collectionDescription: collectionDescriptionFromMetadata,
        supply: collectionSupplyFromMetadata,
        mintPriceStx: collectionMintPriceStx,
        parentIds: collectionParentIds,
        artistAddress,
        contractAddress,
        walletAddress: walletSession.address ?? ''
      })
    );
  }, [
    selectedAction,
    collectionNameFromMetadata,
    displayName,
    collectionSymbolFromMetadata,
    collectionDescriptionFromMetadata,
    collectionSupplyFromMetadata,
    collectionMintPriceStx,
    collectionParentIds,
    artistAddress,
    contractAddress,
    walletSession.address
  ]);

  const contractReady = useMemo(() => {
    const address = contractAddress.trim();
    const name = contractName.trim();
    return validateStacksAddress(address) && CONTRACT_NAME_PATTERN.test(name);
  }, [contractAddress, contractName]);

  const contractId = contractReady
    ? `${contractAddress.trim()}.${contractName.trim()}`
    : null;
  const pausedValue = summary?.paused ?? null;
  const finalizedValue = summary?.finalized ?? null;
  const draftSettingsLocked =
    state.trim().toLowerCase() === 'published' ||
    state.trim().toLowerCase() === 'archived';

  const loadCollectionById = useCallback(async (nextCollectionId: string) => {
    if (!nextCollectionId.trim()) {
      setMessage('Enter a collection ID first.');
      return;
    }
    setMessage(null);
    try {
      const response = await fetch(`/collections/${nextCollectionId.trim()}`);
      const payload = await parseManageJsonResponse<CollectionPayload>(
        response,
        'Collection'
      );
      setDisplayName(payload.display_name ?? '');
      setArtistAddress(payload.artist_address ?? '');
      setContractAddress(payload.contract_address ?? '');
      setState(payload.state ?? 'draft');
      const resolvedMetadata = toRecord(payload.metadata);
      setMetadata(resolvedMetadata);
      const metadataContractName = toText(resolvedMetadata?.contractName);
      setContractName(metadataContractName);
      setSummary(null);
      setSummaryMessage(null);
      setActionMessage(null);
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Unable to load collection'));
    }
  }, []);

  const loadCollection = async () => {
    await loadCollectionById(collectionId.trim());
  };

  useEffect(() => {
    if (
      !normalizedActiveCollectionId ||
      normalizedActiveCollectionId === collectionId.trim()
    ) {
      return;
    }
    setCollectionId(normalizedActiveCollectionId);
    void loadCollectionById(normalizedActiveCollectionId);
  }, [normalizedActiveCollectionId, loadCollectionById]);

  const saveSettings = async () => {
    if (!collectionId.trim()) {
      setMessage('Set a collection ID first.');
      return;
    }
    if (draftSettingsLocked) {
      setMessage(
        `Draft settings are locked while collection state is "${state.trim().toLowerCase()}".`
      );
      return;
    }
    setMessage(null);
    try {
      const response = await fetch(`/collections/${collectionId.trim()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, artistAddress, contractAddress })
      });
      await parseManageJsonResponse(response, 'Collection update');
      setMessage('Draft settings saved.');
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Update error'));
    }
  };

  const callContractReadOnly = async (
    functionName: string,
    functionArgs: ClarityValue[] = []
  ) => {
    if (!contractReady) {
      throw new Error('Enter a valid deployed contract address and name first.');
    }
    const network = toStacksNetwork(walletSession.network ?? 'mainnet');
    const senderAddress = walletSession.address ?? contractAddress.trim();
    return callReadOnlyFunction({
      contractAddress: contractAddress.trim(),
      contractName: contractName.trim(),
      functionName,
      functionArgs,
      network,
      senderAddress
    }).then(unwrapResponse);
  };

  const loadContractSummary = async () => {
    if (!contractReady) {
      setSummaryMessage('Enter a valid deployed contract address and name first.');
      return;
    }
    setSummaryLoading(true);
    setSummaryMessage(null);
    try {
      const [
        ownerCv,
        pendingOwnerCv,
        operatorAdminCv,
        financeAdminCv,
        pausedCv,
        finalizedCv,
        mintPriceCv
      ] = await Promise.all([
        callContractReadOnly('get-owner'),
        callContractReadOnly('get-pending-owner'),
        callContractReadOnly('get-operator-admin'),
        callContractReadOnly('get-finance-admin'),
        callContractReadOnly('is-paused'),
        callContractReadOnly('get-finalized'),
        callContractReadOnly('get-mint-price')
      ]);

      const pendingOwner =
        pendingOwnerCv.type === ClarityType.OptionalSome
          ? toText(toPrimitive(pendingOwnerCv.value))
          : '';
      const parsedMintPrice = (() => {
        const primitive = toPrimitive(mintPriceCv);
        if (typeof primitive === 'bigint') {
          return primitive;
        }
        if (typeof primitive === 'number') {
          return BigInt(Math.floor(primitive));
        }
        if (typeof primitive === 'string' && UINT_PATTERN.test(primitive)) {
          return BigInt(primitive);
        }
        return null;
      })();

      const nextSummary: ContractSummary = {
        owner: toText(toPrimitive(ownerCv)) || null,
        pendingOwner: pendingOwner || null,
        operatorAdmin: toText(toPrimitive(operatorAdminCv)) || null,
        financeAdmin: toText(toPrimitive(financeAdminCv)) || null,
        paused:
          typeof toPrimitive(pausedCv) === 'boolean'
            ? (toPrimitive(pausedCv) as boolean)
            : null,
        finalized:
          typeof toPrimitive(finalizedCv) === 'boolean'
            ? (toPrimitive(finalizedCv) as boolean)
            : null,
        mintPriceMicroStx: parsedMintPrice
      };

      setSummary(nextSummary);
      setSummaryMessage('On-chain status refreshed.');
    } catch (error) {
      setSummaryMessage(
        toManageApiErrorMessage(error, 'Unable to load on-chain status')
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  const requestContractCall = async (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    let session = walletSession;
    if (!session.address || !session.network) {
      await connect();
      session = walletAdapter.getSession();
    }
    if (!session.address || !session.network) {
      throw new Error('Connect a wallet before submitting contract updates.');
    }
    if (!contractReady) {
      throw new Error('Set a valid deployed contract address and name first.');
    }
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: contractAddress.trim(),
        contractName: contractName.trim(),
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network: session.network,
        stxAddress: session.address,
        appDetails: {
          name: 'Xtrata Collection Manager'
        },
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () =>
          reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  const buildActionArgs = (action: MutableAction) => {
    const args: ClarityValue[] = [];

    for (const field of action.fields) {
      const rawValue = actionInputs[field.key] ?? '';

      if (field.type === 'principal') {
        const value = rawValue.trim();
        if (!validateStacksAddress(value)) {
          return { args: [], error: `${field.label} must be a valid STX address.` };
        }
        args.push(principalCV(value));
        continue;
      }

      if (field.type === 'uint') {
        const value = parseUintInput(rawValue, field.allowZero === true);
        if (value === null) {
          return {
            args: [],
            error: `${field.label} must be a valid whole number${
              field.allowZero ? ' (0 allowed)' : ''
            }.`
          };
        }
        args.push(uintCV(value));
        continue;
      }

      if (field.type === 'stx') {
        const value = parseStxToMicro(rawValue, field.allowZero === true);
        if (value === null) {
          return {
            args: [],
            error: `${field.label} must be a valid STX amount (up to 6 decimals).`
          };
        }
        args.push(uintCV(value));
        continue;
      }

      if (field.type === 'bool') {
        args.push(boolCV(rawValue === 'true'));
        continue;
      }

      if (field.type === 'ascii') {
        const value = rawValue.trim();
        const allowEmpty = field.allowEmpty === true;
        if (!allowEmpty && value.length === 0) {
          return { args: [], error: `${field.label} cannot be empty.` };
        }
        if (
          typeof field.maxLength === 'number' &&
          value.length > field.maxLength
        ) {
          return {
            args: [],
            error: `${field.label} must be ${field.maxLength} characters or fewer.`
          };
        }
        if (!ASCII_PATTERN.test(value)) {
          return { args: [], error: `${field.label} must be ASCII text.` };
        }
        args.push(stringAsciiCV(value));
        continue;
      }

      if (field.type === 'hash32') {
        const normalized = normalizeHashHex(rawValue);
        if (!normalized) {
          return {
            args: [],
            error: `${field.label} must be a 64-char hex hash (optional 0x).`
          };
        }
        args.push(hashHexToBufferCv(normalized));
        continue;
      }

      if (field.type === 'uintList') {
        const parsed = parseUintList(rawValue, field.maxItems ?? 50);
        if (parsed.errors.length > 0) {
          return { args: [], error: parsed.errors.join(' ') };
        }
        args.push(listCV(parsed.values.map((value) => uintCV(value))));
        continue;
      }

      if (field.type === 'allowlistBatch') {
        const parsed = parseAllowlistBatch(rawValue, field.maxItems ?? 200);
        if (parsed.errors.length > 0) {
          return { args: [], error: parsed.errors.join(' ') };
        }
        args.push(
          listCV(
            parsed.entries.map((entry) =>
              tupleCV({
                owner: principalCV(entry.owner),
                allowance: uintCV(entry.allowance)
              })
            )
          )
        );
        continue;
      }

      if (field.type === 'registeredUriBatch') {
        const parsed = parseRegisteredUriBatch(rawValue, field.maxItems ?? 200);
        if (parsed.errors.length > 0) {
          return { args: [], error: parsed.errors.join(' ') };
        }
        args.push(
          listCV(
            parsed.entries.map((entry) =>
              tupleCV({
                hash: hashHexToBufferCv(entry.hashHex),
                'token-uri': stringAsciiCV(entry.tokenUri)
              })
            )
          )
        );
      }
    }

    return { args, error: null as string | null };
  };

  const runAction = async () => {
    if (!selectedAction) {
      setActionMessage('Select an action first.');
      return;
    }
    if (!contractReady) {
      setActionMessage('Enter a valid deployed contract address and name first.');
      return;
    }
    const parsed = buildActionArgs(selectedAction);
    if (parsed.error) {
      setActionMessage(parsed.error);
      return;
    }

    setActionPending(true);
    setActionMessage(null);
    try {
      const payload = await requestContractCall({
        functionName: selectedAction.functionName,
        functionArgs: parsed.args
      });
      setActionMessage(
        `${selectedAction.label} submitted: ${payload.txId}. Refresh status after confirmation.`
      );
    } catch (error) {
      setActionMessage(toManageApiErrorMessage(error, `${selectedAction.label} failed`));
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="collection-settings-panel">
      <div className="collection-settings-panel__group">
        <h3>Draft metadata</h3>
        <p className="meta-value">
          Update manager draft fields in D1. This does not send on-chain
          transactions.
        </p>

        <label className="field">
          <span className="field__label info-label">
            Collection ID
            <InfoTooltip text="Use the ID from 'Your drops' to load the exact draft you want to edit." />
          </span>
          <input
            className="input"
            placeholder="Paste collection ID from Your drops"
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
          />
          <button className="button button--ghost" type="button" onClick={loadCollection}>
            Load draft
          </button>
        </label>

        <label className="field">
          <span className="field__label info-label">
            Display name
            <InfoTooltip text="Public-facing name shown in manager listings. This does not redeploy the contract." />
          </span>
          <input
            className="input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={draftSettingsLocked}
          />
        </label>

        <label className="field">
          <span className="field__label info-label">
            Artist address
            <InfoTooltip text="Primary artist wallet tied to this draft. Keep this in sync with payout settings." />
          </span>
          <input
            className="input"
            value={artistAddress}
            onChange={(event) => setArtistAddress(event.target.value.trim().toUpperCase())}
            disabled={draftSettingsLocked}
          />
        </label>

        <label className="field">
          <span className="field__label info-label">
            Contract address
            <InfoTooltip text="Stacks address that deployed/owns the collection contract for this draft." />
          </span>
          <input
            className="input"
            value={contractAddress}
            onChange={(event) => setContractAddress(event.target.value.trim().toUpperCase())}
            disabled={draftSettingsLocked}
          />
        </label>

        <label className="field">
          <span className="field__label info-label">
            Contract name
            <InfoTooltip text="Contract name from deploy metadata, for example xtrata-collection-...." />
          </span>
          <input
            className="input"
            value={contractName}
            onChange={(event) => setContractName(event.target.value.trim())}
            placeholder="xtrata-collection-example"
            disabled={draftSettingsLocked}
          />
        </label>

        <label className="field">
          <span className="field__label info-label">
            Contract state
            <InfoTooltip text="Read-only status from backend: draft means not live, published means live." />
          </span>
          <select className="select" value={state} onChange={(event) => setState(event.target.value)} disabled>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>

        <div className="mint-actions">
          <button
            className="button"
            type="button"
            onClick={saveSettings}
            disabled={draftSettingsLocked}
          >
            Save draft settings
          </button>
        </div>
        {draftSettingsLocked && (
          <p className="meta-value">
            Draft metadata editing is locked for {state.trim().toLowerCase()} collections.
          </p>
        )}
        {message && <div className="alert">{message}</div>}
      </div>

      <div className="collection-settings-panel__group collection-settings-panel__group--onchain">
        <h3>Deployed contract controls</h3>
        <p className="meta-value">
          This section sends wallet transactions directly to the deployed
          collection contract.
        </p>
        <p className="meta-value">
          Contract target:{' '}
          <code>{contractId ?? 'Set valid contract address + contract name'}</code>
        </p>

        <div className="mint-actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={loadContractSummary}
            disabled={!contractReady || summaryLoading}
          >
            {summaryLoading ? 'Refreshing...' : 'Refresh on-chain status'}
          </button>
        </div>

        <div className="collection-settings-panel__summary-grid">
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Owner</span>
            <span className="meta-value">{summary?.owner ?? 'Unknown'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Pending owner</span>
            <span className="meta-value">{summary?.pendingOwner ?? 'None'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Operator admin</span>
            <span className="meta-value">{summary?.operatorAdmin ?? 'Unknown'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Finance admin</span>
            <span className="meta-value">{summary?.financeAdmin ?? 'Unknown'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Paused</span>
            <span className="meta-value">
              {pausedValue === null ? 'Unknown' : pausedValue ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Finalized</span>
            <span className="meta-value">
              {finalizedValue === null ? 'Unknown' : finalizedValue ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Mint price</span>
            <span className="meta-value">{formatMicroStx(summary?.mintPriceMicroStx ?? null)}</span>
          </div>
        </div>
        {summaryMessage && <p className="meta-value">{summaryMessage}</p>}

        <label className="field field--full">
          <span className="field__label info-label">
            Mutable action
            <InfoTooltip text="This list includes every public mutable function in xtrata-collection-mint-v1.1." />
          </span>
          <select
            className="select"
            value={selectedActionKey}
            onChange={(event) => {
              setSelectedActionKey(event.target.value);
              setActionMessage(null);
            }}
          >
            {actionGroups.map(([group, actions]) => (
              <optgroup key={group} label={group}>
                {actions.map((action) => (
                  <option key={action.key} value={action.key}>
                    {action.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedAction && <span className="field__hint">{selectedAction.description}</span>}
        </label>

        {selectedAction &&
          selectedAction.fields.map((field) => {
            const value = actionInputs[field.key] ?? '';
            const fieldId = `action-${selectedAction.key}-${field.key}`;
            const isTextArea =
              field.type === 'uintList' ||
              field.type === 'allowlistBatch' ||
              field.type === 'registeredUriBatch';
            return (
              <label className="field field--full" key={field.key}>
                <span className="field__label">{field.label}</span>
                {field.type === 'bool' ? (
                  <select
                    id={fieldId}
                    className="select"
                    value={value}
                    onChange={(event) =>
                      setActionInputs((current) => ({
                        ...current,
                        [field.key]: event.target.value
                      }))
                    }
                  >
                    <option value="false">false</option>
                    <option value="true">true</option>
                  </select>
                ) : isTextArea ? (
                  <textarea
                    id={fieldId}
                    className="textarea collection-settings-panel__textarea"
                    value={value}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setActionInputs((current) => ({
                        ...current,
                        [field.key]: event.target.value
                      }))
                    }
                  />
                ) : (
                  <input
                    id={fieldId}
                    className="input"
                    value={value}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setActionInputs((current) => ({
                        ...current,
                        [field.key]: event.target.value
                      }))
                    }
                  />
                )}
                {field.hint && <span className="field__hint">{field.hint}</span>}
              </label>
            );
          })}

        <div className="mint-actions">
          <button
            className="button"
            type="button"
            onClick={runAction}
            disabled={!contractReady || actionPending || !selectedAction}
          >
            {actionPending ? 'Submitting...' : 'Submit wallet transaction'}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              if (!selectedAction) {
                return;
              }
              setActionInputs(
                getDefaultInputs({
                  action: selectedAction,
                  collectionName: collectionNameFromMetadata || displayName,
                  collectionSymbol: collectionSymbolFromMetadata,
                  collectionDescription: collectionDescriptionFromMetadata,
                  supply: collectionSupplyFromMetadata,
                  mintPriceStx: collectionMintPriceStx,
                  parentIds: collectionParentIds,
                  artistAddress,
                  contractAddress,
                  walletAddress: walletSession.address ?? ''
                })
              );
              setActionMessage(null);
            }}
            disabled={!selectedAction}
          >
            Reset action fields
          </button>
        </div>
        {actionMessage && <div className="alert">{actionMessage}</div>}
      </div>
    </div>
  );
}
