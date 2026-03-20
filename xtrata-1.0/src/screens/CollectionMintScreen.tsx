import { useEffect, useMemo, useRef, useState } from 'react';
import { showContractCall } from '../lib/wallet/connect';
import {
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  type ClarityValue,
  cvToValue,
  FungibleConditionCode,
  listCV,
  makeStandardSTXPostCondition,
  PostConditionMode,
  type PostCondition,
  principalCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import {
  batchChunks,
  chunkBytes,
  computeExpectedHash,
  MAX_BATCH_SIZE
} from '../lib/chunking/hash';
import { bytesToHex } from '../lib/utils/encoding';
import { formatBytes, truncateMiddle } from '../lib/utils/format';
import { logInfo, logWarn } from '../lib/utils/logger';
import { getNetworkMismatch } from '../lib/network/guard';
import { getContractId } from '../lib/contract/config';
import { useContractAdminStatus } from '../lib/contract/admin-status';
import { createXtrataClient } from '../lib/contract/client';
import { toStacksNetwork } from '../lib/network/stacks';
import {
  estimateBatchContractFees,
  formatMicroStx,
  getFeeSchedule
} from '../lib/contract/fees';
import { formatMicroStxWithUsd } from '../lib/pricing/format';
import { useUsdPriceBook } from '../lib/pricing/hooks';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_TOKEN_URI,
  MAX_MIME_LENGTH,
  MAX_TOKEN_URI_LENGTH,
  TX_DELAY_SECONDS
} from '../lib/mint/constants';
import {
  buildCollectionBatchSealStxPostConditions,
  buildCollectionSealStxPostConditions,
  buildMintBeginStxPostConditions,
  resolveCollectionBatchSealSpendCapMicroStx,
  resolveCollectionBeginSpendCapMicroStx,
  resolveCollectionSealSpendCapMicroStx
} from '../lib/mint/post-conditions';
import {
  parseRandomDropManifest,
  selectRandomDropAssets
} from '../lib/collection-mint/random-drop';
import {
  COLLECTION_RESERVATION_TIMEOUT_MS,
  formatRemainingMinutesSeconds,
  getSoonestReservationRemainingMs,
  parseStoredReservations,
  removeReservationsByHashes,
  serializeReservations,
  upsertReservation,
  type PendingCollectionReservation
} from '../lib/collection-mint/reservations';

type CollectionMintScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mode?: 'mixed' | 'collection-only';
  sectionId?: string;
};

type StepState = 'idle' | 'pending' | 'done' | 'error';

type TxPayload = {
  txId: string;
};

type CollectionItem = {
  key: string;
  path: string;
  mimeType: string;
  totalBytes: number;
  totalChunks: number;
  chunks: Uint8Array[];
  expectedHash: Uint8Array;
  expectedHashHex: string;
  issues: string[];
  status: StepState;
};

type MintTarget = 'core' | 'collection';
type ReservationPresenceState = 'present' | 'missing' | 'error';

type CollectionContractStatus = {
  paused: boolean | null;
  mintPrice: bigint | null;
  activePhaseId: bigint | null;
  activePhaseMintPrice: bigint | null;
  reservationExpiryBlocks: bigint | null;
  allowlistEnabled: boolean | null;
  maxPerWallet: bigint | null;
  maxSupply: bigint | null;
  mintedCount: bigint | null;
  reservedCount: bigint | null;
  finalized: boolean | null;
  defaultDependencies: bigint[] | null;
};

const MAX_COLLECTION_ITEMS = 50;
const MAX_COLLECTION_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_COLLECTION_FILE_BYTES = 4 * 1024 * 1024;
const MAX_COLLECTION_ONLY_QUANTITY = 50;
const BATCH_OPTIONS = Array.from(
  { length: MAX_BATCH_SIZE },
  (_, index) => index + 1
);
const COLLECTION_RESERVATION_STORAGE_PREFIX = 'xtrata:collection-mint:reservations';
const STACKS_BLOCK_TARGET_MS = 10 * 60 * 1000;

const readFileBytes = async (file: File) => {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
};

const readResponseBytes = async (response: Response) => {
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

const isAscii = (value: string) => /^[\x00-\x7F]*$/.test(value);

const fileSortKey = (file: File) =>
  file.webkitRelativePath && file.webkitRelativePath.length > 0
    ? file.webkitRelativePath
    : file.name;

const compareFiles = (left: File, right: File) =>
  fileSortKey(left).localeCompare(fileSortKey(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  });

const formatTokenUriLabel = (value: string) =>
  value ? truncateMiddle(value, 12, 10) : 'Missing';

const formatStepStatus = (state: StepState) => {
  if (state === 'pending') {
    return 'In progress';
  }
  if (state === 'done') {
    return 'Complete';
  }
  if (state === 'error') {
    return 'Error';
  }
  return 'Idle';
};

const formatDurationLabel = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return formatRemainingMinutesSeconds(durationMs);
};

const parseMimeFromContentType = (headerValue: string | null) => {
  if (!headerValue) {
    return null;
  }
  const mime = headerValue.split(';')[0]?.trim() ?? '';
  if (!mime) {
    return null;
  }
  return mime;
};

const resolveNameFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const leaf = parts[parts.length - 1];
    return leaf && leaf.length > 0 ? leaf : parsed.hostname;
  } catch {
    return 'artist-asset';
  }
};

const normalizeQuantityInput = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed <= 0 || parsed > MAX_COLLECTION_ONLY_QUANTITY) {
    return null;
  }
  return parsed;
};

const hashHexToBuffer = (hashHex: string) => {
  const normalized = hashHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Invalid hash.');
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const MISSING_FUNCTION_PATTERN =
  /NoSuchPublicFunction|NoSuchContractFunction|does not exist|Unknown function/i;

const parseUintCv = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (parsed === null || parsed === undefined) {
    return null;
  }
  if (typeof parsed === 'string') {
    try {
      return BigInt(parsed);
    } catch {
      return null;
    }
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'value' in (parsed as Record<string, unknown>)
  ) {
    const inner = (parsed as { value?: string }).value;
    if (!inner) {
      return null;
    }
    try {
      return BigInt(inner);
    } catch {
      return null;
    }
  }
  if (typeof parsed === 'number') {
    return BigInt(Math.floor(parsed));
  }
  return null;
};

const isReadOnlyOptionalSome = (value: ClarityValue) => {
  const normalized = value.type === ClarityType.ResponseOk ? value.value : value;
  return normalized.type === ClarityType.OptionalSome;
};

