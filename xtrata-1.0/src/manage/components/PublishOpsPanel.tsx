import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '@stacks/connect';
import {
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  principalCV,
  validateStacksAddress,
  type ClarityValue
} from '@stacks/transactions';
import { getNetworkFromAddress } from '../../lib/network/guard';
import { toStacksNetwork } from '../../lib/network/stacks';
import { parseStxToMicroStx } from '../../lib/collections/display-price';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import { useManageWallet } from '../ManageWalletContext';
import InfoTooltip from './InfoTooltip';

type CollectionRecord = {
  id: string;
  slug: string;
  display_name: string | null;
  state: string;
  contract_address: string | null;
  metadata?: Record<string, unknown> | null;
};

type ManagedAsset = {
  asset_id: string;
  path: string;
  filename: string | null;
  mime_type: string;
  storage_key: string | null;
  state?: string | null;
};

type PublishReadiness = {
  loading: boolean;
  contractConnected: boolean;
  mintType: 'standard' | 'pre-inscribed';
  activeAssets: number;
  supplyTarget: number;
  error: string | null;
};

type CoverImageSource = 'collection-asset' | 'inscribed-image-url';
type DisplayMintPriceMode = 'on-chain' | 'override';

type ContractTarget = {
  address: string;
  contractName: string;
  network: 'mainnet' | 'testnet';
};

type OnChainReservationStatus = {
  exists: boolean;
  createdAt: bigint | null;
  phaseId: bigint | null;
};

type TxPayload = {
  txId: string;
};

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
const COLLECTION_PAGE_DESCRIPTION_MAX_LENGTH = 4000;
const XTRATA_APP_ICON_DATA_URI =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>';

const parsePositiveInt = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const toText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const toMultilineText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\r\n/g, '\n');
};

const isImageMimeType = (mimeType: string) =>
  mimeType.trim().toLowerCase().startsWith('image/');

const normalizeCoverSource = (value: unknown): CoverImageSource | null => {
  if (value === 'collection-asset') {
    return 'collection-asset';
  }
  if (value === 'inscribed-image-url') {
    return 'inscribed-image-url';
  }
  return null;
};

const normalizeDisplayMintPriceMode = (value: unknown): DisplayMintPriceMode =>
  value === 'override' ? 'override' : 'on-chain';

const isValidCoverUrl = (value: string) =>
  /^(https?:\/\/|ipfs:\/\/|data:image\/)/i.test(value);

const normalizeHashHex = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  if (!HASH_HEX_PATTERN.test(normalized)) {
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

const parseUintCv = (value: ClarityValue | null | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = cvToValue(value) as unknown;
  if (typeof parsed === 'bigint') {
    return parsed;
  }
  if (typeof parsed === 'number') {
    return Number.isFinite(parsed) ? BigInt(Math.floor(parsed)) : null;
  }
  if (typeof parsed === 'string' && /^\d+$/.test(parsed)) {
    return BigInt(parsed);
  }
  if (parsed && typeof parsed === 'object' && 'value' in parsed) {
    const raw = (parsed as { value?: unknown }).value;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) {
      return BigInt(raw);
    }
  }
  return null;
};

const unwrapReadOnly = (value: ClarityValue) => {
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
          : 'Read-only call failed';
    throw new Error(String(detail));
  }
  return value;
};

type PublishOpsPanelProps = {
  activeCollectionId?: string;
};

