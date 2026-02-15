import { useCallback, useEffect, useMemo, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import {
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  listCV,
  principalCV,
  stringAsciiCV,
  uintCV,
  validateStacksAddress,
  type ClarityValue
} from '@stacks/transactions';
import AddressLabel from './components/AddressLabel';
import { createXtrataClient } from './lib/contract/client';
import { batchChunks, chunkBytes, computeExpectedHash } from './lib/chunking/hash';
import { PUBLIC_CONTRACT } from './config/public';
import { DEFAULT_TOKEN_URI } from './lib/mint/constants';
import { getNetworkFromAddress, getNetworkMismatch } from './lib/network/guard';
import { toStacksNetwork } from './lib/network/stacks';
import type { NetworkType } from './lib/network/types';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from './lib/theme/preferences';
import { bytesToHex } from './lib/utils/encoding';
import { formatBytes } from './lib/utils/format';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import type { WalletSession } from './lib/wallet/types';

const walletSessionStore = createWalletSessionStore();
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
const MINT_CHUNK_BATCH_SIZE = 30;
const STATUS_REFRESH_MS = 20_000;
const MINTED_SCAN_BATCH_SIZE = 8;

type CollectionMintLivePageProps = {
  collectionId: string;
};

type CollectionRecord = {
  id: string;
  slug: string;
  display_name: string | null;
  contract_address: string | null;
  state: string;
  metadata?: Record<string, unknown> | null;
};

type CollectionAsset = {
  asset_id: string;
  path: string;
  filename: string | null;
  mime_type: string;
  expected_hash: string | null;
  total_bytes: number;
  total_chunks: number;
  state: string;
};

type CollectionContractTarget = {
  address: string;
  contractName: string;
  network: NetworkType;
};

type ContractStatus = {
  paused: boolean | null;
  finalized: boolean | null;
  mintPrice: bigint | null;
  maxSupply: bigint | null;
  mintedCount: bigint | null;
  reservedCount: bigint | null;
};

type TxPayload = {
  txId: string;
};

const toText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const parseJsonResponse = async <T,>(response: Response, label: string) => {
  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      const snippet = text.slice(0, 180).replace(/\s+/g, ' ').trim();
      throw new Error(`${label} is not JSON: ${snippet}`);
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? ((payload as { error: string }).error ?? '').trim()
        : '';
    throw new Error(message || `${label} request failed (${response.status}).`);
  }
  return payload as T;
};

const unwrapReadOnly = (value: ClarityValue) => {
  if (value.type === ClarityType.ResponseOk) {
    return value.value;
  }
  if (value.type === ClarityType.ResponseErr) {
    throw new Error('Read-only call failed.');
  }
  return value;
};

const parseUintCv = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (parsed === null || parsed === undefined) {
    return null;
  }
  if (typeof parsed === 'bigint') {
    return parsed;
  }
  if (typeof parsed === 'string') {
    try {
      return BigInt(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed === 'number') {
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return BigInt(Math.floor(parsed));
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'value' in (parsed as Record<string, unknown>)
  ) {
    const raw = (parsed as { value?: unknown }).value;
    if (typeof raw === 'bigint') {
      return raw;
    }
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeHashHex = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/^0x/, '');
  if (!HASH_HEX_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
};

const hashHexToBytes = (hashHex: string) => {
  const normalized = normalizeHashHex(hashHex);
  if (!normalized) {
    return null;
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const inferNetworkFromContract = (value: string) =>
  getNetworkFromAddress(value) ?? 'mainnet';

const parseContractId = (value: string): CollectionContractTarget | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const [address = '', contractName = ''] = trimmed.split('.');
  if (!validateStacksAddress(address) || !CONTRACT_NAME_PATTERN.test(contractName)) {
    return null;
  }
  return {
    address,
    contractName,
    network: inferNetworkFromContract(address)
  };
};

const toMicroStxLabel = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  const negative = value < 0n;
  const normalized = negative ? -value : value;
  const whole = normalized / 1_000_000n;
  const fraction = (normalized % 1_000_000n).toString().padStart(6, '0');
  const fractionTrimmed = fraction.replace(/0+$/, '');
  const base = fractionTrimmed.length > 0 ? `${whole}.${fractionTrimmed}` : `${whole}`;
  return `${negative ? '-' : ''}${base} STX`;
};

const formatCount = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  return value.toString();
};

const shuffleAssets = (assets: CollectionAsset[]) => {
  const next = [...assets];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[target];
    next[target] = current;
  }
  return next;
};