const parseUintListCv = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (!Array.isArray(parsed)) {
    return null;
  }
  const values: bigint[] = [];
  for (const entry of parsed) {
    if (typeof entry === 'string') {
      try {
        values.push(BigInt(entry));
      } catch {
        return null;
      }
      continue;
    }
    if (typeof entry === 'number') {
      values.push(BigInt(Math.floor(entry)));
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

export default function CollectionMintScreen(props: CollectionMintScreenProps) {
  const usdPriceBook = useUsdPriceBook({
    enabled: !props.collapsed
  }).data ?? null;
  const isCollectionOnly = props.mode === 'collection-only';
  const sectionId =
    props.sectionId ?? (isCollectionOnly ? 'collection-mint-user' : 'collection-mint');
  const contractId = getContractId(props.contract);
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [mintLog, setMintLog] = useState<string[]>([]);
  const [mintPending, setMintPending] = useState(false);
  const [mintTarget, setMintTarget] = useState<MintTarget>(
    isCollectionOnly ? 'collection' : 'core'
  );
  const [collectionAddress, setCollectionAddress] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [collectionStatus, setCollectionStatus] =
    useState<CollectionContractStatus | null>(null);
  const [collectionStatusMessage, setCollectionStatusMessage] =
    useState<string | null>(null);
  const [collectionStatusLoading, setCollectionStatusLoading] = useState(false);
  const [dropManifestUrl, setDropManifestUrl] = useState('');
  const [dropQuantityInput, setDropQuantityInput] = useState('1');
  const [dropLoading, setDropLoading] = useState(false);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const [beginState, setBeginState] = useState<StepState>('idle');
  const [uploadState, setUploadState] = useState<StepState>('idle');
  const [sealState, setSealState] = useState<StepState>('idle');
  const [batchProgress, setBatchProgress] = useState<{
    itemIndex: number;
    itemCount: number;
    batchIndex: number;
    batchCount: number;
  } | null>(null);
  const [tokenUri, setTokenUri] = useState(DEFAULT_TOKEN_URI);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [txDelaySeconds, setTxDelaySeconds] = useState<number>(TX_DELAY_SECONDS);
  const [txDelayLabel, setTxDelayLabel] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingReservations, setPendingReservations] = useState<
    PendingCollectionReservation[]
  >([]);
  const [reservationBusy, setReservationBusy] = useState(false);
  const [reservationMessage, setReservationMessage] = useState<string | null>(null);
  const [reservationCountdownMs, setReservationCountdownMs] = useState<number | null>(
    null
  );
  const [reservationPresenceByHash, setReservationPresenceByHash] = useState<
    Record<string, ReservationPresenceState>
  >({});

  const adminStatusQuery = useContractAdminStatus({
    client,
    senderAddress: props.walletSession.address ?? props.contract.address
  });
  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const isPaused = adminStatusQuery.data?.paused ?? null;
  const isOwner =
    !!props.walletSession.address &&
    !!adminStatusQuery.data?.admin &&
    props.walletSession.address === adminStatusQuery.data.admin;
  const pauseBlocked = isPaused === true && !isOwner;

  const collectionContract = useMemo(() => {
    const address = collectionAddress.trim();
    const name = collectionName.trim();
    if (!address || !name) {
      return null;
    }
    if (!validateStacksAddress(address)) {
      return null;
    }
    if (!CONTRACT_NAME_PATTERN.test(name)) {
      return null;
    }
    return { address, contractName: name };
  }, [collectionAddress, collectionName]);

  const xtrataContractId = `${props.contract.address}.${props.contract.contractName}`;
  const reservationStorageKey = useMemo(() => {
    if (!isCollectionOnly) {
      return null;
    }
    const owner = props.walletSession.address?.trim();
    if (!owner || !collectionContract) {
      return null;
    }
    const collectionId = `${collectionContract.address}.${collectionContract.contractName}`.toLowerCase();
    return `${COLLECTION_RESERVATION_STORAGE_PREFIX}:${owner.toLowerCase()}:${collectionId}`;
  }, [collectionContract, isCollectionOnly, props.walletSession.address]);

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', 'true');
    folderInputRef.current.setAttribute('directory', 'true');
  }, []);

  useEffect(() => {
    if (!isCollectionOnly) {
      return;
    }
    if (mintTarget !== 'collection') {
      setMintTarget('collection');
    }
  }, [isCollectionOnly, mintTarget]);

  useEffect(() => {
    setCollectionStatus(null);
    setCollectionStatusMessage(null);
    setDropMessage(null);
    setReservationMessage(null);
  }, [collectionAddress, collectionName]);

  useEffect(() => {
    if (!reservationStorageKey || typeof window === 'undefined') {
      setPendingReservations([]);
      return;
    }
    const stored = window.localStorage.getItem(reservationStorageKey);
    setPendingReservations(parseStoredReservations(stored));
  }, [reservationStorageKey]);

  useEffect(() => {
    if (!reservationStorageKey || typeof window === 'undefined') {
      return;
    }
    if (pendingReservations.length === 0) {
      window.localStorage.removeItem(reservationStorageKey);
      return;
    }
    window.localStorage.setItem(
      reservationStorageKey,
      serializeReservations(pendingReservations)
    );
  }, [pendingReservations, reservationStorageKey]);

  const collectionReservationTimeoutMs = useMemo(() => {
    const expiryBlocks = collectionStatus?.reservationExpiryBlocks ?? null;
    if (expiryBlocks === null || expiryBlocks <= 0n) {
      return null;
    }
    const timeoutMs = expiryBlocks * BigInt(STACKS_BLOCK_TARGET_MS);
    if (timeoutMs > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(timeoutMs);
  }, [collectionStatus?.reservationExpiryBlocks]);

  const effectiveReservationTimeoutMs =
    collectionReservationTimeoutMs ?? COLLECTION_RESERVATION_TIMEOUT_MS;

  const reservationExpiryLabel = useMemo(() => {
    const expiryBlocks = collectionStatus?.reservationExpiryBlocks ?? null;
    if (expiryBlocks === null) {
      return `fallback ${formatDurationLabel(
        COLLECTION_RESERVATION_TIMEOUT_MS
      )} (load collection status for exact expiry)`;
    }
    if (expiryBlocks <= 0n) {
      return 'disabled (no expiry blocks configured)';
    }
    if (collectionReservationTimeoutMs === null) {
      return `${expiryBlocks.toString()} blocks`;
    }
    return `${expiryBlocks.toString()} blocks (~${formatDurationLabel(
      collectionReservationTimeoutMs
    )})`;
  }, [collectionReservationTimeoutMs, collectionStatus?.reservationExpiryBlocks]);

  useEffect(() => {
    if (!isCollectionOnly || pendingReservations.length === 0) {
      setReservationCountdownMs(null);
      return;
    }
    const tick = () => {
      setReservationCountdownMs(
        getSoonestReservationRemainingMs(
          pendingReservations,
          Date.now(),
          effectiveReservationTimeoutMs
        )
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [effectiveReservationTimeoutMs, isCollectionOnly, pendingReservations]);

  useEffect(() => {
    if (pendingReservations.length === 0) {
      setReservationPresenceByHash({});
      return;
    }
    setReservationPresenceByHash((prev) => {
      const next: Record<string, ReservationPresenceState> = {};
      pendingReservations.forEach((entry) => {
        const prior = prev[entry.hashHex];
        if (prior) {
          next[entry.hashHex] = prior;
        }
      });
      return next;
    });
  }, [pendingReservations]);

  useEffect(() => {
    if (!isCollectionOnly || pendingReservations.length === 0) {
      return;
    }
    if (reservationCountdownMs === 0) {
      setReservationMessage(
        `Reservation timeout reached (${reservationExpiryLabel}). Cancel pending reservations now to return items to supply.`
      );
    }
  }, [
    isCollectionOnly,
    pendingReservations.length,
    reservationCountdownMs,
    reservationExpiryLabel
  ]);

  const appendLog = (message: string) => {
    setMintLog((prev) => [...prev, message].slice(-50));
    // eslint-disable-next-line no-console
    console.log(`[collection-mint] ${message}`);
  };

  const clearSelection = () => {
    setItems([]);
    setMintStatus(null);
    setMintLog([]);
    setDropMessage(null);
    setReservationMessage(null);
    setBeginState('idle');
    setUploadState('idle');
    setSealState('idle');
    setBatchProgress(null);
  };

  const totalBytes = useMemo(
    () => items.reduce((sum, item) => sum + item.totalBytes, 0),
    [items]
  );
  const totalBytesReadable = formatBytes(BigInt(totalBytes));
  const totalBytesOverLimit = totalBytes > MAX_COLLECTION_TOTAL_BYTES;
  const countOverLimit = items.length > MAX_COLLECTION_ITEMS;
  const hasItemIssues = items.some((item) => item.issues.length > 0);
  const hasBlockingIssues = totalBytesOverLimit || countOverLimit || hasItemIssues;

  const feeUnitNumber = useMemo(() => {
    if (!adminStatusQuery.data?.feeUnitMicroStx) {
      return null;
    }
    const asNumber = Number(adminStatusQuery.data.feeUnitMicroStx);
    if (!Number.isSafeInteger(asNumber) || asNumber <= 0) {
      return null;
    }
    return asNumber;
  }, [adminStatusQuery.data?.feeUnitMicroStx]);
  const feeSchedule = useMemo(
    () => getFeeSchedule(props.contract, feeUnitNumber),
    [props.contract, feeUnitNumber]
  );
  const feeEstimate = useMemo(
    () =>
      estimateBatchContractFees({
        schedule: feeSchedule,
        totalChunks: items.map((item) => item.totalChunks)
      }),
    [feeSchedule, items]
  );
  const activeCollectionMintPrice =
    collectionStatus?.activePhaseMintPrice ?? collectionStatus?.mintPrice ?? null;
  const activeCollectionMintPriceLabel = formatMicroStxWithUsd(
    activeCollectionMintPrice,
    usdPriceBook
  ).combined;
  const feeUnitValue =
    feeSchedule.model === 'fee-unit' ? feeSchedule.feeUnitMicroStx : null;

  const tokenUriError = useMemo(() => {
    const trimmed = tokenUri.trim();
    if (!trimmed) {
      return null;
    }
    if (!isAscii(trimmed) || trimmed.length > MAX_TOKEN_URI_LENGTH) {
      return 'Token URI must be ASCII and <= 256 characters.';
    }
    return null;
  }, [tokenUri]);

  const requestContractCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
    contractAddress?: string;
    contractName?: string;
    logDetails?: Record<string, unknown>;
    postConditionMode?: PostConditionMode;
    postConditions?: PostCondition[];
  }) => {
    const network = props.walletSession.network ?? props.contract.network;
    const stxAddress = props.walletSession.address;
    logInfo('mint', 'Requesting collection contract call', {
      contractId,
      functionName: options.functionName,
      network,
      sender: stxAddress ?? null,
      ...(options.logDetails ?? {})
    });
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: options.contractAddress ?? props.contract.address,
        contractName: options.contractName ?? props.contract.contractName,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network,
        stxAddress,
        postConditionMode: options.postConditionMode ?? PostConditionMode.Deny,
        postConditions: options.postConditions,
        onFinish: (payload) => {
          const resolved = payload as TxPayload;
          logInfo('mint', 'Collection contract call broadcast', {
            contractId,
            functionName: options.functionName,
            txId: resolved.txId
          });
          resolve(resolved);
        },
        onCancel: () => {
          logWarn('mint', 'Collection contract call cancelled', {
            contractId,
            functionName: options.functionName
          });
          reject(new Error('Wallet cancelled or failed to broadcast.'));
        }
      });
    });
  };

  const resolveFeePostConditions = (amountMicroStx: number) => {
    const sender = props.walletSession.address;
    if (!sender || !Number.isFinite(amountMicroStx) || amountMicroStx < 0) {
      return undefined;
    }
    const amount = BigInt(Math.round(amountMicroStx));
    const royaltyRecipient = adminStatusQuery.data?.royaltyRecipient ?? null;
    const conditionCode =
      !royaltyRecipient || royaltyRecipient === sender
        ? FungibleConditionCode.LessEqual
        : FungibleConditionCode.Equal;
    return [
      makeStandardSTXPostCondition(sender, conditionCode, amount)
    ] as PostCondition[];
  };

  const resolveCollectionBeginPostConditions = () =>
    (() => {
      const beginSpendCap = resolveCollectionBeginSpendCapMicroStx({
        protocolFeeMicroStx: BigInt(feeSchedule.feeUnitMicroStx)
      });
      if (beginSpendCap === null) {
        return null;
      }
      return buildMintBeginStxPostConditions({
        sender: props.walletSession.address ?? null,
        mintPrice: beginSpendCap
      });
    })();
  const resolveCollectionSealPostConditions = (totalChunks: number) =>
    buildCollectionSealStxPostConditions({
      sender: props.walletSession.address ?? null,
      mintPrice:
        collectionStatus?.activePhaseMintPrice ?? collectionStatus?.mintPrice ?? null,
      activePhaseMintPrice: collectionStatus?.activePhaseMintPrice ?? null,
      protocolFeeMicroStx: BigInt(feeSchedule.feeUnitMicroStx),
      totalChunks
    });
  const resolveCollectionBatchSealPostConditions = (totalChunks: number[]) =>
    buildCollectionBatchSealStxPostConditions({
      sender: props.walletSession.address ?? null,
      mintPrice:
        collectionStatus?.activePhaseMintPrice ?? collectionStatus?.mintPrice ?? null,
      activePhaseMintPrice: collectionStatus?.activePhaseMintPrice ?? null,
      protocolFeeMicroStx: BigInt(feeSchedule.feeUnitMicroStx),
      totalChunks
    });
  const collectionMintBeginSpendCap = resolveCollectionBeginSpendCapMicroStx({
    protocolFeeMicroStx: BigInt(feeSchedule.feeUnitMicroStx)
  });
  const collectionSealBatchSpendCap = resolveCollectionBatchSealSpendCapMicroStx({
    mintPrice:
      collectionStatus?.activePhaseMintPrice ?? collectionStatus?.mintPrice ?? null,
    activePhaseMintPrice: collectionStatus?.activePhaseMintPrice ?? null,
    protocolFeeMicroStx: BigInt(feeSchedule.feeUnitMicroStx),
    totalChunks: items.map((item) => item.totalChunks)
  });
  const collectionSealSingleSpendCap = resolveCollectionSealSpendCapMicroStx({
    mintPrice:
      collectionStatus?.activePhaseMintPrice ?? collectionStatus?.mintPrice ?? null,
    activePhaseMintPrice: collectionStatus?.activePhaseMintPrice ?? null,
    protocolFeeMicroStx: BigInt(feeSchedule.feeUnitMicroStx),
    totalChunks: 1
  });

  const pauseBeforeNextTx = async (label: string) => {
    if (!txDelaySeconds || txDelaySeconds <= 0) {
      return;
    }
    setTxDelayLabel(label);
    for (let remaining = txDelaySeconds; remaining > 0; remaining -= 1) {
      setCountdown(remaining);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(null);
    setTxDelayLabel(null);
  };

  const buildIssues = (nextItems: CollectionItem[]) => {
    const hashCounts = new Map<string, number>();
    nextItems.forEach((item) => {
      hashCounts.set(
        item.expectedHashHex,
        (hashCounts.get(item.expectedHashHex) ?? 0) + 1
      );
    });
    return nextItems.map((item) => {
      const issues: string[] = [];
      if (item.totalBytes > MAX_COLLECTION_FILE_BYTES) {
        issues.push(
          `File exceeds ${formatBytes(BigInt(MAX_COLLECTION_FILE_BYTES))}.`
        );
      }
      if (item.totalBytes === 0 || item.totalChunks === 0) {
        issues.push('File is empty.');
      }
      if (!isAscii(item.mimeType) || item.mimeType.length > MAX_MIME_LENGTH) {
        issues.push('Mime type must be ASCII and <= 64 characters.');
      }
      if ((hashCounts.get(item.expectedHashHex) ?? 0) > 1) {
        issues.push('Duplicate hash in batch.');
      }
      return { ...item, issues };
    });
  };

  const buildCollectionItemFromBytes = (params: {
    keyPrefix: string;
    path: string;
    bytes: Uint8Array;
    mimeType: string;
    index: number;
  }): CollectionItem => {
    const chunks = chunkBytes(params.bytes);
    const expectedHash = computeExpectedHash(chunks);
    const expectedHashHex = bytesToHex(expectedHash);
    return {
      key: `${params.keyPrefix}-${expectedHashHex}-${params.index}`,
      path: params.path,
      mimeType: params.mimeType,
      totalBytes: params.bytes.length,
      totalChunks: chunks.length,
      chunks,
      expectedHash,
      expectedHashHex,
      issues: [],
      status: 'idle'
    };
  };

  const buildCollectionItems = async (files: File[]) => {
    const sorted = [...files].sort(compareFiles);
    const nextItems: CollectionItem[] = [];
    for (const file of sorted) {
      const bytes = await readFileBytes(file);
      const mimeType = file.type || 'application/octet-stream';
      nextItems.push({
        ...buildCollectionItemFromBytes({
          keyPrefix: file.name,
          path: fileSortKey(file),
          bytes,
          mimeType,
          index: nextItems.length
        })
      });
    }
    return buildIssues(nextItems);
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }
    setIsPreparing(true);
    setMintStatus(null);
    setMintLog([]);
    setBeginState('idle');
    setUploadState('idle');
    setSealState('idle');
    setBatchProgress(null);
    try {
      const files = Array.from(fileList);
      const prepared = await buildCollectionItems(files);
      setItems(prepared);
      appendLog(`Loaded ${prepared.length} collection item(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintStatus(`Failed to read files: ${message}`);
      logWarn('mint', 'Collection file read failed', { error: message });
    } finally {
      setIsPreparing(false);
    }
  };

  const loadRandomDropItems = async () => {
    const manifestUrl = dropManifestUrl.trim();
    if (!manifestUrl) {
      setDropMessage('Enter a drop manifest URL.');
      return;
    }
    let parsedManifestUrl: URL;
    try {
      parsedManifestUrl = new URL(manifestUrl);
    } catch {
      setDropMessage('Enter a valid manifest URL.');
      return;
    }
    if (
      parsedManifestUrl.protocol !== 'https:' &&
      parsedManifestUrl.protocol !== 'http:'
    ) {
      setDropMessage('Manifest URL must use http or https.');
      return;
    }
    const quantity = normalizeQuantityInput(dropQuantityInput);
    if (quantity === null) {
      setDropMessage(`Quantity must be 1 to ${MAX_COLLECTION_ONLY_QUANTITY}.`);
      return;
    }

    setIsPreparing(true);
    setDropLoading(true);
    setDropMessage(null);
    setMintStatus(null);
    setMintLog([]);
    setBeginState('idle');
    setUploadState('idle');
    setSealState('idle');
    setBatchProgress(null);
    try {
      const manifestResponse = await fetch(parsedManifestUrl.toString(), {
        method: 'GET',
        cache: 'no-store'
      });
      if (!manifestResponse.ok) {
        throw new Error(`Manifest request failed (${manifestResponse.status}).`);
      }
      const manifestRaw = (await manifestResponse.json()) as unknown;
      const parsedManifest = parseRandomDropManifest(manifestRaw);
      if (parsedManifest.errors.length > 0) {
        throw new Error(parsedManifest.errors[0]);
      }
      const selectedAssets = selectRandomDropAssets(
        parsedManifest.assets,
        quantity
      );
      if (selectedAssets.length < quantity) {
        throw new Error(
          `Manifest only has ${selectedAssets.length} valid assets for quantity ${quantity}.`
        );
      }
      const nextItems: CollectionItem[] = [];
      for (let index = 0; index < selectedAssets.length; index += 1) {
        const asset = selectedAssets[index];
        const response = await fetch(asset.url, {
          method: 'GET',
          cache: 'no-store'
        });
        if (!response.ok) {
          throw new Error(
            `Drop asset ${index + 1} failed to load (${response.status}).`
          );
        }
        const bytes = await readResponseBytes(response);
        const mimeType =
          asset.mimeType ||
          parseMimeFromContentType(response.headers.get('content-type')) ||
          'application/octet-stream';
        nextItems.push(
          buildCollectionItemFromBytes({
            keyPrefix: resolveNameFromUrl(asset.url),
            path: `Random item ${index + 1}`,
            bytes,
            mimeType,
            index
          })
        );
      }
      const prepared = buildIssues(nextItems);
      setItems(prepared);
      setDropMessage(`Prepared ${prepared.length} random mint item(s).`);
      appendLog(
        `Prepared ${prepared.length} random mint item(s) from ${parsedManifestUrl.toString()}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDropMessage(`Failed to prepare random mint items: ${message}`);
      logWarn('mint', 'Collection random drop load failed', {
        manifestUrl,
        error: message
      });
    } finally {
      setIsPreparing(false);
      setDropLoading(false);
    }
  };

  const removeItem = (key: string) => {
    setItems((prev) => buildIssues(prev.filter((item) => item.key !== key)));
  };

  const checkCollectionReservationOnChain = async (
    owner: string,
    hashHex: string
  ) => {
    if (!collectionContract) {
      throw new Error('Set collection contract first.');
    }
    try {
      const network = toStacksNetwork(props.contract.network);
      const result = await callReadOnlyFunction({
        contractAddress: collectionContract.address,
        contractName: collectionContract.contractName,
        functionName: 'get-reservation',
        functionArgs: [principalCV(owner), bufferCV(hashHexToBuffer(hashHex))],
        senderAddress: owner,
        network
      });
      const present = isReadOnlyOptionalSome(result);
      setReservationPresenceByHash((prev) => ({
        ...prev,
        [hashHex]: present ? 'present' : 'missing'
      }));
      return present;
    } catch (error) {
      setReservationPresenceByHash((prev) => ({
        ...prev,
        [hashHex]: 'error'
      }));
      throw error;
    }
  };

  const refreshPendingReservations = async () => {
    if (!collectionContract || !props.walletSession.address) {
      setReservationMessage('Set collection contract and connect wallet first.');
      return;
    }
    if (pendingReservations.length === 0) {
      setReservationMessage('No pending reservations to refresh.');
      return;
    }
    setReservationBusy(true);
    setReservationMessage(null);
    try {
      const owner = props.walletSession.address;
      const checks = await Promise.all(
        pendingReservations.map(async (entry) => {
          const present = await checkCollectionReservationOnChain(
            owner,
            entry.hashHex
          );
          return { entry, present };
        })
      );
      const active = checks.filter((entry) => entry.present).map((entry) => entry.entry);
      setPendingReservations(active);
      const releasedCount = checks.length - active.length;
      setReservationMessage(
        releasedCount > 0
          ? `Removed ${releasedCount} reservation(s) that are no longer active on-chain.`
          : 'All pending reservations are still active.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReservationMessage(`Failed to refresh reservations: ${message}`);
      setReservationPresenceByHash((prev) => {
        const next = { ...prev };
        pendingReservations.forEach((entry) => {
          next[entry.hashHex] = 'error';
        });
        return next;
      });
      logWarn('mint', 'Collection reservation refresh failed', { error: message });
    } finally {
      setReservationBusy(false);
    }
  };

  const cancelPendingReservations = async () => {
    if (!collectionContract || !props.walletSession.address) {
      setReservationMessage('Set collection contract and connect wallet first.');
      return;
    }
    if (pendingReservations.length === 0) {
      setReservationMessage('No pending reservations to cancel.');
      return;
    }
    setReservationBusy(true);
    setReservationMessage(null);
    const failed: string[] = [];
    try {
      for (let index = 0; index < pendingReservations.length; index += 1) {
        const reservation = pendingReservations[index];
        try {
          const cancelTx = await requestContractCall({
            functionName: 'cancel-reservation',
            functionArgs: [bufferCV(hashHexToBuffer(reservation.hashHex))],
            contractAddress: collectionContract.address,
            contractName: collectionContract.contractName,
            logDetails: {
              hash: reservation.hashHex,
              index: index + 1,
              total: pendingReservations.length
            }
          });
          appendLog(
            `Cancel reservation tx sent (${cancelTx.txId}) for ${reservation.itemLabel}.`
          );
          setPendingReservations((prev) =>
            removeReservationsByHashes(prev, [reservation.hashHex])
          );
          if (index < pendingReservations.length - 1) {
            await pauseBeforeNextTx('Next cancel in');
          }
        } catch (error) {
          failed.push(reservation.hashHex);
          const message = error instanceof Error ? error.message : String(error);
          logWarn('mint', 'Collection reservation cancel failed', {
            hash: reservation.hashHex,
            error: message
          });
        }
      }
      if (failed.length === 0) {
        setReservationMessage('All pending reservations were cancelled.');
      } else {
        setReservationMessage(
          `Cancelled ${
            pendingReservations.length - failed.length
          }/${pendingReservations.length} reservations.`
        );
      }
    } finally {
      setReservationBusy(false);
    }
  };

  const loadCollectionStatus = async () => {
    if (!collectionContract) {
      setCollectionStatusMessage('Enter a valid collection contract first.');
      return;
    }
    setCollectionStatusLoading(true);
    setCollectionStatusMessage(null);
    try {
      const network = toStacksNetwork(props.contract.network);
      const sender = props.walletSession.address ?? props.contract.address;
      const readOnly = (functionName: string) =>
        callReadOnlyFunction({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName,
          functionArgs: [],
          senderAddress: sender,
          network
        }).then((result) => {
          if (result.type === ClarityType.ResponseOk) {
            return result.value;
          }
          if (result.type === ClarityType.ResponseErr) {
            throw new Error('Read-only error.');
          }
          return result;
        });

      const defaultDependenciesPromise = readOnly('get-default-dependencies')
        .then((value) => parseUintListCv(value) ?? [])
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (MISSING_FUNCTION_PATTERN.test(message)) {
            return [];
          }
          throw error;
        });

      const [
        pausedCv,
        priceCv,
        reservationExpiryCv,
        allowlistCv,
        maxPerWalletCv,
        maxSupplyCv,
        mintedCv,
        reservedCv,
        finalizedCv,
        defaultDependencies
      ] = await Promise.all([
        readOnly('is-paused'),
        readOnly('get-mint-price'),
        readOnly('get-reservation-expiry-blocks'),
        readOnly('get-allowlist-enabled'),
        readOnly('get-max-per-wallet'),
        readOnly('get-max-supply'),
        readOnly('get-minted-count'),
        readOnly('get-reserved-count'),
        readOnly('get-finalized'),
        defaultDependenciesPromise
      ]);
      const activePhaseCv = await readOnly('get-active-phase');
      const activePhaseId = parseUintCv(activePhaseCv);
      let activePhaseMintPrice: bigint | null = null;
      if (activePhaseId !== null && activePhaseId > 0n) {
        const phaseCv = await callReadOnlyFunction({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName: 'get-phase',
          functionArgs: [uintCV(activePhaseId)],
          senderAddress: sender,
          network
        });
        const phaseValue = phaseCv.type === ClarityType.ResponseOk ? phaseCv.value : phaseCv;
        if (phaseValue.type === ClarityType.OptionalSome) {
          const tuple = phaseValue.value;
          if (tuple.type === ClarityType.Tuple) {
            const priceEntry = tuple.data['mint-price'];
            if (priceEntry) {
              activePhaseMintPrice = parseUintCv(priceEntry);
            }
          }
        }
      }

      setCollectionStatus({
        paused: Boolean(cvToValue(pausedCv)),
        mintPrice: parseUintCv(priceCv),
        activePhaseId,
        activePhaseMintPrice,
        reservationExpiryBlocks: parseUintCv(reservationExpiryCv),
        allowlistEnabled: Boolean(cvToValue(allowlistCv)),
        maxPerWallet: parseUintCv(maxPerWalletCv),
        maxSupply: parseUintCv(maxSupplyCv),
        mintedCount: parseUintCv(mintedCv),
        reservedCount: parseUintCv(reservedCv),
        finalized: Boolean(cvToValue(finalizedCv)),
        defaultDependencies
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCollectionStatusMessage(`Failed to load collection status: ${message}`);
    } finally {
      setCollectionStatusLoading(false);
    }
  };

  const fetchCollectionDefaultDependencies = async () => {
    if (!collectionContract) {
      return [] as bigint[];
    }
    const network = toStacksNetwork(props.contract.network);
    const sender = props.walletSession.address ?? props.contract.address;
    try {
      const result = await callReadOnlyFunction({
        contractAddress: collectionContract.address,
        contractName: collectionContract.contractName,
        functionName: 'get-default-dependencies',
        functionArgs: [],
        senderAddress: sender,
        network
      });
      const value = result.type === ClarityType.ResponseOk ? result.value : result;
      return parseUintListCv(value) ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (MISSING_FUNCTION_PATTERN.test(message)) {
        return [];
      }
      throw error;
    }
  };

  const startBatchMint = async () => {
    if (mintPending || isPreparing || reservationBusy) {
      return;
    }
    if (!props.walletSession.address) {
      setMintStatus('Connect a wallet to batch mint.');
      return;
    }
    if (mismatch) {
      setMintStatus(`Switch wallet to ${mismatch.expected} to batch mint.`);
      return;
    }
    if (mintTarget === 'collection' && !collectionContract) {
      setMintStatus('Enter a valid collection contract to continue.');
      return;
    }
    if (mintTarget === 'collection' && pendingReservations.length > 0) {
      setMintStatus(
        'You have pending reservations from a previous attempt. Cancel or complete them before starting another mint.'
      );
      return;
    }
    if (mintTarget === 'collection' && collectionStatus?.finalized) {
      setMintStatus('Collection contract is finalized. Minting is locked.');
      return;
    }
    if (mintTarget === 'collection' && collectionStatus?.paused) {
      setMintStatus('Collection contract is paused.');
      return;
    }
    if (mintTarget === 'core' && pauseBlocked) {
      setMintStatus('Contract is paused. Only the owner can mint.');
      return;
    }
    if (items.length === 0) {
      setMintStatus(
        isCollectionOnly
          ? 'Prepare random mint items before starting.'
          : 'Select files before starting the batch.'
      );
      return;
    }
    if (countOverLimit) {
      setMintStatus(`Limit exceeded: max ${MAX_COLLECTION_ITEMS} items.`);
      return;
    }
    if (totalBytesOverLimit) {
      setMintStatus(
        `Collection too large. Max ${formatBytes(
          BigInt(MAX_COLLECTION_TOTAL_BYTES)
        )}.`
      );
      return;
    }
    if (hasItemIssues) {
      setMintStatus('Fix the file issues before batch minting.');
      return;
    }
    let tokenUriValue = tokenUri.trim();
    if (!tokenUriValue) {
      tokenUriValue = DEFAULT_TOKEN_URI;
      setTokenUri(tokenUriValue);
      appendLog('Token URI default applied.');
    }
    if (!isAscii(tokenUriValue) || tokenUriValue.length > MAX_TOKEN_URI_LENGTH) {
      setMintStatus('Token URI must be ASCII and <= 256 characters.');
      appendLog('Batch mint blocked: invalid token URI.');
      return;
    }
    setMintPending(true);
    setMintStatus(null);
    setReservationMessage(null);
    setBeginState('pending');
    setUploadState('pending');
    setSealState('idle');
    appendLog(
      `Starting batch mint (${items.length} items) using ${
        mintTarget === 'collection' ? 'collection contract' : 'core contract'
      }.`
    );

    try {
      const walletAddress = props.walletSession.address ?? null;
      if (!walletAddress) {
        throw new Error('Connect a wallet before starting batch mint.');
      }
      const itemsToSeal: CollectionItem[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setItems((prev) =>
          prev.map((entry, idx) =>
            idx === index ? { ...entry, status: 'pending' } : entry
          )
        );
        const sealedTokenId = await client.getIdByHash(
          item.expectedHash,
          walletAddress
        );
        if (sealedTokenId !== null) {
          appendLog(
            `Item ${index + 1}/${items.length}: already sealed as token #${sealedTokenId.toString()}. Skipping.`
          );
          setItems((prev) =>
            prev.map((entry, idx) =>
              idx === index ? { ...entry, status: 'done' } : entry
            )
          );
          continue;
        }

        let uploadStartIndex = 0;
        const existingUploadState = await client.getUploadState(
          item.expectedHash,
          walletAddress,
          walletAddress
        );
        if (existingUploadState) {
          const expectedSize = BigInt(item.totalBytes);
          const expectedChunks = BigInt(item.totalChunks);
          if (
            existingUploadState.mimeType !== item.mimeType ||
            existingUploadState.totalSize !== expectedSize ||
            existingUploadState.totalChunks !== expectedChunks
          ) {
            throw new Error(
              `Item ${item.path} does not match the on-chain upload session. Clear the old session before retrying.`
            );
          }
          const onChainIndex = Number(existingUploadState.currentIndex);
          if (!Number.isSafeInteger(onChainIndex) || onChainIndex < 0) {
            throw new Error(`Item ${item.path} has an invalid on-chain upload index.`);
          }
          if (onChainIndex > item.totalChunks) {
            throw new Error(
              `Item ${item.path} on-chain index exceeds expected chunk count.`
            );
          }
          uploadStartIndex = onChainIndex;
          if (uploadStartIndex >= item.totalChunks) {
            appendLog(
              `Item ${index + 1}/${items.length}: upload already complete (${uploadStartIndex}/${item.totalChunks}).`
            );
          } else {
            appendLog(
              `Item ${index + 1}/${items.length}: resuming upload from chunk ${uploadStartIndex + 1}/${item.totalChunks}.`
            );
          }
          if (mintTarget === 'collection') {
            const reservationPresent = await checkCollectionReservationOnChain(
              walletAddress,
              item.expectedHashHex
            );
            if (!reservationPresent) {
              throw new Error(
                `Item ${item.path} has on-chain upload data but no active collection reservation. Use cancel/release, then restart this item.`
              );
            }
            appendLog(
              `Item ${index + 1}/${items.length}: reservation is active on-chain.`
            );
          }
        } else {
          appendLog(`Item ${index + 1}/${items.length}: begin inscription.`);
          const beginPostConditions =
            mintTarget === 'collection'
              ? resolveCollectionBeginPostConditions()
              : resolveFeePostConditions(feeSchedule.feeUnitMicroStx);
          if (mintTarget === 'collection' && !beginPostConditions) {
            throw new Error(
              'Collection mint pricing data is unavailable for wallet safety checks. Load collection status and retry.'
            );
          }
          const beginTx = await requestContractCall({
            functionName:
              mintTarget === 'collection' ? 'mint-begin' : 'begin-inscription',
            functionArgs:
              mintTarget === 'collection'
                ? [
                    principalCV(xtrataContractId),
                    bufferCV(item.expectedHash),
                    stringAsciiCV(item.mimeType),
                    uintCV(BigInt(item.totalBytes)),
                    uintCV(BigInt(item.totalChunks))
                  ]
                : [
                    bufferCV(item.expectedHash),
                    stringAsciiCV(item.mimeType),
                    uintCV(BigInt(item.totalBytes)),
                    uintCV(BigInt(item.totalChunks))
                  ],
            contractAddress:
              mintTarget === 'collection' ? collectionContract?.address : undefined,
            contractName:
              mintTarget === 'collection' ? collectionContract?.contractName : undefined,
            postConditionMode: PostConditionMode.Deny,
            postConditions: beginPostConditions ?? undefined,
            logDetails: {
              item: item.path,
              bytes: item.totalBytes,
              chunks: item.totalChunks
            }
          });
          appendLog(`Begin tx sent (${beginTx.txId}).`);
          if (mintTarget === 'collection') {
            setPendingReservations((prev) =>
              upsertReservation(prev, {
                hashHex: item.expectedHashHex,
                itemLabel: item.path,
                startedAtMs: Date.now()
              })
            );
          }
          await pauseBeforeNextTx('Next batch in');
          if (mintTarget === 'collection') {
            const reservationPresent = await checkCollectionReservationOnChain(
              walletAddress,
              item.expectedHashHex
            );
            appendLog(
              reservationPresent
                ? `Item ${index + 1}/${items.length}: reservation confirmed on-chain.`
                : `Item ${index + 1}/${items.length}: reservation not visible yet. Continue only if uploads succeed; otherwise refresh/cancel reservations.`
            );
          }
        }

        const remainingChunks = item.chunks.slice(uploadStartIndex);
        const batches = batchChunks(remainingChunks, batchSize);
        const totalBatches = batches.length;
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
          const batch = batches[batchIndex];
          const batchBytes = batch.reduce((sum, chunk) => sum + chunk.length, 0);
          setBatchProgress({
            itemIndex: index + 1,
            itemCount: items.length,
            batchIndex: batchIndex + 1,
            batchCount: totalBatches
          });
          appendLog(
            `Item ${index + 1}/${items.length}: upload batch ${batchIndex + 1}/${totalBatches}.`
          );
          const uploadTx = await requestContractCall({
            functionName:
              mintTarget === 'collection'
                ? 'mint-add-chunk-batch'
                : 'add-chunk-batch',
            functionArgs:
              mintTarget === 'collection'
                ? [
                    principalCV(xtrataContractId),
                    bufferCV(item.expectedHash),
                    listCV(batch.map((chunk) => bufferCV(chunk)))
                  ]
                : [
                    bufferCV(item.expectedHash),
                    listCV(batch.map((chunk) => bufferCV(chunk)))
                  ],
            contractAddress:
              mintTarget === 'collection' ? collectionContract?.address : undefined,
            contractName:
              mintTarget === 'collection'
                ? collectionContract?.contractName
                : undefined,
            postConditionMode: PostConditionMode.Deny,
            postConditions: undefined,
            logDetails: {
              item: item.path,
              batchIndex: batchIndex + 1,
              batchBytes
            }
          });
          appendLog(`Batch tx sent (${uploadTx.txId}).`);
          if (batchIndex < totalBatches - 1 || index < items.length - 1) {
            await pauseBeforeNextTx('Next batch in');
          } else {
            await pauseBeforeNextTx('Seal in');
          }
        }
        if (totalBatches === 0) {
          appendLog(
            `Item ${index + 1}/${items.length}: no upload batches required.`
          );
        }
        itemsToSeal.push(item);
        setItems((prev) =>
          prev.map((entry, idx) =>
            idx === index ? { ...entry, status: 'done' } : entry
          )
        );
      }

      setBeginState('done');
      setUploadState('done');
      if (itemsToSeal.length === 0) {
        setSealState('done');
        setMintStatus(
          'All selected files are already sealed on-chain. No new mint transactions were required.'
        );
        appendLog('Nothing left to seal. Batch already completed on-chain.');
        return;
      }
      if (itemsToSeal.length < items.length) {
        appendLog(
          `Skipping ${items.length - itemsToSeal.length} already sealed item(s); sealing ${itemsToSeal.length}.`
        );
      }
      if (mintTarget === 'collection') {
        const reservationChecks = await Promise.all(
          itemsToSeal.map(async (item) => ({
            item,
            present: await checkCollectionReservationOnChain(
              walletAddress,
              item.expectedHashHex
            )
          }))
        );
        const missing = reservationChecks.filter((entry) => !entry.present);
        if (missing.length > 0) {
          throw new Error(
            `Reservation missing on-chain for ${missing.length}/${itemsToSeal.length} item(s). Refresh reservations and retry before sealing.`
          );
        }
        appendLog(
          `Reservation check complete: ${reservationChecks.length}/${reservationChecks.length} active on-chain.`
        );
      }
      setSealState('pending');
      let collectionDefaultDependencies: bigint[] = [];
      if (mintTarget === 'collection') {
        collectionDefaultDependencies = await fetchCollectionDefaultDependencies();
        setCollectionStatus((prev) =>
          prev ? { ...prev, defaultDependencies: collectionDefaultDependencies } : prev
        );
      }
      const useSequentialCollectionSeal =
        mintTarget === 'collection' && collectionDefaultDependencies.length > 0;
      if (useSequentialCollectionSeal) {
        appendLog(
          `Default dependencies detected (${collectionDefaultDependencies.length}). Sealing items one-by-one so dependencies are auto-applied.`
        );
        for (let index = 0; index < itemsToSeal.length; index += 1) {
          const item = itemsToSeal[index];
          const sealPostConditions = resolveCollectionSealPostConditions(
            item.totalChunks
          );
          if (!sealPostConditions) {
            throw new Error(
              'Collection seal fee safety cap could not be calculated from chunk count.'
            );
          }
          const sealTx = await requestContractCall({
            functionName: 'mint-seal',
            functionArgs: [
              principalCV(xtrataContractId),
              bufferCV(item.expectedHash),
              stringAsciiCV(tokenUriValue)
            ],
            contractAddress: collectionContract?.address,
            contractName: collectionContract?.contractName,
            postConditionMode: PostConditionMode.Deny,
            postConditions: sealPostConditions ?? undefined,
            logDetails: {
              item: item.path,
              itemIndex: index + 1,
              itemCount: itemsToSeal.length,
              tokenUriLength: tokenUriValue.length
            }
          });
          appendLog(
            `Seal tx sent (${sealTx.txId}) for item ${index + 1}/${itemsToSeal.length}.`
          );
          if (index < itemsToSeal.length - 1) {
            await pauseBeforeNextTx('Next seal in');
          }
        }
      } else {
        const sealPostConditions =
          mintTarget === 'collection'
            ? resolveCollectionBatchSealPostConditions(
                itemsToSeal.map((item) => item.totalChunks)
              )
            : resolveFeePostConditions(feeEstimate.sealMicroStx);
        if (mintTarget === 'collection' && !sealPostConditions) {
          throw new Error(
            'Collection batch seal fee safety cap could not be calculated from chunk counts.'
          );
        }
        appendLog(`Submitting batch seal transaction (${itemsToSeal.length} item(s)).`);
        const sealTx = await requestContractCall({
          functionName:
            mintTarget === 'collection'
              ? 'mint-seal-batch'
              : 'seal-inscription-batch',
          functionArgs:
            mintTarget === 'collection'
              ? [
                  principalCV(xtrataContractId),
                  listCV(
                    itemsToSeal.map((item) =>
                      tupleCV({
                        hash: bufferCV(item.expectedHash),
                        'token-uri': stringAsciiCV(tokenUriValue)
                      })
                    )
                  )
                ]
              : [
                  listCV(
                    itemsToSeal.map((item) =>
                      tupleCV({
                        hash: bufferCV(item.expectedHash),
                        'token-uri': stringAsciiCV(tokenUriValue)
                      })
                    )
                  )
                ],
          contractAddress:
            mintTarget === 'collection' ? collectionContract?.address : undefined,
          contractName:
            mintTarget === 'collection' ? collectionContract?.contractName : undefined,
          postConditionMode: PostConditionMode.Deny,
          postConditions: sealPostConditions ?? undefined,
          logDetails: {
            itemCount: itemsToSeal.length,
            tokenUriLength: tokenUriValue.length
          }
        });
        appendLog(`Batch seal tx sent (${sealTx.txId}).`);
      }
      if (mintTarget === 'collection') {
        setPendingReservations((prev) =>
          removeReservationsByHashes(
            prev,
            itemsToSeal.map((item) => item.expectedHashHex)
          )
        );
      }
      setSealState('done');
      setMintStatus(
        useSequentialCollectionSeal
          ? 'Sequential seal transactions submitted with default dependencies.'
          : 'Batch seal submitted. IDs will mint sequentially.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintStatus(`Batch mint failed: ${message}`);
      if (mintTarget === 'collection') {
        setReservationMessage(
          `Mint did not complete. Cancel pending reservations before expiry (${reservationExpiryLabel}) to unlock supply.`
        );
      }
      setItems((prev) =>
        prev.map((item) =>
          item.status === 'pending' ? { ...item, status: 'error' } : item
        )
      );
      setBeginState((prev) => (prev === 'pending' ? 'error' : prev));
      setUploadState((prev) => (prev === 'pending' ? 'error' : prev));
      setSealState((prev) => (prev === 'pending' ? 'error' : prev));
      logWarn('mint', 'Batch mint failed', { error: message });
    } finally {
      setMintPending(false);
      setBatchProgress(null);
      setCountdown(null);
      setTxDelayLabel(null);
    }
  };

  const tokenUriLabel = formatTokenUriLabel(tokenUri.trim() || DEFAULT_TOKEN_URI);
  const collectionLimitLabel = formatBytes(BigInt(MAX_COLLECTION_TOTAL_BYTES));
  const itemLimitLabel = formatBytes(BigInt(MAX_COLLECTION_FILE_BYTES));
  const reservationStatusCounts = useMemo(() => {
    return pendingReservations.reduce(
      (acc, entry) => {
        const status = reservationPresenceByHash[entry.hashHex] ?? null;
        if (status === 'present') {
          acc.present += 1;
        } else if (status === 'missing') {
          acc.missing += 1;
        } else if (status === 'error') {
          acc.error += 1;
        } else {
          acc.unknown += 1;
        }
        return acc;
      },
      { present: 0, missing: 0, error: 0, unknown: 0 }
    );
  }, [pendingReservations, reservationPresenceByHash]);
  const hasCollectionDefaultDependencies =
    (collectionStatus?.defaultDependencies?.length ?? 0) > 0;

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id={sectionId}
    >
      <div className="panel__header">
        <div>
          <h2>{isCollectionOnly ? 'Collection mint (user)' : 'Batch mint'}</h2>
          <p>
            {isCollectionOnly
              ? 'Random collection mint: choose quantity, prepare unseen items from the artist drop manifest, then begin, upload, and seal.'
              : 'Batch upload up to 50 items, then seal them in one transaction.'}
          </p>
          {!isCollectionOnly && (
            <>
              <p className="meta-value">
                Choose whether to mint directly into the core contract or via a
                partner collection contract.
              </p>
              <p className="meta-value">
                Use Collection mint admin to configure partner collection contracts.
              </p>
            </>
          )}
          {isCollectionOnly && (
            <p className="meta-value">
              Users do not upload their own files in this flow. Mints are random and unseen until sealed.
            </p>
          )}
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
          <span className="meta-label">
            {isCollectionOnly ? 'Collection contract' : 'Mint target'}
          </span>
          {!isCollectionOnly && (
            <div className="meta-grid meta-grid--dense">
              <label className="field">
                <span className="field__label">Target</span>
                <select
                  className="select"
                  value={mintTarget}
                  onChange={(event) =>
                    setMintTarget(event.target.value as MintTarget)
                  }
                >
                  <option value="core">Core contract (direct)</option>
                  <option value="collection">Collection contract (partner)</option>
                </select>
              </label>
            </div>
          )}
          {(isCollectionOnly || mintTarget === 'collection') && (
            <>
              <div className="meta-grid meta-grid--dense">
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
                </label>
              </div>
              <div className="mint-actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void loadCollectionStatus()}
                  disabled={!collectionContract || collectionStatusLoading}
                >
                  {collectionStatusLoading ? 'Loading...' : 'Load collection status'}
                </button>
              </div>
              {collectionStatus && (
                <div className="meta-grid meta-grid--dense">
                  <div>
                    <span className="meta-label">Paused</span>
                    <span className="meta-value">
                      {collectionStatus.paused === null
                        ? 'Unknown'
                        : collectionStatus.paused
                          ? 'Yes'
                          : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Mint price</span>
                    <span className="meta-value">{activeCollectionMintPriceLabel}</span>
                  </div>
                  <div>
                    <span className="meta-label">Wallet safety</span>
                    <span className="meta-value">
                      {collectionMintBeginSpendCap !== null
                        ? `Deny mode: begin <= ${formatMicroStx(
                            Number(collectionMintBeginSpendCap)
                          )}; seal <= fee-unit x (1 + ceil(chunks/50)). Upload allows 0 STX.`
                        : 'Load collection status'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Reservation expiry</span>
                    <span className="meta-value">{reservationExpiryLabel}</span>
                  </div>
                  <div>
                    <span className="meta-label">Allowlist enabled</span>
                    <span className="meta-value">
                      {collectionStatus.allowlistEnabled === null
                        ? 'Unknown'
                        : collectionStatus.allowlistEnabled
                          ? 'Yes'
                          : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Max per wallet</span>
                    <span className="meta-value">
                      {collectionStatus.maxPerWallet?.toString() ?? 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Minted / max</span>
                    <span className="meta-value">
                      {collectionStatus.mintedCount?.toString() ?? 'Unknown'} /{' '}
                      {collectionStatus.maxSupply?.toString() ?? 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Reserved</span>
                    <span className="meta-value">
                      {collectionStatus.reservedCount?.toString() ?? 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="meta-label">Default dependency IDs</span>
                    <span className="meta-value">
                      {collectionStatus.defaultDependencies === null
                        ? 'Unknown'
                        : collectionStatus.defaultDependencies.length === 0
                          ? 'None'
                          : `${collectionStatus.defaultDependencies.length} set`}
                    </span>
                  </div>
                </div>
              )}
              {collectionStatus?.finalized && (
                <p className="meta-value">
                  Collection contract finalized. Minting is locked.
                </p>
              )}
              {(collectionStatus?.defaultDependencies?.length ?? 0) > 0 && (
                <div className="alert">
                  Default dependencies are active for this collection. Multiple items
                  can still be minted in one run, but final sealing is one wallet
                  transaction per item so dependency links are enforced.
                </div>
              )}
              {collectionStatusMessage && (
                <p className="meta-value">{collectionStatusMessage}</p>
              )}
              <p className="meta-value">
                Collection contracts must be allowlisted by the Xtrata owner to
                mint while the core contract is paused.
              </p>
            </>
          )}
        </div>

        <div className="collection-mint__steps">
          <div>
            <span className="meta-label">Step 1</span>
            <span className="meta-value">
              {isCollectionOnly
                ? 'Enter the artist drop manifest URL and quantity, then prepare random items (no local uploads).'
                : `Upload a folder or select multiple files (max ${MAX_COLLECTION_ITEMS}).`}
            </span>
          </div>
          <div>
            <span className="meta-label">Step 2</span>
            <span className="meta-value">
              {isCollectionOnly
                ? `Review total size and fees. Each file ≤ ${itemLimitLabel}, total ≤ ${collectionLimitLabel}.`
                : `Review order + sizes. Each file ≤ ${itemLimitLabel}, total ≤ ${collectionLimitLabel}.`}
            </span>
          </div>
          <div>
            <span className="meta-label">Step 3</span>
            <span className="meta-value">
              Begin + upload chunk data, then seal for sequential IDs. If dependency
              inscriptions are configured on the collection contract, sealing runs one
              item per transaction so dependency links are enforced. Incomplete mints should
              be cancelled before reservation expiry ({reservationExpiryLabel}).
            </span>
          </div>
        </div>

        {isCollectionOnly ? (
          <div className="collection-mint__inputs">
            <label className="field">
              <span className="field__label">Drop manifest URL</span>
              <input
                className="input"
                placeholder="https://artist-site.example/drop/manifest.json"
                value={dropManifestUrl}
                onChange={(event) => setDropManifestUrl(event.target.value)}
              />
              <span className="field__hint">
                Manifest should include an `assets` array of HTTP(S) file URLs.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Quantity</span>
              <input
                className="input"
                type="number"
                min={1}
                max={MAX_COLLECTION_ONLY_QUANTITY}
                value={dropQuantityInput}
                onChange={(event) => setDropQuantityInput(event.target.value)}
              />
              <span className="field__hint">
                Randomly selects this many items from the drop manifest.
              </span>
            </label>
            <div className="mint-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void loadRandomDropItems()}
                disabled={dropLoading || reservationBusy}
              >
                {dropLoading ? 'Preparing...' : 'Prepare random mint'}
              </button>
            </div>
            {dropMessage && <p className="meta-value">{dropMessage}</p>}
          </div>
        ) : (
          <div className="collection-mint__inputs">
            <label className="field">
              <span className="field__label">Upload a folder</span>
              <input
                ref={folderInputRef}
                className="input"
                type="file"
                multiple
                onChange={(event) => handleFilesSelected(event.target.files)}
              />
              <span className="field__hint">
                Uses folder order where supported (Chrome/Edge).
              </span>
            </label>
            <label className="field">
              <span className="field__label">Or select multiple files</span>
              <input
                className="input"
                type="file"
                multiple
                onChange={(event) => handleFilesSelected(event.target.files)}
              />
            </label>
          </div>
        )}

        <div className="meta-grid meta-grid--dense">
          <div>
            <span className="meta-label">Items</span>
            <span className="meta-value">
              {items.length}/{MAX_COLLECTION_ITEMS}
            </span>
          </div>
          <div>
            <span className="meta-label">Total size</span>
            <span className="meta-value">{totalBytesReadable}</span>
          </div>
          <div>
            <span className="meta-label">Token URI</span>
            <span className="meta-value">{tokenUriLabel}</span>
          </div>
          <div>
            <span className="meta-label">Batch size</span>
            <span className="meta-value">{batchSize} chunks/tx</span>
          </div>
        </div>

        {isCollectionOnly && (
          <div className="alert">
            If begin/upload is not completed and sealed before reservation expiry (
            {reservationExpiryLabel}), reservations should be cancelled and returned to
            the collection supply. Fees already paid to submitted transactions are
            non-refundable.
          </div>
        )}
        {mintTarget === 'collection' && pendingReservations.length > 0 && (
          <div className="alert">
            Pending reservations: {pendingReservations.length}. Time until recommended
            cancel:{' '}
            {reservationCountdownMs !== null
              ? formatRemainingMinutesSeconds(reservationCountdownMs)
              : '00:00'}
            .
            <div className="meta-value">
              On-chain checks: {reservationStatusCounts.present} active,{' '}
              {reservationStatusCounts.missing} missing, {reservationStatusCounts.unknown}{' '}
              unchecked, {reservationStatusCounts.error} failed checks.
            </div>
            <div className="meta-grid meta-grid--dense">
              {pendingReservations.slice(0, 8).map((reservation) => (
                <div key={reservation.hashHex}>
                  <span className="meta-label">{reservation.itemLabel}</span>
                  <span className="meta-value">
                    {reservationPresenceByHash[reservation.hashHex] === 'present'
                      ? 'On-chain: active'
                      : reservationPresenceByHash[reservation.hashHex] === 'missing'
                        ? 'On-chain: missing'
                        : reservationPresenceByHash[reservation.hashHex] === 'error'
                          ? 'On-chain: check failed'
                          : 'On-chain: unchecked'}
                  </span>
                </div>
              ))}
            </div>
            {pendingReservations.length > 8 && (
              <div className="meta-value">
                +{pendingReservations.length - 8} additional reservations.
              </div>
            )}
            <div className="mint-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void refreshPendingReservations()}
                disabled={reservationBusy || mintPending}
              >
                {reservationBusy ? 'Refreshing...' : 'Refresh reservations'}
              </button>
              <button
                className="button"
                type="button"
                onClick={() => void cancelPendingReservations()}
                disabled={reservationBusy || mintPending}
              >
                {reservationBusy ? 'Cancelling...' : 'Cancel pending reservations'}
              </button>
            </div>
          </div>
        )}
        {reservationMessage && <div className="alert">{reservationMessage}</div>}

        <label className="field">
          <span className="field__label">Token URI (applied to all items)</span>
          <input
            className="input"
            value={tokenUri}
            onChange={(event) => setTokenUri(event.target.value)}
            placeholder={DEFAULT_TOKEN_URI}
          />
          <span className="field__hint">Leave blank to use the default token URI.</span>
          {tokenUriError && <span className="field__error">{tokenUriError}</span>}
        </label>

        <label className="field">
          <span className="field__label">Chunk batch size</span>
          <select
            className="select"
            value={batchSize}
            onChange={(event) => setBatchSize(Number(event.target.value))}
          >
            {BATCH_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="field__hint">Max {MAX_BATCH_SIZE} chunks per tx.</span>
        </label>

        <div className="collection-mint__fees">
          <div>
            <span className="meta-label">Fee unit</span>
            <span className="meta-value">
              {feeUnitValue !== null ? formatMicroStx(feeUnitValue) : 'Unknown'}
            </span>
          </div>
          <div>
            <span className="meta-label">Begin fees (all items)</span>
            <span className="meta-value">
              {formatMicroStx(feeEstimate.beginMicroStx)}
            </span>
          </div>
          <div>
            <span className="meta-label">Seal fee estimate</span>
            <span className="meta-value">
              {formatMicroStx(feeEstimate.sealMicroStx)}
            </span>
          </div>
          <div>
            <span className="meta-label">Total contract fees</span>
            <span className="meta-value">
              {formatMicroStx(feeEstimate.totalMicroStx)}
            </span>
          </div>
          {mintTarget === 'collection' && (
            <div>
              <span className="meta-label">Collection mint price</span>
              <span className="meta-value">
                {activeCollectionMintPrice === null
                  ? 'Unknown (load status)'
                  : activeCollectionMintPriceLabel}
              </span>
            </div>
          )}
          {mintTarget === 'collection' && (
            <div>
              <span className="meta-label">Xtrata protocol fee unit</span>
              <span className="meta-value">
                {formatMicroStx(feeSchedule.feeUnitMicroStx)}
              </span>
            </div>
          )}
          {mintTarget === 'collection' && (
            <div>
              <span className="meta-label">Wallet safety caps</span>
              <span className="meta-value">
                {collectionMintBeginSpendCap !== null
                  ? `begin <= ${formatMicroStx(
                      Number(collectionMintBeginSpendCap)
                    )}; upload <= 0 STX; seal formula: fee-unit x (1 + ceil(chunks/50))${
                      collectionSealBatchSpendCap !== null
                        ? `; current batch seal <= ${formatMicroStx(
                            Number(collectionSealBatchSpendCap)
                          )}`
                        : ''
                    }`
                  : 'Load collection status'}
              </span>
            </div>
          )}
          {mintTarget === 'collection' && hasCollectionDefaultDependencies && (
            <div>
              <span className="meta-label">Seal mode</span>
              <span className="meta-value">One transaction per item (dependencies enabled)</span>
            </div>
          )}
        </div>

        {isPreparing && <div className="meta-value">Preparing files…</div>}
        {countOverLimit && (
          <div className="alert">
            Too many files selected. Max {MAX_COLLECTION_ITEMS} items.
          </div>
        )}
        {totalBytesOverLimit && (
          <div className="alert">
            Total size exceeds {collectionLimitLabel}. Remove items to continue.
          </div>
        )}

        {items.length > 0 && (
          <div className="collection-mint__table">
            <div className="collection-mint__row collection-mint__row--header">
              <span>Name</span>
              <span>Size</span>
              <span>Chunks</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {items.map((item) => (
              <div key={item.key} className="collection-mint__row">
                <span title={item.path}>{item.path}</span>
                <span>{formatBytes(BigInt(item.totalBytes))}</span>
                <span>{item.totalChunks}</span>
                <span>{formatStepStatus(item.status)}</span>
                <button
                  type="button"
                  className="button button--ghost button--mini"
                  onClick={() => removeItem(item.key)}
                  disabled={mintPending}
                >
                  Remove
                </button>
                {item.issues.length > 0 && (
                  <span className="collection-mint__issues">
                    {item.issues.join(' ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="collection-mint__actions">
          <button
            className="button"
            type="button"
            onClick={() => void startBatchMint()}
            disabled={
              mintPending ||
              dropLoading ||
              reservationBusy ||
              isPreparing ||
              items.length === 0 ||
              hasBlockingIssues ||
              !!tokenUriError ||
              !!mismatch ||
              (mintTarget === 'core' && pauseBlocked) ||
              (mintTarget === 'collection' &&
                (!collectionContract ||
                  pendingReservations.length > 0 ||
                  collectionMintBeginSpendCap === null))
            }
          >
            {mintPending
              ? 'Minting…'
              : isCollectionOnly
                ? hasCollectionDefaultDependencies
                  ? 'Begin collection mint (sequential seal)'
                  : 'Begin collection mint'
                : mintTarget === 'collection' && hasCollectionDefaultDependencies
                  ? 'Begin mint (sequential seal)'
                  : 'Begin batch mint'}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={clearSelection}
            disabled={mintPending || isPreparing}
          >
            Clear
          </button>
        </div>

        {mismatch && (
          <div className="alert">
            Switch wallet to {mismatch.expected} to batch mint.
          </div>
        )}
        {mintTarget === 'core' && pauseBlocked && (
          <div className="alert">
            Contract is paused. Only the owner can mint while paused.
          </div>
        )}
        {mintStatus && <div className="alert">{mintStatus}</div>}

        <div className="mint-steps collection-mint__steps-status">
          <div className={`mint-step mint-step--${beginState}`}>
            <strong>1. Begin</strong>
            <span>{formatStepStatus(beginState)}</span>
          </div>
          <div className={`mint-step mint-step--${uploadState}`}>
            <strong>2. Upload</strong>
            <span>{formatStepStatus(uploadState)}</span>
          </div>
          <div className={`mint-step mint-step--${sealState}`}>
            <strong>3. Seal</strong>
            <span>{formatStepStatus(sealState)}</span>
          </div>
          {batchProgress && (
            <div className="mint-step mint-step--pending">
              Uploading item {batchProgress.itemIndex}/{batchProgress.itemCount} —
              batch {batchProgress.batchIndex}/{batchProgress.batchCount}
            </div>
          )}
          {txDelayLabel && countdown !== null && (
            <div className="mint-step mint-step--pending mint-step--countdown">
              {txDelayLabel} {countdown.toString().padStart(2, '0')}s
            </div>
          )}
        </div>

        {mintLog.length > 0 && (
          <div className="mint-log">
            {mintLog.map((entry, index) => (
              <div key={`${entry}-${index}`} className="mint-log__item">
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