export default function PublishOpsPanel(props: PublishOpsPanelProps) {
  const { walletSession, walletAdapter, connect } = useManageWallet();
  const [collectionId, setCollectionId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Array<Record<string, unknown>>>([]);
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [assets, setAssets] = useState<ManagedAsset[]>([]);
  const [coverSource, setCoverSource] = useState<CoverImageSource>('collection-asset');
  const [selectedCoverAssetId, setSelectedCoverAssetId] = useState('');
  const [inscribedCoverUrl, setInscribedCoverUrl] = useState('');
  const [collectionDescriptionInput, setCollectionDescriptionInput] = useState('');
  const [displayMintPriceMode, setDisplayMintPriceMode] =
    useState<DisplayMintPriceMode>('on-chain');
  const [displayMintPriceInput, setDisplayMintPriceInput] = useState('');
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [descriptionMessage, setDescriptionMessage] = useState<string | null>(null);
  const [displayPriceMessage, setDisplayPriceMessage] = useState<string | null>(null);
  const [liveLinkMessage, setLiveLinkMessage] = useState<string | null>(null);
  const [coverSaving, setCoverSaving] = useState(false);
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [displayPriceSaving, setDisplayPriceSaving] = useState(false);
  const [coverPreviewFailed, setCoverPreviewFailed] = useState(false);
  const [onChainReservationOwner, setOnChainReservationOwner] = useState('');
  const [onChainReservationHash, setOnChainReservationHash] = useState('');
  const [onChainReservationStatus, setOnChainReservationStatus] =
    useState<OnChainReservationStatus | null>(null);
  const [onChainReservationMessage, setOnChainReservationMessage] = useState<string | null>(
    null
  );
  const [onChainReservedCount, setOnChainReservedCount] = useState<bigint | null>(null);
  const [onChainReservationLoading, setOnChainReservationLoading] = useState(false);
  const [onChainReservationActionPending, setOnChainReservationActionPending] =
    useState(false);
  const [readiness, setReadiness] = useState<PublishReadiness>({
    loading: false,
    contractConnected: false,
    mintType: 'standard',
    activeAssets: 0,
    supplyTarget: 0,
    error: null
  });
  const normalizedActiveCollectionId = useMemo(
    () => props.activeCollectionId?.trim() ?? '',
    [props.activeCollectionId]
  );

  const metadata = useMemo(
    () => toRecord(collection?.metadata) ?? null,
    [collection]
  );
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
  const collectionContractTarget = useMemo((): ContractTarget | null => {
    const address = toText(collection?.contract_address);
    const contractName = toText(metadata?.contractName);
    if (!validateStacksAddress(address) || !CONTRACT_NAME_PATTERN.test(contractName)) {
      return null;
    }
    return {
      address,
      contractName,
      network: getNetworkFromAddress(address) ?? 'mainnet'
    };
  }, [collection, metadata]);

  const previewTitle = useMemo(
    () =>
      toText(collection?.display_name) ||
      toText(metadataCollection?.name) ||
      toText(collection?.slug) ||
      'Untitled collection',
    [collection, metadataCollection]
  );
  const previewSymbol = useMemo(
    () => toText(metadataCollection?.symbol) || 'NO-TICKER',
    [metadataCollection]
  );
  const previewDescription = useMemo(
    () =>
      toMultilineText(metadataCollectionPage?.description) ||
      toMultilineText(metadataCollection?.description) ||
      'Add a short description so collectors instantly understand your drop.',
    [metadataCollection, metadataCollectionPage]
  );
  const previewSupply = useMemo(
    () => parsePositiveInt(metadataCollection?.supply),
    [metadataCollection]
  );
  const previewMintPrice = useMemo(
    () =>
      displayMintPriceMode === 'override'
        ? displayMintPriceInput.trim() || toText(metadataCollection?.mintPriceStx) || '0'
        : toText(metadataCollection?.mintPriceStx) || '0',
    [displayMintPriceInput, displayMintPriceMode, metadataCollection]
  );

  const callCollectionReadOnly = async (
    functionName: string,
    functionArgs: ClarityValue[] = []
  ) => {
    if (!collectionContractTarget) {
      throw new Error('Collection contract is not configured yet.');
    }
    const senderAddress = walletSession.address ?? collectionContractTarget.address;
    const network = toStacksNetwork(walletSession.network ?? collectionContractTarget.network);
    const value = await callReadOnlyFunction({
      contractAddress: collectionContractTarget.address,
      contractName: collectionContractTarget.contractName,
      functionName,
      functionArgs,
      senderAddress,
      network
    });
    return unwrapReadOnly(value);
  };

  const refreshOnChainReservedCount = async () => {
    if (!collectionContractTarget) {
      setOnChainReservedCount(null);
      return;
    }
    try {
      const reservedCv = await callCollectionReadOnly('get-reserved-count');
      setOnChainReservedCount(parseUintCv(reservedCv));
    } catch {
      setOnChainReservedCount(null);
    }
  };

  const parseReservationHashInput = () => {
    if (!collectionContractTarget) {
      setOnChainReservationMessage('Collection contract is not configured yet.');
      return null;
    }
    const hashHex = normalizeHashHex(onChainReservationHash);
    if (!hashHex) {
      setOnChainReservationMessage(
        'Enter a valid reservation hash (64 hex characters, optional 0x prefix).'
      );
      return null;
    }
    return hashHex;
  };

  const parseReservationTargetInputs = () => {
    const hashHex = parseReservationHashInput();
    if (!hashHex) {
      return null;
    }
    const owner = onChainReservationOwner.trim();
    if (!validateStacksAddress(owner)) {
      setOnChainReservationMessage('Enter a valid reservation owner wallet address.');
      return null;
    }
    return { owner, hashHex };
  };

  const requestCollectionContractCall = async (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    if (!collectionContractTarget) {
      throw new Error('Collection contract is not configured yet.');
    }
    let session = walletSession;
    if (!session.address || !session.network) {
      await connect();
      session = walletAdapter.getSession();
    }
    if (!session.address || !session.network) {
      throw new Error('Connect a wallet before submitting this action.');
    }
    return new Promise<TxPayload>((resolve, reject) => {
      showContractCall({
        contractAddress: collectionContractTarget.address,
        contractName: collectionContractTarget.contractName,
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
          reject(new Error('Wallet cancelled or failed to broadcast transaction.'))
      });
    });
  };

  const loadOnChainReservationStatus = async () => {
    const target = parseReservationTargetInputs();
    if (!target) {
      return;
    }
    setOnChainReservationLoading(true);
    setOnChainReservationMessage(null);
    try {
      const reservationCv = await callCollectionReadOnly('get-reservation', [
        principalCV(target.owner),
        hashHexToBufferCv(target.hashHex)
      ]);
      if (reservationCv.type === ClarityType.OptionalSome) {
        const raw = cvToValue(reservationCv.value) as {
          value?: {
            'created-at'?: { value?: string };
            'phase-id'?: { value?: string };
          };
          'created-at'?: { value?: string };
          'phase-id'?: { value?: string };
        };
        const createdAtRaw =
          raw?.value?.['created-at']?.value ?? raw?.['created-at']?.value ?? null;
        const phaseIdRaw =
          raw?.value?.['phase-id']?.value ?? raw?.['phase-id']?.value ?? null;
        setOnChainReservationStatus({
          exists: true,
          createdAt: createdAtRaw ? BigInt(createdAtRaw) : null,
          phaseId: phaseIdRaw ? BigInt(phaseIdRaw) : null
        });
      } else {
        setOnChainReservationStatus({ exists: false, createdAt: null, phaseId: null });
      }
      await refreshOnChainReservedCount();
    } catch (error) {
      setOnChainReservationMessage(
        toManageApiErrorMessage(error, 'Unable to load on-chain reservation status.')
      );
    } finally {
      setOnChainReservationLoading(false);
    }
  };

  const runOnChainReservationAction = async (
    label: string,
    functionName: string,
    ownerRequired: boolean
  ) => {
    const hashHex = parseReservationHashInput();
    if (!hashHex) {
      return;
    }
    const owner = onChainReservationOwner.trim();
    if (ownerRequired && !validateStacksAddress(owner)) {
      setOnChainReservationMessage('Enter a valid reservation owner wallet address.');
      return;
    }
    setOnChainReservationActionPending(true);
    setOnChainReservationMessage(null);
    try {
      const functionArgs = ownerRequired
        ? [principalCV(owner), hashHexToBufferCv(hashHex)]
        : [hashHexToBufferCv(hashHex)];
      const payload = await requestCollectionContractCall({
        functionName,
        functionArgs
      });
      setOnChainReservationMessage(`${label} submitted: ${payload.txId}`);
      await refreshOnChainReservedCount();
    } catch (error) {
      setOnChainReservationMessage(toManageApiErrorMessage(error, `${label} failed`));
    } finally {
      setOnChainReservationActionPending(false);
    }
  };

  const loadReadiness = async () => {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      setCollection(null);
      setAssets([]);
      setCoverSource('collection-asset');
      setSelectedCoverAssetId('');
      setInscribedCoverUrl('');
      setCollectionDescriptionInput('');
      setDisplayMintPriceMode('on-chain');
      setDisplayMintPriceInput('');
      setOnChainReservationStatus(null);
      setOnChainReservationMessage(null);
      setOnChainReservedCount(null);
      setReadiness({
        loading: false,
        contractConnected: false,
        mintType: 'standard',
        activeAssets: 0,
        supplyTarget: 0,
        error: null
      });
      return;
    }

    setReadiness((prev) => ({ ...prev, loading: true, error: null }));
    setCoverMessage(null);
    try {
      const [collectionResponse, assetsResponse] = await Promise.all([
        fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}`),
        fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}/assets`)
      ]);

      const loadedCollection = await parseManageJsonResponse<CollectionRecord>(
        collectionResponse,
        'Collection'
      );
      const loadedAssets = await parseManageJsonResponse<ManagedAsset[]>(
        assetsResponse,
        'Collection assets'
      );

      const loadedMetadata = toRecord(loadedCollection.metadata) ?? null;
      const mintTypeRaw =
        loadedMetadata && typeof loadedMetadata.mintType === 'string'
          ? loadedMetadata.mintType
          : 'standard';
      const mintType = mintTypeRaw === 'pre-inscribed' ? 'pre-inscribed' : 'standard';
      const supplyTarget = parsePositiveInt(
        loadedMetadata &&
          typeof loadedMetadata.collection === 'object' &&
          loadedMetadata.collection !== null
          ? (loadedMetadata.collection as Record<string, unknown>).supply
          : 0
      );

      const activeAssets = loadedAssets.filter((asset) => {
        const state = String(asset.state ?? '').toLowerCase();
        return state !== 'expired' && state !== 'sold-out';
      }).length;

      const loadedCollectionPage = toRecord(loadedMetadata?.collectionPage) ?? null;
      const loadedCover = toRecord(loadedCollectionPage?.coverImage) ?? null;
      const savedSource = normalizeCoverSource(loadedCover?.source);
      const savedAssetId = toText(loadedCover?.assetId);
      const savedUrl = toText(loadedCover?.imageUrl);
      const loadedCollectionMetadata = toRecord(loadedMetadata?.collection) ?? null;
      const savedDescription =
        toMultilineText(loadedCollectionPage?.description) ||
        toMultilineText(loadedCollectionMetadata?.description);
      const savedDisplayPriceMode = normalizeDisplayMintPriceMode(
        loadedCollectionPage?.displayMintPriceMode
      );
      const savedDisplayPrice =
        toText(loadedCollectionPage?.displayMintPriceStx) ||
        toText(loadedCollectionMetadata?.mintPriceStx);

      setCollection(loadedCollection);
      setAssets(loadedAssets);
      setCoverSource(savedSource ?? 'collection-asset');
      setSelectedCoverAssetId(savedAssetId);
      setInscribedCoverUrl(savedUrl);
      setCollectionDescriptionInput(savedDescription);
      setDisplayMintPriceMode(savedDisplayPriceMode);
      setDisplayMintPriceInput(savedDisplayPrice);
      setReadiness({
        loading: false,
        contractConnected: !!loadedCollection.contract_address,
        mintType,
        activeAssets,
        supplyTarget,
        error: null
      });
    } catch (error) {
      setCollection(null);
      setAssets([]);
      setCollectionDescriptionInput('');
      setDisplayMintPriceMode('on-chain');
      setDisplayMintPriceInput('');
      setOnChainReservationStatus(null);
      setOnChainReservedCount(null);
      setReadiness({
        loading: false,
        contractConnected: false,
        mintType: 'standard',
        activeAssets: 0,
        supplyTarget: 0,
        error: toManageApiErrorMessage(error, 'Unable to run publish checks.')
      });
    }
  };

  const publishCollection = async () => {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      setMessage('Collection id required.');
      return;
    }
    const response = await fetch(
      `/collections/${encodeURIComponent(normalizedCollectionId)}/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'published' })
      }
    );
    try {
      await parseManageJsonResponse(response, 'Publish');
      setMessage('Collection published.');
      await loadReadiness();
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Publish failed'));
    }
  };

  const loadReservations = async () => {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      return;
    }
    const response = await fetch(
      `/collections/${encodeURIComponent(normalizedCollectionId)}/reserve`
    );
    try {
      const payload = await parseManageJsonResponse<Array<Record<string, unknown>>>(
        response,
        'Reservations'
      );
      setReservations(payload);
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Unable to refresh reservations.'));
    }
  };

  const saveCoverSettings = async () => {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      setCoverMessage('Collection id required.');
      return;
    }
    if (!collection) {
      setCoverMessage('Load collection details before saving cover image settings.');
      return;
    }

    let coverImage: Record<string, unknown>;
    if (coverSource === 'collection-asset') {
      if (!selectedCoverAssetId) {
        setCoverMessage('Choose an image from the collection first.');
        return;
      }
      const selectedAsset = assets.find(
        (asset) => asset.asset_id === selectedCoverAssetId
      );
      if (!selectedAsset) {
        setCoverMessage('Selected image is no longer available. Refresh and choose again.');
        return;
      }
      if (!isImageMimeType(selectedAsset.mime_type)) {
        setCoverMessage('Selected asset is not an image.');
        return;
      }
      coverImage = {
        source: 'collection-asset',
        assetId: selectedAsset.asset_id,
        path: selectedAsset.path,
        filename: selectedAsset.filename,
        mimeType: selectedAsset.mime_type,
        storageKey: selectedAsset.storage_key
      };
    } else {
      const normalizedUrl = inscribedCoverUrl.trim();
      if (!normalizedUrl) {
        setCoverMessage('Enter an existing inscribed image URL first.');
        return;
      }
      if (!isValidCoverUrl(normalizedUrl)) {
        setCoverMessage(
          'Use a valid URL: https://, http://, ipfs://, or data:image/.'
        );
        return;
      }
      coverImage = {
        source: 'inscribed-image-url',
        imageUrl: normalizedUrl
      };
    }

    const currentMetadata = toRecord(collection.metadata) ?? {};
    const currentCollectionPage = toRecord(currentMetadata.collectionPage) ?? {};
    const nextMetadata = {
      ...currentMetadata,
      collectionPage: {
        ...currentCollectionPage,
        coverImage,
        updatedAt: new Date().toISOString()
      }
    };

    setCoverSaving(true);
    setCoverMessage('Saving cover image settings...');
    try {
      const response = await fetch(
        `/collections/${encodeURIComponent(normalizedCollectionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: nextMetadata })
        }
      );
      const updated = await parseManageJsonResponse<CollectionRecord>(
        response,
        'Collection update'
      );
      setCollection(updated);
      setCoverMessage('Cover image settings saved.');
    } catch (error) {
      setCoverMessage(toManageApiErrorMessage(error, 'Unable to save cover image settings.'));
    } finally {
      setCoverSaving(false);
    }
  };

  const saveCollectionDescription = async () => {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      setDescriptionMessage('Collection id required.');
      return;
    }
    if (!collection) {
      setDescriptionMessage('Load collection details before saving description.');
      return;
    }

    const normalizedDescription = collectionDescriptionInput.replace(/\r\n/g, '\n');
    if (normalizedDescription.length > COLLECTION_PAGE_DESCRIPTION_MAX_LENGTH) {
      setDescriptionMessage(
        `Description must be ${COLLECTION_PAGE_DESCRIPTION_MAX_LENGTH} characters or fewer.`
      );
      return;
    }

    const currentMetadata = toRecord(collection.metadata) ?? {};
    const currentCollectionPage = toRecord(currentMetadata.collectionPage) ?? {};
    const nextMetadata = {
      ...currentMetadata,
      collectionPage: {
        ...currentCollectionPage,
        description: normalizedDescription,
        updatedAt: new Date().toISOString()
      }
    };

    setDescriptionSaving(true);
    setDescriptionMessage('Saving collection description...');
    try {
      const response = await fetch(
        `/collections/${encodeURIComponent(normalizedCollectionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: nextMetadata })
        }
      );
      const updated = await parseManageJsonResponse<CollectionRecord>(
        response,
        'Collection update'
      );
      const updatedMetadata = toRecord(updated.metadata) ?? null;
      const updatedCollectionPage = toRecord(updatedMetadata?.collectionPage) ?? null;
      const updatedCollectionMetadata = toRecord(updatedMetadata?.collection) ?? null;
      setCollection(updated);
      setCollectionDescriptionInput(
        toMultilineText(updatedCollectionPage?.description) ||
          toMultilineText(updatedCollectionMetadata?.description)
      );
      setDescriptionMessage('Collection description saved.');
    } catch (error) {
      setDescriptionMessage(
        toManageApiErrorMessage(error, 'Unable to save collection description.')
      );
    } finally {
      setDescriptionSaving(false);
    }
  };

  const saveDisplayMintPriceSettings = async () => {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      setDisplayPriceMessage('Collection id required.');
      return;
    }
    if (!collection) {
      setDisplayPriceMessage('Load collection details before saving display mint price.');
      return;
    }

    const mode = displayMintPriceMode;
    const normalizedDisplayPrice = displayMintPriceInput.trim();
    if (mode === 'override') {
      const parsedPrice = parseStxToMicroStx(normalizedDisplayPrice);
      if (parsedPrice === null) {
        setDisplayPriceMessage(
          'Display mint price must be a valid STX amount (up to 6 decimals).'
        );
        return;
      }
    }

    const currentMetadata = toRecord(collection.metadata) ?? {};
    const currentCollectionPage = toRecord(currentMetadata.collectionPage) ?? {};
    const nextCollectionPage: Record<string, unknown> = {
      ...currentCollectionPage,
      displayMintPriceMode: mode,
      updatedAt: new Date().toISOString()
    };
    if (mode === 'override') {
      nextCollectionPage.displayMintPriceStx = normalizedDisplayPrice;
    } else if ('displayMintPriceStx' in nextCollectionPage) {
      delete nextCollectionPage.displayMintPriceStx;
    }

    const nextMetadata = {
      ...currentMetadata,
      collectionPage: nextCollectionPage
    };

    setDisplayPriceSaving(true);
    setDisplayPriceMessage('Saving display mint price settings...');
    try {
      const response = await fetch(
        `/collections/${encodeURIComponent(normalizedCollectionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: nextMetadata })
        }
      );
      const updated = await parseManageJsonResponse<CollectionRecord>(
        response,
        'Collection update'
      );
      const updatedMetadata = toRecord(updated.metadata) ?? null;
      const updatedCollectionPage = toRecord(updatedMetadata?.collectionPage) ?? null;
      const updatedCollectionMetadata = toRecord(updatedMetadata?.collection) ?? null;
      setCollection(updated);
      setDisplayMintPriceMode(
        normalizeDisplayMintPriceMode(updatedCollectionPage?.displayMintPriceMode)
      );
      setDisplayMintPriceInput(
        toText(updatedCollectionPage?.displayMintPriceStx) ||
          toText(updatedCollectionMetadata?.mintPriceStx)
      );
      setDisplayPriceMessage('Display mint price settings saved.');
    } catch (error) {
      setDisplayPriceMessage(
        toManageApiErrorMessage(error, 'Unable to save display mint price settings.')
      );
    } finally {
      setDisplayPriceSaving(false);
    }
  };

  useEffect(() => {
    void loadReadiness();
  }, [collectionId]);

  useEffect(() => {
    if (!normalizedActiveCollectionId || normalizedActiveCollectionId === collectionId.trim()) {
      return;
    }
    setCollectionId(normalizedActiveCollectionId);
    setMessage(null);
    setCoverMessage(null);
    setDescriptionMessage(null);
    setDisplayPriceMessage(null);
    setLiveLinkMessage(null);
    setOnChainReservationMessage(null);
    setOnChainReservationStatus(null);
  }, [normalizedActiveCollectionId]);

  useEffect(() => {
    if (!walletSession.address || onChainReservationOwner.trim().length > 0) {
      return;
    }
    setOnChainReservationOwner(walletSession.address);
  }, [walletSession.address, onChainReservationOwner]);

  useEffect(() => {
    if (!collectionContractTarget) {
      setOnChainReservedCount(null);
      return;
    }
    void refreshOnChainReservedCount();
  }, [collectionContractTarget, walletSession.address, walletSession.network]);

  const availableImageAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const state = String(asset.state ?? '').toLowerCase();
        return state !== 'expired' && isImageMimeType(asset.mime_type);
      }),
    [assets]
  );

  useEffect(() => {
    if (coverSource !== 'collection-asset') {
      return;
    }
    if (availableImageAssets.length === 0) {
      if (selectedCoverAssetId !== '') {
        setSelectedCoverAssetId('');
      }
      return;
    }
    const selectedStillExists = availableImageAssets.some(
      (asset) => asset.asset_id === selectedCoverAssetId
    );
    if (!selectedStillExists) {
      setSelectedCoverAssetId(availableImageAssets[0].asset_id);
    }
  }, [coverSource, availableImageAssets, selectedCoverAssetId]);

  const selectedCoverAsset = useMemo(
    () =>
      availableImageAssets.find((asset) => asset.asset_id === selectedCoverAssetId) ??
      null,
    [availableImageAssets, selectedCoverAssetId]
  );

  const previewCoverUrl = useMemo(() => {
    if (coverSource === 'inscribed-image-url') {
      const normalized = inscribedCoverUrl.trim();
      return normalized.length > 0 ? normalized : null;
    }
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId || !selectedCoverAsset) {
      return null;
    }
    return `/collections/${encodeURIComponent(
      normalizedCollectionId
    )}/asset-preview?assetId=${encodeURIComponent(selectedCoverAsset.asset_id)}`;
  }, [coverSource, inscribedCoverUrl, collectionId, selectedCoverAsset]);

  useEffect(() => {
    setCoverPreviewFailed(false);
  }, [previewCoverUrl]);

  const publishBlockers = useMemo(() => {
    const blockers: string[] = [];
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      blockers.push('Enter a collection ID first.');
      return blockers;
    }
    if (readiness.loading) {
      blockers.push('Checking readiness...');
      return blockers;
    }
    if (readiness.error) {
      blockers.push(readiness.error);
      return blockers;
    }
    const currentState = toText(collection?.state).toLowerCase();
    if (currentState === 'published') {
      blockers.push('This collection is already live. Publishing is locked.');
      return blockers;
    }
    if (!readiness.contractConnected) {
      blockers.push('Deploy the contract in Step 1 before publishing.');
    }
    if (readiness.mintType !== 'pre-inscribed' && readiness.activeAssets <= 0) {
      blockers.push('Upload at least one artwork file in Step 2 before publishing.');
    }
    return blockers;
  }, [collection?.state, collectionId, readiness]);

  const canPublish = publishBlockers.length === 0;
  const normalizedCollectionId = collectionId.trim();
  const livePageKey = toText(collection?.slug) || normalizedCollectionId;
  const livePagePath = livePageKey
    ? `/collection/${encodeURIComponent(livePageKey)}`
    : '';
  const livePageUrl = useMemo(() => {
    if (!livePagePath) {
      return '';
    }
    if (typeof window === 'undefined') {
      return livePagePath;
    }
    return `${window.location.origin}${livePagePath}`;
  }, [livePagePath]);

  const liveState = toText(collection?.state).toLowerCase() === 'published'
    ? 'Live'
    : 'Draft';
  const collectionStateValue = toText(collection?.state).toLowerCase();
  const alreadyPublished = collectionStateValue === 'published';
  const onChainContractId = collectionContractTarget
    ? `${collectionContractTarget.address}.${collectionContractTarget.contractName}`
    : null;
  const onChainReservedCountLabel =
    onChainReservedCount === null ? 'Unknown' : onChainReservedCount.toString();
  const reservationControlsDisabled =
    onChainReservationLoading || onChainReservationActionPending || !collectionContractTarget;

  const copyLivePageLink = async () => {
    if (!livePageUrl) {
      setLiveLinkMessage('Enter a collection ID first.');
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(livePageUrl);
        setLiveLinkMessage('Live page link copied.');
        return;
      }
      setLiveLinkMessage('Clipboard is unavailable in this browser.');
    } catch {
      setLiveLinkMessage('Unable to copy link. You can still open it directly.');
    }
  };

  return (
    <div className="publish-ops-panel">
      <label className="field">
        <span className="field__label info-label">
          Collection ID
          <InfoTooltip text="Use the same ID from 'Your drops' and Step 2 so you publish and monitor the correct collection." />
        </span>
        <input
          className="input"
          placeholder="Paste collection ID from Your drops"
          value={collectionId}
          onChange={(event) => {
            setCollectionId(event.target.value);
            setMessage(null);
            setCoverMessage(null);
            setDisplayPriceMessage(null);
            setLiveLinkMessage(null);
            setOnChainReservationMessage(null);
            setOnChainReservationStatus(null);
          }}
        />
        <span className="field__hint">
          Refresh reservations to see pending buyer slots for this collection.
        </span>
        <button
          className="button button--ghost"
          type="button"
          onClick={() => void loadReservations()}
        >
          Refresh reservations
        </button>
      </label>

      {livePagePath ? (
        <div className="deploy-wizard__defaults">
          <p className="deploy-wizard__defaults-title info-label">
            Live page
            <InfoTooltip text="This is the public mint page URL collectors use to mint from this collection." />
          </p>
          <p className="meta-value">
            <code>{livePageUrl || livePagePath}</code>
          </p>
          <div className="mint-actions">
            <a
              className="button button--ghost button--mini collection-live-preview__link-button"
              href={livePagePath}
              target="_blank"
              rel="noreferrer"
            >
              Open live page
            </a>
            <button
              className="button button--ghost button--mini"
              type="button"
              onClick={() => void copyLivePageLink()}
            >
              Copy live page link
            </button>
          </div>
          {liveLinkMessage ? <p className="meta-value">{liveLinkMessage}</p> : null}
        </div>
      ) : null}

      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title info-label">
          Publish readiness
          <InfoTooltip text="Checks if this drop has the minimum setup required before making it live." />
        </p>
        <ul>
          <li>Contract deployed: {readiness.contractConnected ? 'Yes' : 'No'}</li>
          <li>Current state: {liveState}</li>
          <li>
            Launch style:{' '}
            {readiness.mintType === 'pre-inscribed' ? 'Pre-inscribed' : 'Standard'}
          </li>
          <li>
            Active staged assets: {readiness.activeAssets}
            {readiness.supplyTarget > 0
              ? ` (target supply: ${readiness.supplyTarget})`
              : ''}
          </li>
        </ul>
        <div className="mint-actions">
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => void loadReadiness()}
          >
            Re-check readiness
          </button>
        </div>
      </div>

      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title info-label">
          On-chain reservation recovery
          <InfoTooltip text="Use this when minting is blocked by a stuck reservation. These actions call the collection contract directly." />
        </p>
        <p className="field__hint">
          If the live mint page says the final slot is reserved, use the owner wallet
          and reservation hash from the failed/pending <code>mint-begin</code>{' '}
          transaction.
        </p>
        <p className="field__hint">
          In most cases, reservation owner = the minting wallet (<code>tx-sender</code> on
          <code> mint-begin</code>), not the contract owner wallet.
        </p>
        <p className="meta-value">
          Connected wallet:{' '}
          <code>{walletSession.address?.trim() || 'Not connected'}</code>
        </p>
        <p className="meta-value">
          <span className="info-label">
            Contract
            <InfoTooltip text="Target collection contract used for these checks and release actions." />
          </span>
          : <code>{onChainContractId ?? 'Not configured yet.'}</code>
        </p>
        <p className="meta-value">
          <span className="info-label">
            On-chain reserved count
            <InfoTooltip text="Number of active mint reservations currently held in the collection contract." />
          </span>
          : {onChainReservedCountLabel}
        </p>

        <label className="field">
          <span className="field__label info-label">
            Reservation owner
            <InfoTooltip text="Paste the wallet that submitted mint-begin (the tx sender in Hiro Explorer)." />
          </span>
          <input
            className="input"
            placeholder="SP... / ST..."
            value={onChainReservationOwner}
            onChange={(event) => {
              setOnChainReservationOwner(event.target.value);
              setOnChainReservationMessage(null);
            }}
          />
        </label>

        <label className="field">
          <span className="field__label info-label">
            Inscription hash (expected-hash)
            <InfoTooltip text="Paste function arg #2 from mint-begin (expected-hash, 64 hex chars, optional 0x)." />
          </span>
          <input
            className="input"
            placeholder="0x..."
            value={onChainReservationHash}
            onChange={(event) => {
              setOnChainReservationHash(event.target.value);
              setOnChainReservationMessage(null);
            }}
          />
          <span className="field__hint">
            In Hiro: open tx → <strong>Function called</strong> → <strong>mint-begin</strong> → copy arg
            2 <code>expected-hash</code>.
          </span>
        </label>

        <div className="mint-actions">
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => void loadOnChainReservationStatus()}
            disabled={reservationControlsDisabled}
          >
            {onChainReservationLoading ? 'Checking...' : 'Check on-chain reservation'}
          </button>
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() =>
              void runOnChainReservationAction(
                'Release expired reservation',
                'release-expired-reservation',
                true
              )
            }
            disabled={reservationControlsDisabled}
          >
            {onChainReservationActionPending
              ? 'Submitting...'
              : 'Release expired reservation'}
          </button>
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() =>
              void runOnChainReservationAction(
                'Force release reservation',
                'release-reservation',
                true
              )
            }
            disabled={reservationControlsDisabled}
          >
            {onChainReservationActionPending ? 'Submitting...' : 'Force release reservation'}
          </button>
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() =>
              void runOnChainReservationAction(
                'Cancel reservation',
                'cancel-reservation',
                false
              )
            }
            disabled={reservationControlsDisabled}
          >
            {onChainReservationActionPending ? 'Submitting...' : 'Cancel as connected wallet'}
          </button>
        </div>

        {onChainReservationStatus && (
          <div className="meta-grid">
            <div>
              <span className="meta-label">Reservation exists</span>
              <span className="meta-value">
                {onChainReservationStatus.exists ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="meta-label">Created at block</span>
              <span className="meta-value">
                {onChainReservationStatus.createdAt?.toString() ?? '—'}
              </span>
            </div>
            <div>
              <span className="meta-label">Phase ID</span>
              <span className="meta-value">
                {onChainReservationStatus.phaseId?.toString() ?? '—'}
              </span>
            </div>
          </div>
        )}
        {onChainReservationMessage && <div className="alert">{onChainReservationMessage}</div>}
      </div>

      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title">Collection cover image</p>
        <p className="field__hint">
          Set the hero image for your live collection page. You can use an uploaded
          collection image or an existing inscribed image URL.
        </p>

        <label className="field">
          <span className="field__label info-label">
            Cover source
            <InfoTooltip text="Choose whether the live page hero image comes from staged collection artwork or an external inscribed image URL." />
          </span>
          <select
            className="select"
            value={coverSource}
            onChange={(event) => {
              const next =
                event.target.value === 'inscribed-image-url'
                  ? 'inscribed-image-url'
                  : 'collection-asset';
              setCoverSource(next);
              setCoverMessage(null);
            }}
          >
            <option value="collection-asset">Image from this collection</option>
            <option value="inscribed-image-url">Existing inscribed image URL</option>
          </select>
        </label>

        {coverSource === 'collection-asset' ? (
          <label className="field">
            <span className="field__label info-label">
              Choose collection image
              <InfoTooltip text="Only image files staged in Step 2 are listed here." />
            </span>
            <select
              className="select"
              value={selectedCoverAssetId}
              onChange={(event) => {
                setSelectedCoverAssetId(event.target.value);
                setCoverMessage(null);
              }}
              disabled={availableImageAssets.length === 0}
            >
              {availableImageAssets.length === 0 ? (
                <option value="">No image assets available</option>
              ) : (
                availableImageAssets.map((asset) => (
                  <option key={asset.asset_id} value={asset.asset_id}>
                    {asset.filename ?? asset.path}
                  </option>
                ))
              )}
            </select>
            <span className="field__hint">
              {availableImageAssets.length === 0
                ? 'Upload at least one image in Step 2 to use it as collection cover art.'
                : `${availableImageAssets.length} image asset${
                    availableImageAssets.length === 1 ? '' : 's'
                  } available.`}
            </span>
          </label>
        ) : (
          <label className="field">
            <span className="field__label info-label">
              Existing inscribed image URL
              <InfoTooltip text="Paste a direct image URL for an existing inscription (for example an inscription content URL)." />
            </span>
            <input
              className="input"
              placeholder="https://... or ipfs://..."
              value={inscribedCoverUrl}
              onChange={(event) => {
                setInscribedCoverUrl(event.target.value);
                setCoverMessage(null);
              }}
            />
          </label>
        )}

        <label className="field">
          <span className="field__label info-label">
            Collection description
            <InfoTooltip text="Update the public collection summary text shown under the hero image. Line breaks are supported." />
          </span>
          <textarea
            className="textarea"
            rows={6}
            maxLength={COLLECTION_PAGE_DESCRIPTION_MAX_LENGTH}
            placeholder="Add a short description so collectors instantly understand your drop."
            value={collectionDescriptionInput}
            onChange={(event) => {
              setCollectionDescriptionInput(event.target.value);
              setDescriptionMessage(null);
            }}
          />
          <span className="field__hint">
            {collectionDescriptionInput.length}/
            {COLLECTION_PAGE_DESCRIPTION_MAX_LENGTH.toString()} characters
          </span>
        </label>

        <label className="field">
          <span className="field__label info-label">
            Display mint price mode
            <InfoTooltip text="Optional display-only override. This does not change on-chain mint price or wallet post-condition calculations." />
          </span>
          <select
            className="select"
            value={displayMintPriceMode}
            onChange={(event) => {
              const nextMode = normalizeDisplayMintPriceMode(event.target.value);
              setDisplayMintPriceMode(nextMode);
              setDisplayPriceMessage(null);
            }}
          >
            <option value="on-chain">Use on-chain mint price</option>
            <option value="override">Override displayed mint price</option>
          </select>
          <span className="field__hint">
            Use override when you intentionally want the public/live UI price to differ from
            on-chain payout price.
          </span>
        </label>

        {displayMintPriceMode === 'override' && (
          <label className="field">
            <span className="field__label info-label">
              Displayed mint price (STX)
              <InfoTooltip text="Shown on public and live mint pages. Keep this aligned with your intended collector-facing price." />
            </span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="1"
              value={displayMintPriceInput}
              onChange={(event) => {
                setDisplayMintPriceInput(event.target.value);
                setDisplayPriceMessage(null);
              }}
            />
          </label>
        )}

        <div className="mint-actions">
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => void saveCoverSettings()}
            disabled={coverSaving || !collectionId.trim()}
          >
            {coverSaving ? 'Saving...' : 'Save cover image'}
          </button>
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => void saveCollectionDescription()}
            disabled={descriptionSaving || !collectionId.trim()}
          >
            {descriptionSaving ? 'Saving...' : 'Save description'}
          </button>
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => void saveDisplayMintPriceSettings()}
            disabled={displayPriceSaving || !collectionId.trim()}
          >
            {displayPriceSaving ? 'Saving...' : 'Save display price'}
          </button>
        </div>
        {coverMessage && <p className="meta-value">{coverMessage}</p>}
        {descriptionMessage && <p className="meta-value">{descriptionMessage}</p>}
        {displayPriceMessage && <p className="meta-value">{displayPriceMessage}</p>}
      </div>

      <div className="collection-live-preview">
        <div className="collection-live-preview__media">
          {previewCoverUrl && !coverPreviewFailed ? (
            <img
              src={previewCoverUrl}
              alt={`${previewTitle} cover`}
              onError={() => setCoverPreviewFailed(true)}
            />
          ) : (
            <div className="collection-live-preview__placeholder">
              {coverPreviewFailed
                ? 'Cover image preview unavailable. Check the saved image source.'
                : 'Choose a cover image to preview your live page hero.'}
            </div>
          )}
        </div>
        <div className="collection-live-preview__content">
          <p className="collection-live-preview__eyebrow">Live collection page preview</p>
          <h3>{previewTitle}</h3>
          <p className="collection-live-preview__description">{previewDescription}</p>
          <div className="collection-live-preview__meta">
            <span>Ticker: {previewSymbol}</span>
            <span>State: {liveState}</span>
            <span>Supply: {previewSupply > 0 ? previewSupply : 'TBD'}</span>
            <span>Mint price: {previewMintPrice} STX</span>
          </div>
          <div className="mint-actions">
            <button className="button" type="button" disabled>
              Mint from {previewMintPrice} STX
            </button>
          </div>
          <p className="field__hint">
            This preview mirrors the top of the upcoming public collection page.
          </p>
        </div>
      </div>

      <div className="mint-actions">
        <button
          className="button"
          type="button"
          onClick={() => void publishCollection()}
          disabled={!canPublish}
        >
          {alreadyPublished ? 'Collection already live' : 'Publish collection'}
        </button>
        <span className="field__hint">
          Publishing marks this drop as live in the manager backend.
        </span>
      </div>

      {publishBlockers.length > 0 && (
        <div className="alert">
          <div>
            <strong>Before publishing:</strong>
            <ul>
              {publishBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {message && <div className="alert">{message}</div>}

      {reservations.length > 0 && (
        <div>
          <h3>Pending reservations</h3>
          <ul>
            {reservations.map((reservation) => (
              <li key={String(reservation.reservation_id)}>
                {reservation.asset_id} · {reservation.status} · expires{' '}
                {new Date(Number(reservation.expires_at ?? 0)).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {metadataCover && (
        <p className="meta-value">
          Saved cover source:{' '}
          {toText(metadataCover.source) || 'not set'}
          {toText(metadataCover.assetId)
            ? ` · asset ${toText(metadataCover.assetId)}`
            : ''}
          {toText(metadataCover.imageUrl) ? ` · ${toText(metadataCover.imageUrl)}` : ''}
        </p>
      )}
    </div>
  );
}
