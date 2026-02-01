import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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
  uintCV
} from '@stacks/transactions';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import {
  batchChunks,
  chunkBytes,
  computeExpectedHash,
  CHUNK_SIZE,
  MAX_BATCH_SIZE
} from '../lib/chunking/hash';
import { bytesToHex } from '../lib/utils/encoding';
import { formatBytes } from '../lib/utils/format';
import { logInfo, logWarn } from '../lib/utils/logger';
import { getNetworkMismatch } from '../lib/network/guard';
import { getApiBaseUrl } from '../lib/network/config';
import { getContractId } from '../lib/contract/config';
import { resolveContractCapabilities } from '../lib/contract/capabilities';
import { useContractAdminStatus } from '../lib/contract/admin-status';
import { createXtrataClient } from '../lib/contract/client';
import {
  clearMintAttempt,
  loadMintAttempt,
  saveMintAttempt,
  type MintAttempt
} from '../lib/mint/attempt-cache';
import {
  estimateContractFees,
  formatMicroStx,
  getFeeSchedule,
  MICROSTX_PER_STX
} from '../lib/contract/fees';
import type { InscriptionMeta, UploadState } from '../lib/protocol/types';

type MintScreenProps = {
  contract: ContractRegistryEntry;
  walletSession: WalletSession;
  onInscriptionSealed?: (payload: { txId: string }) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  restrictions?: MintRestrictions;
};

type StepState = 'idle' | 'pending' | 'done' | 'error';

type TxPayload = {
  txId: string;
};

type MintRestrictions = {
  fixedBatchSize?: number;
  fixedTokenUri?: string;
  maxFileBytes?: number;
  hideDelegate?: boolean;
  hideTokenUri?: boolean;
  hideBatchSize?: boolean;
  hideMetadataTools?: boolean;
  hideFeeRateFetch?: boolean;
  disableDuplicateOverride?: boolean;
};

type Sip16MetadataParams = {
  contractId: string;
  contractName: string;
  collectionName: string;
  collectionSymbol: string;
  network: string;
  protocolVersion: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  totalChunks: number;
  expectedHashHex: string;
  creator: string | null;
  dependencies: bigint[];
};

const DEFAULT_BATCH_SIZE = Math.min(30, MAX_BATCH_SIZE);
const BATCH_OPTIONS = Array.from(
  { length: MAX_BATCH_SIZE },
  (_, index) => index + 1
);
const MAX_UPLOAD_RETRIES = 3;
const TX_DELAY_SECONDS = 5;
const DEFAULT_TOKEN_URI =
  'https://xvgh3sbdkivby4blejmripeiyjuvji3d4tycym6hgaxalescegjq.arweave.net/vUx9yCNSKhxwKyJZFDyIwmlUo2Pk8CwzxzAuBZJCIZM';
const MAX_TOKEN_URI_LENGTH = 256;
const MAX_MIME_LENGTH = 64;
const SIP16_TOKEN_ID_PLACEHOLDER = '{id}';
const SIP16_RESOLVER_HOST_PLACEHOLDER = '{resolver-host}';
const SIP16_PREVIEW_HOST_PLACEHOLDER = '{preview-host}';
const SIP16_COLLECTION_NAME = 'xtrata';
const SIP16_COLLECTION_SYMBOL = 'XST';
const SIP16_PLACEHOLDER_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA1MCA1MCc+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nMjAnIGZpbGw9J25vbmUnIHN0cm9rZT0nIzYzNjZmMScgc3Ryb2tlLXdpZHRoPSc0Jy8+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nMTInIGZpbGw9J25vbmUnIHN0cm9rZT0nI2VjNDg5OScgc3Ryb2tlLXdpZHRoPSc0Jy8+PC9zdmc+';

const isAscii = (value: string) => /^[\x00-\x7F]*$/.test(value);
const isHttpUrl = (value: string) =>
  value.startsWith('http://') || value.startsWith('https://');

const formatStx = (value: number, decimals = 2) =>
  `${(value / MICROSTX_PER_STX).toFixed(decimals)} STX`;

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

const parseTokenIdInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = BigInt(trimmed);
    if (parsed < 0n) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

const getSip16Category = (mimeType: string) => {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType === 'text/html' || mimeType === 'application/xhtml+xml') {
    return 'html';
  }
  if (mimeType.startsWith('text/')) {
    return 'text';
  }
  if (mimeType.includes('json')) {
    return 'json';
  }
  return 'application';
};

const sanitizeFilename = (value: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  const trimmed = cleaned.replace(/^[-.]+/, '').replace(/[-.]+$/, '');
  return trimmed || 'xtrata-metadata';
};

const buildSip16Metadata = (params: Sip16MetadataParams) => {
  const rawMediaUri = `https://${SIP16_RESOLVER_HOST_PLACEHOLDER}/xtrata/${params.contractId}/${SIP16_TOKEN_ID_PLACEHOLDER}`;
  const previewUri = `https://${SIP16_PREVIEW_HOST_PLACEHOLDER}/xtrata/${params.contractId}/${SIP16_TOKEN_ID_PLACEHOLDER}`;
  const category = getSip16Category(params.mimeType);
  const isImage = params.mimeType.startsWith('image/');
  const metadata: Record<string, unknown> = {
    sip: 16,
    name: `${params.collectionName} #${SIP16_TOKEN_ID_PLACEHOLDER}`,
    description: `xtrata inscription for ${params.fileName} (${params.mimeType}, ${params.totalBytes} bytes).`,
    image: isImage ? rawMediaUri : SIP16_PLACEHOLDER_IMAGE
  };
  const properties: Record<string, unknown> = {
    collection: params.collectionName,
    id: SIP16_TOKEN_ID_PLACEHOLDER,
    symbol: params.collectionSymbol,
    category,
    raw_media_file_uri: rawMediaUri,
    raw_media_file_type: params.mimeType,
    raw_media_file_signature_type: 'sha256',
    raw_media_file_signature: params.expectedHashHex,
    files: [
      {
        uri: rawMediaUri,
        type: params.mimeType,
        signature: params.expectedHashHex,
        signature_type: 'sha256'
      }
    ],
    xtrata: {
      contract_id: params.contractId,
      contract_name: params.contractName,
      network: params.network,
      protocol_version: params.protocolVersion,
      total_size: params.totalBytes,
      total_chunks: params.totalChunks,
      expected_hash: params.expectedHashHex,
      preview_uri: previewUri
    }
  };
  if (params.creator) {
    properties.creators = [{ address: params.creator, share: 100 }];
  }
  if (!isImage) {
    metadata.animation_url = rawMediaUri;
    properties.animation_url = rawMediaUri;
  }
  if (params.dependencies.length > 0) {
    (properties.xtrata as Record<string, unknown>).dependencies =
      params.dependencies.map((dependency) => dependency.toString());
  }
  metadata.properties = properties;
  return metadata;
};

