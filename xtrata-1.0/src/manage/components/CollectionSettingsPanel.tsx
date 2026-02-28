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
import {
  parseContractPrincipal,
  resolveCollectionContractLink
} from '../lib/contract-link';
import InfoTooltip from './InfoTooltip';

const ASCII_PATTERN = /^[\x00-\x7F]*$/;
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const UINT_PATTERN = /^\d+$/;
const STX_PATTERN = /^\d+(?:\.\d{0,6})?$/;
const MICROSTX_PER_STX = 1_000_000n;
const CHUNK_BATCH_SIZE = 50n;
const XTRATA_APP_ICON_DATA_URI =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>';

type CollectionPayload = {
  id?: string | null;
  slug?: string | null;
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
  maxSupply: bigint | null;
  coreContractId: string | null;
  coreFeeUnitMicroStx: bigint | null;
};

type ContractTarget = {
  address: string;
  contractName: string;
};

type TxPayload = {
  txId: string;
};

type BuildActionArgsResult = {
  args: ClarityValue[];
  notices: string[];
  error: string | null;
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

const OWNER_ONLY_FUNCTIONS = new Set<string>([
  'set-max-supply',
  'finalize',
  'set-operator-admin',
  'set-finance-admin',
  'initiate-contract-ownership-transfer',
  'cancel-contract-ownership-transfer',
  'transfer-contract-ownership'
]);

const CONFIG_ADMIN_FUNCTIONS = new Set<string>([
  'set-collection-metadata',
  'set-reservation-expiry-blocks',
  'set-default-token-uri',
  'set-default-dependencies',
  'set-registered-token-uri',
  'clear-registered-token-uri',
  'set-registered-token-uri-batch',
  'set-paused',
  'set-phase',
  'clear-phase',
  'set-active-phase',
  'set-allowlist-enabled',
  'set-max-per-wallet',
  'set-allowlist',
  'clear-allowlist',
  'set-allowlist-batch',
  'set-phase-allowlist',
  'clear-phase-allowlist',
  'set-phase-allowlist-batch',
  'release-reservation',
  'release-expired-reservation'
]);

const FINANCE_ADMIN_FUNCTIONS = new Set<string>([
  'set-mint-price',
  'set-recipients',
  'set-splits'
]);

const getActionSignerHint = (action: MutableAction) => {
  if (OWNER_ONLY_FUNCTIONS.has(action.functionName)) {
    return 'Signer must be the contract owner wallet.';
  }
  if (CONFIG_ADMIN_FUNCTIONS.has(action.functionName)) {
    return 'Signer must be contract owner or operator admin wallet.';
  }
  if (FINANCE_ADMIN_FUNCTIONS.has(action.functionName)) {
    return 'Signer must be contract owner or finance admin wallet.';
  }
  if (action.functionName === 'accept-contract-ownership') {
    return 'Signer must be the pending owner wallet.';
  }
  if (action.functionName === 'cancel-reservation') {
    return 'Signer must be the reservation owner wallet (the mint-begin tx sender).';
  }
  return 'Use a wallet with permission for this contract action.';
};

const getActionFieldTooltip = (action: MutableAction, field: ActionField) => {
  const actionFieldKey = `${action.key}.${field.key}`;
  if (
    actionFieldKey === 'release-reservation.owner' ||
    actionFieldKey === 'release-expired-reservation.owner'
  ) {
    return 'Paste the reservation owner wallet (mint-begin tx sender), not necessarily the contract owner.';
  }
  if (
    actionFieldKey === 'release-reservation.hash' ||
    actionFieldKey === 'release-expired-reservation.hash' ||
    actionFieldKey === 'cancel-reservation.hash'
  ) {
    return 'Paste expected-hash from mint-begin function arg #2 (64 hex chars, optional 0x).';
  }
  if (actionFieldKey === 'set-phase.allowlist-mode') {
    return 'Allowlist mode: 0 = inherit, 1 = public, 2 = global allowlist, 3 = phase allowlist.';
  }
  if (actionFieldKey === 'set-phase.start-block') {
    return 'Block height when phase begins. Use 0 to start immediately.';
  }
  if (actionFieldKey === 'set-phase.end-block') {
    return 'Block height when phase ends. Use 0 for no end block.';
  }
  if (field.hint) {
    return field.hint;
  }
  if (field.type === 'principal') {
    return 'Paste a full STX address (SP... mainnet or ST... testnet).';
  }
  if (field.type === 'hash32') {
    return 'Paste a 64-character hex hash. 0x prefix is optional.';
  }
  if (field.type === 'uint') {
    return 'Whole number only (no decimals).';
  }
  if (field.type === 'stx') {
    return 'STX amount with up to 6 decimals.';
  }
  if (field.type === 'bool') {
    return 'Select true to enable/apply this setting, false to disable.';
  }
  if (field.type === 'ascii') {
    return 'Plain ASCII text only.';
  }
  if (field.type === 'uintList') {
    return 'Enter token IDs separated by comma, space, or new line.';
  }
  if (field.type === 'allowlistBatch') {
    return 'One line per entry: wallet-address allowance.';
  }
  if (field.type === 'registeredUriBatch') {
    return 'One line per entry: inscription-hash token-uri.';
  }
  return 'Provide the value required for this contract field.';
};

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

const parseUintPrimitive = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string' && UINT_PATTERN.test(value)) {
    return BigInt(value);
  }
  return null;
};

