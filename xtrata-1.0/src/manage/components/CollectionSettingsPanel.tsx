import { useCallback, useEffect, useMemo, useState } from 'react';
import { showContractCall } from '../../lib/wallet/connect';
import {
  boolCV,
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  contractPrincipalCV,
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
import { parseDeployPricingLockSnapshot } from '../../lib/deploy/pricing-lock';
import { resolveCollectionMintPaymentModel } from '../../lib/collection-mint/payment-model';
import {
  resolveLockedCollectionMintFeeFloor,
  resolveManagedCollectionMintPrice,
  resolveOnChainMintPriceFromDisplayedMintPrice
} from '../../lib/collection-mint/launch-pricing';
import { resolveCollectionMintPricingMetadata } from '../../lib/collection-mint/pricing-metadata';
import InfoTooltip from './InfoTooltip';

const ASCII_PATTERN = /^[\x00-\x7F]*$/;
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const UINT_PATTERN = /^\d+$/;
const STX_PATTERN = /^\d+(?:\.\d{0,6})?$/;
const MICROSTX_PER_STX = 1_000_000n;
const CHUNK_BATCH_SIZE = 50n;
const TX_CONFIRMATION_TIMEOUT_MS = 180_000;
const TX_CONFIRMATION_POLL_MS = 3_500;
const XTRATA_FIXED_RECIPIENT_ADDRESS =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
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
    label: 'Set payout base price',
    group: 'Pricing and Payouts',
    functionName: 'set-mint-price',
    description:
      'Update the on-chain payout base used for artist/marketplace split calculations.',
    fields: [
      {
        key: 'amount',
        label: 'Payout base price (on-chain STX)',
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
    description:
      'Set artist payout address. Marketplace/operator recipients are fixed to Xtrata defaults in manage mode.',
    fields: [
      {
        key: 'artist',
        label: 'Artist address',
        type: 'principal',
        hint: 'Marketplace and operator recipients are fixed by Xtrata in this flow.'
      }
    ]
  },
  {
    key: 'set-artist-recipient',
    label: 'Set artist recipient (v1.3+)',
    group: 'Pricing and Payouts',
    functionName: 'set-artist-recipient',
    description: 'Set artist payout address without modifying marketplace/operator recipients.',
    fields: [{ key: 'artist', label: 'Artist address', type: 'principal' }]
  },
  {
    key: 'set-marketplace-recipient',
    label: 'Set marketplace recipient (v1.3+)',
    group: 'Pricing and Payouts',
    functionName: 'set-marketplace-recipient',
    description:
      'Set marketplace payout address (requires on-chain recipient-editor access granted by main Xtrata admin).',
    fields: [{ key: 'marketplace', label: 'Marketplace address', type: 'principal' }]
  },
  {
    key: 'set-operator-recipient',
    label: 'Set operator recipient (v1.3+)',
    group: 'Pricing and Payouts',
    functionName: 'set-operator-recipient',
    description:
      'Set operator payout address (requires on-chain recipient-editor access granted by main Xtrata admin).',
    fields: [{ key: 'operator', label: 'Operator address', type: 'principal' }]
  },
  {
    key: 'set-recipient-editor-access',
    label: 'Set recipient editor access (v1.3+)',
    group: 'Ownership and Roles',
    functionName: 'set-recipient-editor-access',
    description:
      'Grant/revoke marketplace/operator recipient edit permissions for one wallet. Signer must be core Xtrata admin.',
    fields: [
      { key: 'editor', label: 'Editor wallet', type: 'principal' },
      {
        key: 'can-marketplace',
        label: 'Can edit marketplace recipient',
        type: 'bool'
      },
      { key: 'can-operator', label: 'Can edit operator recipient', type: 'bool' }
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
    label: 'Set default dependency IDs',
    group: 'Collection Configuration',
    functionName: 'set-default-dependencies',
    description: 'Set dependency inscription IDs applied by default.',
    fields: [
      {
        key: 'dependencies',
        label: 'Dependency IDs',
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
        label: 'Phase on-chain price (STX)',
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
  'set-artist-recipient',
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
  'set-splits'
]);

const RECIPIENT_EDITOR_FUNCTIONS = new Set<string>([
  'set-marketplace-recipient',
  'set-operator-recipient'
]);

const CORE_ADMIN_FUNCTIONS = new Set<string>(['set-recipient-editor-access']);
const XTRATA_OWNER_ONLY_ACTION_KEYS = new Set<string>([
  'set-marketplace-recipient',
  'set-operator-recipient',
  'set-recipient-editor-access'
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
  if (RECIPIENT_EDITOR_FUNCTIONS.has(action.functionName)) {
    return 'Signer wallet must have recipient-editor permission for this field.';
  }
  if (CORE_ADMIN_FUNCTIONS.has(action.functionName)) {
    return 'Signer must be the admin of the linked core Xtrata contract.';
  }
  if (action.functionName === 'set-recipients') {
    return 'Artist updates require collection owner signer; marketplace/operator updates require recipient-editor permissions.';
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

const formatDraftStx = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Not set';
  }
  return `${trimmed} STX`;
};

const normalizeTxId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), ms);
  });

const resolveLockedRecipientAddress = (coreContractId: string | null) => {
  const parsed = parseContractPrincipal(coreContractId ?? '');
  const candidate = parsed?.address ?? XTRATA_FIXED_RECIPIENT_ADDRESS;
  return candidate.trim().toUpperCase();
};

const resolveFixedRecipientArgs = (coreContractId: string | null): BuildActionArgsResult => {
  const lockedRecipientAddress = resolveLockedRecipientAddress(coreContractId);
  if (!validateStacksAddress(lockedRecipientAddress)) {
    return {
      args: [],
      notices: [],
      error:
        'Xtrata fixed recipient address is invalid in this build. Contact support before submitting payout recipient updates.'
    };
  }
  const fixedRecipientCv = principalCV(lockedRecipientAddress);
  return {
    args: [fixedRecipientCv, fixedRecipientCv],
    notices: [
      `Marketplace and operator recipients are fixed to ${lockedRecipientAddress} in manage mode.`
    ],
    error: null
  };
};

const resolveCoreContractArgs = (coreContractId: string | null): BuildActionArgsResult => {
  const parsed = parseContractPrincipal(coreContractId ?? '');
  if (!parsed) {
    return {
      args: [],
      notices: [],
      error:
        'Unable to resolve the locked core contract ID. Refresh on-chain status before setting recipient editor access.'
    };
  }
  return {
    args: [contractPrincipalCV(parsed.address, parsed.contractName)],
    notices: [],
    error: null
  };
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

const DEFAULT_ADVANCED_ACTION_KEY = 'set-paused';

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
  isXtrataOwner?: boolean;
};

export default function CollectionSettingsPanel(props: CollectionSettingsPanelProps) {
  const mode = props.mode ?? 'advanced';
  const guidedMode = mode === 'guided';
  const canManageLockedRecipients = props.isXtrataOwner === true;
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
    DEFAULT_ADVANCED_ACTION_KEY
  );
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [absorbSealFees, setAbsorbSealFees] = useState(false);
  const [sealChunkCountInput, setSealChunkCountInput] = useState('1');
  const [quickMintPriceStx, setQuickMintPriceStx] = useState('');
  const [quickMaxSupply, setQuickMaxSupply] = useState('');
  const [guidedFreeMintEnabled, setGuidedFreeMintEnabled] = useState(false);
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
  const collectionPricingMetadata = useMemo(
    () => resolveCollectionMintPricingMetadata(metadataRecord?.pricing),
    [metadataRecord]
  );
  const deployPricingLock = useMemo(
    () => parseDeployPricingLockSnapshot(metadataRecord),
    [metadataRecord]
  );
  const preInscribedMint =
    toText(metadataRecord?.mintType).toLowerCase() === 'pre-inscribed';
  const templateVersion = toText(metadataRecord?.templateVersion);
  const collectionMintPaymentModel = useMemo(
    () => resolveCollectionMintPaymentModel(templateVersion),
    [templateVersion]
  );
  const pausedReadOnlyFunction = preInscribedMint ? 'get-paused' : 'is-paused';
  const priceReadOnlyFunction = preInscribedMint ? 'get-price' : 'get-mint-price';
  const priceWriteFunction = preInscribedMint ? 'set-price' : 'set-mint-price';
  const collectionNameFromMetadata = toText(metadataCollection?.name);
  const collectionSymbolFromMetadata = toText(metadataCollection?.symbol);
  const collectionDescriptionFromMetadata = toText(metadataCollection?.description);
  const collectionSupplyFromMetadata = toText(metadataCollection?.supply);
  const collectionMintPriceStx = toText(metadataCollection?.mintPriceStx);
  const livePagePriceLabel = preInscribedMint
    ? 'Sale price (live page)'
    : 'Mint price (live page)';
  const onChainPriceLabel = preInscribedMint
    ? 'On-chain sale price'
    : 'On-chain payout base price';
  const onChainPriceSummaryHint = preInscribedMint
    ? 'This value is read directly from the contract.'
    : 'This value is split to artist/marketplace recipients. Collector-facing mint price can be higher when seal fee absorption is enabled.';
  const setPriceActionLabel = preInscribedMint
    ? 'Set sale price'
    : 'Set payout base price';
  const lockedMintFeeFloor = useMemo(
    () =>
      !preInscribedMint &&
      deployPricingLock &&
      summary?.coreFeeUnitMicroStx !== null &&
      summary?.coreFeeUnitMicroStx !== undefined
        ? resolveLockedCollectionMintFeeFloor({
            maxChunks: deployPricingLock.maxChunks,
            feeUnitMicroStx: summary.coreFeeUnitMicroStx
          })
        : null,
    [preInscribedMint, deployPricingLock, summary?.coreFeeUnitMicroStx]
  );
  const collectorMintPriceMicroStx = useMemo(() => {
    if (preInscribedMint) {
      return summary?.mintPriceMicroStx ?? parseStxToMicro(collectionMintPriceStx, true);
    }
    return resolveManagedCollectionMintPrice({
      paymentModel: collectionMintPaymentModel,
      contractMintPriceMicroStx: summary?.mintPriceMicroStx ?? null,
      pricing: collectionPricingMetadata,
      pricingLockMaxChunks: deployPricingLock?.maxChunks ?? null,
      feeUnitMicroStx: summary?.coreFeeUnitMicroStx ?? null
    });
  }, [
    preInscribedMint,
    summary?.mintPriceMicroStx,
    collectionMintPriceStx,
    collectionMintPaymentModel,
    collectionPricingMetadata,
    deployPricingLock?.maxChunks,
    summary?.coreFeeUnitMicroStx
  ]);
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
  const availableActions = useMemo(
    () =>
      canManageLockedRecipients
        ? MUTABLE_ACTIONS
        : MUTABLE_ACTIONS.filter(
            (action) => !XTRATA_OWNER_ONLY_ACTION_KEYS.has(action.key)
          ),
    [canManageLockedRecipients]
  );

  const selectedAction = useMemo(
    () => availableActions.find((action) => action.key === selectedActionKey) ?? null,
    [availableActions, selectedActionKey]
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
  const actionGroups = useMemo(() => getActionGroups(availableActions), [availableActions]);

  useEffect(() => {
    if (availableActions.some((action) => action.key === selectedActionKey)) {
      return;
    }
    setSelectedActionKey(
      availableActions.find((action) => action.key === DEFAULT_ADVANCED_ACTION_KEY)?.key ??
        availableActions[0]?.key ??
        ''
    );
  }, [availableActions, selectedActionKey]);

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
    const nextValue = preInscribedMint
      ? collectionMintPriceStx || formatMicroStxInput(summary?.mintPriceMicroStx ?? null)
      : formatMicroStxInput(collectorMintPriceMicroStx);
    if (!quickMintPriceStx && nextValue) {
      setQuickMintPriceStx(nextValue);
    }
  }, [
    preInscribedMint,
    collectionMintPriceStx,
    summary?.mintPriceMicroStx,
    collectorMintPriceMicroStx,
    quickMintPriceStx
  ]);

  useEffect(() => {
    const pricePendingSetup =
      !preInscribedMint &&
      state.trim().toLowerCase() !== 'published' &&
      collectionPricingMetadata.mode === 'raw-on-chain';
    if (
      preInscribedMint ||
      pricePendingSetup ||
      !lockedMintFeeFloor ||
      !collectorMintPriceMicroStx
    ) {
      if (guidedFreeMintEnabled) {
        setGuidedFreeMintEnabled(false);
      }
      return;
    }
    if (!quickMintPriceStx) {
      setGuidedFreeMintEnabled(
        collectorMintPriceMicroStx === lockedMintFeeFloor.totalProtocolFeeMicroStx
      );
    }
  }, [
    preInscribedMint,
    state,
    collectionPricingMetadata.mode,
    lockedMintFeeFloor,
    collectorMintPriceMicroStx,
    quickMintPriceStx,
    guidedFreeMintEnabled
  ]);

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
  const standardMintPricePendingSetup =
    !preInscribedMint &&
    !collectionPublished &&
    collectionPricingMetadata.mode === 'raw-on-chain';
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
      setGuidedFreeMintEnabled(false);
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

  useEffect(() => {
    if (guidedMode || !normalizedActiveCollectionId) {
      return;
    }
    setSelectedActionKey(DEFAULT_ADVANCED_ACTION_KEY);
  }, [guidedMode, normalizedActiveCollectionId]);

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

  const syncStandardMintPricingMetadata = useCallback(
    async (params: {
      displayedMintPriceMicroStx: bigint;
      onChainMintPriceMicroStx: bigint;
      feeFloor: NonNullable<typeof lockedMintFeeFloor>;
    }) => {
      if (!collectionId.trim()) {
        throw new Error('Set a collection ID first.');
      }
      const nextMetadata: Record<string, unknown> = {
        ...(metadataRecord ?? {})
      };
      nextMetadata.collection = {
        ...(metadataCollection ?? {}),
        mintPriceStx: formatMicroStxInput(params.displayedMintPriceMicroStx),
        mintPriceMicroStx: params.displayedMintPriceMicroStx.toString()
      };
      nextMetadata.pricing = {
        ...toRecord(metadataRecord?.pricing),
        mode: 'price-includes-total-fees',
        mintPriceMicroStx: params.displayedMintPriceMicroStx.toString(),
        onChainMintPriceMicroStx: params.onChainMintPriceMicroStx.toString(),
        absorbedSealFeeMicroStx: params.feeFloor.sealFeeMicroStx.toString(),
        absorbedBeginFeeMicroStx: params.feeFloor.beginFeeMicroStx.toString(),
        absorbedProtocolFeeMicroStx: params.feeFloor.totalProtocolFeeMicroStx.toString(),
        absorptionModel: 'total-fees',
        worstCaseSealFeeMicroStx: params.feeFloor.sealFeeMicroStx.toString(),
        pricingLockMaxChunks: params.feeFloor.maxChunks
      };

      const response = await fetch(`/collections/${collectionId.trim()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: nextMetadata })
      });
      const payload = await parseManageJsonResponse<CollectionPayload>(
        response,
        'Collection pricing update'
      );
      setMetadata(toRecord(payload.metadata));
      props.onJourneyRefreshRequested?.();
    },
    [collectionId, metadataCollection, metadataRecord, props]
  );

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
      return null;
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
      return nextSummary;
    } catch (error) {
      setSummaryMessage(
        toManageApiErrorMessage(error, 'Unable to load on-chain status')
      );
      return null;
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
                'Mint price is lower than the protocol seal fee. Increase price or lower expected chunks.'
            };
          }
          const mintPrice = value;
          value = mintPrice - sealProtocolFee;
          notices.push(
            `Fee absorption enabled: mint price ${formatMicroStx(
              mintPrice
            )} - protocol seal fee ${formatMicroStx(
              sealProtocolFee
            )} = on-chain payout base price ${formatMicroStx(
              value
            )}. Begin anti-spam fee remains separate.`
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

    if (action.functionName === 'set-recipients') {
      const fixedRecipients = resolveFixedRecipientArgs(summary?.coreContractId ?? null);
      if (fixedRecipients.error) {
        return fixedRecipients;
      }
      args.push(...fixedRecipients.args);
      notices.push(...fixedRecipients.notices);
    }

    if (action.functionName === 'set-recipient-editor-access') {
      const coreArgs = resolveCoreContractArgs(summary?.coreContractId ?? null);
      if (coreArgs.error) {
        return coreArgs;
      }
      args.unshift(...coreArgs.args);
      notices.push(...coreArgs.notices);
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
    awaitOnChainConfirmation?: boolean;
    expectedPausedState?: boolean;
  }): Promise<
    | {
        status: 'submitted' | 'pending' | 'confirmed' | 'failed';
        txId: string;
        refreshedSummary: ContractSummary | null;
      }
    | null
  > => {
    if (!contractReady) {
      setQuickActionMessage('Set a valid deployed contract address and name first.');
      return null;
    }

    const waitForTxResult = async (
      txId: string,
      network: string
    ): Promise<{ success: boolean; status: string } | null> => {
      const normalizedNetwork = network === 'testnet' ? 'testnet' : 'mainnet';
      const normalizedTxId = normalizeTxId(txId);
      if (!normalizedTxId) {
        return null;
      }
      const failedStatuses = new Set([
        'abort_by_response',
        'abort_by_post_condition',
        'dropped_replace_by_fee',
        'dropped_replace_across_fork',
        'dropped_too_expensive',
        'dropped_stale_garbage_collect',
        'dropped_problematic'
      ]);
      const startedAt = Date.now();
      while (Date.now() - startedAt < TX_CONFIRMATION_TIMEOUT_MS) {
        try {
          const response = await fetch(
            `/hiro/${normalizedNetwork}/extended/v1/tx/${encodeURIComponent(
              normalizedTxId
            )}`,
            { cache: 'no-store' }
          );
          if (response.ok) {
            const payload = (await response.json()) as {
              tx_status?: string;
            };
            const status = String(payload.tx_status ?? '').trim().toLowerCase();
            if (status === 'success') {
              return { success: true, status };
            }
            if (failedStatuses.has(status)) {
              return { success: false, status };
            }
          }
        } catch {
          // keep polling until timeout
        }
        await sleep(TX_CONFIRMATION_POLL_MS);
      }
      return null;
    };

    setQuickActionPending(params.pendingKey);
    setQuickActionMessage(null);
    try {
      const payload = await requestContractCall({
        functionName: params.functionName,
        functionArgs: params.functionArgs
      });

      if (!params.awaitOnChainConfirmation) {
        setQuickActionMessage(
          `${params.successLabel} submitted: ${payload.txId}. Refresh on-chain status after confirmation.`
        );
        props.onJourneyRefreshRequested?.();
        return {
          status: 'submitted',
          txId: payload.txId,
          refreshedSummary: null
        };
      }

      const resolvedNetwork =
        walletAdapter.getSession().network ?? walletSession.network ?? null;
      if (!resolvedNetwork) {
        setQuickActionMessage(
          `${params.successLabel} submitted: ${payload.txId}. Waiting for wallet/network sync before confirmation checks.`
        );
        props.onJourneyRefreshRequested?.();
        return {
          status: 'pending',
          txId: payload.txId,
          refreshedSummary: null
        };
      }

      setQuickActionMessage(
        `${params.successLabel} submitted: ${payload.txId}. Waiting for on-chain confirmation...`
      );

      const txResult = await waitForTxResult(payload.txId, resolvedNetwork);
      if (!txResult) {
        setQuickActionMessage(
          `${params.successLabel} submitted: ${payload.txId}. Confirmation is still pending.`
        );
        props.onJourneyRefreshRequested?.();
        return {
          status: 'pending',
          txId: payload.txId,
          refreshedSummary: null
        };
      }

      if (!txResult.success) {
        const refreshedSummary = await loadContractSummary();
        setQuickActionMessage(
          `${params.successLabel} failed on-chain (${txResult.status.replace(/_/g, ' ')}).`
        );
        props.onJourneyRefreshRequested?.();
        return {
          status: 'failed',
          txId: payload.txId,
          refreshedSummary
        };
      }

      const refreshedSummary = await loadContractSummary();
      if (
        typeof params.expectedPausedState === 'boolean' &&
        refreshedSummary?.paused !== params.expectedPausedState
      ) {
        setQuickActionMessage(
          `${params.successLabel} confirmed, but pause state has not updated yet. Refresh again in a moment.`
        );
      } else {
        setQuickActionMessage(`${params.successLabel} confirmed on-chain.`);
      }
      props.onJourneyRefreshRequested?.();
      return {
        status: 'confirmed',
        txId: payload.txId,
        refreshedSummary
      };
    } catch (error) {
      setQuickActionMessage(
        toManageApiErrorMessage(error, `${params.successLabel} failed`)
      );
      return null;
    } finally {
      setQuickActionPending(null);
    }
  };

  const runQuickSetMintPrice = async () => {
    if (!preInscribedMint) {
      if (!deployPricingLock) {
        setQuickActionMessage(
          'Lock staged assets in Step 2 before setting the mint price collectors pay.'
        );
        return;
      }
      if (!lockedMintFeeFloor) {
        setQuickActionMessage(
          'Refresh on-chain status first so the locked Xtrata fee floor can be calculated.'
        );
        return;
      }
      const displayedMintPriceMicroStx = guidedFreeMintEnabled
        ? lockedMintFeeFloor.totalProtocolFeeMicroStx
        : parseStxToMicro(quickMintPriceStx, true);
      if (displayedMintPriceMicroStx === null) {
        setQuickActionMessage(
          'Mint price must be a valid STX amount (up to 6 decimals).'
        );
        return;
      }
      const onChainMintPriceMicroStx = resolveOnChainMintPriceFromDisplayedMintPrice({
        displayedMintPriceMicroStx,
        feeFloorMicroStx: lockedMintFeeFloor.totalProtocolFeeMicroStx
      });
      if (onChainMintPriceMicroStx === null) {
        setQuickActionMessage(
          `Mint price must be at least ${formatMicroStx(
            lockedMintFeeFloor.totalProtocolFeeMicroStx
          )} so collectors only pay the locked Xtrata fee floor or more.`
        );
        return;
      }
      const result = await runQuickAction({
        pendingKey: 'set-mint-price',
        functionName: priceWriteFunction,
        functionArgs: [uintCV(onChainMintPriceMicroStx)],
        successLabel: guidedFreeMintEnabled ? 'Set free mint price' : 'Set mint price',
        awaitOnChainConfirmation: true
      });
      if (result?.status !== 'confirmed') {
        return;
      }
      try {
        await syncStandardMintPricingMetadata({
          displayedMintPriceMicroStx,
          onChainMintPriceMicroStx,
          feeFloor: lockedMintFeeFloor
        });
        setQuickMintPriceStx(formatMicroStxInput(displayedMintPriceMicroStx));
        setQuickActionMessage(
          guidedFreeMintEnabled
            ? 'Free mint confirmed on-chain and synced to the live page price.'
            : 'Mint price confirmed on-chain and synced to the live page price.'
        );
      } catch (error) {
        setQuickActionMessage(
          toManageApiErrorMessage(
            error,
            'Mint price confirmed on-chain, but syncing live-page pricing failed'
          )
        );
      }
      return;
    }

    const parsed = parseStxToMicro(quickMintPriceStx, true);
    if (parsed === null) {
      setQuickActionMessage(
        'On-chain price must be a valid STX amount (up to 6 decimals).'
      );
      return;
    }
    await runQuickAction({
      pendingKey: 'set-mint-price',
      functionName: priceWriteFunction,
      functionArgs: [uintCV(parsed)],
      successLabel: setPriceActionLabel
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
      successLabel: 'Pause contract',
      awaitOnChainConfirmation: true,
      expectedPausedState: true
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
      successLabel: 'Unpause contract',
      awaitOnChainConfirmation: true,
      expectedPausedState: false
    });
  };

  if (guidedMode) {
    const quickActionsBusy = quickActionPending !== null;
    const onChainPriceFieldLabel = preInscribedMint
      ? 'On-chain sale price'
      : 'On-chain payout base price';
    const collectorMintPriceLabel = preInscribedMint
      ? 'Sale price collectors pay'
      : 'Mint price collectors pay';
    const pauseStepNumber = 1;
    const priceStepNumber = 2;
    const maxSupplyStepNumber = 3;
    const unpauseStepNumber = preInscribedMint ? 3 : 4;
    const launchToggleTargetsUnpause = pausedValue !== false;
    const launchToggleIsSubmitting =
      quickActionPending === 'pause' || quickActionPending === 'unpause';
    const launchToggleLabel = launchToggleTargetsUnpause
      ? 'Unpause contract'
      : 'Pause contract';
    const pauseStatusLabel =
      pausedValue === null
        ? 'Unknown'
        : pausedValue
          ? 'Paused (safe pre-launch)'
          : 'Unpaused (live)';
    const guidedMintPriceInputValue =
      !preInscribedMint && guidedFreeMintEnabled && lockedMintFeeFloor
        ? formatMicroStxInput(lockedMintFeeFloor.totalProtocolFeeMicroStx)
        : quickMintPriceStx;
    const guidedDisplayedMintPriceMicroStx = preInscribedMint
      ? parseStxToMicro(quickMintPriceStx, true)
      : guidedFreeMintEnabled && lockedMintFeeFloor
        ? lockedMintFeeFloor.totalProtocolFeeMicroStx
        : parseStxToMicro(quickMintPriceStx, true);
    const guidedDerivedOnChainMintPriceMicroStx =
      !preInscribedMint &&
      guidedDisplayedMintPriceMicroStx !== null &&
      lockedMintFeeFloor !== null
        ? resolveOnChainMintPriceFromDisplayedMintPrice({
            displayedMintPriceMicroStx: guidedDisplayedMintPriceMicroStx,
            feeFloorMicroStx: lockedMintFeeFloor.totalProtocolFeeMicroStx
          })
        : guidedDisplayedMintPriceMicroStx;
    const unpauseBlockedHint =
      !collectionPublished
        ? 'Publish first in Step 4.'
        : pausedValue === null
          ? 'Refresh on-chain status first.'
          : null;

    return (
      <div className="collection-settings-panel collection-settings-panel--guided">
        <div className="collection-settings-panel__group">
          <h3 className="info-label">
            Guided launch quick actions
            <InfoTooltip text="Run these contract updates in sequence. This keeps launch state predictable for first-time creators." />
          </h3>
          <p className="meta-value">
            Complete these contract actions in order, then refresh checklist status.
          </p>
          <p className="meta-value">
            <span className="info-label">
              Active draft
              <InfoTooltip text="The selected drop ID from Step 1 and Step 2. Quick actions apply to this draft context." />
            </span>
            : <code>{collectionId || 'Select a drop in "Your drops"'}</code>
          </p>
          <p className="meta-value">
            <span className="info-label">
              Contract target
              <InfoTooltip text="Address and contract name that wallet transactions will be sent to." />
            </span>
            :{' '}
            <code>{contractId ?? 'Load a deployed contract from the selected draft'}</code>
          </p>

          <div className="mint-actions">
            <span className="info-label">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void loadContractSummary()}
                disabled={!contractReady || summaryLoading}
              >
                {summaryLoading ? 'Refreshing...' : 'Refresh on-chain status'}
              </button>
              <InfoTooltip text="Reads current on-chain values (price, pause state, supply) from the deployed contract." />
            </span>
            {props.onRequestAdvancedControls ? (
              <span className="info-label">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={props.onRequestAdvancedControls}
                >
                  Open advanced controls
                </button>
                <InfoTooltip text="Switches to detailed contract controls for expert/admin-level actions." />
              </span>
            ) : null}
          </div>

          <div className="collection-settings-panel__summary-grid">
            <div className="collection-settings-panel__summary-item">
              <span className="meta-label info-label">
                {onChainPriceLabel}
                <InfoTooltip text="Contract value used for recipient split calculations." />
              </span>
              <span className="meta-value">
                {formatMicroStx(summary?.mintPriceMicroStx ?? null)}
              </span>
            </div>
            <div className="collection-settings-panel__summary-item">
              <span className="meta-label info-label">
                {collectorMintPriceLabel}
                <InfoTooltip text="Total price collectors should expect to pay on the mint page." />
              </span>
              <span className="meta-value">
                {standardMintPricePendingSetup
                  ? 'Not set yet'
                  : formatMicroStx(collectorMintPriceMicroStx)}
              </span>
            </div>
            {!preInscribedMint ? (
              <div className="collection-settings-panel__summary-item">
                <span className="meta-label info-label">
                  Max supply
                  <InfoTooltip text="Hard cap for tokens this drop can mint." />
                </span>
                <span className="meta-value">
                  {maxSupplyValue === null ? 'Unknown' : maxSupplyValue.toString()}
                </span>
              </div>
            ) : null}
            <div className="collection-settings-panel__summary-item">
              <span className="meta-label info-label">
                Contract pause status
                <InfoTooltip text="Paused means minting is blocked. Unpaused means minting is live." />
              </span>
              <span className="meta-value">{pauseStatusLabel}</span>
            </div>
            <div className="collection-settings-panel__summary-item">
              <span className="meta-label info-label">
                Backend state
                <InfoTooltip text="Manager-side lifecycle marker such as draft or published." />
              </span>
              <span className="meta-value">{collectionStateValue || 'draft'}</span>
            </div>
          </div>

          {summaryMessage ? <p className="meta-value">{summaryMessage}</p> : null}
          {message ? <div className="alert">{message}</div> : null}
          {quickActionMessage ? <div className="alert">{quickActionMessage}</div> : null}
        </div>

        <div className="collection-settings-panel__group">
          <h3 className="info-label">
            {pauseStepNumber}. Pause before publish
            <InfoTooltip text="Recommended first action: keep minting locked until setup and publish are complete." />
          </h3>
          <p className="meta-value">
            Keep minting paused while finishing live-page details and publish.
          </p>
          <div className="mint-actions">
            <span className="info-label">
              <button
                className="button"
                type="button"
                id="manage-pause-contract-button"
                onClick={() => void runQuickPause()}
                disabled={!contractReady || quickActionsBusy || pausedValue === true}
              >
                {quickActionPending === 'pause' ? 'Submitting...' : 'Pause contract'}
              </button>
              <InfoTooltip text="Sends `set-paused true` to the collection contract." />
            </span>
          </div>
        </div>

        <div className="collection-settings-panel__group">
          <h3 className="info-label">
            {priceStepNumber}. Set {preInscribedMint ? onChainPriceFieldLabel.toLowerCase() : 'mint price collectors pay'}
            <InfoTooltip text="For standard mints this is the one collector-facing price. Xtrata protocol fees are absorbed underneath it automatically from the locked fee floor." />
          </h3>
          <p className="meta-value">
            {preInscribedMint
              ? 'Set the on-chain sale price used by the contract.'
              : 'Set the single mint price collectors see and pay. The app automatically converts that into the on-chain payout base using the locked Xtrata fee floor from Step 2.'}
          </p>
          {standardMintPricePendingSetup ? (
            <div className="alert">
              Standard mint pricing is not configured yet. Step 1 deploys with a 0 STX
              on-chain payout base by default; save the collector-facing mint price here
              before publishing.
            </div>
          ) : null}
          {!preInscribedMint && (
            <span className="meta-value">
              {!deployPricingLock
                ? 'Lock staged assets in Step 2 first. Pricing becomes available after the collection fee floor is locked.'
                : lockedMintFeeFloor
                  ? `Locked Xtrata fee floor: ${formatMicroStx(
                      lockedMintFeeFloor.totalProtocolFeeMicroStx
                    )} (begin ${formatMicroStx(
                      lockedMintFeeFloor.beginFeeMicroStx
                    )} + seal ${formatMicroStx(
                      lockedMintFeeFloor.sealFeeMicroStx
                    )}, max ${lockedMintFeeFloor.maxChunks.toString()} chunks).`
                  : 'Refresh on-chain status to load the locked Xtrata fee floor for this collection.'}
            </span>
          )}
          {!preInscribedMint && (
            <div className="field field--full">
              <span className="field__label info-label">
                Free mint
                <InfoTooltip text="Sets the mint price collectors pay to the exact locked Xtrata fee floor." />
              </span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={guidedFreeMintEnabled}
                  onChange={(event) => {
                    const nextEnabled = event.target.checked;
                    setGuidedFreeMintEnabled(nextEnabled);
                    if (nextEnabled && lockedMintFeeFloor) {
                      setQuickMintPriceStx(
                        formatMicroStxInput(lockedMintFeeFloor.totalProtocolFeeMicroStx)
                      );
                    }
                    setQuickActionMessage(null);
                  }}
                  disabled={!lockedMintFeeFloor}
                />
                <span>
                  {lockedMintFeeFloor
                    ? `Use ${formatMicroStx(lockedMintFeeFloor.totalProtocolFeeMicroStx)}`
                    : 'Available after Step 2 lock + on-chain refresh'}
                </span>
              </label>
            </div>
          )}
          <label className="field field--full">
            <span className="field__label info-label">
              {preInscribedMint ? `${onChainPriceFieldLabel} (STX)` : 'Mint price collectors pay (STX)'}
              <InfoTooltip
                text={
                  preInscribedMint
                    ? 'Up to 6 decimals. This is written on-chain.'
                    : 'Up to 6 decimals. This is the total price shown to collectors on the mint page.'
                }
              />
            </span>
            <input
              className="input"
              value={guidedMintPriceInputValue}
              placeholder="0.00"
              onChange={(event) => {
                setQuickMintPriceStx(event.target.value.trim());
                if (!preInscribedMint && guidedFreeMintEnabled) {
                  setGuidedFreeMintEnabled(false);
                }
                setQuickActionMessage(null);
              }}
              disabled={!preInscribedMint && guidedFreeMintEnabled}
            />
          </label>
          {!preInscribedMint && (
            <>
              {guidedDisplayedMintPriceMicroStx === null && quickMintPriceStx.trim().length > 0 ? (
                <p className="meta-value field__hint--error">
                  Enter a valid STX amount (up to 6 decimals).
                </p>
              ) : null}
              {guidedDisplayedMintPriceMicroStx !== null &&
              lockedMintFeeFloor !== null &&
              guidedDerivedOnChainMintPriceMicroStx === null ? (
                <p className="meta-value field__hint--error">
                  Mint price must be at least{' '}
                  {formatMicroStx(lockedMintFeeFloor.totalProtocolFeeMicroStx)}.
                </p>
              ) : null}
              {guidedDisplayedMintPriceMicroStx !== null &&
              guidedDerivedOnChainMintPriceMicroStx !== null &&
              lockedMintFeeFloor !== null ? (
                <p className="meta-value">
                  On save, on-chain payout base price will be{' '}
                  {formatMicroStx(guidedDerivedOnChainMintPriceMicroStx)} and the live mint
                  page will show {formatMicroStx(guidedDisplayedMintPriceMicroStx)}.
                </p>
              ) : null}
            </>
          )}
          <div className="mint-actions">
            <span className="info-label">
              <button
                className="button"
                type="button"
                onClick={() => void runQuickSetMintPrice()}
                disabled={
                  !contractReady ||
                  quickActionsBusy ||
                  (!preInscribedMint && (!deployPricingLock || lockedMintFeeFloor === null))
                }
              >
                {quickActionPending === 'set-mint-price'
                  ? 'Submitting...'
                  : preInscribedMint
                    ? `Set ${onChainPriceFieldLabel.toLowerCase()}`
                    : guidedFreeMintEnabled
                      ? 'Set free mint'
                      : 'Set mint price'}
              </button>
              <InfoTooltip
                text={
                  preInscribedMint
                    ? 'Submits the price update transaction with your connected signer wallet.'
                    : 'Submits the derived on-chain payout base update, then syncs the collector-facing mint price in backend metadata.'
                }
              />
            </span>
          </div>
        </div>

        {!preInscribedMint ? (
          <div className="collection-settings-panel__group">
            <h3 className="info-label">
              {maxSupplyStepNumber}. Set max supply
              <InfoTooltip text="Sets the maximum token count allowed by the contract." />
            </h3>
            <p className="meta-value">Set the maximum number of tokens this drop can mint.</p>
            <label className="field field--full">
              <span className="field__label info-label">
                Max supply
                <InfoTooltip text="Whole number only. Usually set once before launch." />
              </span>
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
              <span className="info-label">
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
                <InfoTooltip text="Sends `set-max-supply` to the contract owner/admin role." />
              </span>
            </div>
          </div>
        ) : null}

        <div className="collection-settings-panel__group">
          <h3 className="info-label">
            {unpauseStepNumber}. {launchToggleTargetsUnpause ? 'Unpause to go live' : 'Pause live contract'}
            <InfoTooltip text="Final launch control. Unpause after publish to go live, or pause again if you need to halt minting." />
          </h3>
          <p className="meta-value">
            {launchToggleTargetsUnpause
              ? 'Final launch milestone: unpause only after the collection is published.'
              : 'Contract is currently live. You can pause again here if needed.'}
          </p>
          <div className="mint-actions">
            <span className="info-label">
              <button
                className="button"
                type="button"
                id="manage-unpause-contract-button"
                onClick={() =>
                  void (launchToggleTargetsUnpause ? runQuickUnpause() : runQuickPause())
                }
                disabled={
                  !contractReady ||
                  quickActionsBusy ||
                  !collectionPublished ||
                  pausedValue === null
                }
              >
                {launchToggleIsSubmitting ? 'Submitting...' : launchToggleLabel}
              </button>
              <InfoTooltip
                text={
                  launchToggleTargetsUnpause
                    ? 'Sends `set-paused false` so collectors can mint.'
                    : 'Sends `set-paused true` to pause minting again.'
                }
              />
            </span>
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
        <h3 className="info-label">
          Draft metadata
          <InfoTooltip text="Backend-only draft details. Editing here does not send wallet transactions." />
        </h3>
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
          <span className="info-label">
            <button className="button button--ghost" type="button" onClick={loadCollection}>
              Load draft
            </button>
            <InfoTooltip text="Fetches the selected draft and pre-fills these fields." />
          </span>
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
          <span className="info-label">
            <button
              className="button"
              type="button"
              onClick={saveSettings}
              disabled={draftSettingsLocked}
            >
              Save draft settings
            </button>
            <InfoTooltip text="Writes updated draft metadata to the manager backend." />
          </span>
        </div>
        {draftSettingsLocked && (
          <p className="meta-value">
            Draft metadata editing is locked for {state.trim().toLowerCase()} collections.
          </p>
        )}
        {message && <div className="alert">{message}</div>}
      </div>

      <div className="collection-settings-panel__group collection-settings-panel__group--onchain">
        <h3 className="info-label">
          Deployed contract controls
          <InfoTooltip text="Direct wallet transactions to contract functions. Use carefully in production collections." />
        </h3>
        <p className="meta-value">
          This section sends wallet transactions directly to the deployed
          collection contract.
        </p>
        <p className="meta-value">{onChainPriceSummaryHint}</p>
        <p className="meta-value">
          Contract target:{' '}
          <code>{contractId ?? 'Set valid contract address + contract name'}</code>
        </p>

        <div className="mint-actions">
          <span className="info-label">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void loadContractSummary()}
              disabled={!contractReady || summaryLoading}
            >
              {summaryLoading ? 'Refreshing...' : 'Refresh on-chain status'}
            </button>
            <InfoTooltip text="Reads owner/admin roles, pause state, pricing, and core fee data from the contract." />
          </span>
        </div>

        <div className="collection-settings-panel__summary-grid">
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Owner
              <InfoTooltip text="Current contract owner wallet." />
            </span>
            <span className="meta-value">{summary?.owner ?? 'Unknown'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Pending owner
              <InfoTooltip text="Wallet waiting to accept ownership transfer, if any." />
            </span>
            <span className="meta-value">{summary?.pendingOwner ?? 'None'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Operator admin
              <InfoTooltip text="Admin role that can manage operational/config actions." />
            </span>
            <span className="meta-value">{summary?.operatorAdmin ?? 'Unknown'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Finance admin
              <InfoTooltip text="Admin role that can update finance actions like pricing and splits." />
            </span>
            <span className="meta-value">{summary?.financeAdmin ?? 'Unknown'}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Paused
              <InfoTooltip text="Yes means mint functions are blocked. No means minting is enabled." />
            </span>
            <span className="meta-value">
              {pausedValue === null ? 'Unknown' : pausedValue ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Finalized
              <InfoTooltip text="Finalized contracts lock selected mutable controls permanently." />
            </span>
            <span className="meta-value">
              {finalizedValue === null ? 'Unknown' : finalizedValue ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              {onChainPriceLabel}
              <InfoTooltip text="Contract-side payout/sale value currently stored on-chain." />
            </span>
            <span className="meta-value">{formatMicroStx(summary?.mintPriceMicroStx ?? null)}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              {livePagePriceLabel}
              <InfoTooltip text="Collector-facing price from draft/live-page metadata." />
            </span>
            <span className="meta-value">{formatDraftStx(collectionMintPriceStx)}</span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Max supply
              <InfoTooltip text="Current contract cap for total mintable tokens." />
            </span>
            <span className="meta-value">
              {summary?.maxSupply === null || summary?.maxSupply === undefined
                ? 'Unknown'
                : summary.maxSupply.toString()}
            </span>
          </div>
          <div className="collection-settings-panel__summary-item">
            <span className="meta-label info-label">
              Core fee unit
              <InfoTooltip text="Fee unit pulled from locked core contract, used for fee absorption helpers." />
            </span>
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
            id="manage-contract-action-select"
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
              On-chain price input mode
              <InfoTooltip text="Optional helper: keep begin anti-spam fee separate, and absorb seal protocol fee into your mint price target." />
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
              <option value="raw">Raw on-chain payout base (no absorption)</option>
              <option value="absorb">
                Mint price target (auto-subtract seal protocol fee)
              </option>
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
          <span className="info-label">
            <button
              className="button"
              type="button"
              id="manage-contract-action-submit"
              onClick={runAction}
              disabled={!contractReady || actionPending || !selectedAction}
            >
              {actionPending ? 'Submitting...' : 'Submit wallet transaction'}
            </button>
            <InfoTooltip text="Opens wallet confirmation for the selected contract function call." />
          </span>
          <span className="info-label">
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
            <InfoTooltip text="Restores this action form to suggested defaults from the current draft/context." />
          </span>
        </div>
        {actionMessage && <div className="alert">{actionMessage}</div>}
      </div>
    </div>
  );
}
