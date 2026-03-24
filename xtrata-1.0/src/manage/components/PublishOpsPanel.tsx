import { useEffect, useMemo, useState } from 'react';
import { showContractCall } from '../../lib/wallet/connect';
import {
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  principalCV,
  validateStacksAddress,
  type ClarityValue
} from '@stacks/transactions';
import { PUBLIC_CONTRACT } from '../../config/public';
import CollectionCoverImage from '../../components/CollectionCoverImage';
import { createXtrataClient } from '../../lib/contract/client';
import {
  buildRuntimeInscriptionContentUrl,
  normalizeCoverImageSource,
  parseInscriptionTokenId,
  type CoverImageSource
} from '../../lib/collections/cover-image';
import { getNetworkFromAddress } from '../../lib/network/guard';
import { toStacksNetwork } from '../../lib/network/stacks';
import {
  formatMiningFeeMicroStx,
  toChunkCountLabel,
  type CollectionMiningFeeGuidance
} from '../../lib/collection-mint/mining-fee-guidance';
import { resolveCollectionMintPricingMetadata } from '../../lib/collection-mint/pricing-metadata';
import { supportsCollectionSmallSingleTx } from '../../lib/collection-mint/routing';
import { SMALL_MINT_HELPER_MAX_CHUNKS } from '../../lib/mint/constants';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import { parseContractPrincipal } from '../lib/contract-link';
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

type ContractTarget = {
  address: string;
  contractName: string;
  network: 'mainnet' | 'testnet';
};

