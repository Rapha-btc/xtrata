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

type CollectionMintScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type StepState = 'idle' | 'pending' | 'done' | 'error';

type TxPayload = {
  txId: string;
};

type CollectionItem = {
  key: string;
  file: File;
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
const BATCH_OPTIONS = Array.from(
  { length: MAX_BATCH_SIZE },
  (_, index) => index + 1
);

const readFileBytes = async (file: File) => {
  const buffer = await file.arrayBuffer();
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
  const [mintTarget, setMintTarget] = useState<MintTarget>('core');
  const [collectionAddress, setCollectionAddress] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [collectionStatus, setCollectionStatus] =
    useState<CollectionContractStatus | null>(null);
  const [collectionStatusMessage, setCollectionStatusMessage] =
    useState<string | null>(null);
  const [collectionStatusLoading, setCollectionStatusLoading] = useState(false);
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

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', 'true');
    folderInputRef.current.setAttribute('directory', 'true');
  }, []);

  useEffect(() => {
    setCollectionStatus(null);
    setCollectionStatusMessage(null);
  }, [collectionAddress, collectionName]);

  const appendLog = (message: string) => {
    setMintLog((prev) => [...prev, message].slice(-50));
    // eslint-disable-next-line no-console
    console.log(`[collection-mint] ${message}`);
  };

  const clearSelection = () => {
    setItems([]);
    setMintStatus(null);
    setMintLog([]);
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

  const buildCollectionItems = async (files: File[]) => {
    const sorted = [...files].sort(compareFiles);
    const nextItems: CollectionItem[] = [];
    for (const file of sorted) {
      const bytes = await readFileBytes(file);
      const chunks = chunkBytes(bytes);
      const expectedHash = computeExpectedHash(chunks);
      const expectedHashHex = bytesToHex(expectedHash);
      const mimeType = file.type || 'application/octet-stream';
      nextItems.push({
        key: `${file.name}-${expectedHashHex}-${nextItems.length}`,
        file,
        path: fileSortKey(file),
        mimeType,
        totalBytes: bytes.length,
        totalChunks: chunks.length,
        chunks,
        expectedHash,
        expectedHashHex,
        issues: [],
        status: 'idle'
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

  const removeItem = (key: string) => {
    setItems((prev) => buildIssues(prev.filter((item) => item.key !== key)));
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
    if (mintPending || isPreparing) {
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
      setMintStatus('Select files before starting the batch.');
      return;
    }
    if (countOverLimit) {
      setMintStatus(`Limit exceeded: max ${MAX_COLLECTION_ITEMS} files.`);
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
      setSealState('done');
      setMintStatus('Batch seal submitted. IDs will mint sequentially.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintStatus(`Batch mint failed: ${message}`);
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

  return (
    <section
      className={`panel app-section panel--compact${props.collapsed ? ' panel--collapsed' : ''}`}
      id="collection-mint"
    >
      <div className="panel__header">
        <div>
          <h2>Batch mint</h2>
          <p>Batch upload up to 50 items, then seal them in one transaction.</p>
          <p className="meta-value">
            Choose whether to mint directly into the core contract or via a
            partner collection contract.
          </p>
          <p className="meta-value">
            Use Collection mint admin to configure partner collection contracts.
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
          <span className="meta-label">Mint target</span>
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
          {mintTarget === 'collection' && (
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
              Upload a folder or select multiple files (max {MAX_COLLECTION_ITEMS}).
            </span>
          </div>
          <div>
            <span className="meta-label">Step 2</span>
            <span className="meta-value">
              Review order + sizes. Each file ≤ {itemLimitLabel}, total ≤ {collectionLimitLabel}.
            </span>
          </div>
          <div>
            <span className="meta-label">Step 3</span>
            <span className="meta-value">
              Begin + upload each file, then seal the batch for sequential IDs.
            </span>
          </div>
        </div>

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
              isPreparing ||
              items.length === 0 ||
              hasBlockingIssues ||
              !!tokenUriError ||
              !!mismatch ||
              (mintTarget === 'core' && pauseBlocked) ||
              (mintTarget === 'collection' && !collectionContract)
            }
          >
            {mintPending ? 'Minting…' : 'Begin batch mint'}
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
