import { useEffect, useMemo, useRef, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import {
  bufferCV,
  type ClarityValue,
  FungibleConditionCode,
  listCV,
  makeStandardSTXPostCondition,
  PostConditionMode,
  type PostCondition,
  stringAsciiCV,
  tupleCV,
  uintCV
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

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', 'true');
    folderInputRef.current.setAttribute('directory', 'true');
  }, []);

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
        contractAddress: props.contract.address,
        contractName: props.contract.contractName,
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

  const startBatchMint = async () => {
    if (mintPending || isPreparing) {
      return;
    }
    if (!props.walletSession.address) {
      setMintStatus('Connect a wallet to mint the collection.');
      return;
    }
    if (mismatch) {
      setMintStatus(
        `Switch wallet to ${mismatch.expected} to mint this collection.`
      );
      return;
    }
    if (pauseBlocked) {
      setMintStatus('Contract is paused. Only the owner can mint.');
      return;
    }
    if (items.length === 0) {
      setMintStatus('Select files before starting.');
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
      setMintStatus('Fix the file issues before minting.');
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
      appendLog('Collection mint blocked: invalid token URI.');
      return;
    }
    setMintPending(true);
    setMintStatus(null);
    setBeginState('pending');
    setUploadState('pending');
    setSealState('idle');
    appendLog(`Starting collection mint (${items.length} items).`);

    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setItems((prev) =>
          prev.map((entry, idx) =>
            idx === index ? { ...entry, status: 'pending' } : entry
          )
        );
        appendLog(`Item ${index + 1}/${items.length}: begin inscription.`);
        const beginPostConditions = resolveFeePostConditions(
          feeSchedule.feeUnitMicroStx
        );
        const beginTx = await requestContractCall({
          functionName: 'begin-inscription',
          functionArgs: [
            bufferCV(item.expectedHash),
            stringAsciiCV(item.mimeType),
            uintCV(BigInt(item.totalBytes)),
            uintCV(BigInt(item.totalChunks))
          ],
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
            functionName: 'add-chunk-batch',
            functionArgs: [
              bufferCV(item.expectedHash),
              listCV(batch.map((chunk) => bufferCV(chunk)))
            ],
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
      const sealPostConditions = resolveFeePostConditions(
        feeEstimate.sealMicroStx
      );
      appendLog('Submitting batch seal transaction.');
      const sealTx = await requestContractCall({
        functionName: 'seal-inscription-batch',
        functionArgs: [
          listCV(
            items.map((item) =>
              tupleCV({
                hash: bufferCV(item.expectedHash),
                'token-uri': stringAsciiCV(tokenUriValue)
              })
            )
          )
        ],
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
      setMintStatus(`Collection mint failed: ${message}`);
      setItems((prev) =>
        prev.map((item) =>
          item.status === 'pending' ? { ...item, status: 'error' } : item
        )
      );
      setBeginState((prev) => (prev === 'pending' ? 'error' : prev));
      setUploadState((prev) => (prev === 'pending' ? 'error' : prev));
      setSealState((prev) => (prev === 'pending' ? 'error' : prev));
      logWarn('mint', 'Collection mint failed', { error: message });
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
          <h2>Collection mint</h2>
          <p>Batch upload up to 50 items, then seal them in one transaction.</p>
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
              pauseBlocked
            }
          >
            {mintPending ? 'Minting…' : 'Begin collection mint'}
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
            Switch wallet to {mismatch.expected} to mint this collection.
          </div>
        )}
        {pauseBlocked && (
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