const resolveSealProtocolFeeMicroStx = (
  feeUnitMicroStx: bigint,
  totalChunks: bigint
) => {
  if (feeUnitMicroStx <= 0n || totalChunks <= 0n) {
    return null;
  }
  const feeBatches = (totalChunks + CHUNK_BATCH_SIZE - 1n) / CHUNK_BATCH_SIZE;
  return feeUnitMicroStx * (1n + feeBatches);
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

const formatMicroStxInput = (value: bigint | null) => {
  if (value === null) {
    return '';
  }
  const whole = value / MICROSTX_PER_STX;
  const fraction = value % MICROSTX_PER_STX;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionText = fraction
    .toString()
    .padStart(6, '0')
    .replace(/0+$/g, '');
  return `${whole.toString()}.${fractionText}`;
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
  onJourneyRefreshRequested?: () => void;
  mode?: 'guided' | 'advanced';
  onRequestAdvancedControls?: () => void;
};

export default function CollectionSettingsPanel(props: CollectionSettingsPanelProps) {
  const mode = props.mode ?? 'advanced';
  const guidedMode = mode === 'guided';
  const [collectionId, setCollectionId] = useState('');
  const [collectionSlug, setCollectionSlug] = useState('');
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
  const [autoSummaryTarget, setAutoSummaryTarget] = useState<ContractTarget | null>(
    null
  );

  const [selectedActionKey, setSelectedActionKey] = useState(
    MUTABLE_ACTIONS[0]?.key ?? ''
  );
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [absorbSealFees, setAbsorbSealFees] = useState(false);
  const [sealChunkCountInput, setSealChunkCountInput] = useState('1');
  const [quickMintPriceStx, setQuickMintPriceStx] = useState('');
  const [quickMaxSupply, setQuickMaxSupply] = useState('');
  const [quickActionMessage, setQuickActionMessage] = useState<string | null>(null);
  const [quickActionPending, setQuickActionPending] = useState<
    'set-mint-price' | 'set-max-supply' | 'pause' | 'unpause' | null
  >(null);

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
  const preInscribedMint =
    toText(metadataRecord?.mintType).toLowerCase() === 'pre-inscribed';
  const pausedReadOnlyFunction = preInscribedMint ? 'get-paused' : 'is-paused';
  const priceReadOnlyFunction = preInscribedMint ? 'get-price' : 'get-mint-price';
  const priceWriteFunction = preInscribedMint ? 'set-price' : 'set-mint-price';
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
  const selectedActionSignerHint = useMemo(
    () => (selectedAction ? getActionSignerHint(selectedAction) : null),
    [selectedAction]
  );
  const selectedActionTooltipText = useMemo(() => {
    if (!selectedAction) {
      return 'Choose a contract action to configure fields for a wallet transaction.';
    }
    return `${selectedAction.description} ${getActionSignerHint(selectedAction)}`;
  }, [selectedAction]);
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

  useEffect(() => {
    const nextValue =
      collectionMintPriceStx || formatMicroStxInput(summary?.mintPriceMicroStx ?? null);
    if (!quickMintPriceStx && nextValue) {
      setQuickMintPriceStx(nextValue);
    }
  }, [collectionMintPriceStx, summary?.mintPriceMicroStx, quickMintPriceStx]);

  useEffect(() => {
    const nextValue =
      collectionSupplyFromMetadata ||
      (summary?.maxSupply !== null && summary?.maxSupply !== undefined
        ? summary.maxSupply.toString()
        : '');
    if (!quickMaxSupply && nextValue) {
      setQuickMaxSupply(nextValue);
    }
  }, [collectionSupplyFromMetadata, summary?.maxSupply, quickMaxSupply]);

  useEffect(() => {
    if (selectedAction?.functionName !== 'set-mint-price') {
      setAbsorbSealFees(false);
      setSealChunkCountInput('1');
    }
  }, [selectedAction]);

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
  const maxSupplyValue = summary?.maxSupply ?? null;
  const collectionStateValue = state.trim().toLowerCase();
  const collectionPublished = collectionStateValue === 'published';
  const draftSettingsLocked =
    collectionStateValue === 'published' || collectionStateValue === 'archived';

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
      const resolvedCollectionId = toText(payload.id ?? '') || nextCollectionId.trim();
      const resolvedCollectionSlug = toText(payload.slug ?? '');
      setDisplayName(payload.display_name ?? '');
      setArtistAddress(payload.artist_address ?? '');
      setCollectionId(resolvedCollectionId);
      setCollectionSlug(resolvedCollectionSlug);
      setState(payload.state ?? 'draft');
      const resolvedMetadata = toRecord(payload.metadata);
      setMetadata(resolvedMetadata);
      const resolvedContractTarget = resolveCollectionContractLink({
        collectionId: resolvedCollectionId,
        collectionSlug: resolvedCollectionSlug,
        contractAddress: toText(payload.contract_address ?? ''),
        metadata: resolvedMetadata
      });
      const parsedContractAddress = parseContractPrincipal(
        toText(payload.contract_address ?? '')
      );
      const nextContractAddress =
        resolvedContractTarget?.address ??
        parsedContractAddress?.address ??
        toText(payload.contract_address ?? '');
      const nextContractName = resolvedContractTarget?.contractName ?? '';
      setContractAddress(nextContractAddress);
      setContractName(nextContractName);
      setSummary(null);
      setSummaryMessage(null);
      setActionMessage(null);
      setQuickMintPriceStx('');
      setQuickMaxSupply('');
      setQuickActionMessage(null);
      if (
        validateStacksAddress(nextContractAddress) &&
        CONTRACT_NAME_PATTERN.test(nextContractName)
      ) {
        setSummaryMessage('Refreshing on-chain status...');
        setAutoSummaryTarget({
          address: nextContractAddress,
          contractName: nextContractName
        });
      } else {
        setAutoSummaryTarget(null);
      }
      if (resolvedContractTarget?.source === 'derived-slug-id') {
        setMessage(
          'Contract name was auto-resolved from draft slug/id. Click "Save draft settings" to store it in draft metadata.'
        );
      }
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Unable to load collection'));
    }
  }, [props.onJourneyRefreshRequested]);

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
      const parsedContractFromAddress = parseContractPrincipal(contractAddress);
      const resolvedContractAddress =
        parsedContractFromAddress?.address ?? contractAddress.trim().toUpperCase();
      const typedContractName = contractName.trim();
      if (typedContractName && !CONTRACT_NAME_PATTERN.test(typedContractName)) {
        setMessage('Contract name is invalid. Use letters, numbers, hyphen, or underscore.');
        return;
      }

      let nextMetadata = metadataRecord ? { ...metadataRecord } : null;
      const resolvedContractTarget = resolveCollectionContractLink({
        collectionId: collectionId.trim(),
        collectionSlug,
        contractAddress: resolvedContractAddress,
        metadata: nextMetadata,
        deployContractName: typedContractName || parsedContractFromAddress?.contractName
      });

      let metadataChanged = false;
      if (resolvedContractTarget) {
        if (!nextMetadata) {
          nextMetadata = {};
        }
        if (toText(nextMetadata.contractName) !== resolvedContractTarget.contractName) {
          nextMetadata.contractName = resolvedContractTarget.contractName;
          metadataChanged = true;
        }
        if (toText(nextMetadata.contractId) !== resolvedContractTarget.contractId) {
          nextMetadata.contractId = resolvedContractTarget.contractId;
          metadataChanged = true;
        }
      }

      const patchPayload: Record<string, unknown> = {
        displayName,
        artistAddress,
        contractAddress: resolvedContractAddress
      };
      if (nextMetadata && metadataChanged) {
        patchPayload.metadata = nextMetadata;
      }

      const response = await fetch(`/collections/${collectionId.trim()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload)
      });
      const payload = await parseManageJsonResponse<CollectionPayload>(
        response,
        'Collection update'
      );
      const resolvedCollectionSlug = toText(payload.slug ?? '');
      if (resolvedCollectionSlug) {
        setCollectionSlug(resolvedCollectionSlug);
      }
      const resolvedMetadata = toRecord(payload.metadata);
      setMetadata(resolvedMetadata);
      const persistedTarget = resolveCollectionContractLink({
        collectionId: collectionId.trim(),
        collectionSlug: resolvedCollectionSlug || collectionSlug,
        contractAddress: toText(payload.contract_address ?? ''),
        metadata: resolvedMetadata
      });
      const persistedAddress =
        persistedTarget?.address ??
        parseContractPrincipal(toText(payload.contract_address ?? ''))?.address ??
        toText(payload.contract_address ?? '');
      setContractAddress(persistedAddress);
      setContractName(persistedTarget?.contractName ?? '');
      setMessage('Draft settings saved.');
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Update error'));
    }
  };

  const callContractReadOnly = async (
    functionName: string,
    functionArgs: ClarityValue[] = [],
    target?: ContractTarget
  ) => {
    const contractAddressRaw = target?.address ?? contractAddress;
    const contractNameRaw = target?.contractName ?? contractName;
    const resolvedAddress = contractAddressRaw.trim();
    const resolvedName = contractNameRaw.trim();

    if (
      !validateStacksAddress(resolvedAddress) ||
      !CONTRACT_NAME_PATTERN.test(resolvedName)
    ) {
      throw new Error('Enter a valid deployed contract address and name first.');
    }
    const network = toStacksNetwork(walletSession.network ?? 'mainnet');
    const senderAddress = walletSession.address ?? resolvedAddress;
    return callReadOnlyFunction({
      contractAddress: resolvedAddress,
      contractName: resolvedName,
      functionName,
      functionArgs,
      network,
      senderAddress
    }).then(unwrapResponse);
  };

  const loadContractSummary = async (target?: ContractTarget) => {
    const contractAddressRaw = target?.address ?? contractAddress;
    const contractNameRaw = target?.contractName ?? contractName;
    const resolvedAddress = contractAddressRaw.trim();
    const resolvedName = contractNameRaw.trim();
    if (
      !validateStacksAddress(resolvedAddress) ||
      !CONTRACT_NAME_PATTERN.test(resolvedName)
    ) {
      setSummaryMessage('Enter a valid deployed contract address and name first.');
      return;
    }
    setSummaryLoading(true);
    setSummaryMessage(null);
    try {
      const summaryTarget: ContractTarget = {
        address: resolvedAddress,
        contractName: resolvedName
      };
      const [
        ownerCv,
        pendingOwnerCv,
        operatorAdminCv,
        financeAdminCv,
        pausedCv,
        finalizedCv,
        mintPriceCv,
        maxSupplyCv
      ] = await Promise.all([
        callContractReadOnly('get-owner', [], summaryTarget),
        preInscribedMint
          ? Promise.resolve(null)
          : callContractReadOnly('get-pending-owner', [], summaryTarget),
        preInscribedMint
          ? Promise.resolve(null)
          : callContractReadOnly('get-operator-admin', [], summaryTarget),
        preInscribedMint
          ? Promise.resolve(null)
          : callContractReadOnly('get-finance-admin', [], summaryTarget),
        callContractReadOnly(pausedReadOnlyFunction, [], summaryTarget),
        preInscribedMint
          ? Promise.resolve(null)
          : callContractReadOnly('get-finalized', [], summaryTarget),
        callContractReadOnly(priceReadOnlyFunction, [], summaryTarget),
        preInscribedMint
          ? Promise.resolve(null)
          : callContractReadOnly('get-max-supply', [], summaryTarget)
      ]);

      let coreContractId: string | null = null;
      let coreFeeUnitMicroStx: bigint | null = null;

      try {
        const lockedCoreCv = await callContractReadOnly('get-locked-core-contract', [], {
          address: resolvedAddress,
          contractName: resolvedName
        });
        const lockedCoreRaw = toText(toPrimitive(lockedCoreCv));
        coreContractId = lockedCoreRaw || null;
        const parsedCoreTarget = parseContractPrincipal(lockedCoreRaw);
        if (parsedCoreTarget) {
          const feeUnitCv = await callContractReadOnly('get-fee-unit', [], parsedCoreTarget);
          coreFeeUnitMicroStx = parseUintPrimitive(toPrimitive(feeUnitCv));
        }
      } catch {
        coreContractId = null;
        coreFeeUnitMicroStx = null;
      }

      const pendingOwner =
        pendingOwnerCv && pendingOwnerCv.type === ClarityType.OptionalSome
          ? toText(toPrimitive(pendingOwnerCv.value))
          : '';
      const parsedMintPrice = parseUintPrimitive(toPrimitive(mintPriceCv));
      const parsedMaxSupply =
        maxSupplyCv === null ? null : parseUintPrimitive(toPrimitive(maxSupplyCv));
      const operatorAdmin =
        operatorAdminCv === null ? null : toText(toPrimitive(operatorAdminCv)) || null;
      const financeAdmin =
        financeAdminCv === null ? null : toText(toPrimitive(financeAdminCv)) || null;
      const finalized =
        finalizedCv !== null && typeof toPrimitive(finalizedCv) === 'boolean'
          ? (toPrimitive(finalizedCv) as boolean)
          : null;

      const nextSummary: ContractSummary = {
        owner: toText(toPrimitive(ownerCv)) || null,
        pendingOwner: pendingOwner || null,
        operatorAdmin,
        financeAdmin,
        paused:
          typeof toPrimitive(pausedCv) === 'boolean'
            ? (toPrimitive(pausedCv) as boolean)
            : null,
        finalized,
        mintPriceMicroStx: parsedMintPrice,
        maxSupply: parsedMaxSupply,
        coreContractId,
        coreFeeUnitMicroStx
      };

      setSummary(nextSummary);
      setSummaryMessage('On-chain status refreshed.');
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setSummaryMessage(
        toManageApiErrorMessage(error, 'Unable to load on-chain status')
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!autoSummaryTarget) {
      return;
    }
    const target = autoSummaryTarget;
    setAutoSummaryTarget(null);
    void loadContractSummary(target);
  }, [autoSummaryTarget]);

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
          name: 'Xtrata Collection Manager',
          icon: XTRATA_APP_ICON_DATA_URI
        },
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () =>
          reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  const buildActionArgs = (action: MutableAction): BuildActionArgsResult => {
    const args: ClarityValue[] = [];
    const notices: string[] = [];

    for (const field of action.fields) {
      const rawValue = actionInputs[field.key] ?? '';

      if (field.type === 'principal') {
        const value = rawValue.trim();
        if (!validateStacksAddress(value)) {
          return {
            args: [],
            notices: [],
            error: `${field.label} must be a valid STX address.`
          };
        }
        args.push(principalCV(value));
        continue;
      }

      if (field.type === 'uint') {
        const value = parseUintInput(rawValue, field.allowZero === true);
        if (value === null) {
          return {
            args: [],
            notices: [],
            error: `${field.label} must be a valid whole number${
              field.allowZero ? ' (0 allowed)' : ''
            }.`
          };
        }
        args.push(uintCV(value));
        continue;
      }

      if (field.type === 'stx') {
        let value = parseStxToMicro(rawValue, field.allowZero === true);
        if (value === null) {
          return {
            args: [],
            notices: [],
            error: `${field.label} must be a valid STX amount (up to 6 decimals).`
          };
        }
        if (
          action.functionName === 'set-mint-price' &&
          field.key === 'amount' &&
          absorbSealFees
        ) {
          const chunkCount = parseUintInput(sealChunkCountInput, false);
          if (chunkCount === null) {
            return {
              args: [],
              notices: [],
              error: 'Expected chunks must be a whole number greater than 0.'
            };
          }
          const feeUnitMicroStx = summary?.coreFeeUnitMicroStx ?? null;
          if (feeUnitMicroStx === null) {
            return {
              args: [],
              notices: [],
              error:
                'Core fee unit is unavailable. Refresh on-chain status before using fee absorption.'
            };
          }
          const sealProtocolFee = resolveSealProtocolFeeMicroStx(
            feeUnitMicroStx,
            chunkCount
          );
          if (sealProtocolFee === null) {
            return {
              args: [],
              notices: [],
              error: 'Unable to compute seal protocol fee from fee unit/chunk count.'
            };
          }
          if (value < sealProtocolFee) {
            return {
              args: [],
              notices: [],
              error:
                'Advertised seal price is lower than the protocol seal fee. Increase advertised price or lower expected chunks.'
            };
          }
          const advertised = value;
          value = advertised - sealProtocolFee;
          notices.push(
            `Fee absorption enabled: advertised seal ${formatMicroStx(
              advertised
            )} - protocol seal fee ${formatMicroStx(
              sealProtocolFee
            )} = on-chain mint price ${formatMicroStx(value)}. Begin anti-spam fee remains separate.`
          );
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
          return {
            args: [],
            notices: [],
            error: `${field.label} cannot be empty.`
          };
        }
        if (
          typeof field.maxLength === 'number' &&
          value.length > field.maxLength
        ) {
          return {
            args: [],
            notices: [],
            error: `${field.label} must be ${field.maxLength} characters or fewer.`
          };
        }
        if (!ASCII_PATTERN.test(value)) {
          return { args: [], notices: [], error: `${field.label} must be ASCII text.` };
        }
        args.push(stringAsciiCV(value));
        continue;
      }

      if (field.type === 'hash32') {
        const normalized = normalizeHashHex(rawValue);
        if (!normalized) {
          return {
            args: [],
            notices: [],
            error: `${field.label} must be a 64-char hex hash (optional 0x).`
          };
        }
        args.push(hashHexToBufferCv(normalized));
        continue;
      }

      if (field.type === 'uintList') {
        const parsed = parseUintList(rawValue, field.maxItems ?? 50);
        if (parsed.errors.length > 0) {
          return { args: [], notices: [], error: parsed.errors.join(' ') };
        }
        args.push(listCV(parsed.values.map((value) => uintCV(value))));
        continue;
      }

      if (field.type === 'allowlistBatch') {
        const parsed = parseAllowlistBatch(rawValue, field.maxItems ?? 200);
        if (parsed.errors.length > 0) {
          return { args: [], notices: [], error: parsed.errors.join(' ') };
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
          return { args: [], notices: [], error: parsed.errors.join(' ') };
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

    return { args, notices, error: null as string | null };
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
        `${parsed.notices.join(' ')}${parsed.notices.length > 0 ? ' ' : ''}${
          selectedAction.label
        } submitted: ${payload.txId}. Refresh status after confirmation.`
      );
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setActionMessage(toManageApiErrorMessage(error, `${selectedAction.label} failed`));
    } finally {
      setActionPending(false);
    }
  };

  const runQuickAction = async (params: {
    pendingKey: 'set-mint-price' | 'set-max-supply' | 'pause' | 'unpause';
    functionName: string;
    functionArgs: ClarityValue[];
    successLabel: string;
  }) => {
    if (!contractReady) {
      setQuickActionMessage('Set a valid deployed contract address and name first.');
      return;
    }
    setQuickActionPending(params.pendingKey);
    setQuickActionMessage(null);
    try {
      const payload = await requestContractCall({
        functionName: params.functionName,
        functionArgs: params.functionArgs
      });
      setQuickActionMessage(
        `${params.successLabel} submitted: ${payload.txId}. Refresh on-chain status after confirmation.`
      );
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setQuickActionMessage(
        toManageApiErrorMessage(error, `${params.successLabel} failed`)
      );
    } finally {
      setQuickActionPending(null);
    }
  };

  const runQuickSetMintPrice = async () => {
    const parsed = parseStxToMicro(quickMintPriceStx, true);
    if (parsed === null) {
      setQuickActionMessage('Price must be a valid STX amount (up to 6 decimals).');
      return;
    }
    await runQuickAction({
      pendingKey: 'set-mint-price',
      functionName: priceWriteFunction,
      functionArgs: [uintCV(parsed)],
      successLabel: preInscribedMint ? 'Set sale price' : 'Set mint price'
    });
  };

  const runQuickSetMaxSupply = async () => {
    const parsed = parseUintInput(quickMaxSupply, false);
    if (parsed === null) {
      setQuickActionMessage('Max supply must be a whole number greater than 0.');
      return;
    }
    await runQuickAction({
      pendingKey: 'set-max-supply',
      functionName: 'set-max-supply',
      functionArgs: [uintCV(parsed)],
      successLabel: 'Set max supply'
    });
  };

  const runQuickPause = async () => {
    await runQuickAction({
      pendingKey: 'pause',
      functionName: 'set-paused',
      functionArgs: [boolCV(true)],
      successLabel: 'Pause contract'
    });
  };

  const runQuickUnpause = async () => {
    if (!collectionPublished) {
      setQuickActionMessage('Publish the collection in Step 4 before unpausing.');
      return;
    }
    await runQuickAction({
      pendingKey: 'unpause',
      functionName: 'set-paused',
      functionArgs: [boolCV(false)],
      successLabel: 'Unpause contract'
    });
  };

  if (guidedMode) {
    const quickActionsBusy = quickActionPending !== null;
    const priceLabel = preInscribedMint ? 'Sale price' : 'Mint price';
    const pauseStepNumber = preInscribedMint ? 2 : 3;
    const unpauseStepNumber = preInscribedMint ? 3 : 4;
    const pauseStatusLabel =
      pausedValue === null
        ? 'Unknown'
        : pausedValue
          ? 'Paused (safe pre-launch)'
          : 'Unpaused (live)';
    const unpauseBlockedHint = !collectionPublished
      ? 'Publish first in Step 4.'
      : pausedValue !== true
        ? 'Pause status must be "Paused" before unpausing.'
        : null;

    return (
      <div className="collection-settings-panel collection-settings-panel--guided">
        <div className="collection-settings-panel__group">
          <h3>Guided launch quick actions</h3>
          <p className="meta-value">
            Complete these contract actions in order, then refresh checklist status.
          </p>
          <p className="meta-value">
            Active draft: <code>{collectionId || 'Select a drop in "Your drops"'}</code>
          </p>
          <p className="meta-value">
            Contract target:{' '}
            <code>{contractId ?? 'Load a deployed contract from the selected draft'}</code>
          </p>

          <div className="mint-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void loadContractSummary()}
              disabled={!contractReady || summaryLoading}
            >
              {summaryLoading ? 'Refreshing...' : 'Refresh on-chain status'}
            </button>
            {props.onRequestAdvancedControls ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={props.onRequestAdvancedControls}
              >
                Open advanced controls
              </button>
            ) : null}
          </div>

          <div className="collection-settings-panel__summary-grid">
            <div className="collection-settings-panel__summary-item">
              <span className="meta-label">{priceLabel}</span>
              <span className="meta-value">
                {formatMicroStx(summary?.mintPriceMicroStx ?? null)}
              </span>
            </div>
            {!preInscribedMint ? (
              <div className="collection-settings-panel__summary-item">
                <span className="meta-label">Max supply</span>
                <span className="meta-value">
                  {maxSupplyValue === null ? 'Unknown' : maxSupplyValue.toString()}
                </span>
              </div>
            ) : null}
            <div className="collection-settings-panel__summary-item">
              <span className="meta-label">Contract pause status</span>
              <span className="meta-value">{pauseStatusLabel}</span>
            </div>
            <div className="collection-settings-panel__summary-item">
              <span className="meta-label">Backend state</span>
              <span className="meta-value">{collectionStateValue || 'draft'}</span>
            </div>
          </div>

          {summaryMessage ? <p className="meta-value">{summaryMessage}</p> : null}
          {message ? <div className="alert">{message}</div> : null}
          {quickActionMessage ? <div className="alert">{quickActionMessage}</div> : null}
        </div>

        <div className="collection-settings-panel__group">
          <h3>1. Set {priceLabel.toLowerCase()}</h3>
          <p className="meta-value">
            Set the {priceLabel.toLowerCase()} collectors will pay at mint time.
          </p>
          <label className="field field--full">
            <span className="field__label">{priceLabel} (STX)</span>
            <input
              className="input"
              value={quickMintPriceStx}
              placeholder="0.00"
              onChange={(event) => {
                setQuickMintPriceStx(event.target.value.trim());
                setQuickActionMessage(null);
              }}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void runQuickSetMintPrice()}
              disabled={!contractReady || quickActionsBusy}
            >
              {quickActionPending === 'set-mint-price'
                ? 'Submitting...'
                : `Set ${priceLabel.toLowerCase()}`}
            </button>
          </div>
        </div>

        {!preInscribedMint ? (
          <div className="collection-settings-panel__group">
            <h3>2. Set max supply</h3>
            <p className="meta-value">Set the maximum number of tokens this drop can mint.</p>
            <label className="field field--full">
              <span className="field__label">Max supply</span>
              <input
                className="input"
                value={quickMaxSupply}
                placeholder="100"
                onChange={(event) => {
                  setQuickMaxSupply(event.target.value.trim());
                  setQuickActionMessage(null);
                }}
              />
            </label>
            <div className="mint-actions">
              <button
                className="button"
                type="button"
                onClick={() => void runQuickSetMaxSupply()}
                disabled={!contractReady || quickActionsBusy}
              >
                {quickActionPending === 'set-max-supply'
                  ? 'Submitting...'
                  : 'Set max supply'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="collection-settings-panel__group">
          <h3>{pauseStepNumber}. Pause before publish</h3>
          <p className="meta-value">
            Keep minting paused while finishing live-page details and publish.
          </p>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void runQuickPause()}
              disabled={!contractReady || quickActionsBusy || pausedValue === true}
            >
              {quickActionPending === 'pause' ? 'Submitting...' : 'Pause contract'}
            </button>
          </div>
        </div>

        <div className="collection-settings-panel__group">
          <h3>{unpauseStepNumber}. Unpause to go live</h3>
          <p className="meta-value">
            Final launch milestone: unpause only after the collection is published.
          </p>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void runQuickUnpause()}
              disabled={
                !contractReady ||
                quickActionsBusy ||
                !collectionPublished ||
                pausedValue !== true
              }
            >
              {quickActionPending === 'unpause' ? 'Submitting...' : 'Unpause contract'}
            </button>
          </div>
          {unpauseBlockedHint ? (
            <p className="meta-value">{unpauseBlockedHint}</p>
          ) : null}
        </div>
      </div>
    );
  }

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
            onChange={(event) => {
              const input = event.target.value.trim();
              const parsed = parseContractPrincipal(input);
              if (parsed) {
                setContractAddress(parsed.address);
                setContractName((current) => current || parsed.contractName);
              } else {
                setContractAddress(input.toUpperCase());
              }
            }}
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
            onClick={() => void loadContractSummary()}
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
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Max supply</span>
            <span className="meta-value">
              {summary?.maxSupply === null || summary?.maxSupply === undefined
                ? 'Unknown'
                : summary.maxSupply.toString()}
            </span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label">Core fee unit</span>
            <span className="meta-value">
              {formatMicroStx(summary?.coreFeeUnitMicroStx ?? null)}
            </span>
          </div>
        </div>
        {summaryMessage && <p className="meta-value">{summaryMessage}</p>}

        <label className="field field--full">
          <span className="field__label info-label">
            Mutable action
            <InfoTooltip text={selectedActionTooltipText} />
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
          {selectedAction && (
            <span className="field__hint">
              {selectedAction.description} {selectedActionSignerHint}
            </span>
          )}
          <span className="field__hint">
            Connected signer wallet: {walletSession.address ?? 'Not connected'}
          </span>
        </label>

        {selectedAction &&
          selectedAction.fields.map((field) => {
            const value = actionInputs[field.key] ?? '';
            const fieldId = `action-${selectedAction.key}-${field.key}`;
            const fieldTooltip = getActionFieldTooltip(selectedAction, field);
            const isTextArea =
              field.type === 'uintList' ||
              field.type === 'allowlistBatch' ||
              field.type === 'registeredUriBatch';
            return (
              <label className="field field--full" key={field.key}>
                <span className="field__label info-label">
                  {field.label}
                  <InfoTooltip text={fieldTooltip} />
                </span>
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
                <span className="field__hint">{field.hint ?? fieldTooltip}</span>
              </label>
            );
          })}

        {selectedAction?.functionName === 'set-mint-price' && (
          <div className="field field--full">
            <span className="field__label info-label">
              Mint Price Mode
              <InfoTooltip text="Optional helper: keep begin anti-spam fee separate, and absorb seal protocol fee into your advertised seal price." />
            </span>
            <select
              className="select"
              value={absorbSealFees ? 'absorb' : 'raw'}
              onChange={(event) => {
                const nextAbsorb = event.target.value === 'absorb';
                setAbsorbSealFees(nextAbsorb);
                setActionMessage(null);
              }}
            >
              <option value="raw">Raw on-chain mint price (no absorption)</option>
              <option value="absorb">Advertised seal price (absorb seal protocol fee)</option>
            </select>
            <span className="field__hint">
              Begin anti-spam fee is unchanged and always paid separately at mint-begin.
            </span>

            {absorbSealFees && (
              <>
                <label className="field field--full">
                  <span className="field__label info-label">
                    Expected chunks per mint
                    <InfoTooltip text="Used to estimate protocol seal fee: fee-unit x (1 + ceil(chunks/50))." />
                  </span>
                  <input
                    className="input"
                    value={sealChunkCountInput}
                    onChange={(event) => {
                      setSealChunkCountInput(event.target.value.trim());
                      setActionMessage(null);
                    }}
                    placeholder="1"
                  />
                  <span className="field__hint">
                    Core fee unit for this collection: {formatMicroStx(summary?.coreFeeUnitMicroStx ?? null)}.
                  </span>
                </label>
              </>
            )}
          </div>
        )}

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