type CoreContractTarget = ContractTarget & {
  contractId: string;
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

const normalizePrincipal = (value: string) =>
  value.trim().replace(/^'+/, '').toUpperCase();

const parsePrincipalCv = (value: ClarityValue | null | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = cvToValue(value) as unknown;
  if (typeof parsed === 'string') {
    const normalized = normalizePrincipal(parsed);
    return normalized.length > 0 ? normalized : null;
  }
  if (parsed && typeof parsed === 'object' && 'value' in parsed) {
    const raw = (parsed as { value?: unknown }).value;
    if (typeof raw === 'string') {
      const normalized = normalizePrincipal(raw);
      return normalized.length > 0 ? normalized : null;
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
  onJourneyRefreshRequested?: () => void;
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
  const [inscriptionCoverTokenId, setInscriptionCoverTokenId] = useState('');
  const [collectionDescriptionInput, setCollectionDescriptionInput] = useState('');
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [descriptionMessage, setDescriptionMessage] = useState<string | null>(null);
  const [liveLinkMessage, setLiveLinkMessage] = useState<string | null>(null);
  const [feeGuidanceMessage, setFeeGuidanceMessage] = useState<string | null>(null);
  const [coverSaving, setCoverSaving] = useState(false);
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [feeGuidance, setFeeGuidance] = useState<CollectionMiningFeeGuidance | null>(
    null
  );
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
  const metadataPricing = useMemo(
    () => resolveCollectionMintPricingMetadata(metadata?.pricing),
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
  const coreContractTarget = useMemo((): CoreContractTarget => {
    const configured = parseContractPrincipal(toText(metadata?.coreContractId));
    if (configured) {
      return {
        address: configured.address,
        contractName: configured.contractName,
        contractId: `${configured.address}.${configured.contractName}`,
        network: getNetworkFromAddress(configured.address) ?? 'mainnet'
      };
    }
    return {
      address: PUBLIC_CONTRACT.address,
      contractName: PUBLIC_CONTRACT.contractName,
      contractId: `${PUBLIC_CONTRACT.address}.${PUBLIC_CONTRACT.contractName}`,
      network: PUBLIC_CONTRACT.network
    };
  }, [metadata]);

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
    () => toText(metadataCollection?.mintPriceStx) || '0',
    [metadataCollection]
  );
  const templateVersion = useMemo(
    () => toText(metadata?.templateVersion),
    [metadata]
  );
  const supportsSingleTxTemplate = useMemo(
    () => supportsCollectionSmallSingleTx(templateVersion),
    [templateVersion]
  );
  const largestFileUsesSingleTxFlow = useMemo(() => {
    if (!feeGuidance?.available) {
      return false;
    }
    if (readiness.mintType !== 'standard') {
      return false;
    }
    if (!supportsSingleTxTemplate) {
      return false;
    }
    const chunkCount = Math.floor(feeGuidance.chunkCount);
    return chunkCount > 0 && chunkCount <= SMALL_MINT_HELPER_MAX_CHUNKS;
  }, [feeGuidance, readiness.mintType, supportsSingleTxTemplate]);

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

  const ensureWalletSession = async () => {
    let session = walletSession;
    if (!session.address || !session.network) {
      await connect();
      session = walletAdapter.getSession();
    }
    if (!session.address || !session.network) {
      throw new Error('Connect a wallet before submitting this action.');
    }
    return {
      ...session,
      address: session.address,
      network: session.network
    };
  };

  const requestCollectionContractCall = async (options: {
    functionName: string;
    functionArgs: ClarityValue[];
  }) => {
    if (!collectionContractTarget) {
      throw new Error('Collection contract is not configured yet.');
    }
    const session = await ensureWalletSession();
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
      setInscriptionCoverTokenId('');
      setCollectionDescriptionInput('');
      setFeeGuidance(null);
      setFeeGuidanceMessage(null);
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
    setFeeGuidanceMessage(null);
    try {
      const [collectionResponse, assetsResponse, feeGuidanceResponse] = await Promise.all([
        fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}`),
        fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}/assets`),
        fetch(
          `/collections/${encodeURIComponent(normalizedCollectionId)}/fee-guidance`
        )
      ]);

      const loadedCollection = await parseManageJsonResponse<CollectionRecord>(
        collectionResponse,
        'Collection'
      );
      const loadedAssets = await parseManageJsonResponse<ManagedAsset[]>(
        assetsResponse,
        'Collection assets'
      );
      let loadedFeeGuidance: CollectionMiningFeeGuidance | null = null;
      try {
        loadedFeeGuidance =
          await parseManageJsonResponse<CollectionMiningFeeGuidance>(
            feeGuidanceResponse,
            'Mining fee guidance'
          );
      } catch (error) {
        setFeeGuidanceMessage(
          toManageApiErrorMessage(error, 'Unable to load mining fee guidance.')
        );
      }

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
      const savedSource = normalizeCoverImageSource(loadedCover?.source);
      const savedAssetId = toText(loadedCover?.assetId);
      const savedUrl = toText(loadedCover?.imageUrl);
      const savedInscriptionTokenId =
        parseInscriptionTokenId(loadedCover?.tokenId ?? loadedCover?.inscriptionId) ??
        '';
      const loadedCollectionMetadata = toRecord(loadedMetadata?.collection) ?? null;
      const savedDescription =
        toMultilineText(loadedCollectionPage?.description) ||
        toMultilineText(loadedCollectionMetadata?.description);

      setCollection(loadedCollection);
      setAssets(loadedAssets);
      setCoverSource(savedSource ?? 'collection-asset');
      setSelectedCoverAssetId(savedAssetId);
      setInscribedCoverUrl(savedUrl);
      setInscriptionCoverTokenId(savedInscriptionTokenId);
      setCollectionDescriptionInput(savedDescription);
      setFeeGuidance(loadedFeeGuidance);
      setReadiness({
        loading: false,
        contractConnected: !!loadedCollection.contract_address,
        mintType,
        activeAssets,
        supplyTarget,
        error: null
      });
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setCollection(null);
      setAssets([]);
      setCoverSource('collection-asset');
      setSelectedCoverAssetId('');
      setInscribedCoverUrl('');
      setInscriptionCoverTokenId('');
      setFeeGuidance(null);
      setCollectionDescriptionInput('');
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
      props.onJourneyRefreshRequested?.();
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
    } else if (coverSource === 'inscribed-image-url') {
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
    } else {
      const normalizedTokenId = parseInscriptionTokenId(inscriptionCoverTokenId);
      if (!normalizedTokenId) {
        setCoverMessage('Enter a valid inscription ID (whole number).');
        return;
      }
      if (!collectionContractTarget) {
        setCoverMessage('Collection contract is not configured yet.');
        return;
      }
      let session;
      try {
        session = await ensureWalletSession();
      } catch (error) {
        setCoverMessage(toManageApiErrorMessage(error, 'Connect wallet to validate owner.'));
        return;
      }

      const connectedOwner = normalizePrincipal(session.address);
      setCoverMessage('Checking collection owner and inscription ownership...');
      try {
        const collectionOwnerCv = await callCollectionReadOnly('get-owner');
        const collectionOwner = parsePrincipalCv(collectionOwnerCv);
        if (!collectionOwner) {
          setCoverMessage('Unable to read collection contract owner.');
          return;
        }
        if (collectionOwner !== connectedOwner) {
          setCoverMessage(
            `Connected wallet (${session.address}) is not the collection owner (${collectionOwner}).`
          );
          return;
        }

        const coreClient = createXtrataClient({
          contract: {
            address: coreContractTarget.address,
            contractName: coreContractTarget.contractName,
            network: coreContractTarget.network
          }
        });
        const inscriptionMeta = await coreClient.getInscriptionMeta(
          BigInt(normalizedTokenId),
          connectedOwner
        );
        if (!inscriptionMeta) {
          setCoverMessage(
            `Inscription #${normalizedTokenId} was not found on ${coreContractTarget.contractId}.`
          );
          return;
        }
        const inscriptionOwner = normalizePrincipal(inscriptionMeta.owner);
        if (inscriptionOwner !== connectedOwner) {
          setCoverMessage(
            `Inscription #${normalizedTokenId} is owned by ${inscriptionMeta.owner}, not ${session.address}.`
          );
          return;
        }
        if (!isImageMimeType(inscriptionMeta.mimeType)) {
          setCoverMessage(
            `Inscription #${normalizedTokenId} mime type is ${inscriptionMeta.mimeType}, not image/*.`
          );
          return;
        }

        const runtimeContentUrl = buildRuntimeInscriptionContentUrl({
          coreContractId: coreContractTarget.contractId,
          tokenId: normalizedTokenId
        });
        if (!runtimeContentUrl) {
          setCoverMessage('Unable to build runtime URL for this inscription.');
          return;
        }

        coverImage = {
          source: 'inscription-id',
          tokenId: normalizedTokenId,
          coreContractId: coreContractTarget.contractId,
          mimeType: inscriptionMeta.mimeType,
          imageUrl: runtimeContentUrl
        };
      } catch (error) {
        setCoverMessage(
          toManageApiErrorMessage(error, 'Unable to validate inscription ownership.')
        );
        return;
      }
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
      props.onJourneyRefreshRequested?.();
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
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setDescriptionMessage(
        toManageApiErrorMessage(error, 'Unable to save collection description.')
      );
    } finally {
      setDescriptionSaving(false);
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
    setLiveLinkMessage(null);
    setFeeGuidanceMessage(null);
    setFeeGuidance(null);
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

  const previewCoverImage = useMemo(() => {
    if (coverSource === 'collection-asset') {
      if (!selectedCoverAsset) {
        return null;
      }
      return {
        source: 'collection-asset',
        assetId: selectedCoverAsset.asset_id
      };
    }
    if (coverSource === 'inscribed-image-url') {
      const normalized = inscribedCoverUrl.trim();
      return normalized.length > 0
        ? {
            source: 'inscribed-image-url',
            imageUrl: normalized
          }
        : null;
    }
    const normalizedTokenId = inscriptionCoverTokenId.trim();
    return normalizedTokenId.length > 0
      ? {
          source: 'inscription-id',
          tokenId: normalizedTokenId,
          coreContractId: coreContractTarget.contractId
        }
      : null;
  }, [
    coverSource,
    inscribedCoverUrl,
    inscriptionCoverTokenId,
    selectedCoverAsset,
    coreContractTarget
  ]);

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
    if (
      readiness.mintType === 'standard' &&
      metadataPricing.mode === 'raw-on-chain'
    ) {
      blockers.push(
        'Set the mint price in Step 3 before publishing. Standard deploys start with a 0 STX on-chain payout base.'
      );
    }
    return blockers;
  }, [collection?.state, collectionId, metadataPricing.mode, readiness]);

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
            setLiveLinkMessage(null);
            setOnChainReservationMessage(null);
            setOnChainReservationStatus(null);
          }}
        />
        <span className="field__hint">
          Refresh reservations to see pending buyer slots for this collection.
        </span>
        <span className="info-label">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => void loadReservations()}
          >
            Refresh reservations
          </button>
          <InfoTooltip text="Reloads backend reservation rows and on-chain reservation counters for this drop." />
        </span>
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
            <span className="info-label">
              <a
                className="button button--ghost button--mini collection-live-preview__link-button"
                href={livePagePath}
                target="_blank"
                rel="noreferrer"
              >
                Open live page
              </a>
              <InfoTooltip text="Opens the public mint page exactly as collectors will see it." />
            </span>
            <span className="info-label">
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={() => void copyLivePageLink()}
              >
                Copy live page link
              </button>
              <InfoTooltip text="Copies the public mint URL so you can share it externally." />
            </span>
          </div>
          {liveLinkMessage ? <p className="meta-value">{liveLinkMessage}</p> : null}
        </div>
      ) : null}

      <div className="deploy-wizard__defaults" id="manage-live-page-settings">
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
          <span className="info-label">
            <button
              className="button button--ghost button--mini"
              type="button"
              onClick={() => void loadReadiness()}
            >
              Re-check readiness
            </button>
            <InfoTooltip text="Re-runs readiness checks after you update launch controls, assets, or cover settings." />
          </span>
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
          <span className="info-label">
            <button
              className="button button--ghost button--mini"
              type="button"
              onClick={() => void loadOnChainReservationStatus()}
              disabled={reservationControlsDisabled}
            >
              {onChainReservationLoading ? 'Checking...' : 'Check on-chain reservation'}
            </button>
            <InfoTooltip text="Reads reservation details for the owner + hash pair from the collection contract." />
          </span>
          <span className="info-label">
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
            <InfoTooltip text="Owner/operator action for expired reservation cleanup." />
          </span>
          <span className="info-label">
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
            <InfoTooltip text="Owner/operator override to release a reservation even before expiry." />
          </span>
          <span className="info-label">
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
            <InfoTooltip text="Cancels using the connected wallet as reservation owner." />
          </span>
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
        <p className="deploy-wizard__defaults-title info-label">
          Collection cover image
          <InfoTooltip text="Controls hero artwork and description shown at the top of the public mint page." />
        </p>
        <p className="field__hint">
          Set the hero image for your live collection page. You can use an uploaded
          collection image, an existing inscribed image URL, or an inscription ID
          you own.
        </p>

        <label className="field">
          <span className="field__label info-label">
            Cover source
            <InfoTooltip text="Choose whether the live page hero image comes from staged artwork, a direct URL, or an on-chain inscription ID." />
          </span>
          <select
            className="select"
            value={coverSource}
            onChange={(event) => {
              const next =
                normalizeCoverImageSource(event.target.value) ?? 'collection-asset';
              setCoverSource(next);
              setCoverMessage(null);
            }}
          >
            <option value="collection-asset">Image from this collection</option>
            <option value="inscribed-image-url">Existing inscribed image URL</option>
            <option value="inscription-id">Existing inscription ID (on-chain)</option>
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
        ) : coverSource === 'inscribed-image-url' ? (
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
        ) : (
          <label className="field">
            <span className="field__label info-label">
              Existing inscription ID
              <InfoTooltip text="Enter an inscription token ID. Save checks that connected wallet is the collection owner and also owns this inscription." />
            </span>
            <input
              className="input"
              placeholder="Token ID (e.g. 12345)"
              value={inscriptionCoverTokenId}
              onChange={(event) => {
                setInscriptionCoverTokenId(event.target.value);
                setCoverMessage(null);
              }}
            />
            <span className="field__hint">
              Runtime source contract: <code>{coreContractTarget.contractId}</code>
            </span>
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

        <div className="mint-actions">
          <span className="info-label">
            <button
              className="button button--ghost button--mini"
              type="button"
              onClick={() => void saveCoverSettings()}
              disabled={coverSaving || !collectionId.trim()}
            >
              {coverSaving ? 'Saving...' : 'Save cover image'}
            </button>
            <InfoTooltip text="Writes current cover source/selection to collection page metadata." />
          </span>
          <span className="info-label">
            <button
              className="button button--ghost button--mini"
              type="button"
              onClick={() => void saveCollectionDescription()}
              disabled={descriptionSaving || !collectionId.trim()}
            >
              {descriptionSaving ? 'Saving...' : 'Save description'}
            </button>
            <InfoTooltip text="Saves the collection summary text shown on the live page." />
          </span>
        </div>
        {coverMessage && <p className="meta-value">{coverMessage}</p>}
        {descriptionMessage && <p className="meta-value">{descriptionMessage}</p>}
      </div>

      <div className="collection-live-preview">
        <div className="collection-live-preview__media">
          <CollectionCoverImage
            coverImage={previewCoverImage}
            collectionId={collectionId.trim() || null}
            fallbackCoreContractId={coreContractTarget.contractId}
            alt={`${previewTitle} cover`}
            placeholderClassName="collection-live-preview__placeholder"
            emptyMessage="Choose a cover image to preview your live page hero."
            loadingMessage="Resolving cover image preview..."
            errorMessage="Cover image preview unavailable. Check the saved image source."
            debugLabel={`manage-cover-preview:${collectionId.trim() || 'draft'}`}
          />
        </div>
        <div className="collection-live-preview__content">
          <p className="collection-live-preview__eyebrow info-label">
            Live collection page preview
            <InfoTooltip text="Preview of the public hero section using your saved metadata + cover settings." />
          </p>
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

      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title info-label">
          Mining fee guidance (largest file)
          <InfoTooltip text="Server-side estimate of mining fees for begin, upload batch(es), and seal based on the largest staged file. If largest file is <=30 chunks on v1.4+, mint can route to one wallet transaction. This estimate is separate from the collection mint price." />
        </p>
        {feeGuidance?.available ? (
          <>
            <p className="field__hint">
              Largest file:{' '}
              <code>
                {feeGuidance.largestAsset?.filename ||
                  feeGuidance.largestAsset?.path ||
                  'Unknown file'}
              </code>{' '}
              · {toChunkCountLabel(feeGuidance.chunkCount)} chunk(s) ·{' '}
              {feeGuidance.batchCount.toLocaleString()} upload batch(es)
            </p>
            <p className="field__hint">
              Template single-tx support:{' '}
              {supportsSingleTxTemplate
                ? `Enabled (${templateVersion || 'v1.4+'}).`
                : `Disabled (requires v1.4+, current template ${templateVersion || 'unknown'}).`}
            </p>
            <p className="field__hint">
              Mint flow for largest file:{' '}
              <strong>
                {largestFileUsesSingleTxFlow
                  ? `Single transaction (begin + upload + seal in one wallet confirmation, <=${SMALL_MINT_HELPER_MAX_CHUNKS} chunks).`
                  : 'Standard 3-stage route (begin -> upload batch(es) -> seal).'}
              </strong>
            </p>
            {largestFileUsesSingleTxFlow ? (
              <p className="field__hint">
                The table below still breaks out begin/upload/seal mining-fee components,
                even though this largest-file route submits in one transaction.
              </p>
            ) : null}
            <div className="fee-guidance-table-wrapper">
              <table className="fee-guidance-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Tx count</th>
                    <th>Chunk count</th>
                    <th>Suggested mining fee</th>
                    <th>Wallet default</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {feeGuidance.table.map((row) => (
                    <tr key={row.step}>
                      <td>{row.label}</td>
                      <td>{row.txCount.toLocaleString()}</td>
                      <td>{row.chunkCount > 0 ? row.chunkCount.toLocaleString() : '—'}</td>
                      <td>
                        {formatMiningFeeMicroStx(row.recommendedTotalMicroStx)}
                        {row.recommendedPerTxMicroStx !== null
                          ? ` total (~${formatMiningFeeMicroStx(
                              row.recommendedPerTxMicroStx
                            )} each)`
                          : ' total'}
                      </td>
                      <td>
                        {formatMiningFeeMicroStx(row.walletDefaultTotalMicroStx)}
                        {row.walletDefaultPerTxMicroStx !== null
                          ? ` total (${formatMiningFeeMicroStx(
                              row.walletDefaultPerTxMicroStx
                            )} each)`
                          : ''}
                      </td>
                      <td className="fee-guidance-table__note">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {feeGuidance.uploadBatches.length > 0 && (
              <ul>
                {feeGuidance.uploadBatches.map((batch) => (
                  <li key={batch.label}>
                    {batch.label}: {batch.batchCount.toLocaleString()} tx · suggested{' '}
                    {formatMiningFeeMicroStx(batch.recommendedPerTxMicroStx)} each ·
                    wallet default{' '}
                    {formatMiningFeeMicroStx(batch.walletDefaultPerTxMicroStx)} each.
                  </li>
                ))}
              </ul>
            )}
            <p className="field__hint">
              Ballpark total mining fee for this largest file: roughly{' '}
              <strong>
                {formatMiningFeeMicroStx(feeGuidance.totals.lowBallparkMicroStx)} to{' '}
                {formatMiningFeeMicroStx(feeGuidance.totals.highBallparkMicroStx)}
              </strong>
              . If a wallet rejects a lower fee, increase gradually and retry.
            </p>
            {feeGuidance.warnings.map((warning) => (
              <p key={warning} className="field__hint">
                {warning}
              </p>
            ))}
          </>
        ) : (
          <p className="field__hint">
            {feeGuidance?.warnings[0] ??
              'Upload at least one file to generate mining fee guidance.'}
          </p>
        )}
        {feeGuidanceMessage ? <p className="field__hint">{feeGuidanceMessage}</p> : null}
      </div>

      <div className="mint-actions">
        <span className="info-label">
          <button
            className="button"
            type="button"
            id="manage-publish-collection-button"
            onClick={() => void publishCollection()}
            disabled={!canPublish}
          >
            {alreadyPublished ? 'Collection already live' : 'Publish collection'}
          </button>
          <InfoTooltip text="Marks the drop published in backend state so the live collection page can serve it." />
        </span>
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
          <h3 className="info-label">
            Pending reservations
            <InfoTooltip text="Current reservation rows tracked by backend for this drop." />
          </h3>
          <ul>
            {reservations.map((reservation) => (
              <li key={String(reservation.reservation_id)}>
                {toText(reservation.asset_id) || 'Unknown asset'} ·{' '}
                {toText(reservation.status) || 'unknown'} · expires{' '}
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
          {toText(metadataCover.tokenId)
            ? ` · inscription #${toText(metadataCover.tokenId)}`
            : ''}
          {toText(metadataCover.coreContractId)
            ? ` · core ${toText(metadataCover.coreContractId)}`
            : ''}
          {toText(metadataCover.imageUrl) ? ` · ${toText(metadataCover.imageUrl)}` : ''}
        </p>
      )}
    </div>
  );
}
