import { useEffect, useMemo, useRef, useState } from 'react';
import { showContractCall } from '@stacks/connect';
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
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_TOKEN_URI,
  MAX_MIME_LENGTH,
  MAX_TOKEN_URI_LENGTH,
  TX_DELAY_SECONDS
} from '../lib/mint/constants';
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

type CollectionContractStatus = {
  paused: boolean | null;
  mintPrice: bigint | null;
  allowlistEnabled: boolean | null;
  maxPerWallet: bigint | null;
  maxSupply: bigint | null;
  mintedCount: bigint | null;
  reservedCount: bigint | null;
  finalized: boolean | null;
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

export default function CollectionMintScreen(props: CollectionMintScreenProps) {
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

  useEffect(() => {
    if (!isCollectionOnly || pendingReservations.length === 0) {
      setReservationCountdownMs(null);
      return;
    }
    const tick = () => {
      setReservationCountdownMs(
        getSoonestReservationRemainingMs(pendingReservations, Date.now())
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isCollectionOnly, pendingReservations]);

  useEffect(() => {
    if (!isCollectionOnly || pendingReservations.length === 0) {
      return;
    }
    if (reservationCountdownMs === 0) {
      setReservationMessage(
        'Reservation timeout reached. Cancel pending reservations now to return items to supply.'
      );
    }
  }, [isCollectionOnly, pendingReservations.length, reservationCountdownMs]);

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
        postConditionMode: options.postConditionMode,
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
      const network = toStacksNetwork(props.contract.network);
      const owner = props.walletSession.address;
      const checks = await Promise.all(
        pendingReservations.map(async (entry) => {
          const result = await callReadOnlyFunction({
            contractAddress: collectionContract.address,
            contractName: collectionContract.contractName,
            functionName: 'get-reservation',
            functionArgs: [principalCV(owner), bufferCV(hashHexToBuffer(entry.hashHex))],
            senderAddress: owner,
            network
          });
          const present =
            result.type === ClarityType.OptionalSome ||
            (result.type === ClarityType.ResponseOk &&
              result.value.type === ClarityType.OptionalSome);
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

      const [
        pausedCv,
        priceCv,
        allowlistCv,
        maxPerWalletCv,
        maxSupplyCv,
        mintedCv,
        reservedCv,
        finalizedCv
      ] = await Promise.all([
        readOnly('is-paused'),
        readOnly('get-mint-price'),
        readOnly('get-allowlist-enabled'),
        readOnly('get-max-per-wallet'),
        readOnly('get-max-supply'),
        readOnly('get-minted-count'),
        readOnly('get-reserved-count'),
        readOnly('get-finalized')
      ]);

      setCollectionStatus({
        paused: Boolean(cvToValue(pausedCv)),
        mintPrice: parseUintCv(priceCv),
        allowlistEnabled: Boolean(cvToValue(allowlistCv)),
        maxPerWallet: parseUintCv(maxPerWalletCv),
        maxSupply: parseUintCv(maxSupplyCv),
        mintedCount: parseUintCv(mintedCv),
        reservedCount: parseUintCv(reservedCv),
        finalized: Boolean(cvToValue(finalizedCv))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCollectionStatusMessage(`Failed to load collection status: ${message}`);
    } finally {
      setCollectionStatusLoading(false);
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
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setItems((prev) =>
          prev.map((entry, idx) =>
            idx === index ? { ...entry, status: 'pending' } : entry
          )
        );
        appendLog(`Item ${index + 1}/${items.length}: begin inscription.`);
        const beginPostConditions =
          mintTarget === 'collection'
            ? undefined
            : resolveFeePostConditions(feeSchedule.feeUnitMicroStx);
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
          postConditionMode: beginPostConditions
            ? PostConditionMode.Deny
            : undefined,
          postConditions: beginPostConditions,
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

        const batches = batchChunks(item.chunks, batchSize);
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
        setItems((prev) =>
          prev.map((entry, idx) =>
            idx === index ? { ...entry, status: 'done' } : entry
          )
        );
      }

      setBeginState('done');
      setUploadState('done');
      setSealState('pending');
      const sealPostConditions =
        mintTarget === 'collection'
          ? undefined
          : resolveFeePostConditions(feeEstimate.sealMicroStx);
      appendLog('Submitting batch seal transaction.');
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
                  items.map((item) =>
                    tupleCV({
                      hash: bufferCV(item.expectedHash),
                      'token-uri': stringAsciiCV(tokenUriValue)
                    })
                  )
                )
              ]
            : [
                listCV(
                  items.map((item) =>
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
        postConditionMode: sealPostConditions
          ? PostConditionMode.Deny
          : undefined,
        postConditions: sealPostConditions,
        logDetails: {
          itemCount: items.length,
          tokenUriLength: tokenUriValue.length
        }
      });
      appendLog(`Batch seal tx sent (${sealTx.txId}).`);
      if (mintTarget === 'collection') {
        setPendingReservations((prev) =>
          removeReservationsByHashes(
            prev,
            items.map((item) => item.expectedHashHex)
          )
        );
      }
      setSealState('done');
      setMintStatus('Batch seal submitted. IDs will mint sequentially.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintStatus(`Batch mint failed: ${message}`);
      if (mintTarget === 'collection') {
        setReservationMessage(
          'Mint did not complete. Cancel pending reservations within 20 minutes to unlock supply.'
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
  const reservationTimeoutLabel = formatRemainingMinutesSeconds(
    COLLECTION_RESERVATION_TIMEOUT_MS
  );

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
                    <span className="meta-value">
                      {collectionStatus.mintPrice !== null
                        ? formatMicroStx(Number(collectionStatus.mintPrice))
                        : 'Unknown'}
                    </span>
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
                </div>
              )}
              {collectionStatus?.finalized && (
                <p className="meta-value">
                  Collection contract finalized. Minting is locked.
                </p>
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
              Begin + upload chunk data, then seal for sequential IDs. Incomplete mints should be cancelled within 20 minutes.
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
            If begin/upload is not completed and sealed within {reservationTimeoutLabel},
            reservations should be cancelled and returned to the collection supply. Fees
            already paid to submitted transactions are non-refundable.
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
            <span className="meta-label">Seal fee (batch)</span>
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
                {collectionStatus?.mintPrice !== null &&
                collectionStatus?.mintPrice !== undefined
                  ? formatMicroStx(Number(collectionStatus.mintPrice))
                  : 'Unknown (load status)'}
              </span>
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
                (!collectionContract || pendingReservations.length > 0))
            }
          >
            {mintPending
              ? 'Minting…'
              : isCollectionOnly
                ? 'Begin collection mint'
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
            <strong>3. Seal batch</strong>
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