export default function CollectionMintLivePage(props: CollectionMintLivePageProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialTheme());
  const [walletSession, setWalletSession] = useState<WalletSession>(() =>
    walletSessionStore.load()
  );
  const [walletPending, setWalletPending] = useState(false);
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [assets, setAssets] = useState<CollectionAsset[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState<string | null>(null);
  const [contractStatus, setContractStatus] = useState<ContractStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [mintPending, setMintPending] = useState(false);
  const [mintMessage, setMintMessage] = useState<string | null>(null);
  const [mintLog, setMintLog] = useState<string[]>([]);
  const [mintedTokenIds, setMintedTokenIds] = useState<Record<string, string>>({});
  const [mintedScanPending, setMintedScanPending] = useState(false);
  const [pendingMintAssetIds, setPendingMintAssetIds] = useState<string[]>([]);

  const normalizedCollectionId = useMemo(
    () => props.collectionId.trim(),
    [props.collectionId]
  );

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'Xtrata Collection Mint',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const metadata = useMemo(() => toRecord(collection?.metadata) ?? null, [collection]);
  const metadataCollection = useMemo(
    () => toRecord(metadata?.collection) ?? null,
    [metadata]
  );
  const metadataCollectionPage = useMemo(
    () => toRecord(metadata?.collectionPage) ?? null,
    [metadata]
  );
  const metadataCover = useMemo(
    () => toRecord(metadataCollectionPage?.coverImage) ?? null,
    [metadataCollectionPage]
  );

  const collectionContract = useMemo(() => {
    const address = toText(collection?.contract_address);
    const name = toText(metadata?.contractName);
    if (!validateStacksAddress(address) || !CONTRACT_NAME_PATTERN.test(name)) {
      return null;
    }
    return {
      address,
      contractName: name,
      network: inferNetworkFromContract(address)
    } as CollectionContractTarget;
  }, [collection, metadata]);

  const coreContract = useMemo(() => {
    const configuredCore = parseContractId(toText(metadata?.coreContractId));
    if (configuredCore) {
      return configuredCore;
    }
    return {
      address: PUBLIC_CONTRACT.address,
      contractName: PUBLIC_CONTRACT.contractName,
      network: PUBLIC_CONTRACT.network
    } satisfies CollectionContractTarget;
  }, [metadata]);

  const coreClient = useMemo(
    () =>
      createXtrataClient({
        contract: {
          address: coreContract.address,
          contractName: coreContract.contractName,
          network: coreContract.network
        }
      }),
    [coreContract]
  );

  const networkMismatch = useMemo(
    () =>
      collectionContract
        ? getNetworkMismatch(collectionContract.network, walletSession.network)
        : null,
    [collectionContract, walletSession.network]
  );

  const imageAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const mime = asset.mime_type.trim().toLowerCase();
        return mime.startsWith('image/');
      }),
    [assets]
  );

  const mintedGallery = useMemo(
    () =>
      imageAssets.filter(
        (asset) => typeof mintedTokenIds[asset.asset_id] === 'string'
      ),
    [imageAssets, mintedTokenIds]
  );

  const coverUrl = useMemo(() => {
    const source = toText(metadataCover?.source);
    if (source === 'collection-asset') {
      const assetId = toText(metadataCover?.assetId);
      if (!assetId || !normalizedCollectionId) {
        return null;
      }
      return `/collections/${encodeURIComponent(
        normalizedCollectionId
      )}/asset-preview?assetId=${encodeURIComponent(assetId)}`;
    }
    if (source === 'inscribed-image-url') {
      const imageUrl = toText(metadataCover?.imageUrl);
      if (imageUrl) {
        return imageUrl;
      }
    }
    const fallback = imageAssets[0];
    if (!fallback || !normalizedCollectionId) {
      return null;
    }
    return `/collections/${encodeURIComponent(
      normalizedCollectionId
    )}/asset-preview?assetId=${encodeURIComponent(fallback.asset_id)}`;
  }, [metadataCover, imageAssets, normalizedCollectionId]);

  const collectionTitle = useMemo(
    () =>
      toText(collection?.display_name) ||
      toText(metadataCollection?.name) ||
      toText(collection?.slug) ||
      'Untitled collection',
    [collection, metadataCollection]
  );

  const collectionDescription = useMemo(
    () =>
      toText(metadataCollection?.description) ||
      'This collection is live on Xtrata.',
    [metadataCollection]
  );

  const collectionSymbol = useMemo(
    () => toText(metadataCollection?.symbol) || 'NO-TICKER',
    [metadataCollection]
  );

  const collectionState = toText(collection?.state).toLowerCase() || 'unknown';
  const published = collectionState === 'published';

  const remaining = useMemo(() => {
    if (!contractStatus?.maxSupply || contractStatus.mintedCount === null) {
      return null;
    }
    const reserved = contractStatus.reservedCount ?? 0n;
    const used = contractStatus.mintedCount + reserved;
    if (used >= contractStatus.maxSupply) {
      return 0n;
    }
    return contractStatus.maxSupply - used;
  }, [contractStatus]);

  const soldOut = useMemo(() => {
    if (!contractStatus) {
      return false;
    }
    if (remaining !== null && remaining <= 0n) {
      return true;
    }
    if (contractStatus.finalized === true) {
      return true;
    }
    if (
      contractStatus.maxSupply !== null &&
      contractStatus.mintedCount !== null &&
      contractStatus.mintedCount >= contractStatus.maxSupply
    ) {
      return true;
    }
    return false;
  }, [contractStatus, remaining]);

  const mintUnavailableReason = useMemo(() => {
    if (!published) {
      return 'This collection is not live yet.';
    }
    if (!collectionContract) {
      return 'Collection contract details are missing.';
    }
    if (contractStatus?.paused) {
      return 'Minting is currently paused.';
    }
    if (contractStatus?.finalized) {
      return 'Minting is finalized.';
    }
    if (remaining !== null && remaining <= 0n) {
      return 'This collection is sold out.';
    }
    if (imageAssets.length === 0) {
      return 'No image assets are available for minting.';
    }
    return null;
  }, [
    collectionContract,
    contractStatus?.finalized,
    contractStatus?.paused,
    imageAssets.length,
    published,
    remaining
  ]);

  const appendMintLog = useCallback((message: string) => {
    setMintLog((current) => [...current, message].slice(-20));
  }, []);

  const loadCollectionSnapshot = useCallback(async () => {
    if (!normalizedCollectionId) {
      setCollection(null);
      setAssets([]);
      setCollectionMessage('Collection id missing from URL.');
      return;
    }
    setCollectionLoading(true);
    setCollectionMessage(null);
    try {
      const [collectionResponse, assetsResponse] = await Promise.all([
        fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}`, {
          cache: 'no-store'
        }),
        fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}/assets`, {
          cache: 'no-store'
        })
      ]);
      const loadedCollection = await parseJsonResponse<CollectionRecord>(
        collectionResponse,
        'Collection'
      );
      const loadedAssets = await parseJsonResponse<CollectionAsset[]>(
        assetsResponse,
        'Collection assets'
      );
      setCollection(loadedCollection);
      setAssets(loadedAssets);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCollection(null);
      setAssets([]);
      setCollectionMessage(message);
    } finally {
      setCollectionLoading(false);
    }
  }, [normalizedCollectionId]);

  const loadContractStatus = useCallback(async () => {
    if (!collectionContract) {
      setContractStatus(null);
      return;
    }
    setStatusLoading(true);
    setStatusMessage(null);
    try {
      const network = toStacksNetwork(collectionContract.network);
      const senderAddress = walletSession.address ?? collectionContract.address;
      const readOnly = async (functionName: string) => {
        const value = await callReadOnlyFunction({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName,
          functionArgs: [],
          senderAddress,
          network
        });
        return unwrapReadOnly(value);
      };

      const [pausedCv, finalizedCv, mintPriceCv, maxSupplyCv, mintedCountCv, reservedCountCv] =
        await Promise.all([
          readOnly('is-paused'),
          readOnly('get-finalized'),
          readOnly('get-mint-price'),
          readOnly('get-max-supply'),
          readOnly('get-minted-count'),
          readOnly('get-reserved-count')
        ]);

      setContractStatus({
        paused: Boolean(cvToValue(pausedCv)),
        finalized: Boolean(cvToValue(finalizedCv)),
        mintPrice: parseUintCv(mintPriceCv),
        maxSupply: parseUintCv(maxSupplyCv),
        mintedCount: parseUintCv(mintedCountCv),
        reservedCount: parseUintCv(reservedCountCv)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Unable to refresh contract status: ${message}`);
    } finally {
      setStatusLoading(false);
    }
  }, [collectionContract, walletSession.address]);

  const scanMintedAssets = useCallback(async () => {
    if (!normalizedCollectionId || imageAssets.length === 0) {
      setMintedTokenIds({});
      return;
    }
    setMintedScanPending(true);
    const senderAddress = walletSession.address ?? coreContract.address;
    const next: Record<string, string> = {};
    try {
      for (let offset = 0; offset < imageAssets.length; offset += MINTED_SCAN_BATCH_SIZE) {
        const batch = imageAssets.slice(offset, offset + MINTED_SCAN_BATCH_SIZE);
        const settled = await Promise.all(
          batch.map(async (asset) => {
            const hashBytes = hashHexToBytes(asset.expected_hash ?? '');
            if (!hashBytes) {
              return null;
            }
            try {
              const tokenId = await coreClient.getIdByHash(hashBytes, senderAddress);
              if (tokenId === null) {
                return null;
              }
              return { assetId: asset.asset_id, tokenId: tokenId.toString() };
            } catch {
              return null;
            }
          })
        );
        settled.forEach((entry) => {
          if (!entry) {
            return;
          }
          next[entry.assetId] = entry.tokenId;
        });
      }
      setMintedTokenIds(next);
    } finally {
      setMintedScanPending(false);
    }
  }, [coreClient, coreContract.address, imageAssets, normalizedCollectionId, walletSession.address]);

  const ensureConnectedWallet = useCallback(async () => {
    if (walletSession.address && walletSession.network) {
      return walletSession;
    }
    setWalletPending(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
      return session;
    } finally {
      setWalletPending(false);
    }
  }, [walletAdapter, walletSession]);

  const requestCollectionContractCall = useCallback(
    (
      params: {
        functionName: string;
        functionArgs: ClarityValue[];
      },
      session: WalletSession
    ) => {
      if (!collectionContract) {
        throw new Error('Collection contract is not configured.');
      }
      if (!session.address) {
        throw new Error('Connect a wallet before minting.');
      }
      const network = session.network ?? collectionContract.network;
      return new Promise<TxPayload>((resolve, reject) => {
        showContractCall({
          contractAddress: collectionContract.address,
          contractName: collectionContract.contractName,
          functionName: params.functionName,
          functionArgs: params.functionArgs,
          network,
          stxAddress: session.address,
          appDetails: {
            name: 'Xtrata Collection Mint'
          },
          onFinish: (payload) => resolve(payload as TxPayload),
          onCancel: () =>
            reject(new Error('Wallet cancelled or failed to broadcast transaction.'))
        });
      });
    },
    [collectionContract]
  );

  const mintAsset = useCallback(
    async (asset: CollectionAsset, session: WalletSession) => {
      if (!normalizedCollectionId) {
        throw new Error('Collection id missing.');
      }
      const expectedHashBytes = hashHexToBytes(asset.expected_hash ?? '');
      if (!expectedHashBytes) {
        throw new Error('Asset hash is missing or invalid.');
      }
      const tokenUri = DEFAULT_TOKEN_URI;
      const previewResponse = await fetch(
        `/collections/${encodeURIComponent(
          normalizedCollectionId
        )}/asset-preview?assetId=${encodeURIComponent(asset.asset_id)}`,
        { cache: 'no-store' }
      );
      if (!previewResponse.ok) {
        const text = (await previewResponse.text())
          .slice(0, 180)
          .replace(/\s+/g, ' ')
          .trim();
        throw new Error(
          `Unable to load asset bytes (${previewResponse.status})${text ? `: ${text}` : ''}.`
        );
      }
      const rawBytes = new Uint8Array(await previewResponse.arrayBuffer());
      const chunks = chunkBytes(rawBytes);
      const computedHash = computeExpectedHash(chunks);
      const computedHex = bytesToHex(computedHash);
      const expectedHex = bytesToHex(expectedHashBytes);
      if (computedHex !== expectedHex) {
        throw new Error('Asset bytes do not match expected on-chain hash.');
      }
      if (asset.total_bytes > 0 && asset.total_bytes !== rawBytes.length) {
        throw new Error('Asset byte size does not match staged metadata.');
      }
      if (asset.total_chunks > 0 && asset.total_chunks !== chunks.length) {
        throw new Error('Asset chunk count does not match staged metadata.');
      }

      const coreContractId = `${coreContract.address}.${coreContract.contractName}`;

      setMintMessage('Approve begin transaction in wallet.');
      const beginTx = await requestCollectionContractCall(
        {
          functionName: 'mint-begin',
          functionArgs: [
            principalCV(coreContractId),
            bufferCV(expectedHashBytes),
            stringAsciiCV(asset.mime_type || 'application/octet-stream'),
            uintCV(BigInt(rawBytes.length)),
            uintCV(BigInt(chunks.length))
          ]
        },
        session
      );
      appendMintLog(`Begin submitted: ${beginTx.txId}`);

      const chunkBatches = batchChunks(chunks, MINT_CHUNK_BATCH_SIZE);
      for (let index = 0; index < chunkBatches.length; index += 1) {
        setMintMessage(
          `Approve chunk upload ${index + 1}/${chunkBatches.length} in wallet.`
        );
        const uploadTx = await requestCollectionContractCall(
          {
            functionName: 'mint-add-chunk-batch',
            functionArgs: [
              principalCV(coreContractId),
              bufferCV(expectedHashBytes),
              listCV(chunkBatches[index].map((chunk) => bufferCV(chunk)))
            ]
          },
          session
        );
        appendMintLog(
          `Chunk batch ${index + 1}/${chunkBatches.length} submitted: ${uploadTx.txId}`
        );
      }

      setMintMessage('Approve seal transaction in wallet.');
      const sealTx = await requestCollectionContractCall(
        {
          functionName: 'mint-seal',
          functionArgs: [
            principalCV(coreContractId),
            bufferCV(expectedHashBytes),
            stringAsciiCV(tokenUri)
          ]
        },
        session
      );
      appendMintLog(`Seal submitted: ${sealTx.txId}`);
      return sealTx.txId;
    },
    [
      appendMintLog,
      coreContract.address,
      coreContract.contractName,
      normalizedCollectionId,
      requestCollectionContractCall
    ]
  );

  const handleMintNow = useCallback(async () => {
    if (mintPending || walletPending) {
      return;
    }
    if (mintUnavailableReason) {
      setMintMessage(mintUnavailableReason);
      return;
    }

    setMintPending(true);
    setMintMessage(null);
    let selectedAssetId: string | null = null;
    try {
      const session = await ensureConnectedWallet();
      if (!session.address || !session.network) {
        throw new Error('Connect a wallet before minting.');
      }
      const mismatch = getNetworkMismatch(collectionContract.network, session.network);
      if (mismatch) {
        throw new Error(`Switch wallet to ${mismatch.expected} before minting.`);
      }

      const senderAddress = session.address;
      const shuffled = shuffleAssets(imageAssets);
      const nextMinted = { ...mintedTokenIds };
      let target: CollectionAsset | null = null;

      for (const candidate of shuffled) {
        if (pendingMintAssetIds.includes(candidate.asset_id)) {
          continue;
        }
        if (nextMinted[candidate.asset_id]) {
          continue;
        }
        const hashBytes = hashHexToBytes(candidate.expected_hash ?? '');
        if (!hashBytes) {
          continue;
        }
        try {
          const existingId = await coreClient.getIdByHash(hashBytes, senderAddress);
          if (existingId !== null) {
            nextMinted[candidate.asset_id] = existingId.toString();
            continue;
          }
        } catch {
          // If this one lookup fails, keep trying other candidates.
        }
        target = candidate;
        break;
      }

      setMintedTokenIds(nextMinted);

      if (!target) {
        setMintMessage('No unminted items remain. This collection appears sold out.');
        await loadContractStatus();
        await scanMintedAssets();
        return;
      }

      selectedAssetId = target.asset_id;
      setPendingMintAssetIds((current) =>
        current.includes(target.asset_id) ? current : [...current, target.asset_id]
      );
      setMintMessage(`Preparing ${target.filename ?? target.path}...`);
      const sealTxId = await mintAsset(target, session);
      setMintMessage(`Mint submitted: ${sealTxId}`);
      window.setTimeout(() => {
        void loadContractStatus();
        void scanMintedAssets();
      }, 8_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMintMessage(message);
      appendMintLog(`Mint failed: ${message}`);
    } finally {
      if (selectedAssetId) {
        setPendingMintAssetIds((current) =>
          current.filter((value) => value !== selectedAssetId)
        );
      }
      setMintPending(false);
    }
  }, [
    appendMintLog,
    collectionContract,
    contractStatus?.finalized,
    contractStatus?.paused,
    coreClient,
    ensureConnectedWallet,
    imageAssets,
    loadContractStatus,
    mintAsset,
    mintPending,
    mintUnavailableReason,
    mintedTokenIds,
    pendingMintAssetIds,
    scanMintedAssets,
    walletPending
  ]);

  const handleConnectWallet = useCallback(async () => {
    setWalletPending(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
    } finally {
      setWalletPending(false);
    }
  }, [walletAdapter]);

  const handleDisconnectWallet = useCallback(async () => {
    setWalletPending(true);
    try {
      await walletAdapter.disconnect();
      setWalletSession(walletAdapter.getSession());
    } finally {
      setWalletPending(false);
    }
  }, [walletAdapter]);

  useEffect(() => {
    applyThemeToDocument(themeMode);
    writeThemePreference(themeMode);
  }, [themeMode]);

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

  useEffect(() => {
    void loadCollectionSnapshot();
  }, [loadCollectionSnapshot]);

  useEffect(() => {
    if (!collectionContract) {
      return;
    }
    void loadContractStatus();
    const timer = window.setInterval(() => {
      void loadContractStatus();
    }, STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [collectionContract, loadContractStatus]);

  useEffect(() => {
    if (!collection || !published || !collectionContract || imageAssets.length === 0) {
      return;
    }
    void scanMintedAssets();
  }, [
    collection,
    collectionContract,
    imageAssets.length,
    published,
    scanMintedAssets,
    contractStatus?.mintedCount
  ]);

  const mintedCountLabel = formatCount(contractStatus?.mintedCount ?? null);
  const maxSupplyLabel = formatCount(contractStatus?.maxSupply ?? null);
  const reservedCountLabel = formatCount(contractStatus?.reservedCount ?? null);
  const remainingLabel = remaining === null ? 'Unknown' : remaining.toString();
  const mintPriceLabel = toMicroStxLabel(contractStatus?.mintPrice ?? null);
  const pausedStatus = contractStatus?.paused;
  const pausedLabel =
    pausedStatus === null || pausedStatus === undefined
      ? 'Unknown'
      : pausedStatus
        ? 'Yes'
        : 'No';
  const finalizedStatus = contractStatus?.finalized;
  const finalizedLabel =
    finalizedStatus === null || finalizedStatus === undefined
      ? 'Unknown'
      : finalizedStatus
        ? 'Yes'
        : 'No';

  return (
    <div className="app collection-live-page">
      <header className="app__header collection-live-page__header">
        <section className="collection-live-page__hero">
          {soldOut && <span className="collection-live-page__stamp">Sold out</span>}
          <div className="collection-live-page__hero-media">
            {coverUrl ? (
              <img src={coverUrl} alt={`${collectionTitle} cover`} />
            ) : (
              <div className="collection-live-page__hero-placeholder">
                Cover image unavailable
              </div>
            )}
          </div>
          <div className="collection-live-page__hero-copy">
            <p className="collection-live-page__eyebrow">Live collection mint</p>
            <h1>{collectionTitle}</h1>
            <p>{collectionDescription}</p>
            <div className="collection-live-page__hero-meta">
              <span>Ticker: {collectionSymbol}</span>
              <span>State: {published ? 'Live' : collectionState || 'Unknown'}</span>
              <span>Mint price: {mintPriceLabel}</span>
            </div>
            <div className="collection-live-page__hero-actions">
              {walletSession.isConnected ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleDisconnectWallet}
                  disabled={walletPending}
                >
                  Disconnect wallet
                </button>
              ) : (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleConnectWallet}
                  disabled={walletPending}
                >
                  {walletPending ? 'Connecting...' : 'Connect wallet'}
                </button>
              )}
              <button
                className="button"
                type="button"
                onClick={() => void handleMintNow()}
                disabled={mintPending || walletPending || Boolean(mintUnavailableReason)}
              >
                {mintPending
                  ? 'Minting...'
                  : mintUnavailableReason
                    ? 'Mint unavailable'
                    : 'Mint one now'}
              </button>
            </div>
          </div>
        </section>
      </header>

      <main className="app__main collection-live-page__main">
        <section className="panel app-section collection-live-page__status">
          <div className="panel__header">
            <div>
              <h2>Collection status</h2>
              <p></p>
            </div>
            <div className="panel__actions">
              <label className="theme-select" htmlFor="live-theme-select">
                <span className="theme-select__label">Theme</span>
                <select
                  id="live-theme-select"
                  className="theme-select__control"
                  value={themeMode}
                  onChange={(event) => setThemeMode(coerceThemeMode(event.target.value))}
                  onInput={(event) =>
                    setThemeMode(coerceThemeMode(event.currentTarget.value))
                  }
                >
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="panel__body">
            <div className="meta-grid">
              <div>
                <span className="meta-label">Collection ID</span>
                <span className="meta-value">
                  <code>{normalizedCollectionId || 'Unknown'}</code>
                </span>
              </div>
              <div>
                <span className="meta-label">Minted / max</span>
                <span className="meta-value">
                  {mintedCountLabel} / {maxSupplyLabel}
                </span>
              </div>
              <div>
                <span className="meta-label">Reserved</span>
                <span className="meta-value">{reservedCountLabel}</span>
              </div>
              <div>
                <span className="meta-label">Remaining</span>
                <span className="meta-value">{remainingLabel}</span>
              </div>
              <div>
                <span className="meta-label">Paused</span>
                <span className="meta-value">{pausedLabel}</span>
              </div>
              <div>
                <span className="meta-label">Finalized</span>
                <span className="meta-value">{finalizedLabel}</span>
              </div>
              <div>
                <span className="meta-label">Wallet</span>
                <AddressLabel
                  className="meta-value"
                  address={walletSession.address}
                  network={walletSession.network}
                  fallback="Not connected"
                />
              </div>
              <div>
                <span className="meta-label">Collection contract</span>
                <span className="meta-value">
                  {collectionContract
                    ? `${collectionContract.address}.${collectionContract.contractName}`
                    : 'Unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Core contract</span>
                <span className="meta-value">
                  {`${coreContract.address}.${coreContract.contractName}`}
                </span>
              </div>
            </div>

            {networkMismatch && (
              <div className="alert">
                Wallet is on {networkMismatch.actual}. Switch to {networkMismatch.expected} to mint.
              </div>
            )}

            {!published && (
              <div className="alert">
                This collection is not live yet. Publishing is required before public minting.
              </div>
            )}

            {collectionMessage && <div className="alert">{collectionMessage}</div>}
            {statusMessage && <div className="alert">{statusMessage}</div>}
            {mintUnavailableReason && !mintMessage && (
              <div className="alert">{mintUnavailableReason}</div>
            )}
            {mintMessage && <div className="alert">{mintMessage}</div>}
            {collectionLoading && <p className="meta-value">Loading collection...</p>}
            {statusLoading && <p className="meta-value">Refreshing contract status...</p>}
            {mintedScanPending && (
              <p className="meta-value">Refreshing minted gallery...</p>
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

        <section className="panel app-section collection-live-page__gallery">
          <div className="panel__header">
            <div>
              <h2>Previously inscribed</h2>
              <p>Thumbnails of minted images from this live collection.</p>
            </div>
          </div>
          <div className="panel__body">
            {mintedGallery.length === 0 ? (
              <p className="meta-value">
                No minted thumbnails yet. This gallery updates as new mints are confirmed.
              </p>
            ) : (
              <div className="collection-live-page__gallery-grid">
                {mintedGallery.map((asset) => {
                  const tokenId = mintedTokenIds[asset.asset_id] ?? null;
                  const previewUrl = `/collections/${encodeURIComponent(
                    normalizedCollectionId
                  )}/asset-preview?assetId=${encodeURIComponent(asset.asset_id)}`;
                  return (
                    <article
                      key={asset.asset_id}
                      className="collection-live-page__gallery-item"
                    >
                      <div className="collection-live-page__gallery-frame">
                        <img
                          src={previewUrl}
                          alt={asset.filename ?? asset.path}
                          loading="lazy"
                        />
                      </div>
                      <div className="collection-live-page__gallery-meta">
                        <span className="meta-value" title={asset.filename ?? asset.path}>
                          {asset.filename ?? asset.path}
                        </span>
                        <span className="meta-label">
                          {tokenId ? `Token #${tokenId}` : 'Token ID pending'}
                        </span>
                        <span className="meta-label">
                          {formatBytes(BigInt(asset.total_bytes))}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
