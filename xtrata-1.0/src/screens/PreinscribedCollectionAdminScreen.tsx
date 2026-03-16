import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '../lib/wallet/connect';
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

type PreinscribedCollectionAdminScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
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

const parseTokenIdList = (raw: string, maxCount = 50) => {
  const ids: bigint[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const parts = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  parts.forEach((part, index) => {
    if (!/^\d+$/.test(part)) {
      errors.push(`Item ${index + 1} is not a valid token ID.`);
      return;
    }
    const value = BigInt(part);
    const key = value.toString();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    ids.push(value);
  });

  if (ids.length > maxCount) {
    errors.push(`Token batch limit is ${maxCount} IDs.`);
  }

  return { ids, errors };
};

const parseAllowlistBatch = (raw: string) => {
  const entries: Array<{ owner: string; allowance: bigint }> = [];
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
    const allowance = parseUintInput(allowanceRaw);
    if (allowance === null) {
      errors.push(`Line ${index + 1} has an invalid allowance (> 0 required).`);
      return;
    }
    entries.push({ owner: address, allowance });
  });

  if (entries.length > 200) {
    errors.push('Allowlist batch limit is 200 entries.');
  }

  return { entries, errors };
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

export default function PreinscribedCollectionAdminScreen(
  props: PreinscribedCollectionAdminScreenProps
) {
  const [saleAddress, setSaleAddress] = useState('');
  const [saleName, setSaleName] = useState('');
  const [status, setStatus] = useState<SaleStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [priceInput, setPriceInput] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [marketplaceInput, setMarketplaceInput] = useState('');
  const [operatorInput, setOperatorInput] = useState('');
  const [artistBpsInput, setArtistBpsInput] = useState('');
  const [marketplaceBpsInput, setMarketplaceBpsInput] = useState('');
  const [operatorBpsInput, setOperatorBpsInput] = useState('');
  const [saleStartInput, setSaleStartInput] = useState('');
  const [saleEndInput, setSaleEndInput] = useState('');
  const [allowlistEnabledInput, setAllowlistEnabledInput] = useState('');
  const [maxPerWalletInput, setMaxPerWalletInput] = useState('');
  const [allowlistAddressInput, setAllowlistAddressInput] = useState('');
  const [allowlistAllowanceInput, setAllowlistAllowanceInput] = useState('');
  const [allowlistBatchInput, setAllowlistBatchInput] = useState('');
  const [allowlistStatus, setAllowlistStatus] = useState<{
    exists: boolean;
    allowance: bigint | null;
    bought: bigint;
  } | null>(null);
  const [allowlistStatusMessage, setAllowlistStatusMessage] =
    useState<string | null>(null);
  const [allowlistStatusLoading, setAllowlistStatusLoading] = useState(false);
  const [inventoryBatchInput, setInventoryBatchInput] = useState('');
  const [withdrawRecipientInput, setWithdrawRecipientInput] = useState('');
  const [inventoryLookupInput, setInventoryLookupInput] = useState('');
  const [inventoryLookupStatus, setInventoryLookupStatus] = useState<{
    exists: boolean;
    available: boolean | null;
    sold: boolean | null;
    seller: string | null;
    buyer: string | null;
    depositedAt: bigint | null;
    soldAt: bigint | null;
  } | null>(null);
  const [inventoryLookupMessage, setInventoryLookupMessage] =
    useState<string | null>(null);
  const [inventoryLookupLoading, setInventoryLookupLoading] = useState(false);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const canTransact = !!props.walletSession.address && !mismatch;

  const contractValid = useMemo(() => {
    if (!saleAddress.trim() || !saleName.trim()) {
      return false;
    }
    if (!validateStacksAddress(saleAddress.trim())) {
      return false;
    }
    return CONTRACT_NAME_PATTERN.test(saleName.trim());
  }, [saleAddress, saleName]);

  const saleContract = useMemo(() => {
    if (!contractValid) {
      return null;
    }
    return {
      address: saleAddress.trim(),
      contractName: saleName.trim()
    };
  }, [saleAddress, saleName, contractValid]);

  const isSaleOwner =
    !!props.walletSession.address &&
    !!status?.owner &&
    props.walletSession.address === status.owner;
  const canManageSale = canTransact && (!status?.owner || isSaleOwner);

  const callSaleReadOnly = async (
    functionName: string,
    functionArgs: ClarityValue[] = []
  ) => {
    if (!saleContract) {
      throw new Error('Sale contract is not set.');
    }
    const network = toStacksNetwork(props.contract.network);
    const sender = props.walletSession.address ?? props.contract.address;
    return callReadOnlyFunction({
      contractAddress: saleContract.address,
      contractName: saleContract.contractName,
      functionName,
      functionArgs,
      senderAddress: sender,
      network
    }).then(unwrapResponse);
  };

  const requestSaleCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    if (!saleContract) {
      throw new Error('Enter a valid sale contract first.');
    }
    const network = props.walletSession.network ?? props.contract.network;
    const stxAddress = props.walletSession.address;
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: saleContract.address,
        contractName: saleContract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network,
        stxAddress,
        onFinish: (payload) => resolve(payload as TxPayload),
        onCancel: () =>
          reject(new Error('Wallet cancelled or failed to broadcast.'))
      });
    });
  };

  useEffect(() => {
    setStatus(null);
    setStatusMessage(null);
    setAllowlistStatus(null);
    setAllowlistStatusMessage(null);
    setInventoryLookupStatus(null);
    setInventoryLookupMessage(null);
  }, [saleAddress, saleName]);

  useEffect(() => {
    setAllowlistStatus(null);
    setAllowlistStatusMessage(null);
  }, [allowlistAddressInput]);

  useEffect(() => {
    setInventoryLookupStatus(null);
    setInventoryLookupMessage(null);
  }, [inventoryLookupInput]);

  useEffect(() => {
    if (!status) {
      return;
    }
    if (status.price !== null && !priceInput.trim()) {
      const asNumber = Number(status.price) / MICROSTX_PER_STX;
      if (Number.isFinite(asNumber)) {
        setPriceInput(asNumber.toFixed(6));
      }
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
    if (status.saleStartBlock !== null && !saleStartInput.trim()) {
      setSaleStartInput(status.saleStartBlock.toString());
    }
    if (status.saleEndBlock !== null && !saleEndInput.trim()) {
      setSaleEndInput(status.saleEndBlock.toString());
    }
    if (status.allowlistEnabled !== null && !allowlistEnabledInput.trim()) {
      setAllowlistEnabledInput(status.allowlistEnabled ? 'true' : 'false');
    }
    if (status.maxPerWallet !== null && !maxPerWalletInput.trim()) {
      setMaxPerWalletInput(status.maxPerWallet.toString());
    }
  }, [
    status,
    priceInput,
    artistInput,
    marketplaceInput,
    operatorInput,
    artistBpsInput,
    marketplaceBpsInput,
    operatorBpsInput,
    saleStartInput,
    saleEndInput,
    allowlistEnabledInput,
    maxPerWalletInput
  ]);

  const loadStatus = async () => {
    if (!saleContract) {
      setStatusMessage('Enter a sale contract address and name.');
      return;
    }
    setStatusLoading(true);
    setStatusMessage(null);
    try {
      const [
        ownerCv,
        pausedCv,
        priceCv,
        allowlistCv,
        maxPerWalletCv,
        windowCv,
        countsCv,
        recipientsCv,
        splitsCv
      ] = await Promise.all([
        callSaleReadOnly('get-owner'),
        callSaleReadOnly('get-paused'),
        callSaleReadOnly('get-price'),
        callSaleReadOnly('get-allowlist-enabled'),
        callSaleReadOnly('get-max-per-wallet'),
        callSaleReadOnly('get-sale-window'),
        callSaleReadOnly('get-counts'),
        callSaleReadOnly('get-recipients'),
        callSaleReadOnly('get-splits')
      ]);

      const windowRaw = cvToValue(windowCv);
      const countsRaw = cvToValue(countsCv);
      const recipientsRaw = cvToValue(recipientsCv);
      const splitsRaw = cvToValue(splitsCv);

      const nextStatus: SaleStatus = {
        owner: toPrimitive(ownerCv) as string,
        paused: Boolean(toPrimitive(pausedCv)),
        price: parseUint(priceCv),
        allowlistEnabled: Boolean(toPrimitive(allowlistCv)),
        maxPerWallet: parseUint(maxPerWalletCv),
        saleStartBlock: (() => {
          const value = readTupleField(windowRaw, 'start-block');
          return value !== null ? BigInt(String(value)) : null;
        })(),
        saleEndBlock: (() => {
          const value = readTupleField(windowRaw, 'end-block');
          return value !== null ? BigInt(String(value)) : null;
        })(),
        availableCount: (() => {
          const value = readTupleField(countsRaw, 'available');
          return value !== null ? BigInt(String(value)) : null;
        })(),
        soldCount: (() => {
          const value = readTupleField(countsRaw, 'sold');
          return value !== null ? BigInt(String(value)) : null;
        })(),
        recipients: {
          artist: String(readTupleField(recipientsRaw, 'artist') ?? ''),
          marketplace: String(readTupleField(recipientsRaw, 'marketplace') ?? ''),
          operator: String(readTupleField(recipientsRaw, 'operator') ?? '')
        },
        splits: {
          artist: BigInt(String(readTupleField(splitsRaw, 'artist') ?? 0)),
          marketplace: BigInt(
            String(readTupleField(splitsRaw, 'marketplace') ?? 0)
          ),
          operator: BigInt(String(readTupleField(splitsRaw, 'operator') ?? 0))
        }
      };
      setStatus(nextStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed to load sale status: ${message}`);
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

  const handleSetPrice = async () => {
    const parsed = parseStxInput(priceInput, true);
    if (parsed === null) {
      setActionMessage('Enter a valid sale price in STX (0 allowed).');
      return;
    }
    const micro = BigInt(Math.round(parsed * MICROSTX_PER_STX));
    await runAction('Set price', () =>
      requestSaleCall({
        functionName: 'set-price',
        functionArgs: [uintCV(micro)]
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
      requestSaleCall({
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
      requestSaleCall({
        functionName: 'set-splits',
        functionArgs: [uintCV(artist), uintCV(marketplace), uintCV(operator)]
      })
    );
  };

  const handlePauseToggle = async (value: boolean) => {
    await runAction(value ? 'Pause sale' : 'Unpause sale', () =>
      requestSaleCall({
        functionName: 'set-paused',
        functionArgs: [boolCV(value)]
      })
    );
  };

  const handleSetSaleWindow = async () => {
    const start = parseUintInput(saleStartInput, true);
    const end = parseUintInput(saleEndInput, true);
    if (start === null || end === null) {
      setActionMessage('Enter valid block heights (0 allowed) for sale window.');
      return;
    }
    await runAction('Set sale window', () =>
      requestSaleCall({
        functionName: 'set-sale-window',
        functionArgs: [uintCV(start), uintCV(end)]
      })
    );
  };

  const handleSetAllowlistEnabled = async () => {
    const value = allowlistEnabledInput === 'true';
    await runAction('Set allowlist mode', () =>
      requestSaleCall({
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
      requestSaleCall({
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
    const allowance = parseUintInput(allowlistAllowanceInput);
    if (allowance === null) {
      setActionMessage('Enter a valid allowance (> 0).');
      return;
    }
    await runAction('Update allowlist entry', () =>
      requestSaleCall({
        functionName: 'set-allowlist',
        functionArgs: [principalCV(allowlistAddressInput.trim()), uintCV(allowance)]
      })
    );
  };

  const handleClearAllowlistEntry = async () => {
    if (!validateStacksAddress(allowlistAddressInput.trim())) {
      setActionMessage('Enter a valid allowlist address.');
      return;
    }
    await runAction('Clear allowlist entry', () =>
      requestSaleCall({
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
      requestSaleCall({
        functionName: 'set-allowlist-batch',
        functionArgs: [entriesCv]
      })
    );
  };

  const handleLoadAllowlistStatus = async () => {
    if (!saleContract) {
      setAllowlistStatusMessage('Enter a sale contract first.');
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
      const entryCv = await callSaleReadOnly('get-allowlist-entry', [
        principalCV(address)
      ]);
      let exists = false;
      let allowance: bigint | null = null;
      if (entryCv.type === ClarityType.OptionalSome) {
        exists = true;
        const entryRaw = cvToValue(entryCv.value);
        const allowanceRaw = readTupleField(entryRaw, 'allowance');
        if (allowanceRaw !== null) {
          allowance = BigInt(String(allowanceRaw));
        }
      }
      const statsCv = await callSaleReadOnly('get-wallet-stats', [
        principalCV(address)
      ]);
      const statsRaw = cvToValue(statsCv);
      const boughtRaw = readTupleField(statsRaw, 'bought');
      const bought = boughtRaw !== null ? BigInt(String(boughtRaw)) : 0n;
      setAllowlistStatus({ exists, allowance, bought });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAllowlistStatusMessage(`Failed to load allowlist status: ${message}`);
    } finally {
      setAllowlistStatusLoading(false);
    }
  };

  const handleDepositBatch = async () => {
    const parsed = parseTokenIdList(inventoryBatchInput, 50);
    if (parsed.errors.length > 0) {
      setActionMessage(parsed.errors.join(' '));
      return;
    }
    if (parsed.ids.length === 0) {
      setActionMessage('Provide at least one token ID to deposit.');
      return;
    }
    await runAction('Deposit inventory batch', () =>
      requestSaleCall({
        functionName: 'deposit-batch',
        functionArgs: [listCV(parsed.ids.map((id) => uintCV(id)))]
      })
    );
  };

  const handleWithdrawBatch = async () => {
    const parsed = parseTokenIdList(inventoryBatchInput, 50);
    if (parsed.errors.length > 0) {
      setActionMessage(parsed.errors.join(' '));
      return;
    }
    if (parsed.ids.length === 0) {
      setActionMessage('Provide at least one token ID to withdraw.');
      return;
    }
    if (!validateStacksAddress(withdrawRecipientInput.trim())) {
      setActionMessage('Enter a valid withdraw recipient address.');
      return;
    }
    await runAction('Withdraw inventory batch', () =>
      requestSaleCall({
        functionName: 'withdraw-batch',
        functionArgs: [
          listCV(parsed.ids.map((id) => uintCV(id))),
          principalCV(withdrawRecipientInput.trim())
        ]
      })
    );
  };

  const handleLoadInventoryStatus = async () => {
    if (!saleContract) {
      setInventoryLookupMessage('Enter a sale contract first.');
      return;
    }
    const tokenId = parseUintInput(inventoryLookupInput);
    if (tokenId === null) {
      setInventoryLookupMessage('Enter a valid token ID.');
      return;
    }
    setInventoryLookupLoading(true);
    setInventoryLookupMessage(null);
    try {
      const inventoryCv = await callSaleReadOnly('get-inventory', [uintCV(tokenId)]);
      if (inventoryCv.type === ClarityType.OptionalNone) {
        setInventoryLookupStatus({
          exists: false,
          available: null,
          sold: null,
          seller: null,
          buyer: null,
          depositedAt: null,
          soldAt: null
        });
        return;
      }
      const inventoryRaw = cvToValue(inventoryCv.value);
      const availableRaw = readTupleField(inventoryRaw, 'available');
      const soldRaw = readTupleField(inventoryRaw, 'sold');
      const sellerRaw = readTupleField(inventoryRaw, 'seller');
      const buyerRaw = readTupleField(inventoryRaw, 'buyer');
      const depositedRaw = readTupleField(inventoryRaw, 'deposited-at');
      const soldAtRaw = readTupleField(inventoryRaw, 'sold-at');
      setInventoryLookupStatus({
        exists: true,
        available:
          typeof availableRaw === 'boolean' ? availableRaw : availableRaw === null ? null : String(availableRaw) === 'true',
        sold:
          typeof soldRaw === 'boolean' ? soldRaw : soldRaw === null ? null : String(soldRaw) === 'true',
        seller: sellerRaw !== null ? String(sellerRaw) : null,
        buyer: buyerRaw !== null ? String(buyerRaw) : null,
        depositedAt:
          depositedRaw !== null ? BigInt(String(depositedRaw)) : null,
        soldAt: soldAtRaw !== null ? BigInt(String(soldAtRaw)) : null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInventoryLookupMessage(`Failed to load inventory status: ${message}`);
    } finally {
      setInventoryLookupLoading(false);
    }
  };

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="preinscribed-sale-admin"
    >
      <div className="panel__header">
        <div>
          <h2>Pre-inscribed sale admin</h2>
          <p>
            Configure and operate escrow sales for pre-inscribed tokens using a
            dedicated sale contract.
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
          <span className="meta-label">1. Identify sale contract</span>
          <label className="field">
            <span className="field__label">Sale contract address</span>
            <input
              className="input"
              placeholder="ST..."
              value={saleAddress}
              onChange={(event) => setSaleAddress(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Sale contract name</span>
            <input
              className="input"
              placeholder="xtrata-preinscribed-collection-sale-v1-0"
              value={saleName}
              onChange={(event) => setSaleName(event.target.value)}
            />
            <span className="field__hint">
              This sale contract is designed for tokens already minted into{' '}
              {props.contract.contractName}.
            </span>
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void loadStatus()}
              disabled={!saleContract || statusLoading}
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
              <span className="meta-value">{status?.owner ?? 'Unknown'}</span>
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
              <span className="meta-label">Price</span>
              <span className="meta-value">
                {formatMicroStxValue(status?.price ?? null)}
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
            <div>
              <span className="meta-label">Sale window</span>
              <span className="meta-value">
                {(status?.saleStartBlock ?? 0n).toString()} -{' '}
                {(status?.saleEndBlock ?? 0n).toString()}
              </span>
            </div>
            <div>
              <span className="meta-label">Available</span>
              <span className="meta-value">
                {status?.availableCount?.toString() ?? 'Unknown'}
              </span>
            </div>
            <div>
              <span className="meta-label">Sold</span>
              <span className="meta-value">
                {status?.soldCount?.toString() ?? 'Unknown'}
              </span>
            </div>
          </div>
          {status?.recipients && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Artist</span>
                <span className="meta-value address-value--full">
                  {status.recipients.artist}
                </span>
              </div>
              <div>
                <span className="meta-label">Marketplace</span>
                <span className="meta-value address-value--full">
                  {status.recipients.marketplace}
                </span>
              </div>
              <div>
                <span className="meta-label">Operator</span>
                <span className="meta-value address-value--full">
                  {status.recipients.operator}
                </span>
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
          {status?.owner && !isSaleOwner && (
            <span className="meta-value">
              Connect the sale owner wallet to update settings.
            </span>
          )}
        </div>

        <div className="mint-panel">
          <span className="meta-label">2. Configure sale</span>
          <label className="field">
            <span className="field__label">Price (STX)</span>
            <input
              className="input"
              placeholder="0.000000"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetPrice()}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Set price' ? 'Updating...' : 'Set price'}
            </button>
          </div>

          <div className="meta-grid meta-grid--dense">
            <label className="field field--address">
              <span className="field__label">Artist recipient</span>
              <input
                className="input input--address-fit"
                placeholder="ST..."
                value={artistInput}
                onChange={(event) => setArtistInput(event.target.value)}
              />
            </label>
            <label className="field field--address">
              <span className="field__label">Marketplace recipient</span>
              <input
                className="input input--address-fit"
                placeholder="ST..."
                value={marketplaceInput}
                onChange={(event) => setMarketplaceInput(event.target.value)}
              />
            </label>
            <label className="field field--address">
              <span className="field__label">Operator recipient</span>
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
              disabled={!canManageSale || pendingAction !== null}
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
                placeholder="10000"
                value={artistBpsInput}
                onChange={(event) => setArtistBpsInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Marketplace split (bps)</span>
              <input
                className="input"
                placeholder="0"
                value={marketplaceBpsInput}
                onChange={(event) => setMarketplaceBpsInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Operator split (bps)</span>
              <input
                className="input"
                placeholder="0"
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
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Set splits' ? 'Updating...' : 'Set splits'}
            </button>
          </div>

          <div className="meta-grid meta-grid--dense">
            <label className="field">
              <span className="field__label">Sale start block (0 = no start)</span>
              <input
                className="input"
                placeholder="0"
                value={saleStartInput}
                onChange={(event) => setSaleStartInput(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Sale end block (0 = no end)</span>
              <input
                className="input"
                placeholder="0"
                value={saleEndInput}
                onChange={(event) => setSaleEndInput(event.target.value)}
              />
            </label>
          </div>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetSaleWindow()}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Set sale window'
                ? 'Updating...'
                : 'Set sale window'}
            </button>
          </div>

          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handlePauseToggle(true)}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Pause sale' ? 'Pausing...' : 'Pause sale'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handlePauseToggle(false)}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Unpause sale' ? 'Unpausing...' : 'Unpause sale'}
            </button>
          </div>
        </div>

        <div className="mint-panel">
          <span className="meta-label">3. Allowlist + wallet limits</span>
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
              disabled={!canManageSale || pendingAction !== null}
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
              disabled={!canManageSale || pendingAction !== null}
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
              placeholder="1"
              value={allowlistAllowanceInput}
              onChange={(event) => setAllowlistAllowanceInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetAllowlistEntry()}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Update allowlist entry'
                ? 'Updating...'
                : 'Add/update entry'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleClearAllowlistEntry()}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Clear allowlist entry'
                ? 'Clearing...'
                : 'Clear entry'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleLoadAllowlistStatus()}
              disabled={allowlistStatusLoading || !saleContract}
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
                  {allowlistStatus.allowance?.toString() ?? '—'}
                </span>
              </div>
              <div>
                <span className="meta-label">Bought</span>
                <span className="meta-value">{allowlistStatus.bought.toString()}</span>
              </div>
            </div>
          )}
          {allowlistStatusMessage && (
            <span className="meta-value">{allowlistStatusMessage}</span>
          )}

          <label className="field">
            <span className="field__label">Batch allowlist (one per line)</span>
            <textarea
              className="textarea"
              placeholder="ST... 1"
              value={allowlistBatchInput}
              onChange={(event) => setAllowlistBatchInput(event.target.value)}
            />
            <span className="field__hint">
              Format: address allowance. Max 200 entries per batch.
            </span>
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleSetAllowlistBatch()}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Set allowlist batch'
                ? 'Updating...'
                : 'Apply allowlist batch'}
            </button>
          </div>
        </div>

        <div className="mint-panel">
          <span className="meta-label">4. Inventory operations</span>
          <label className="field">
            <span className="field__label">Token IDs (space/comma/newline)</span>
            <textarea
              className="textarea"
              placeholder="1, 2, 3"
              value={inventoryBatchInput}
              onChange={(event) => setInventoryBatchInput(event.target.value)}
            />
            <span className="field__hint">
              Deposit/withdraw supports up to 50 IDs per transaction.
            </span>
          </label>
          <label className="field">
            <span className="field__label">Withdraw recipient</span>
            <input
              className="input"
              placeholder="ST..."
              value={withdrawRecipientInput}
              onChange={(event) => setWithdrawRecipientInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handleDepositBatch()}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Deposit inventory batch'
                ? 'Depositing...'
                : 'Deposit batch to escrow'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleWithdrawBatch()}
              disabled={!canManageSale || pendingAction !== null}
            >
              {pendingAction === 'Withdraw inventory batch'
                ? 'Withdrawing...'
                : 'Withdraw batch'}
            </button>
          </div>

          <label className="field">
            <span className="field__label">Inspect inventory token ID</span>
            <input
              className="input"
              placeholder="1"
              value={inventoryLookupInput}
              onChange={(event) => setInventoryLookupInput(event.target.value)}
            />
          </label>
          <div className="mint-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleLoadInventoryStatus()}
              disabled={inventoryLookupLoading || !saleContract}
            >
              {inventoryLookupLoading ? 'Checking...' : 'Check inventory'}
            </button>
          </div>
          {inventoryLookupStatus && (
            <div className="meta-grid meta-grid--dense">
              <div>
                <span className="meta-label">Exists</span>
                <span className="meta-value">
                  {inventoryLookupStatus.exists ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Available</span>
                <span className="meta-value">
                  {inventoryLookupStatus.available === null
                    ? 'Unknown'
                    : inventoryLookupStatus.available
                      ? 'Yes'
                      : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Sold</span>
                <span className="meta-value">
                  {inventoryLookupStatus.sold === null
                    ? 'Unknown'
                    : inventoryLookupStatus.sold
                      ? 'Yes'
                      : 'No'}
                </span>
              </div>
              <div>
                <span className="meta-label">Seller</span>
                <span className="meta-value">
                  {inventoryLookupStatus.seller ?? '—'}
                </span>
              </div>
              <div>
                <span className="meta-label">Buyer</span>
                <span className="meta-value">
                  {inventoryLookupStatus.buyer ?? '—'}
                </span>
              </div>
              <div>
                <span className="meta-label">Deposited at</span>
                <span className="meta-value">
                  {inventoryLookupStatus.depositedAt?.toString() ?? '—'}
                </span>
              </div>
              <div>
                <span className="meta-label">Sold at</span>
                <span className="meta-value">
                  {inventoryLookupStatus.soldAt?.toString() ?? '—'}
                </span>
              </div>
            </div>
          )}
          {inventoryLookupMessage && (
            <span className="meta-value">{inventoryLookupMessage}</span>
          )}
        </div>

        {actionMessage && <div className="alert">{actionMessage}</div>}
        {mismatch && (
          <div className="alert">
            Switch wallet to {mismatch.expected} to manage sale contracts.
          </div>
        )}
      </div>
    </section>
  );
}