const buildDelegateHtml = (params: {
  contractAddress: string;
  contractName: string;
  apiBaseUrl: string;
  tokenId: bigint;
  totalChunks: number;
  mimeType: string;
}) => {
  const safeMime = params.mimeType || 'application/octet-stream';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Delegate #${params.tokenId.toString()}</title>
<style>
html,body{margin:0;width:100%;height:100%;background:#0f172a;color:#f8fafc;font:13px/1.4 "IBM Plex Sans",system-ui,sans-serif}
#app{display:grid;place-items:center;width:100%;height:100%}
img,video,iframe{max-width:100%;max-height:100%}
pre{white-space:pre-wrap;padding:16px}
</style>
</head>
<body>
<div id="app">Loading delegate...</div>
<script>
const CONTRACT_ADDRESS="${params.contractAddress}";
const CONTRACT_NAME="${params.contractName}";
const API_BASE="${params.apiBaseUrl}";
const TOKEN_ID=${params.tokenId.toString()}n;
const TOTAL_CHUNKS=${params.totalChunks};
const MIME=${JSON.stringify(safeMime)};
const app=document.getElementById("app");
const uintToHex=(n)=>{const hex=BigInt(n).toString(16).padStart(32,"0");return "0x01"+hex};
const hexToBytes=(hex)=>{const clean=hex.startsWith("0x")?hex.slice(2):hex;const out=new Uint8Array(clean.length/2);for(let i=0;i<clean.length;i+=2){out[i/2]=parseInt(clean.slice(i,i+2),16)}return out};
const bytesToHex=(b)=>Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
const clarityToBytes=(hex)=>{const bytes=hexToBytes(hex);if(!bytes.length)return bytes;const tag=bytes[0];if(tag===0x08)return new Uint8Array();if(tag===0x07)return clarityToBytes("0x"+bytesToHex(bytes.slice(1)));if(tag===0x09)return new Uint8Array();if(tag===0x0a)return clarityToBytes("0x"+bytesToHex(bytes.slice(1)));if(tag!==0x02)return new Uint8Array();const len=(bytes[1]<<24)|(bytes[2]<<16)|(bytes[3]<<8)|bytes[4];return bytes.slice(5,5+len)};
const callReadOnly=async(fn,args)=>{const url=\`\${API_BASE}/v2/contracts/call-read/\${CONTRACT_ADDRESS}/\${CONTRACT_NAME}/\${fn}\`;const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sender:CONTRACT_ADDRESS,arguments:args})});const text=await res.text();let json;try{json=JSON.parse(text)}catch(e){throw new Error("Invalid response")};if(!json.okay)throw new Error(json.cause||"Read-only failed");return json.result};
const fetchChunk=async(i)=>{const result=await callReadOnly("get-chunk",[uintToHex(TOKEN_ID),uintToHex(BigInt(i))]);return clarityToBytes(result)};
const renderBytes=(bytes)=>{const blob=new Blob([bytes],{type:MIME});const url=URL.createObjectURL(blob);const type=MIME||"application/octet-stream";if(type.startsWith("image/")){const img=new Image();img.src=url;app.textContent="";app.appendChild(img);return}if(type.startsWith("audio/")){const audio=document.createElement("audio");audio.controls=true;audio.src=url;app.textContent="";app.appendChild(audio);return}if(type.startsWith("video/")){const video=document.createElement("video");video.controls=true;video.src=url;app.textContent="";app.appendChild(video);return}if(type==="application/pdf"){const frame=document.createElement("iframe");frame.src=url;frame.setAttribute("sandbox","");app.textContent="";app.appendChild(frame);return}const text=new TextDecoder().decode(bytes);const pre=document.createElement("pre");pre.textContent=text;app.textContent="";app.appendChild(pre)};
(async()=>{try{const chunks=[];let total=0;for(let i=0;i<TOTAL_CHUNKS;i++){const chunk=await fetchChunk(i);if(!chunk.length)break;chunks.push(chunk);total+=chunk.length}const bytes=new Uint8Array(total);let offset=0;chunks.forEach(c=>{bytes.set(c,offset);offset+=c.length});if(MIME==="text/html"||MIME==="application/xhtml+xml"){const html=new TextDecoder().decode(bytes);document.open();document.write(html);document.close();return}renderBytes(bytes)}catch(e){app.textContent="Delegate load failed.";console.error(e)}})();
</script>
</body>
</html>`;
};

const readFileBytes = async (file: File) => {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
};

export default function MintScreen(props: MintScreenProps) {
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const contractId = getContractId(props.contract);
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [chunks, setChunks] = useState<Uint8Array[]>([]);
  const [expectedHash, setExpectedHash] = useState<Uint8Array | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [delegateTargetIdInput, setDelegateTargetIdInput] = useState('');
  const [delegateTargetId, setDelegateTargetId] = useState<bigint | null>(null);
  const [delegateMeta, setDelegateMeta] = useState<InscriptionMeta | null>(null);
  const [delegateStatus, setDelegateStatus] = useState<string | null>(null);
  const [delegatePending, setDelegatePending] = useState(false);
  const [metadataJson, setMetadataJson] = useState<string | null>(null);
  const [metadataStatus, setMetadataStatus] = useState<string | null>(null);
  const [duplicateState, setDuplicateState] = useState<
    'idle' | 'checking' | 'clear' | 'found' | 'error'
  >('idle');
  const [duplicateMatch, setDuplicateMatch] = useState<{
    id: bigint;
    owner: string | null;
  } | null>(null);
  const [resumeState, setResumeState] = useState<UploadState | null>(null);
  const [resumeCheckKey, setResumeCheckKey] = useState(0);
  const restrictions = props.restrictions ?? {};
  const fixedBatchSize = restrictions.fixedBatchSize;
  const fixedTokenUri = restrictions.fixedTokenUri;
  const maxFileBytes = restrictions.maxFileBytes ?? null;
  const hideDelegate = restrictions.hideDelegate ?? false;
  const hideTokenUri = restrictions.hideTokenUri ?? false;
  const hideBatchSize = restrictions.hideBatchSize ?? false;
  const hideMetadataTools = restrictions.hideMetadataTools ?? false;
  const hideFeeRateFetch = restrictions.hideFeeRateFetch ?? false;
  const disableDuplicateOverride = restrictions.disableDuplicateOverride ?? false;
  const resolvedFixedBatchSize =
    fixedBatchSize && fixedBatchSize > 0 ? fixedBatchSize : undefined;
  const initialBatchSize = Math.min(
    resolvedFixedBatchSize ?? DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE
  );
  const initialTokenUri = fixedTokenUri ?? DEFAULT_TOKEN_URI;

  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const duplicateCheckRef = useRef(0);
  const [batchSize, setBatchSize] = useState(initialBatchSize);
  const [tokenUri, setTokenUri] = useState(initialTokenUri);
  const [tokenUriStatus, setTokenUriStatus] = useState<string | null>(null);
  const [tokenUriStatusTone, setTokenUriStatusTone] = useState<
    'idle' | 'ok' | 'error' | 'pending'
  >('idle');
  const [lastAttempt, setLastAttempt] = useState<MintAttempt | null>(null);
  const [resumeHint, setResumeHint] = useState<string | null>(null);
  const [txDelaySeconds, setTxDelaySeconds] = useState<number | null>(null);
  const [txDelayLabel, setTxDelayLabel] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [mintLog, setMintLog] = useState<string[]>([]);
  const [mintPending, setMintPending] = useState(false);
  const [beginState, setBeginState] = useState<StepState>('idle');
  const [uploadState, setUploadState] = useState<StepState>('idle');
  const [sealState, setSealState] = useState<StepState>('idle');
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [feeRateStatus, setFeeRateStatus] = useState<string | null>(null);
  const [feeRatePending, setFeeRatePending] = useState(false);
  const [feeRateUpdatedAt, setFeeRateUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (resolvedFixedBatchSize) {
      setBatchSize(Math.min(resolvedFixedBatchSize, MAX_BATCH_SIZE));
    }
  }, [resolvedFixedBatchSize]);

  useEffect(() => {
    if (fixedTokenUri) {
      setTokenUri(fixedTokenUri);
    }
  }, [fixedTokenUri]);

  useEffect(() => {
    let active = true;
    void loadMintAttempt(contractId).then((attempt) => {
      if (active) {
        setLastAttempt(attempt);
      }
    });
    return () => {
      active = false;
    };
  }, [contractId]);

  const mismatch = getNetworkMismatch(
    props.contract.network,
    props.walletSession.network
  );
  const capabilities = useMemo(
    () => resolveContractCapabilities(props.contract),
    [props.contract]
  );
  const readOnlySender =
    props.walletSession.address ?? props.contract.address;
  const adminStatusQuery = useContractAdminStatus({
    client,
    senderAddress: readOnlySender,
    enabled: capabilities.supportsFeeUnit || capabilities.supportsPause
  });

  const effectiveBatchSize = Math.min(
    resolvedFixedBatchSize ?? batchSize,
    MAX_BATCH_SIZE
  );
  const batches = useMemo(() => {
    if (chunks.length === 0) {
      return [];
    }
    return batchChunks(chunks, effectiveBatchSize);
  }, [chunks, effectiveBatchSize]);

  const expectedHashHex = expectedHash ? bytesToHex(expectedHash) : null;
  const hasDuplicate = duplicateMatch !== null;
  const resumeInfo = useMemo(() => {
    if (!resumeState) {
      return null;
    }
    const totalChunks = Number(resumeState.totalChunks);
    const currentIndex = Number(resumeState.currentIndex);
    if (
      !Number.isSafeInteger(totalChunks) ||
      !Number.isSafeInteger(currentIndex) ||
      totalChunks < 0 ||
      currentIndex < 0
    ) {
      return { error: 'Upload state is too large to resume safely.' };
    }
    if (currentIndex > totalChunks) {
      return { error: 'On-chain upload state is ahead of expected chunks.' };
    }
    const remainingChunks = Math.max(0, totalChunks - currentIndex);
    const batchLimit = effectiveBatchSize;
    const remainingBatches =
      batchLimit > 0 ? Math.ceil(remainingChunks / batchLimit) : 0;
    return {
      totalChunks,
      currentIndex,
      remainingChunks,
      remainingBatches,
      batchLimit
    };
  }, [resumeState, effectiveBatchSize]);
  const resumeMismatch = useMemo(() => {
    if (!resumeState || !file || !fileBytes) {
      return null;
    }
    const mimeType = file.type || 'application/octet-stream';
    if (resumeState.mimeType !== mimeType) {
      return 'Selected file does not match the on-chain upload mime type.';
    }
    if (resumeState.totalSize !== BigInt(fileBytes.length)) {
      return 'Selected file size does not match the on-chain upload.';
    }
    if (resumeState.totalChunks !== BigInt(chunks.length)) {
      return 'Selected file chunk count does not match the on-chain upload.';
    }
    return null;
  }, [resumeState, file, fileBytes, chunks.length]);
  const resumeBlocked =
    !!resumeMismatch || (resumeInfo ? 'error' in resumeInfo : false);
  const totalBytes = fileBytes ? BigInt(fileBytes.length) : 0n;
  const uploadBatchCount = batches.length;
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
      estimateContractFees({
        schedule: feeSchedule,
        totalChunks: chunks.length
      }),
    [feeSchedule, chunks.length]
  );
  const hasChunks = chunks.length > 0;
  const feeUnitValue =
    feeSchedule.model === 'fee-unit' ? feeSchedule.feeUnitMicroStx : null;
  const isPaused = adminStatusQuery.data?.paused ?? null;
  const isOwner =
    !!props.walletSession.address &&
    !!adminStatusQuery.data?.admin &&
    props.walletSession.address === adminStatusQuery.data.admin;
  const pauseBlocked = isPaused === true && !isOwner;
  const feeUnitError =
    feeSchedule.model === 'fee-unit' && adminStatusQuery.isError
      ? adminStatusQuery.error instanceof Error
        ? adminStatusQuery.error.message
        : 'Unable to load fee unit.'
      : null;
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
  const estimatedTxBytes = useMemo(() => {
    if (!fileBytes) {
      return null;
    }
    let uploadBytes = 0;
    for (const batch of batches) {
      const batchBytes = batch.reduce((sum, chunk) => sum + chunk.length, 0);
      uploadBytes += 520 + batchBytes;
    }
    return 380 + 420 + uploadBytes;
  }, [batches, fileBytes]);
  const networkFeeEstimate =
    feeRate && estimatedTxBytes
      ? Math.ceil(estimatedTxBytes * feeRate)
      : null;
  const handleBackToWallet = () => {
    if (typeof document === 'undefined') {
      return;
    }
    const anchor = document.getElementById('my-wallet');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    }
  };

  const pauseBeforeNextTx = async (label: string) => {
    setTxDelayLabel(label);
    for (let remaining = TX_DELAY_SECONDS; remaining > 0; remaining -= 1) {
      setTxDelaySeconds(remaining);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setTxDelaySeconds(null);
    setTxDelayLabel(null);
  };

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!expectedHash) {
      setDuplicateState('idle');
      setDuplicateMatch(null);
      setResumeState(null);
      setAllowDuplicate(false);
      setResumeHint(null);
      return;
    }
    const checkId = duplicateCheckRef.current + 1;
    duplicateCheckRef.current = checkId;
    setDuplicateState('checking');
    setDuplicateMatch(null);
    setAllowDuplicate(false);
    const expectedHex = bytesToHex(expectedHash);

    const runCheck = async () => {
      let uploadState: UploadState | null = null;
      if (props.walletSession.address) {
        try {
          uploadState = await client.getUploadState(
            expectedHash,
            props.walletSession.address,
            readOnlySender
          );
        } catch (error) {
          uploadState = null;
        }
      }

      if (duplicateCheckRef.current !== checkId) {
        return;
      }
      setResumeState(uploadState);

      try {
        const lastTokenId = await client.getLastTokenId(readOnlySender);
        for (let id = lastTokenId; ; id -= 1n) {
          const meta = await client.getInscriptionMeta(id, readOnlySender);
          if (duplicateCheckRef.current !== checkId) {
            return;
          }
          if (meta && bytesToHex(meta.finalHash) === expectedHex) {
            setDuplicateMatch({ id, owner: meta.owner ?? null });
            setDuplicateState('found');
            return;
          }
          if (id === 0n) {
            break;
          }
        }
        setDuplicateState('clear');
      } catch (error) {
        if (duplicateCheckRef.current !== checkId) {
          return;
        }
        setDuplicateState('error');
      }
    };

    void runCheck();
  }, [
    client,
    expectedHash,
    readOnlySender,
    resumeCheckKey
  ]);

  useEffect(() => {
    if (!resumeState || mintPending) {
      return;
    }
    if (beginState === 'idle') {
      setBeginState('done');
    }
  }, [resumeState, mintPending, beginState]);

  const appendLog = (message: string) => {
    setMintLog((prev) => {
      const next = [...prev, message];
      return next.slice(-30);
    });
    // eslint-disable-next-line no-console
    console.log(`[mint] ${message}`);
  };

  const setTokenUriStatusState = (
    message: string,
    tone: 'idle' | 'ok' | 'error' | 'pending'
  ) => {
    setTokenUriStatus(message);
    setTokenUriStatusTone(tone);
  };

  const resolveTokenUri = async () => {
    const value = tokenUri.trim() || DEFAULT_TOKEN_URI;
    if (!tokenUri.trim()) {
      setTokenUri(value);
    }
    if (!isHttpUrl(value)) {
      setTokenUriStatusState('Invalid URL. Use http(s).', 'error');
      return;
    }
    setTokenUriStatusState('Resolving...', 'pending');
    try {
      const response = await fetch(value, {
        redirect: 'follow',
        cache: 'no-store'
      });
      const finalUrl = response.url || value;
      if (finalUrl !== value) {
        setTokenUri(finalUrl);
      }
      const contentType = response.headers.get('content-type') || '';
      const suffix = contentType ? ` (${contentType})` : '';
      setTokenUriStatusState(`Resolved: ${finalUrl}${suffix}`, 'ok');
      appendLog(`Token URI resolved to ${finalUrl}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTokenUriStatusState('Resolve failed. See log for details.', 'error');
      appendLog(`Token URI resolve failed: ${message}`);
    }
  };

  const extractFeeRate = (value: unknown): number | null => {
    if (value == null) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (Array.isArray(value)) {
      const rates = value
        .map(extractFeeRate)
        .filter((rate): rate is number => !!rate && rate > 0);
      return rates.length ? Math.max(...rates) : null;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const direct =
        record.fee_rate ??
        record.feeRate ??
        record.fee_rate_per_byte ??
        record.feeRatePerByte;
      const directRate = extractFeeRate(direct);
      if (directRate) {
        return directRate;
      }
      if (Array.isArray(record.estimations)) {
        const rates = record.estimations
          .map((entry) => extractFeeRate(entry))
          .filter((rate): rate is number => !!rate && rate > 0);
        return rates.length ? Math.max(...rates) : null;
      }
    }
    return null;
  };

  const fetchFeeRate = async () => {
    setFeeRatePending(true);
    setFeeRateStatus('Fetching fee rate...');
    const baseUrl = getApiBaseUrl(props.contract.network);
    try {
      const response = await fetch(`${baseUrl}/v2/fees/transfer`, {
        cache: 'no-store',
        redirect: 'follow'
      });
      const text = await response.text();
      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        data = null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      const rate = extractFeeRate(data);
      if (!rate || !Number.isFinite(rate)) {
        throw new Error('Unrecognized fee response.');
      }
      setFeeRate(rate);
      setFeeRateUpdatedAt(Date.now());
      setFeeRateStatus(`Loaded fee rate: ${rate} microSTX/byte.`);
      appendLog(`Fee rate loaded: ${rate} microSTX/byte.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeeRate(null);
      setFeeRateStatus(`Fee rate fetch failed: ${message}`);
      appendLog(`Fee rate fetch failed: ${message}`);
    } finally {
      setFeeRatePending(false);
    }
  };

  const generateSip16Metadata = () => {
    if (!file || !expectedHashHex) {
      setMetadataStatus('Select a file to generate SIP-016 metadata.');
      return;
    }
    const mimeType = file.type || 'application/octet-stream';
    const metadata = buildSip16Metadata({
      contractId,
      contractName: props.contract.contractName,
      collectionName: SIP16_COLLECTION_NAME,
      collectionSymbol: SIP16_COLLECTION_SYMBOL,
      network: props.contract.network,
      protocolVersion: props.contract.protocolVersion,
      fileName: file.name,
      mimeType,
      totalBytes: file.size,
      totalChunks: chunks.length,
      expectedHashHex,
      creator: props.walletSession.address ?? null,
      dependencies: delegateTargetId ? [delegateTargetId] : []
    });
    const json = JSON.stringify(metadata, null, 2);
    setMetadataJson(json);
    setMetadataStatus(
      'SIP-016 metadata generated. Replace {resolver-host}/{preview-host}, host the JSON, then set token URI.'
    );
    appendLog('SIP-016 metadata generated.');
  };

  const copySip16Metadata = async () => {
    if (!metadataJson) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setMetadataStatus('Clipboard unavailable. Copy from the preview.');
      return;
    }
    try {
      await navigator.clipboard.writeText(metadataJson);
      setMetadataStatus('SIP-016 metadata copied to clipboard.');
      appendLog('SIP-016 metadata copied.');
    } catch (error) {
      setMetadataStatus('Copy failed. Copy from the preview.');
    }
  };

  const downloadSip16Metadata = () => {
    if (!metadataJson) {
      return;
    }
    const baseName = file ? file.name.replace(/\.[^/.]+$/, '') : 'xtrata';
    const safeBase = sanitizeFilename(baseName);
    const hashSuffix = expectedHashHex ? expectedHashHex.slice(0, 8) : 'meta';
    const filename = `${safeBase}-sip016-${hashSuffix}.json`;
    const blob = new Blob([metadataJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMetadataStatus(`Downloaded ${filename}.`);
    appendLog('SIP-016 metadata downloaded.');
  };

  const clearSip16Metadata = () => {
    setMetadataJson(null);
    setMetadataStatus(null);
  };

  const resetSteps = () => {
    setBeginState('idle');
    setUploadState('idle');
    setSealState('idle');
    setBatchProgress(null);
  };

  const resetPreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewText(null);
    setPreviewHtml(null);
    setShowHtmlSource(false);
  };

  const handleFileSelect = async (
    selected: File,
    options?: { clearDelegate?: boolean }
  ) => {
    resetSteps();
    setMintStatus(null);
    setMintLog([]);
    setMetadataJson(null);
    setMetadataStatus(null);
    setResumeHint(null);
    resetPreview();
    if (options?.clearDelegate !== false) {
      setDelegateTargetId(null);
      setDelegateMeta(null);
      setDelegateStatus(null);
    }
    if (maxFileBytes !== null && selected.size > maxFileBytes) {
      const maxReadable = formatBytes(BigInt(maxFileBytes));
      const actualReadable = formatBytes(BigInt(selected.size));
      const message = `File is too large (${actualReadable}). Max allowed is ${maxReadable}.`;
      setMintStatus(message);
      appendLog('Mint blocked: file too large.');
      logWarn('mint', 'Mint blocked: file too large', {
        fileName: selected.name,
        bytes: selected.size,
        maxBytes: maxFileBytes
      });
      setFile(null);
      setFileBytes(null);
      setChunks([]);
      setExpectedHash(null);
      setMetadataJson(null);
      setMetadataStatus(null);
      resetPreview();
      return;
    }
    setIsPreparing(true);
    setFile(selected);
    try {
      const bytes = await readFileBytes(selected);
      const nextChunks = chunkBytes(bytes, CHUNK_SIZE);
      const expectedHash = computeExpectedHash(nextChunks);
      const expectedHashHex = bytesToHex(expectedHash);
      const batchLimit = effectiveBatchSize;
      const batchCount =
        batchLimit > 0 ? Math.ceil(nextChunks.length / batchLimit) : 0;
      setFileBytes(bytes);
      setChunks(nextChunks);
      setExpectedHash(expectedHash);
      const previousAttempt = lastAttempt ?? (await loadMintAttempt(contractId));
      if (previousAttempt) {
        setLastAttempt(previousAttempt);
      }
      if (previousAttempt && previousAttempt.expectedHashHex === expectedHashHex) {
        const name = previousAttempt.fileName ?? selected.name;
        setResumeHint(
          `Matched your last inscription attempt (${name}). Resume will pick up where you left off.`
        );
      } else {
        setResumeHint(null);
      }
      const resolvedTokenUri =
        fixedTokenUri ?? (tokenUri.trim() || DEFAULT_TOKEN_URI);
      const attempt: MintAttempt = {
        contractId,
        expectedHashHex,
        fileName: selected.name,
        mimeType: selected.type || 'application/octet-stream',
        totalBytes: bytes.length,
        totalChunks: nextChunks.length,
        batchSize: batchLimit,
        tokenUri: resolvedTokenUri,
        updatedAt: Date.now()
      };
      void saveMintAttempt(attempt);
      setLastAttempt(attempt);
      logInfo('mint', 'Prepared inscription file', {
        fileName: selected.name,
        fileType: selected.type || 'application/octet-stream',
        bytes: bytes.length,
        chunks: nextChunks.length,
        chunkSize: CHUNK_SIZE,
        expectedHash: expectedHashHex,
        batchSize: batchLimit,
        batches: batchCount
      });

      const name = selected.name.toLowerCase();
      const isHtml =
        selected.type === 'text/html' ||
        selected.type === 'application/xhtml+xml' ||
        selected.type.includes('html') ||
        name.endsWith('.html') ||
        name.endsWith('.htm');
      if (selected.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(selected));
      } else if (
        selected.type.startsWith('audio/') ||
        selected.type.startsWith('video/')
      ) {
        setPreviewUrl(URL.createObjectURL(selected));
      } else if (isHtml) {
        const decoder = new TextDecoder();
        setPreviewHtml(decoder.decode(bytes));
        setShowHtmlSource(false);
      } else if (
        selected.type.startsWith('text/') ||
        selected.type.includes('json')
      ) {
        const decoder = new TextDecoder();
        setPreviewText(decoder.decode(bytes.slice(0, 4000)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('mint', 'Failed to read file', {
        fileName: selected.name,
        error: message
      });
      setMintStatus(`Failed to read file: ${message}`);
      setFile(null);
      setFileBytes(null);
      setChunks([]);
      setExpectedHash(null);
      setMetadataJson(null);
      setMetadataStatus(null);
      resetPreview();
    } finally {
      setIsPreparing(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      return;
    }
    void handleFileSelect(selected);
  };

  const handleGenerateDelegate = async () => {
    const parsedId = parseTokenIdInput(delegateTargetIdInput);
    if (parsedId === null) {
      setDelegateStatus('Enter a valid token ID.');
      return;
    }
    setDelegatePending(true);
    setDelegateStatus(null);
    setDelegateMeta(null);
    logInfo('mint', 'Generating delegate clone', {
      tokenId: parsedId.toString(),
      contractId: getContractId(props.contract)
    });
    try {
      const meta = await client.getInscriptionMeta(parsedId, readOnlySender);
      if (!meta) {
        setDelegateStatus(`No inscription found for ID ${parsedId.toString()}.`);
        setDelegateTargetId(null);
        logWarn('mint', 'Delegate target not found', {
          tokenId: parsedId.toString()
        });
        return;
      }
      const totalChunks = Number(meta.totalChunks);
      if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
        setDelegateStatus('Unable to derive chunk count for this inscription.');
        setDelegateTargetId(null);
        logWarn('mint', 'Delegate target missing chunk data', {
          tokenId: parsedId.toString()
        });
        return;
      }
      logInfo('mint', 'Delegate target loaded', {
        tokenId: parsedId.toString(),
        mimeType: meta.mimeType,
        totalChunks
      });
      const delegateHtml = buildDelegateHtml({
        contractAddress: props.contract.address,
        contractName: props.contract.contractName,
        apiBaseUrl:
          props.contract.network === 'mainnet'
            ? 'https://api.mainnet.hiro.so'
            : 'https://api.testnet.hiro.so',
        tokenId: parsedId,
        totalChunks,
        mimeType: meta.mimeType
      });
      const delegateFile = new File(
        [delegateHtml],
        `delegate-${parsedId.toString()}.html`,
        { type: 'text/html' }
      );
      setDelegateTargetId(parsedId);
      setDelegateMeta(meta);
      setDelegateTargetIdInput(parsedId.toString());
      if (!meta.sealed) {
        setDelegateStatus('Inscription is not sealed yet.');
      } else if (!props.walletSession.address) {
        setDelegateStatus('Connect a wallet to verify ownership.');
      } else if (meta.owner !== props.walletSession.address) {
        setDelegateStatus('Owner mismatch. Proceed only if this is yours.');
      }
      await handleFileSelect(delegateFile, { clearDelegate: false });
      appendLog(`Delegate clone generated for token #${parsedId.toString()}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDelegateStatus(`Delegate generation failed: ${message}`);
      setDelegateTargetId(null);
      logWarn('mint', 'Delegate generation failed', {
        tokenId: parsedId.toString(),
        error: message
      });
    } finally {
      setDelegatePending(false);
    }
  };

  const requestContractCall = (options: {
    functionName: string;
    functionArgs: ClarityValue[];
    logDetails?: Record<string, unknown>;
    postConditionMode?: PostConditionMode;
    postConditions?: PostCondition[];
  }) => {
    const network = props.walletSession.network ?? props.contract.network;
    const stxAddress = props.walletSession.address;
    logInfo('mint', 'Requesting contract call', {
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
          logInfo('mint', 'Contract call broadcast', {
            contractId,
            functionName: options.functionName,
            txId: resolved.txId
          });
          resolve(resolved);
        },
        onCancel: () => {
          logWarn('mint', 'Contract call cancelled', {
            contractId,
            functionName: options.functionName
          });
          reject(new Error('Wallet cancelled or failed to broadcast.'));
        }
      });
    });
  };

  const getMintInputs = () => {
    const walletAddress = props.walletSession.address;
    if (!walletAddress) {
      setMintStatus('Connect a wallet to inscribe.');
      appendLog('Mint blocked: wallet not connected.');
      logWarn('mint', 'Mint blocked: wallet not connected');
      return null;
    }
    if (mismatch) {
      setMintStatus(
        `Network mismatch: wallet on ${mismatch.actual}, contract is ${mismatch.expected}.`
      );
      appendLog('Mint blocked: network mismatch.');
      logWarn('mint', 'Mint blocked: network mismatch', {
        wallet: mismatch.actual,
        contract: mismatch.expected
      });
      return null;
    }
    if (!file || !fileBytes || !expectedHash) {
      setMintStatus('Select a file before continuing an inscription.');
      appendLog('Mint blocked: missing file.');
      logWarn('mint', 'Mint blocked: missing file');
      return null;
    }
    if (maxFileBytes !== null && file.size > maxFileBytes) {
      const maxReadable = formatBytes(BigInt(maxFileBytes));
      const actualReadable = formatBytes(BigInt(file.size));
      setMintStatus(
        `File is too large (${actualReadable}). Max allowed is ${maxReadable}.`
      );
      appendLog('Mint blocked: file too large.');
      logWarn('mint', 'Mint blocked: file too large', {
        fileName: file.name,
        bytes: file.size,
        maxBytes: maxFileBytes
      });
      return null;
    }
    const mimeType = file.type || 'application/octet-stream';
    if (!isAscii(mimeType) || mimeType.length > MAX_MIME_LENGTH) {
      setMintStatus('File type must be ASCII and <= 64 characters.');
      appendLog(`Mint blocked: invalid mime type (${mimeType}).`);
      logWarn('mint', 'Mint blocked: invalid mime type', { mimeType });
      return null;
    }
    let tokenUriValue = fixedTokenUri ?? tokenUri.trim();
    if (!tokenUriValue) {
      tokenUriValue = DEFAULT_TOKEN_URI;
      setTokenUri(tokenUriValue);
      appendLog('Token URI default applied.');
    }
    if (!isAscii(tokenUriValue) || tokenUriValue.length > MAX_TOKEN_URI_LENGTH) {
      setMintStatus('Token URI must be ASCII and <= 256 characters.');
      appendLog('Mint blocked: invalid token URI.');
      logWarn('mint', 'Mint blocked: invalid token URI', {
        tokenUriLength: tokenUriValue.length
      });
      return null;
    }
    const dependencyIds = delegateTargetId ? [delegateTargetId] : [];
    if (dependencyIds.length > 0 && !delegateMeta) {
      setMintStatus('Delegate target missing. Regenerate the delegate file.');
      appendLog('Mint blocked: delegate target missing.');
      logWarn('mint', 'Mint blocked: delegate target missing');
      return null;
    }
    if (hasDuplicate && !allowDuplicate) {
      setMintStatus(
        'Duplicate hash detected. Confirm the warning to proceed.'
      );
      appendLog('Mint blocked: duplicate hash not acknowledged.');
      logWarn('mint', 'Mint blocked: duplicate hash not acknowledged');
      return null;
    }
    return {
      walletAddress,
      mimeType,
      tokenUriValue,
      dependencyIds
    };
  };

  const getResumeValidationError = (
    state: UploadState,
    mimeType: string
  ) => {
    if (!fileBytes) {
      return 'Select the original file to resume this upload.';
    }
    if (state.mimeType !== mimeType) {
      return 'Selected file does not match the on-chain upload mime type.';
    }
    if (state.totalSize !== BigInt(fileBytes.length)) {
      return 'Selected file size does not match the on-chain upload.';
    }
    if (state.totalChunks !== BigInt(chunks.length)) {
      return 'Selected file chunk count does not match the on-chain upload.';
    }
    if (state.currentIndex > state.totalChunks) {
      return 'On-chain upload state is ahead of the selected file.';
    }
    return null;
  };

  const sendChunkBatchWithRetry = async (
    batch: Uint8Array[],
    label: string,
    details?: {
      batchIndex?: number;
      totalBatches?: number;
      batchBytes?: number;
      resume?: boolean;
    }
  ) => {
    if (!expectedHash) {
      throw new Error('Missing expected hash for batch upload.');
    }
    let attempt = 0;
    while (attempt < MAX_UPLOAD_RETRIES) {
      attempt += 1;
      try {
        const uploadTx = await requestContractCall({
          functionName: 'add-chunk-batch',
          functionArgs: [
            bufferCV(expectedHash),
            listCV(batch.map((chunk) => bufferCV(chunk)))
          ],
          logDetails: {
            action: 'add-chunk-batch',
            label,
            chunkCount: batch.length,
            batchBytes: details?.batchBytes ?? null,
            batchIndex: details?.batchIndex ?? null,
            totalBatches: details?.totalBatches ?? null,
            resume: details?.resume ?? false
          }
        });
        appendLog(`${label} tx sent: ${uploadTx.txId}`);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog(
          `${label} failed (attempt ${attempt}/${MAX_UPLOAD_RETRIES}): ${message}`
        );
        logWarn('mint', 'Batch upload failed', {
          label,
          attempt,
          error: message
        });
        if (attempt >= MAX_UPLOAD_RETRIES) {
          throw error;
        }
        appendLog(
          'Retrying batch after wallet error. Update the fee if needed.'
        );
      }
    }
  };

  const handleStartOver = async () => {
    if (!props.walletSession.address) {
      setMintStatus('Connect a wallet to clear the upload state.');
      appendLog('Start over blocked: wallet not connected.');
      logWarn('mint', 'Start over blocked: wallet not connected');
      return;
    }
    if (mismatch) {
      setMintStatus(
        `Network mismatch: wallet on ${mismatch.actual}, contract is ${mismatch.expected}.`
      );
      appendLog('Start over blocked: network mismatch.');
      logWarn('mint', 'Start over blocked: network mismatch', {
        wallet: mismatch.actual,
        contract: mismatch.expected
      });
      return;
    }
    if (pauseBlocked) {
      setMintStatus('Contract is paused. Only the contract owner can clear uploads.');
      appendLog('Start over blocked: contract paused.');
      logWarn('mint', 'Start over blocked: contract paused');
      return;
    }
    if (!capabilities.supportsAbandonUpload) {
      setMintStatus('This contract does not support clearing uploads.');
      appendLog('Start over blocked: abandon-upload unsupported.');
      logWarn('mint', 'Start over blocked: abandon-upload unsupported');
      return;
    }
    if (!expectedHash) {
      setMintStatus('Select a file before clearing the upload.');
      appendLog('Start over blocked: missing file.');
      logWarn('mint', 'Start over blocked: missing file');
      return;
    }

    setMintPending(true);
    setMintStatus('Clearing on-chain upload state...');
    appendLog('Clearing in-progress upload state.');
    logInfo('mint', 'Sending abandon-upload', {
      contractId: getContractId(props.contract),
      expectedHash: bytesToHex(expectedHash)
    });
    try {
      const abandonTx = await requestContractCall({
        functionName: 'abandon-upload',
        functionArgs: [bufferCV(expectedHash)],
        logDetails: {
          action: 'abandon-upload'
        }
      });
      appendLog(`Abandon tx sent: ${abandonTx.txId}`);
      logInfo('mint', 'Abandon upload broadcast', {
        txId: abandonTx.txId
      });
      setResumeState(null);
      setResumeCheckKey((prev) => prev + 1);
      resetSteps();
      setMintStatus('Upload state cleared. You can begin again once confirmed.');
      void clearMintAttempt(getContractId(props.contract));
      setLastAttempt(null);
      setResumeHint(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintStatus(`Unable to clear upload state: ${message}`);
      appendLog(`Abandon upload failed: ${message}`);
      logWarn('mint', 'Abandon upload failed', { error: message });
    } finally {
      setMintPending(false);
    }
  };

  const startMint = async () => {
    if (pauseBlocked) {
      setMintStatus('Contract is paused. Only the contract owner can mint.');
      appendLog('Mint blocked: contract paused.');
      logWarn('mint', 'Mint blocked: contract paused');
      return;
    }
    if (resumeState) {
      setMintStatus('Upload already started. Resume to continue.');
      appendLog('Mint blocked: upload already in progress.');
      logWarn('mint', 'Mint blocked: upload already in progress');
      return;
    }
    const mintInputs = getMintInputs();
    if (!mintInputs || !expectedHash || !fileBytes) {
      return;
    }

    const batchLimit = effectiveBatchSize;
    logInfo('mint', 'Mint start requested', {
      contractId,
      network: props.contract.network,
      wallet: mintInputs.walletAddress,
      fileName: file?.name ?? null,
      mimeType: mintInputs.mimeType,
      bytes: fileBytes.length,
      chunks: chunks.length,
      batchSize: batchLimit,
      batches: batches.length,
      tokenUriLength: mintInputs.tokenUriValue.length,
      dependencyCount: mintInputs.dependencyIds.length,
      expectedHash: bytesToHex(expectedHash)
    });

    setMintPending(true);
    setMintStatus('Preparing transactions...');
    resetSteps();
    appendLog('Starting inscription.');

    let activeStage: 'begin' | 'upload' | 'seal' = 'begin';

    try {
      setBeginState('pending');
      appendLog('Step 1: begin-inscription');
      const beginPostConditions = resolveFeePostConditions(feeEstimate.beginMicroStx);
      const beginTx = await requestContractCall({
        functionName: 'begin-inscription',
        functionArgs: [
          bufferCV(expectedHash),
          stringAsciiCV(mintInputs.mimeType),
          uintCV(BigInt(fileBytes.length)),
          uintCV(BigInt(chunks.length))
        ],
        postConditionMode: beginPostConditions ? PostConditionMode.Deny : undefined,
        postConditions: beginPostConditions,
        logDetails: {
          action: 'begin-inscription',
          mimeType: mintInputs.mimeType,
          totalSize: fileBytes.length,
          totalChunks: chunks.length,
          expectedHash: bytesToHex(expectedHash)
        }
      });
      appendLog(`Begin tx sent: ${beginTx.txId}`);
      setBeginState('done');
      await pauseBeforeNextTx('Next transaction in');

      activeStage = 'upload';
      setUploadState('pending');
      const totalBatches = batches.length;
      if (totalBatches === 0) {
        throw new Error('No batches to upload. Select a non-empty file.');
      }
      setBatchProgress({ current: 0, total: totalBatches });
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const batchBytes = batch.reduce((sum, chunk) => sum + chunk.length, 0);
        setBatchProgress({ current: index + 1, total: totalBatches });
        appendLog(`Step 2: upload batch ${index + 1}/${totalBatches}`);
        await sendChunkBatchWithRetry(
          batch,
          `Batch ${index + 1}/${totalBatches}`,
          {
            batchIndex: index + 1,
            totalBatches,
            batchBytes,
            resume: false
          }
        );
        if (index < batches.length - 1) {
          await pauseBeforeNextTx('Next batch in');
        }
      }
      setUploadState('done');

      activeStage = 'seal';
      setSealState('pending');
      appendLog(
        mintInputs.dependencyIds.length > 0
          ? `Step 3: seal-recursive (deps: ${mintInputs.dependencyIds
              .map((id) => id.toString())
              .join(', ')})`
          : 'Step 3: seal-inscription'
      );
      await pauseBeforeNextTx('Sealing in');
      const sealPostConditions = resolveFeePostConditions(feeEstimate.sealMicroStx);
      const sealTx = await requestContractCall({
        functionName:
          mintInputs.dependencyIds.length > 0
            ? 'seal-recursive'
            : 'seal-inscription',
        functionArgs:
          mintInputs.dependencyIds.length > 0
            ? [
                bufferCV(expectedHash),
                stringAsciiCV(mintInputs.tokenUriValue),
                listCV(mintInputs.dependencyIds.map((id) => uintCV(id)))
              ]
            : [bufferCV(expectedHash), stringAsciiCV(mintInputs.tokenUriValue)],
        postConditionMode: sealPostConditions ? PostConditionMode.Deny : undefined,
        postConditions: sealPostConditions,
        logDetails: {
          action:
            mintInputs.dependencyIds.length > 0
              ? 'seal-recursive'
              : 'seal-inscription',
          tokenUriLength: mintInputs.tokenUriValue.length,
          dependencyCount: mintInputs.dependencyIds.length,
          expectedHash: bytesToHex(expectedHash)
        }
      });
      appendLog(`Seal tx sent: ${sealTx.txId}`);
      setSealState('done');

      setMintStatus('Inscription complete. Await confirmations in wallet.');
      appendLog('Mint flow completed.');
      logInfo('mint', 'Mint flow completed', {
        contractId,
        txId: sealTx.txId
      });
      props.onInscriptionSealed?.({ txId: sealTx.txId });
      void clearMintAttempt(contractId);
      setLastAttempt(null);
      setResumeHint(null);
      setResumeState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintStatus(`Mint failed: ${message}`);
      appendLog(`Mint failed: ${message}`);
      logWarn('mint', 'Mint failed', { error: message });
      setTxDelaySeconds(null);
      setTxDelayLabel(null);
      if (activeStage === 'begin') {
        setBeginState('error');
      } else if (activeStage === 'upload') {
        setUploadState('error');
      } else if (activeStage === 'seal') {
        setSealState('error');
      }
      if (activeStage !== 'begin') {
        setResumeCheckKey((prev) => prev + 1);
      }
    } finally {
      setTxDelaySeconds(null);
      setTxDelayLabel(null);
      setMintPending(false);
    }
  };

  const resumeMint = async () => {
    if (pauseBlocked) {
      setMintStatus('Contract is paused. Only the contract owner can resume.');
      appendLog('Resume blocked: contract paused.');
      logWarn('mint', 'Resume blocked: contract paused');
      return;
    }
    const mintInputs = getMintInputs();
    if (!mintInputs || !expectedHash || !fileBytes) {
      return;
    }
    if (!resumeState) {
      setMintStatus('No in-progress upload found for this hash.');
      appendLog('Resume blocked: no upload state.');
      logWarn('mint', 'Resume blocked: no upload state');
      return;
    }
    if (resumeMismatch) {
      setMintStatus(resumeMismatch);
      appendLog(`Resume blocked: ${resumeMismatch}`);
      logWarn('mint', 'Resume blocked: mismatch', { reason: resumeMismatch });
      return;
    }
    if (resumeInfo && 'error' in resumeInfo) {
      setMintStatus(resumeInfo.error);
      appendLog(`Resume blocked: ${resumeInfo.error}`);
      logWarn('mint', 'Resume blocked: resume info error', {
        reason: resumeInfo.error
      });
      return;
    }

    const batchLimit = effectiveBatchSize;
    logInfo('mint', 'Resume requested', {
      contractId,
      network: props.contract.network,
      wallet: mintInputs.walletAddress,
      fileName: file?.name ?? null,
      mimeType: mintInputs.mimeType,
      bytes: fileBytes.length,
      chunks: chunks.length,
      batchSize: batchLimit,
      tokenUriLength: mintInputs.tokenUriValue.length,
      dependencyCount: mintInputs.dependencyIds.length,
      expectedHash: bytesToHex(expectedHash)
    });

    setMintPending(true);
    setMintStatus('Confirming on-chain upload state...');
    resetSteps();
    setBeginState('done');
    appendLog('Resuming inscription.');

    let activeStage: 'upload' | 'seal' = 'upload';

    try {
      const latestState = await client.getUploadState(
        expectedHash,
        mintInputs.walletAddress,
        readOnlySender
      );
      if (!latestState) {
        throw new Error('No on-chain upload state found for this hash.');
      }
      setResumeState(latestState);
      logInfo('mint', 'Upload state loaded', {
        currentIndex: latestState.currentIndex.toString(),
        totalChunks: latestState.totalChunks.toString()
      });
      const resumeError = getResumeValidationError(
        latestState,
        mintInputs.mimeType
      );
      if (resumeError) {
        throw new Error(resumeError);
      }
      const totalChunks = Number(latestState.totalChunks);
      const currentIndex = Number(latestState.currentIndex);
      if (
        !Number.isSafeInteger(totalChunks) ||
        !Number.isSafeInteger(currentIndex)
      ) {
        throw new Error('Upload state is too large to resume safely.');
      }
      if (currentIndex > chunks.length) {
        throw new Error('On-chain upload state exceeds local chunk count.');
      }
      const remainingChunks = chunks.slice(currentIndex);
      const batchLimit = effectiveBatchSize;
      const remainingBatches = batchChunks(remainingChunks, batchLimit);
      const didUploadBatches = remainingBatches.length > 0;
      appendLog(
        `On-chain confirmed: ${currentIndex}/${totalChunks} chunks uploaded. ${remainingBatches.length} batch${remainingBatches.length === 1 ? '' : 'es'} remaining.`
      );
      setMintStatus('Resuming upload batches...');

      if (remainingBatches.length > 0) {
        setUploadState('pending');
        setBatchProgress({ current: 0, total: remainingBatches.length });
        for (let index = 0; index < remainingBatches.length; index += 1) {
          const batch = remainingBatches[index];
          const batchBytes = batch.reduce((sum, chunk) => sum + chunk.length, 0);
          setBatchProgress({ current: index + 1, total: remainingBatches.length });
          appendLog(
            `Resume batch ${index + 1}/${remainingBatches.length}`
          );
          await sendChunkBatchWithRetry(
            batch,
            `Resume batch ${index + 1}/${remainingBatches.length}`,
            {
              batchIndex: index + 1,
              totalBatches: remainingBatches.length,
              batchBytes,
              resume: true
            }
          );
          if (index < remainingBatches.length - 1) {
            await pauseBeforeNextTx('Next batch in');
          }
        }
        setUploadState('done');
      } else {
        setUploadState('done');
        appendLog('All chunks already uploaded. Proceeding to seal.');
      }

      activeStage = 'seal';
      setSealState('pending');
      appendLog(
        mintInputs.dependencyIds.length > 0
          ? `Step 3: seal-recursive (deps: ${mintInputs.dependencyIds
              .map((id) => id.toString())
              .join(', ')})`
          : 'Step 3: seal-inscription'
      );
      if (didUploadBatches) {
        await pauseBeforeNextTx('Sealing in');
      }
      const sealPostConditions = resolveFeePostConditions(feeEstimate.sealMicroStx);
      const sealTx = await requestContractCall({
        functionName:
          mintInputs.dependencyIds.length > 0
            ? 'seal-recursive'
            : 'seal-inscription',
        functionArgs:
          mintInputs.dependencyIds.length > 0
            ? [
                bufferCV(expectedHash),
                stringAsciiCV(mintInputs.tokenUriValue),
                listCV(mintInputs.dependencyIds.map((id) => uintCV(id)))
              ]
            : [bufferCV(expectedHash), stringAsciiCV(mintInputs.tokenUriValue)],
        postConditionMode: sealPostConditions ? PostConditionMode.Deny : undefined,
        postConditions: sealPostConditions,
        logDetails: {
          action:
            mintInputs.dependencyIds.length > 0
              ? 'seal-recursive'
              : 'seal-inscription',
          tokenUriLength: mintInputs.tokenUriValue.length,
          dependencyCount: mintInputs.dependencyIds.length,
          expectedHash: bytesToHex(expectedHash)
        }
      });
      appendLog(`Seal tx sent: ${sealTx.txId}`);
      setSealState('done');

      setMintStatus('Inscription complete. Await confirmations in wallet.');
      appendLog('Mint flow completed.');
      logInfo('mint', 'Resume flow completed', {
        contractId,
        txId: sealTx.txId
      });
      props.onInscriptionSealed?.({ txId: sealTx.txId });
      void clearMintAttempt(contractId);
      setLastAttempt(null);
      setResumeHint(null);
      setResumeState(null);
      setResumeCheckKey((prev) => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintStatus(`Mint failed: ${message}`);
      appendLog(`Mint failed: ${message}`);
      logWarn('mint', 'Resume failed', { error: message });
      setTxDelaySeconds(null);
      setTxDelayLabel(null);
      if (activeStage === 'upload') {
        setUploadState('error');
      } else if (activeStage === 'seal') {
        setSealState('error');
      }
      setResumeCheckKey((prev) => prev + 1);
    } finally {
      setTxDelaySeconds(null);
      setTxDelayLabel(null);
      setMintPending(false);
    }
  };

  const mintActionLabel = resumeState ? 'Resume inscription' : 'Begin inscription';
  const mintActionPendingLabel = resumeState ? 'Resuming...' : 'Minting...';
  const allowDuplicateOverride = disableDuplicateOverride ? false : allowDuplicate;
  const mintActionDisabled =
    mintPending ||
    isPreparing ||
    delegatePending ||
    !file ||
    !expectedHash ||
    !props.walletSession.address ||
    !!mismatch ||
    pauseBlocked ||
    duplicateState === 'checking' ||
    (hasDuplicate && !allowDuplicateOverride) ||
    (resumeState ? resumeBlocked : false);
  const startOverUnsupported = !capabilities.supportsAbandonUpload;
  const startOverDisabled =
    mintPending ||
    isPreparing ||
    delegatePending ||
    !expectedHash ||
    !props.walletSession.address ||
    !!mismatch ||
    pauseBlocked ||
    startOverUnsupported;
  const metadataDisabled = isPreparing || !file || !expectedHashHex;
  const formattedTxDelay =
    txDelaySeconds === null ? null : txDelaySeconds.toString().padStart(2, '0');

  return (
    <section
      className={`panel mint app-section app-section--fit${props.collapsed ? ' panel--collapsed' : ''}`}
      id="mint"
    >
      <div className="panel__header">
        <div>
          <h2>Mint inscription</h2>
          <p>Upload a file, review fees, and inscribe on-chain.</p>
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
        <label className="field">
          <span className="field__label">Select a file</span>
          <input className="input" type="file" onChange={onFileChange} />
        </label>
        {maxFileBytes !== null && (
          <span className="meta-value">
            Max file size: {formatBytes(BigInt(maxFileBytes))}.
          </span>
        )}
        {isPreparing && <p>Preparing file for inscription...</p>}

        {!hideDelegate && (
          <div className="mint-panel mint-delegate">
            <span className="meta-label">Delegate clone</span>
            <p className="meta-value">
              Generate a tiny recursive HTML wrapper that mirrors an existing
              inscription.
            </p>
            <label className="field">
              <span className="field__label">Original token ID</span>
              <input
                className="input"
                placeholder="e.g. 12"
                value={delegateTargetIdInput}
                onChange={(event) => {
                  setDelegateTargetIdInput(event.target.value);
                  setDelegateStatus(null);
                }}
              />
            </label>
            <div className="mint-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void handleGenerateDelegate()}
                disabled={delegatePending}
              >
                {delegatePending ? 'Generating...' : 'Generate delegate file'}
              </button>
              {delegateTargetId && (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => {
                    setDelegateTargetId(null);
                    setDelegateMeta(null);
                    setDelegateStatus(null);
                  }}
                >
                  Clear delegate
                </button>
              )}
            </div>
            {delegateStatus && (
              <span className="meta-value">{delegateStatus}</span>
            )}
            {delegateMeta && delegateTargetId && (
              <div className="mint-kv">
                <div>
                  <span className="meta-label">Target</span>
                  <span className="meta-value">
                    #{delegateTargetId.toString()}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Mime type</span>
                  <span className="meta-value">{delegateMeta.mimeType}</span>
                </div>
                <div>
                  <span className="meta-label">Chunks</span>
                  <span className="meta-value">
                    {delegateMeta.totalChunks.toString()}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Owner</span>
                  <span className="meta-value">
                    {delegateMeta.owner ?? 'Unknown'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {file && (
          <div className="mint-grid">
            <div className="mint-panel">
              <div className="mint-preview__header">
                <span className="meta-label">Preview</span>
                <div className="mint-preview__actions">
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={handleBackToWallet}
                  >
                    Back to wallet
                  </button>
                  {previewHtml && (
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => setShowHtmlSource((value) => !value)}
                    >
                      {showHtmlSource ? 'Render HTML' : 'View source'}
                    </button>
                  )}
                </div>
              </div>
              <div className="mint-preview">
                {!previewUrl && !previewText && !previewHtml && (
                  <span className="mint-placeholder">No preview available.</span>
                )}
                {previewUrl && file.type.startsWith('image/') && (
                  <img src={previewUrl} alt={file.name} />
                )}
                {previewUrl && file.type.startsWith('audio/') && (
                  <audio controls src={previewUrl} />
                )}
                {previewUrl && file.type.startsWith('video/') && (
                  <video controls src={previewUrl} />
                )}
                {previewHtml && !showHtmlSource && (
                  <iframe
                    title="Mint HTML preview"
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    srcDoc={previewHtml}
                  />
                )}
                {previewHtml && showHtmlSource && (
                  <pre className="mint-text">{previewHtml}</pre>
                )}
                {!previewHtml && previewText && (
                  <pre className="mint-text">{previewText}</pre>
                )}
              </div>
            </div>
            <div className="mint-panel">
              <span className="meta-label">Inscription plan</span>
              <div className="mint-kv">
                <div>
                  <span className="meta-label">File</span>
                  <span className="meta-value">{file.name}</span>
                </div>
                <div>
                  <span className="meta-label">Type</span>
                  <span className="meta-value">
                    {file.type || 'application/octet-stream'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Size</span>
                  <span className="meta-value">
                    {formatBytes(totalBytes)}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Chunks</span>
                  <span className="meta-value">{chunks.length}</span>
                </div>
                <div>
                  <span className="meta-label">Chunk size</span>
                  <span className="meta-value">{CHUNK_SIZE} bytes</span>
                </div>
                <div>
                  <span className="meta-label">Batches</span>
                  <span className="meta-value">{uploadBatchCount}</span>
                </div>
                {expectedHashHex && (
                  <div>
                    <span className="meta-label">Expected hash</span>
                    <span className="meta-value mint-hash">
                      {expectedHashHex}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mint-settings">
          {!hideTokenUri && (
            <label className="field">
              <span className="field__label">Token URI (required)</span>
              <input
                className="input"
                placeholder="https://example.com/metadata.json"
                value={tokenUri}
                onChange={(event) => {
                  setTokenUri(event.target.value);
                  setTokenUriStatus(null);
                  setTokenUriStatusTone('idle');
                }}
              />
              {!hideMetadataTools && (
                <div className="token-uri-actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void resolveTokenUri()}
                  >
                    Resolve token URI
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={generateSip16Metadata}
                    disabled={metadataDisabled}
                  >
                    Generate SIP-016 metadata
                  </button>
                  {tokenUriStatus && (
                    <span
                      className={`token-uri-status token-uri-status--${tokenUriStatusTone}`}
                    >
                      {tokenUriStatus}
                    </span>
                  )}
                </div>
              )}
              {!hideMetadataTools && metadataStatus && (
                <span className="meta-value">{metadataStatus}</span>
              )}
              {!hideMetadataTools && metadataJson && (
                <details className="mint-metadata" open>
                  <summary>Generated SIP-016 metadata</summary>
                  <div className="mint-metadata__body">
                    <div className="mint-actions">
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={() => void copySip16Metadata()}
                      >
                        Copy JSON
                      </button>
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={downloadSip16Metadata}
                      >
                        Download JSON
                      </button>
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={clearSip16Metadata}
                      >
                        Clear
                      </button>
                    </div>
                    <pre className="mint-text mint-metadata__pre">
                      {metadataJson}
                    </pre>
                  </div>
                </details>
              )}
            </label>
          )}
          {!hideBatchSize ? (
            <label className="field">
              <span className="field__label">Batch size</span>
              <select
                className="select"
                value={batchSize}
                onChange={(event) => setBatchSize(Number(event.target.value))}
              >
                {BATCH_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} chunks / tx
                  </option>
                ))}
              </select>
              <span className="meta-value">
                Max {MAX_BATCH_SIZE} chunks per batch.
              </span>
            </label>
          ) : (
            <div className="mint-panel">
              <span className="meta-label">Batch size</span>
              <span className="meta-value">
                {effectiveBatchSize} chunks / tx
              </span>
            </div>
          )}
        </div>

        <div className="mint-fees">
          <div>
            <span className="meta-label">Fee unit</span>
            <span className="meta-value">
              {feeUnitValue !== null ? formatMicroStx(feeUnitValue) : 'Unknown'}
            </span>
            {adminStatusQuery.isFetching && (
              <span className="meta-value">Fetching fee unit...</span>
            )}
            {feeUnitError && <span className="meta-value">{feeUnitError}</span>}
          </div>
          <div>
            <span className="meta-label">Init fee</span>
            <span className="meta-value">
              {formatStx(feeEstimate.beginMicroStx)}
            </span>
          </div>
          <div>
            <span className="meta-label">Seal fee</span>
            <span className="meta-value">
              {hasChunks ? (
                <>
                  {feeUnitValue !== null
                    ? formatMicroStx(feeUnitValue)
                    : 'Fee unit'}{' '}
                  × (1 + {feeEstimate.feeBatches} batches) ={' '}
                  {formatStx(feeEstimate.sealMicroStx)}
                </>
              ) : (
                'Select a file to estimate.'
              )}
            </span>
          </div>
          <div>
            <span className="meta-label">Total contract fees</span>
            <span className="meta-value">
              {formatStx(feeEstimate.totalMicroStx)}
            </span>
          </div>
          {!hideFeeRateFetch && (
            <div className="fee-fetch">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void fetchFeeRate()}
                disabled={feeRatePending}
              >
                {feeRatePending ? 'Fetching fee rate...' : 'Fetch fee rate'}
              </button>
              {feeRateStatus && (
                <span className="meta-value">{feeRateStatus}</span>
              )}
              {feeRate && networkFeeEstimate && (
                <span className="meta-value">
                  Estimated network fees: {formatMicroStx(networkFeeEstimate)}
                  {feeRateUpdatedAt
                    ? ` (updated ${Math.round(
                        (Date.now() - feeRateUpdatedAt) / 1000
                      )}s ago)`
                    : ''}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="alert">
          <strong>Automated sequence.</strong> After you approve the first
          transaction, all remaining transactions will appear automatically in
          order. If anything goes wrong, reload the page and re-select the exact
          same file — your latest upload is stored locally (IndexedDB) and will
          rehydrate the mint state so you can resume where you left off.
        </div>

        {resumeHint && <div className="alert">{resumeHint}</div>}

        <div className="mint-steps">
          <div className={`mint-step mint-step--${beginState}`}>
            <span>1. Initialization</span>
            <span>{formatStepStatus(beginState)}</span>
          </div>
          <div className={`mint-step mint-step--${uploadState}`}>
            <span>
              2. Upload batches
              {batchProgress
                ? ` (${batchProgress.current}/${batchProgress.total})`
                : ''}
            </span>
            <span>{formatStepStatus(uploadState)}</span>
          </div>
          <div className={`mint-step mint-step--${sealState}`}>
            <span>3. Seal inscription</span>
            <span>{formatStepStatus(sealState)}</span>
          </div>
          {formattedTxDelay && (
            <div className="mint-step mint-step--pending mint-step--countdown">
              <span>Automated sequence</span>
              <span>
                {(txDelayLabel ?? 'Next transaction in')} {formattedTxDelay}s
              </span>
            </div>
          )}
        </div>

        <div className="mint-actions">
          <button
            className="button"
            type="button"
            disabled={mintActionDisabled}
            onClick={() => void (resumeState ? resumeMint() : startMint())}
          >
            {mintPending ? mintActionPendingLabel : mintActionLabel}
          </button>
          {!props.walletSession.address && (
            <span className="meta-value">
              Connect a wallet to enable minting.
            </span>
          )}
          {mismatch && (
            <span className="meta-value">
              Switch wallet to {mismatch.expected} to mint.
            </span>
          )}
        </div>

        {mismatch && (
          <div className="alert">
            Wallet network is {mismatch.actual}. Switch to{' '}
            {mismatch.expected} to mint with this contract.
          </div>
        )}

        {pauseBlocked && (
          <div className="alert">
            Contract is paused. Only the contract owner can inscribe.
          </div>
        )}

        {mintStatus && <div className="alert">{mintStatus}</div>}

        {formattedTxDelay && (
          <div className="alert">
            {(txDelayLabel ?? 'Next transaction in')} {formattedTxDelay}s
          </div>
        )}

        {delegateTargetId && (
          <div className="alert">
            Delegate clone active. Seal will link to token #
            {delegateTargetId.toString()}.
          </div>
        )}

        {duplicateState === 'checking' && (
          <div className="alert">
            Checking for existing inscriptions of this hash...
          </div>
        )}

        {resumeState && (
          <div className="alert">
            <div>
              <strong>Upload already started.</strong>{' '}
              {resumeState.currentIndex.toString()}/
              {resumeState.totalChunks.toString()} chunks uploaded.
              {resumeInfo && !('error' in resumeInfo) && (
                <div className="meta-value">
                  {resumeInfo.remainingBatches} batch
                  {resumeInfo.remainingBatches === 1 ? '' : 'es'} remaining.
                </div>
              )}
              {resumeInfo && !('error' in resumeInfo) && (
                <div className="meta-value">
                  {resumeInfo.remainingBatches > 0
                    ? 'Next: upload remaining batches, then seal.'
                    : 'Next: seal inscription.'}
                </div>
              )}
              {resumeInfo && 'error' in resumeInfo && (
                <div className="meta-value">{resumeInfo.error}</div>
              )}
              {resumeMismatch && (
                <div className="meta-value">{resumeMismatch}</div>
              )}
              {startOverUnsupported && (
                <div className="meta-value">
                  Clearing uploads is not supported by this contract.
                </div>
              )}
            </div>
            <div className="mint-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void handleStartOver()}
                disabled={startOverDisabled}
              >
                Start over
              </button>
            </div>
          </div>
        )}

        {duplicateMatch && (
          <div className="alert">
            <div>
              <strong>Duplicate hash detected.</strong> Token #
              {duplicateMatch.id.toString()} already matches this content
              {duplicateMatch.owner
                ? ` (owner ${duplicateMatch.owner}).`
                : '.'}
            </div>
            {!disableDuplicateOverride ? (
              !allowDuplicate ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setAllowDuplicate(true)}
                >
                  Proceed anyway
                </button>
              ) : (
                <span className="meta-value">Proceeding anyway.</span>
              )
            ) : (
              <span className="meta-value">Minting blocked for duplicates.</span>
            )}
          </div>
        )}

        {duplicateState === 'error' && (
          <div className="alert">
            Unable to check for duplicate inscriptions right now.
          </div>
        )}

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
