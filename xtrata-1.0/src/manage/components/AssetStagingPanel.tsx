import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
import { getMediaKind, getTextPreview, type MediaKind } from '../../lib/viewer/content';
import { formatBytes } from '../../lib/utils/format';
import { chunkCount, hexDigest } from '../lib/asset-utils';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import {
  createSecureRandomSeed,
  prepareUploadSelection,
  type DuplicatePolicy,
  type UploadOrderMode
} from '../lib/upload-prep';
import { buildUploadSafetyWarnings } from '../lib/upload-safety';
import InfoTooltip from './InfoTooltip';

type ManagedAsset = {
  asset_id: string;
  path: string;
  filename: string | null;
  mime_type: string;
  storage_key?: string | null;
  edition_cap?: number | null;
  total_bytes: number;
  total_chunks: number;
  expected_hash: string | null;
  state: string;
  created_at: number;
  expires_at?: number | null;
};

type UploadReadiness = {
  collectionId: string;
  ready: boolean;
  reason: string;
  deployReady?: boolean;
  predeployUploadsReady?: boolean;
  deployTxId: string | null;
  deployTxStatus: string | null;
  network: 'mainnet' | 'testnet' | null;
  collectionState?: string;
  uploadsLocked?: boolean;
  lockReason?: string | null;
};

type UploadTokenResponse = {
  uploadUrl: string;
  key: string;
  mode?: 'signed' | 'direct';
  binding?: string | null;
  requestId?: string;
  durationMs?: number;
};

type CollectionRecord = {
  display_name?: string | null;
  slug?: string | null;
  metadata?: Record<string, unknown> | null;
  state?: string | null;
};

type DeleteAssetResponse = {
  deleted: boolean;
  assetId: string;
  pricingLockCleared?: boolean;
  storageObjectDeleted?: boolean;
};

type DeployPricingLock = {
  version: 'v1';
  lockedAt: string;
  assetCount: number;
  maxChunks: number;
  maxBytes: number;
  totalBytes: number;
};

const buildTxExplorerUrl = (
  txId: string,
  network: UploadReadiness['network']
) =>
  `https://explorer.hiro.so/txid/${txId.startsWith('0x') ? txId : `0x${txId}`}?chain=${
    network === 'testnet' ? 'testnet' : 'mainnet'
  }&tab=overview`;

const fileSortKey = (file: File) =>
  file.webkitRelativePath && file.webkitRelativePath.length > 0
    ? file.webkitRelativePath
    : file.name;

const ORDER_MODE_OPTIONS: Array<{ value: UploadOrderMode; label: string }> = [
  { value: 'as-selected', label: 'Keep selected order' },
  { value: 'path-natural', label: 'Sort by path (natural)' },
  { value: 'filename-natural', label: 'Sort by filename (natural)' },
  { value: 'seeded-random', label: 'Seeded random order' }
];

type AssetOrderMode =
  | 'backend-current'
  | 'uploaded-oldest'
  | 'uploaded-newest'
  | 'path-natural'
  | 'filename-natural';

const ASSET_GRID_PAGE_SIZE = 16;

const ASSET_ORDER_OPTIONS: Array<{ value: AssetOrderMode; label: string }> = [
  { value: 'backend-current', label: 'Current backend order' },
  { value: 'uploaded-oldest', label: 'Upload time (oldest first)' },
  { value: 'uploaded-newest', label: 'Upload time (newest first)' },
  { value: 'path-natural', label: 'Path (A to Z)' },
  { value: 'filename-natural', label: 'Filename (A to Z)' }
];

const naturalCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base'
  });

const getAssetMediaKind = (asset: ManagedAsset): MediaKind =>
  getMediaKind(asset.mime_type);

const isImageAsset = (asset: ManagedAsset) => {
  const kind = getAssetMediaKind(asset);
  return kind === 'image' || kind === 'svg';
};

const isHtmlAsset = (asset: ManagedAsset) => {
  return getAssetMediaKind(asset) === 'html';
};

const getAssetDisplayName = (asset: ManagedAsset) => asset.filename ?? asset.path;

const sortManagedAssets = (assets: ManagedAsset[], mode: AssetOrderMode) => {
  if (mode === 'backend-current') {
    return assets;
  }
  const sorted = [...assets];
  if (mode === 'uploaded-oldest') {
    sorted.sort((left, right) => left.created_at - right.created_at);
    return sorted;
  }
  if (mode === 'uploaded-newest') {
    sorted.sort((left, right) => right.created_at - left.created_at);
    return sorted;
  }
  if (mode === 'path-natural') {
    sorted.sort((left, right) => naturalCompare(left.path, right.path));
    return sorted;
  }
  sorted.sort((left, right) =>
    naturalCompare(getAssetDisplayName(left), getAssetDisplayName(right))
  );
  return sorted;
};

const buildAssetPreviewUrl = (collectionId: string, assetId: string) =>
  `/collections/${encodeURIComponent(collectionId)}/asset-preview?assetId=${encodeURIComponent(
    assetId
  )}`;

const extractPathTraits = (path: string) => {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return [] as string[];
  }
  return parts
    .slice(0, -1)
    .map((segment) =>
      segment
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((segment) => segment.length > 0);
};

const logUploadDebug = (phase: string, details: Record<string, unknown>) => {
  console.info(`[manage:asset-staging] ${phase}`, details);
};

const parseTargetSupply = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const collection = metadata.collection;
  if (!collection || typeof collection !== 'object') {
    return null;
  }
  const value = (collection as Record<string, unknown>).supply;
  const parsed =
    typeof value === 'number'
      ? Math.floor(value)
      : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const parseDeployPricingLock = (
  metadata: Record<string, unknown> | null | undefined
): DeployPricingLock | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const raw = metadata.deployPricingLock;
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const lockedAt =
    typeof record.lockedAt === 'string' ? record.lockedAt.trim() : '';
  const assetCount = Number(record.assetCount ?? 0);
  const maxChunks = Number(record.maxChunks ?? 0);
  const maxBytes = Number(record.maxBytes ?? 0);
  const totalBytes = Number(record.totalBytes ?? 0);
  if (
    !lockedAt ||
    !Number.isFinite(assetCount) ||
    !Number.isFinite(maxChunks) ||
    !Number.isFinite(maxBytes) ||
    !Number.isFinite(totalBytes) ||
    assetCount <= 0 ||
    maxChunks <= 0 ||
    maxBytes <= 0 ||
    totalBytes <= 0
  ) {
    return null;
  }
  return {
    version: 'v1',
    lockedAt,
    assetCount: Math.floor(assetCount),
    maxChunks: Math.floor(maxChunks),
    maxBytes: Math.floor(maxBytes),
    totalBytes: Math.floor(totalBytes)
  };
};

type AssetStagingPanelProps = {
  activeCollectionId?: string;
  onJourneyRefreshRequested?: () => void;
  highlightLockAction?: boolean;
};

export default function AssetStagingPanel(props: AssetStagingPanelProps) {
  const [collectionId, setCollectionId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [assets, setAssets] = useState<ManagedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [readiness, setReadiness] = useState<UploadReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [collectionTargetSupply, setCollectionTargetSupply] = useState<number | null>(
    null
  );
  const [collectionMetadata, setCollectionMetadata] = useState<
    Record<string, unknown> | null
  >(null);
  const [deployPricingLock, setDeployPricingLock] = useState<DeployPricingLock | null>(
    null
  );
  const [collectionLabel, setCollectionLabel] = useState<string | null>(null);
  const [collectionState, setCollectionState] = useState<string>('draft');
  const [lockPending, setLockPending] = useState(false);
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [orderMode, setOrderMode] = useState<UploadOrderMode>('path-natural');
  const [seededOrderSeed, setSeededOrderSeed] = useState(createSecureRandomSeed);
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('warn');
  const [preflightOnly, setPreflightOnly] = useState(false);
  const [includeExtensionsInput, setIncludeExtensionsInput] = useState('');
  const [excludeExtensionsInput, setExcludeExtensionsInput] = useState('');
  const [assetOrderMode, setAssetOrderMode] = useState<AssetOrderMode>(
    'backend-current'
  );
  const [showImagesOnly, setShowImagesOnly] = useState(true);
  const [assetGridPage, setAssetGridPage] = useState(1);
  const [previewPanelView, setPreviewPanelView] = useState<'image' | 'metadata'>(
    'image'
  );
  const [selectedPreviewAssetId, setSelectedPreviewAssetId] = useState<string | null>(
    null
  );
  const [assetImageErrors, setAssetImageErrors] = useState<Record<string, true>>({});
  const [selectedPreviewText, setSelectedPreviewText] = useState<string | null>(null);
  const [selectedPreviewTextTruncated, setSelectedPreviewTextTruncated] = useState(false);
  const [selectedPreviewTextPending, setSelectedPreviewTextPending] = useState(false);
  const [selectedPreviewTextError, setSelectedPreviewTextError] = useState<string | null>(
    null
  );
  const [assetsForCollectionId, setAssetsForCollectionId] = useState('');
  const [uploadControlsCollapsed, setUploadControlsCollapsed] = useState(false);
  const [lastUploadTrace, setLastUploadTrace] = useState<{
    requestId: string | null;
    mode: string | null;
    binding: string | null;
    filePath: string | null;
    step: 'token' | 'storage' | 'metadata' | null;
  }>({
    requestId: null,
    mode: null,
    binding: null,
    filePath: null,
    step: null
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAutoCollapseCollectionIdRef = useRef<string | null>(null);

  const normalizedCollectionId = useMemo(() => collectionId.trim(), [collectionId]);
  const normalizedActiveCollectionId = useMemo(
    () => props.activeCollectionId?.trim() ?? '',
    [props.activeCollectionId]
  );

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const loadAssets = async (id = normalizedCollectionId) => {
    if (!id) {
      setAssets([]);
      setAssetsForCollectionId('');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/collections/${encodeURIComponent(id)}/assets`);
      const payload = await parseManageJsonResponse<ManagedAsset[]>(
        response,
        'Collection assets'
      );
      setAssets(payload);
      setAssetsForCollectionId(id);
      props.onJourneyRefreshRequested?.();
    } catch (error) {
      setAssets([]);
      setAssetsForCollectionId(id);
      setStatus(toManageApiErrorMessage(error, 'Load failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', 'true');
    folderInputRef.current.setAttribute('directory', 'true');
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [normalizedCollectionId]);

  useEffect(() => {
    if (!normalizedActiveCollectionId || normalizedActiveCollectionId === collectionId.trim()) {
      return;
    }
    pendingAutoCollapseCollectionIdRef.current = normalizedActiveCollectionId;
    setCollectionId(normalizedActiveCollectionId);
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
    setStatus(null);
  }, [normalizedActiveCollectionId]);

  useEffect(() => {
    const pendingId = pendingAutoCollapseCollectionIdRef.current;
    if (!pendingId || assetsForCollectionId !== pendingId) {
      return;
    }
    setUploadControlsCollapsed(assets.length > 0);
    pendingAutoCollapseCollectionIdRef.current = null;
  }, [assetsForCollectionId, assets.length]);

  useEffect(() => {
    setAssetGridPage(1);
    setSelectedPreviewAssetId(null);
    setAssetImageErrors({});
  }, [normalizedCollectionId]);

  useEffect(() => {
    if (!normalizedCollectionId) {
      setReadiness(null);
      setReadinessLoading(false);
      return;
    }

    const controller = new AbortController();
    setReadinessLoading(true);

    const loadReadiness = async () => {
      try {
        const response = await fetch(
          `/collections/${encodeURIComponent(normalizedCollectionId)}/readiness`,
          {
            signal: controller.signal
          }
        );
        const payload = await parseManageJsonResponse<UploadReadiness>(
          response,
          'Collection readiness'
        );
        if (!controller.signal.aborted) {
          setReadiness(payload);
          props.onJourneyRefreshRequested?.();
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setReadiness(null);
          setStatus(toManageApiErrorMessage(error, 'Unable to check upload readiness'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setReadinessLoading(false);
        }
      }
    };

    void loadReadiness();

    return () => controller.abort();
  }, [normalizedCollectionId]);

  useEffect(() => {
    if (!normalizedCollectionId) {
      setCollectionTargetSupply(null);
      setCollectionMetadata(null);
      setDeployPricingLock(null);
      setCollectionLabel(null);
      setCollectionState('draft');
      return;
    }

    const controller = new AbortController();
    const loadCollection = async () => {
      try {
        const response = await fetch(
          `/collections/${encodeURIComponent(normalizedCollectionId)}`,
          { signal: controller.signal }
        );
        const payload = await parseManageJsonResponse<CollectionRecord>(
          response,
          'Collection'
        );
        if (controller.signal.aborted) {
          return;
        }
        const label = payload.display_name?.trim() || payload.slug?.trim() || null;
        setCollectionLabel(label);
        const metadata = payload.metadata ?? null;
        setCollectionMetadata(metadata);
        setCollectionTargetSupply(parseTargetSupply(metadata));
        setDeployPricingLock(parseDeployPricingLock(metadata));
        setCollectionState(String(payload.state ?? 'draft').trim().toLowerCase());
        props.onJourneyRefreshRequested?.();
      } catch {
        if (!controller.signal.aborted) {
          setCollectionLabel(null);
          setCollectionTargetSupply(null);
          setCollectionMetadata(null);
          setDeployPricingLock(null);
          setCollectionState('draft');
        }
      }
    };

    void loadCollection();
    return () => controller.abort();
  }, [normalizedCollectionId]);

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setSelectedFiles(nextFiles);
    setStatus(null);
  };

  const selectedCandidates = useMemo(
    () =>
      selectedFiles.map((file, index) => ({
        id: `${index}-${fileSortKey(file)}-${file.size}-${file.lastModified}`,
        name: file.name,
        path: fileSortKey(file),
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        lastModified: file.lastModified || 0,
        payload: file
      })),
    [selectedFiles]
  );

  const preparedSelection = useMemo(
    () =>
      prepareUploadSelection({
        items: selectedCandidates,
        includeExtensionsInput,
        excludeExtensionsInput,
        orderMode,
        duplicatePolicy,
        seededOrderSeed
      }),
    [
      selectedCandidates,
      includeExtensionsInput,
      excludeExtensionsInput,
      orderMode,
      duplicatePolicy,
      seededOrderSeed
    ]
  );

  const filesForUpload = useMemo(
    () => preparedSelection.items.map((item) => item.payload),
    [preparedSelection.items]
  );

  const selectedTotalBytes = useMemo(
    () => filesForUpload.reduce((sum, file) => sum + file.size, 0),
    [filesForUpload]
  );

  const uploadWarnings = useMemo(
    () =>
      buildUploadSafetyWarnings({
        selectedFiles: filesForUpload.map((file) => ({
          name: file.name,
          path: fileSortKey(file),
          size: file.size,
          mimeType: file.type || 'application/octet-stream'
        })),
        existingAssets: assets.map((asset) => ({
          path: asset.path,
          filename: asset.filename,
          state: asset.state
        })),
        targetSupply: collectionTargetSupply
      }),
    [filesForUpload, assets, collectionTargetSupply]
  );

  const overlappingExtensionFilters = useMemo(() => {
    const excludeSet = new Set(preparedSelection.excludeExtensions);
    return preparedSelection.includeExtensions.filter((ext) => excludeSet.has(ext));
  }, [preparedSelection.excludeExtensions, preparedSelection.includeExtensions]);

  const prepNotices = useMemo(() => {
    const notices: string[] = [];
    if (preparedSelection.skippedByFilter > 0) {
      notices.push(
        `${preparedSelection.skippedByFilter} file${
          preparedSelection.skippedByFilter === 1 ? '' : 's'
        } excluded by extension filters.`
      );
    }
    if (preparedSelection.skippedDuplicates > 0 && duplicatePolicy === 'skip') {
      notices.push(
        `${preparedSelection.skippedDuplicates} duplicate file${
          preparedSelection.skippedDuplicates === 1 ? '' : 's'
        } skipped automatically.`
      );
    }
    if (orderMode === 'seeded-random') {
      notices.push('Seeded random order is active and reproducible with the current seed.');
    }
    return notices;
  }, [
    preparedSelection.skippedByFilter,
    preparedSelection.skippedDuplicates,
    duplicatePolicy,
    orderMode
  ]);

  const orderedAssets = useMemo(
    () => sortManagedAssets(assets, assetOrderMode),
    [assets, assetOrderMode]
  );

  const previewableAssets = useMemo(
    () =>
      orderedAssets.filter((asset) =>
        showImagesOnly ? isImageAsset(asset) : true
      ),
    [orderedAssets, showImagesOnly]
  );

  const totalAssetPages = Math.max(
    1,
    Math.ceil(previewableAssets.length / ASSET_GRID_PAGE_SIZE)
  );

  useEffect(() => {
    setAssetGridPage((current) => Math.min(current, totalAssetPages));
  }, [totalAssetPages]);

  useEffect(() => {
    if (previewableAssets.length === 0) {
      if (selectedPreviewAssetId !== null) {
        setSelectedPreviewAssetId(null);
      }
      return;
    }
    const stillExists = previewableAssets.some(
      (asset) => asset.asset_id === selectedPreviewAssetId
    );
    if (!stillExists) {
      setSelectedPreviewAssetId(previewableAssets[0].asset_id);
    }
  }, [previewableAssets, selectedPreviewAssetId]);

  useEffect(() => {
    if (!selectedPreviewAssetId) {
      setPreviewPanelView('image');
    }
  }, [selectedPreviewAssetId]);

  const pageStartIndex = (assetGridPage - 1) * ASSET_GRID_PAGE_SIZE;
  const currentAssetPage = useMemo(
    () =>
      previewableAssets.slice(
        pageStartIndex,
        pageStartIndex + ASSET_GRID_PAGE_SIZE
      ),
    [previewableAssets, pageStartIndex]
  );

  const currentPageEmptySlots = Math.max(
    0,
    ASSET_GRID_PAGE_SIZE - currentAssetPage.length
  );

  const selectedPreviewAsset = useMemo(
    () =>
      previewableAssets.find((asset) => asset.asset_id === selectedPreviewAssetId) ??
      null,
    [previewableAssets, selectedPreviewAssetId]
  );

  const selectedPreviewIndex = useMemo(() => {
    if (!selectedPreviewAsset) {
      return 0;
    }
    const index = previewableAssets.findIndex(
      (asset) => asset.asset_id === selectedPreviewAsset.asset_id
    );
    return index >= 0 ? index + 1 : 0;
  }, [previewableAssets, selectedPreviewAsset]);

  const selectedPreviewUrl = useMemo(() => {
    if (!selectedPreviewAsset || !normalizedCollectionId) {
      return null;
    }
    return buildAssetPreviewUrl(
      normalizedCollectionId,
      selectedPreviewAsset.asset_id
    );
  }, [selectedPreviewAsset, normalizedCollectionId]);

  const selectedPreviewMediaKind = useMemo(
    () => (selectedPreviewAsset ? getAssetMediaKind(selectedPreviewAsset) : null),
    [selectedPreviewAsset]
  );

  const selectedPreviewTraits = useMemo(
    () => (selectedPreviewAsset ? extractPathTraits(selectedPreviewAsset.path) : []),
    [selectedPreviewAsset]
  );

  useEffect(() => {
    if (!selectedPreviewAsset || !selectedPreviewUrl || selectedPreviewMediaKind !== 'text') {
      setSelectedPreviewText(null);
      setSelectedPreviewTextTruncated(false);
      setSelectedPreviewTextPending(false);
      setSelectedPreviewTextError(null);
      return;
    }

    const controller = new AbortController();
    setSelectedPreviewTextPending(true);
    setSelectedPreviewTextError(null);

    const loadTextPreview = async () => {
      try {
        const response = await fetch(selectedPreviewUrl, {
          cache: 'default',
          signal: controller.signal
        });
        if (!response.ok) {
          const body = (await response.text())
            .slice(0, 180)
            .replace(/\s+/g, ' ')
            .trim();
          throw new Error(
            `Unable to load text preview (${response.status})${body ? `: ${body}` : ''}.`
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const preview = getTextPreview(bytes);
        if (controller.signal.aborted) {
          return;
        }
        setSelectedPreviewText(preview.text);
        setSelectedPreviewTextTruncated(preview.truncated);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setSelectedPreviewText(null);
        setSelectedPreviewTextTruncated(false);
        setSelectedPreviewTextError(
          error instanceof Error
            ? error.message
            : 'Unable to load a text preview for this asset.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setSelectedPreviewTextPending(false);
        }
      }
    };

    void loadTextPreview();
    return () => controller.abort();
  }, [selectedPreviewAsset, selectedPreviewMediaKind, selectedPreviewUrl]);

  const markAssetImageError = (assetId: string) => {
    setAssetImageErrors((current) =>
      current[assetId] ? current : { ...current, [assetId]: true }
    );
  };

  const uploadsLocked =
    readiness?.uploadsLocked === true ||
    collectionState === 'published' ||
    collectionState === 'archived';
  const uploadLockReason =
    readiness?.lockReason ??
    (uploadsLocked
      ? `Uploads are locked while collection state is "${collectionState}".`
      : null);

  const lockStagedAssetsForDeploy = async () => {
    if (!normalizedCollectionId) {
      setStatus('Enter a collection ID first.');
      return;
    }
    if (uploadsLocked) {
      setStatus(uploadLockReason ?? 'Uploads are currently locked.');
      return;
    }
    const activeAssets = assets.filter((asset) => {
      const state = String(asset.state ?? '').trim().toLowerCase();
      return state !== 'expired' && state !== 'sold-out';
    });
    if (activeAssets.length === 0) {
      setStatus('No active staged assets found to lock.');
      return;
    }
    const maxChunks = activeAssets.reduce(
      (max, asset) => Math.max(max, Math.floor(asset.total_chunks || 0)),
      0
    );
    const maxBytes = activeAssets.reduce(
      (max, asset) => Math.max(max, Math.floor(asset.total_bytes || 0)),
      0
    );
    const totalBytes = activeAssets.reduce(
      (sum, asset) => sum + Math.max(0, Math.floor(asset.total_bytes || 0)),
      0
    );
    if (maxChunks <= 0 || maxBytes <= 0 || totalBytes <= 0) {
      setStatus('Unable to lock pricing: staged asset stats are invalid.');
      return;
    }

    const lock: DeployPricingLock = {
      version: 'v1',
      lockedAt: new Date().toISOString(),
      assetCount: activeAssets.length,
      maxChunks,
      maxBytes,
      totalBytes
    };

    setLockPending(true);
    try {
      const nextMetadata: Record<string, unknown> = {
        ...(collectionMetadata ?? {}),
        deployPricingLock: lock
      };
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
      const updatedMetadata = updated.metadata ?? null;
      setCollectionMetadata(updatedMetadata);
      setDeployPricingLock(parseDeployPricingLock(updatedMetadata));
      props.onJourneyRefreshRequested?.();
      setStatus(
        `Pricing lock saved (${activeAssets.length} assets, max ${maxChunks} chunks, max ${formatBytes(
          BigInt(maxBytes)
        )}).`
      );
    } catch (error) {
      setStatus(
        toManageApiErrorMessage(error, 'Unable to save deploy pricing lock.')
      );
    } finally {
      setLockPending(false);
    }
  };

  const clearLocalDeployPricingLock = () => {
    setCollectionMetadata((current) => {
      if (!current || typeof current !== 'object') {
        return current;
      }
      if (!Object.prototype.hasOwnProperty.call(current, 'deployPricingLock')) {
        return current;
      }
      const next = { ...current };
      delete next.deployPricingLock;
      return next;
    });
    setDeployPricingLock(null);
  };

  const getAssetRemovalBlockedReason = (asset: ManagedAsset) => {
    const state = String(asset.state ?? '')
      .trim()
      .toLowerCase();
    if (uploadsLocked) {
      return uploadLockReason ?? 'Uploads are currently locked.';
    }
    if (uploading) {
      return 'Wait for the current upload to finish before removing staged assets.';
    }
    if (loading) {
      return 'Wait for staged assets to finish loading.';
    }
    if (lockPending) {
      return 'Wait for pricing lock save to finish.';
    }
    if (removingAssetId) {
      return removingAssetId === asset.asset_id
        ? 'Removing staged asset...'
        : 'Another asset removal is already in progress.';
    }
    if (state === 'sold-out') {
      return 'Minted assets cannot be removed from staging.';
    }
    return null;
  };

  const removeStagedAsset = async (asset: ManagedAsset) => {
    const blockedReason = getAssetRemovalBlockedReason(asset);
    if (!normalizedCollectionId) {
      setStatus('Enter a collection ID first.');
      return;
    }
    if (blockedReason) {
      setStatus(blockedReason);
      return;
    }

    const assetName = getAssetDisplayName(asset);
    const confirmationMessage = deployPricingLock
      ? `Remove "${assetName}" from staged assets?\n\nThis also clears the deploy pricing lock. You will need to lock staged assets again before deploy.`
      : `Remove "${assetName}" from staged assets?`;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(confirmationMessage)
    ) {
      return;
    }

    setRemovingAssetId(asset.asset_id);
    setStatus(`Removing ${assetName} from staged assets...`);
    try {
      const response = await fetch(
        `/collections/${encodeURIComponent(
          normalizedCollectionId
        )}/assets?assetId=${encodeURIComponent(asset.asset_id)}`,
        {
          method: 'DELETE'
        }
      );
      const payload = await parseManageJsonResponse<DeleteAssetResponse>(
        response,
        'Remove staged asset'
      );

      setAssets((current) =>
        current.filter((currentAsset) => currentAsset.asset_id !== asset.asset_id)
      );
      setAssetImageErrors((current) => {
        if (!current[asset.asset_id]) {
          return current;
        }
        const next = { ...current };
        delete next[asset.asset_id];
        return next;
      });
      if (payload.pricingLockCleared) {
        clearLocalDeployPricingLock();
      }
      props.onJourneyRefreshRequested?.();
      setStatus(
        `Removed ${assetName} from staged assets.${
          payload.pricingLockCleared
            ? ' Pricing lock cleared; lock staged assets again before deploy.'
            : ''
        }`
      );
    } catch (error) {
      setStatus(
        toManageApiErrorMessage(error, 'Unable to remove staged asset.')
      );
    } finally {
      setRemovingAssetId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedCollectionId) {
      setStatus('Enter a collection ID first.');
      return;
    }
    if (uploadsLocked) {
      setStatus(uploadLockReason ?? 'Uploads are currently locked.');
      return;
    }
    if (filesForUpload.length === 0) {
      setStatus('Choose one or more files first.');
      return;
    }
    if (preflightOnly) {
      setStatus(
        `Preflight complete for ${filesForUpload.length} file${
          filesForUpload.length === 1 ? '' : 's'
        }. No files were uploaded.`
      );
      return;
    }
    if (readinessLoading) {
      setStatus('Checking deployment readiness. Try again in a moment.');
      return;
    }
    if (!readiness?.ready) {
      setStatus(
        readiness?.reason ?? 'Upload readiness check is unavailable. Refresh and try again.'
      );
      return;
    }
    setUploading(true);
    setLastUploadTrace({
      requestId: null,
      mode: null,
      binding: null,
      filePath: null,
      step: null
    });
    logUploadDebug('upload.start', {
      collectionId: normalizedCollectionId,
      selectedFiles: selectedFiles.length,
      filesForUpload: filesForUpload.length,
      totalBytes: selectedTotalBytes,
      orderMode,
      duplicatePolicy
    });
    setStatus(`Uploading 1/${filesForUpload.length}: ${fileSortKey(filesForUpload[0])}`);

    let uploadedCount = 0;
    let failedAtIndex: number | null = null;
    let failedMessage: string | null = null;
    let failedRequestId: string | null = null;

    for (let index = 0; index < filesForUpload.length; index += 1) {
      const selectedFile = filesForUpload[index];
      const path = fileSortKey(selectedFile);
      let currentRequestId: string | null = null;
      try {
        if (index > 0) {
          setStatus(`Uploading ${index + 1}/${filesForUpload.length}: ${path}`);
        }
        const tokenResponse = await fetch(
          `/collections/${encodeURIComponent(normalizedCollectionId)}/upload-url`
        );
        const token = await parseManageJsonResponse<UploadTokenResponse>(
          tokenResponse,
          'Upload URL'
        );
        const tokenRequestId = token.requestId ?? null;
        currentRequestId = tokenRequestId;
        failedRequestId = tokenRequestId;
        setLastUploadTrace({
          requestId: tokenRequestId,
          mode: token.mode ?? null,
          binding: token.binding ?? null,
          filePath: path,
          step: 'token'
        });
        logUploadDebug('upload.token.ok', {
          index: index + 1,
          total: filesForUpload.length,
          path,
          key: token.key,
          mode: token.mode ?? null,
          binding: token.binding ?? null,
          requestId: tokenRequestId,
          durationMs: token.durationMs ?? null
        });

        const storageResponse = await fetch(token.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
          body: selectedFile
        });
        if (!storageResponse.ok) {
          const snippet = (await storageResponse.text())
            .slice(0, 220)
            .replace(/\s+/g, ' ')
            .trim();
          logUploadDebug('upload.storage.error', {
            index: index + 1,
            total: filesForUpload.length,
            path,
            status: storageResponse.status,
            snippet: snippet || null,
            requestId: tokenRequestId
          });
          throw new Error(
            `Storage upload failed (${storageResponse.status})${
              snippet ? `: ${snippet}` : '.'
            }${tokenRequestId ? ` Request ID: ${tokenRequestId}` : ''}`
          );
        }
        setLastUploadTrace({
          requestId: tokenRequestId,
          mode: token.mode ?? null,
          binding: token.binding ?? null,
          filePath: path,
          step: 'storage'
        });
        logUploadDebug('upload.storage.ok', {
          index: index + 1,
          total: filesForUpload.length,
          path,
          requestId: tokenRequestId
        });

        const expectedHash = await hexDigest(selectedFile);
        const metadataResponse = await fetch(
          `/collections/${encodeURIComponent(normalizedCollectionId)}/assets`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path,
              filename: selectedFile.name,
              mimeType: selectedFile.type || 'application/octet-stream',
              totalBytes: selectedFile.size,
              totalChunks: chunkCount(selectedFile.size),
              expectedHash,
              storageKey: token.key
            })
          }
        );
        await parseManageJsonResponse(metadataResponse, 'Asset metadata');
        if (uploadedCount === 0) {
          clearLocalDeployPricingLock();
        }
        setLastUploadTrace({
          requestId: tokenRequestId,
          mode: token.mode ?? null,
          binding: token.binding ?? null,
          filePath: path,
          step: 'metadata'
        });
        logUploadDebug('upload.metadata.ok', {
          index: index + 1,
          total: filesForUpload.length,
          path,
          requestId: tokenRequestId
        });
        uploadedCount += 1;
      } catch (error) {
        logUploadDebug('upload.file.error', {
          index: index + 1,
          total: filesForUpload.length,
          path,
          message: error instanceof Error ? error.message : String(error),
          requestId: currentRequestId
        });
        failedAtIndex = index;
        failedMessage = toManageApiErrorMessage(error, 'Upload error');
        failedRequestId = currentRequestId ?? failedRequestId;
        break;
      }
    }

    await loadAssets(normalizedCollectionId);
    setUploading(false);

    if (failedAtIndex === null) {
      logUploadDebug('upload.complete', {
        collectionId: normalizedCollectionId,
        uploadedCount
      });
      setStatus(`Uploaded ${uploadedCount} file${uploadedCount === 1 ? '' : 's'}.`);
      clearSelectedFiles();
      return;
    }

    const remaining = filesForUpload.slice(failedAtIndex);
    setSelectedFiles(remaining);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
    setStatus(
      `Uploaded ${uploadedCount}/${filesForUpload.length}. ${
        failedMessage ?? 'Upload failed.'
      } ${
        failedRequestId ? `Request ID: ${failedRequestId}. ` : ''
      }${remaining.length} file${remaining.length === 1 ? '' : 's'} remain selected for retry.`
    );
  };

  const uploadGate = useMemo(() => {
    if (!normalizedCollectionId) {
      return {
        canUpload: false,
        reason:
          'Enter a collection ID first. Copy it from "Your drops" after creating a draft in Step 1.'
      };
    }
    if (uploadsLocked) {
      return {
        canUpload: false,
        reason: uploadLockReason ?? 'Uploads are currently locked for this collection.'
      };
    }
    if (uploading) {
      return {
        canUpload: false,
        reason: 'Upload already in progress.'
      };
    }
    if (selectedFiles.length === 0) {
      return {
        canUpload: false,
        reason: 'Select one or more files first.'
      };
    }
    if (filesForUpload.length === 0) {
      return {
        canUpload: false,
        reason:
          'No selected files are currently eligible after filters/duplicate rules.'
      };
    }
    if (preflightOnly) {
      return {
        canUpload: true,
        reason: null
      };
    }
    if (readinessLoading) {
      return {
        canUpload: false,
        reason: 'Checking upload readiness...'
      };
    }
    if (!readiness?.ready) {
      return {
        canUpload: false,
        reason: readiness?.reason ?? 'Upload readiness check is unavailable.'
      };
    }
    return {
      canUpload: true,
      reason: null
    };
  }, [
    normalizedCollectionId,
    uploadsLocked,
    uploadLockReason,
    uploading,
    selectedFiles.length,
    filesForUpload.length,
    preflightOnly,
    readinessLoading,
    readiness?.ready,
    readiness?.reason
  ]);

  const canUpload = uploadGate.canUpload;

  return (
    <div className="asset-staging-panel">
      <section
        className={`asset-staging__section${
          uploadControlsCollapsed ? ' asset-staging__section--collapsed' : ''
        }`}
      >
        <div className="asset-staging__section-header">
          <div>
            <h3 className="info-label">
              Upload controls
              <InfoTooltip text="Choose files, validate ordering/filters, then upload and lock staged assets so launch pricing can use a fixed fee floor." />
            </h3>
            <p>Select a collection, choose files/folder, then run upload checks.</p>
          </div>
          <div className="mint-actions">
            <span className="info-label">
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={() =>
                  setUploadControlsCollapsed((current) => !current)
                }
              >
                {uploadControlsCollapsed ? 'Expand upload controls' : 'Collapse upload controls'}
              </button>
              <InfoTooltip text="Collapses this setup area so you can focus on staged assets and preview checks." />
            </span>
          </div>
        </div>

        {uploadControlsCollapsed ? (
          <p className="asset-staging__collapsed-note">
            Upload controls are collapsed so staged assets stay in view. Expand if you
            need to add more files.
          </p>
        ) : (
          <div className="asset-staging__section-body">
            <form className="field" onSubmit={handleSubmit}>
              <label className="field__label">
                <span className="info-label">
                  Collection ID
                  <InfoTooltip text="Use the ID shown in Step 1 under 'Your drops'. It identifies which drop these files belong to." />
                </span>
                <input
                  className="input"
                  placeholder="Paste collection ID from Your drops"
                  value={collectionId}
                  onChange={(event) => {
                    setCollectionId(event.target.value);
                    clearSelectedFiles();
                    setStatus(null);
                  }}
                  disabled={uploading}
                />
                <span className="field__hint">
                  Tip: click "Copy ID" in Your drops, then paste it here.
                </span>
              </label>

              <label className="field__label">
                <span className="info-label">
                  Select files
                  <InfoTooltip text="Pick multiple files at once for faster staging. Files upload one-by-one for reliability." />
                </span>
                <input
                  ref={fileInputRef}
                  className="input"
                  type="file"
                  multiple
                  onChange={handleFilesSelected}
                  disabled={uploading || uploadsLocked}
                />
                <span className="field__hint">
                  Use this for quick multi-select from a single location.
                </span>
              </label>

              <label className="field__label">
                <span className="info-label">
                  Or select a folder
                  <InfoTooltip text="Choose a whole folder to load all files at once, including subfolder paths." />
                </span>
                <input
                  ref={folderInputRef}
                  className="input"
                  type="file"
                  multiple
                  onChange={handleFilesSelected}
                  disabled={uploading || uploadsLocked}
                />
                <span className="field__hint">
                  Folder uploads keep relative paths so collection structure stays clear.
                </span>
              </label>

              <div className="mint-actions">
                <span className="info-label">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => setShowAdvanced((current) => !current)}
                    disabled={uploading || uploadsLocked}
                  >
                    {showAdvanced
                      ? 'Hide advanced upload settings'
                      : 'Show advanced upload settings'}
                  </button>
                  <InfoTooltip text="Reveal optional ordering, duplicate, extension, and preflight controls." />
                </span>
              </div>

              {showAdvanced && (
                <div className="deploy-wizard__defaults">
                  <p className="deploy-wizard__defaults-title">Advanced upload settings</p>
                  <div className="deploy-wizard__grid">
                    <label className="field">
                      <span className="field__label info-label">
                        Inscription order
                        <InfoTooltip text="Choose how selected files are ordered before upload and mint staging." />
                      </span>
                      <select
                        className="select"
                        value={orderMode}
                        onChange={(event) => setOrderMode(event.target.value as UploadOrderMode)}
                        disabled={uploading}
                      >
                        {ORDER_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {orderMode === 'seeded-random' && (
                      <label className="field">
                        <span className="field__label info-label">
                          Random seed
                          <InfoTooltip text="Generated with Web Crypto for strong randomness. Keep this value to reproduce the same order later." />
                        </span>
                        <div className="field__inline">
                          <input
                            className="input"
                            value={seededOrderSeed}
                            onChange={(event) =>
                              setSeededOrderSeed(event.target.value.trim())
                            }
                            disabled={uploading}
                          />
                          <button
                            className="button button--ghost button--mini"
                            type="button"
                            onClick={() => setSeededOrderSeed(createSecureRandomSeed())}
                            disabled={uploading}
                          >
                            New secure seed
                          </button>
                        </div>
                      </label>
                    )}

                    <label className="field">
                      <span className="field__label info-label">
                        Duplicate handling
                        <InfoTooltip text="Warn only keeps all selected files. Auto-skip removes exact repeated file entries from this batch." />
                      </span>
                      <select
                        className="select"
                        value={duplicatePolicy}
                        onChange={(event) =>
                          setDuplicatePolicy(event.target.value as DuplicatePolicy)
                        }
                        disabled={uploading}
                      >
                        <option value="warn">Warn only</option>
                        <option value="skip">Auto-skip exact duplicates</option>
                      </select>
                    </label>

                    <label className="field">
                      <span className="field__label info-label">
                        Include extensions
                        <InfoTooltip text="Optional allow-list. Example: .png, .jpg. Leave empty to include everything." />
                      </span>
                      <input
                        className="input"
                        value={includeExtensionsInput}
                        placeholder=".png, .jpg"
                        onChange={(event) => setIncludeExtensionsInput(event.target.value)}
                        disabled={uploading}
                      />
                    </label>

                    <label className="field">
                      <span className="field__label info-label">
                        Exclude extensions
                        <InfoTooltip text="Optional block-list. Example: .psd, .tmp. Exclude rules override include rules." />
                      </span>
                      <input
                        className="input"
                        value={excludeExtensionsInput}
                        placeholder=".psd, .tmp"
                        onChange={(event) => setExcludeExtensionsInput(event.target.value)}
                        disabled={uploading}
                      />
                    </label>

                    <label className="field field--checkbox field--full">
                      <input
                        type="checkbox"
                        checked={preflightOnly}
                        onChange={(event) => setPreflightOnly(event.target.checked)}
                        disabled={uploading}
                      />
                      <span className="field__label info-label">
                        Preflight only (no upload)
                        <InfoTooltip text="Runs all checks and previews final batch count/order without sending files to storage." />
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {selectedFiles.length > 0 && (
                <div className="mint-step mint-step--pending">
                  <span className="meta-label">Selection</span>
                  <span className="meta-value">
                    Selected {selectedFiles.length} file
                    {selectedFiles.length === 1 ? '' : 's'} · ready {filesForUpload.length}{' '}
                    file{filesForUpload.length === 1 ? '' : 's'} ·{' '}
                    {formatBytes(BigInt(selectedTotalBytes))}
                    {collectionTargetSupply
                      ? ` · target supply ${collectionTargetSupply}`
                      : ''}
                    {collectionLabel ? ` · ${collectionLabel}` : ''}
                  </span>
                </div>
              )}

              {prepNotices.length > 0 && (
                <div className="alert">
                  <div>
                    {prepNotices.map((notice) => (
                      <p key={notice}>{notice}</p>
                    ))}
                  </div>
                </div>
              )}

              {overlappingExtensionFilters.length > 0 && (
                <div className="alert">
                  <p>
                    Extensions listed in both include and exclude rules:{' '}
                    {overlappingExtensionFilters.join(', ')}. Exclude rules take priority.
                  </p>
                </div>
              )}

              {uploadWarnings.length > 0 && (
                <div className="alert">
                  <div>
                    <strong>Quick checks before upload:</strong>
                    <ul>
                      {uploadWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {selectedFiles.length > 0 && filesForUpload.length === 0 && (
                <div className="alert">
                  <p>
                    No files are currently ready for upload. Check extension filters or
                    duplicate settings in advanced upload settings.
                  </p>
                </div>
              )}

              <div className="mint-actions">
                <span className="info-label">
                  <button className="button" type="submit" disabled={!canUpload}>
                    {uploadsLocked
                      ? 'Uploads locked'
                      : uploading
                      ? 'Uploading...'
                      : preflightOnly
                        ? 'Run preflight checks'
                        : `Upload selected file${filesForUpload.length === 1 ? '' : 's'}`}
                  </button>
                  <InfoTooltip text="Runs preflight-only checks or uploads selected files, depending on current mode." />
                </span>
                <span className="info-label">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={clearSelectedFiles}
                    disabled={selectedFiles.length === 0 || uploading}
                  >
                    Clear selection
                  </button>
                  <InfoTooltip text="Clears currently selected local files without touching already staged assets." />
                </span>
                <span className="info-label">
                  <button
                    className={`button button--ghost${
                      props.highlightLockAction ? ' button--next-action' : ''
                    }`}
                    type="button"
                    onClick={() => void lockStagedAssetsForDeploy()}
                    disabled={
                      uploading ||
                      loading ||
                      lockPending ||
                      !normalizedCollectionId ||
                      assets.length === 0 ||
                      uploadsLocked
                    }
                  >
                    {lockPending ? 'Locking...' : 'Lock staged assets for pricing'}
                  </button>
                  <InfoTooltip text="Saves the pricing-lock snapshot (asset count + max chunks) used later by Step 3 to calculate the standard-mint fee floor." />
                </span>
              </div>

              {!canUpload && uploadGate.reason ? (
                <p className="field__hint">Upload disabled: {uploadGate.reason}</p>
              ) : null}
            </form>

            {collectionId && (
              <div
                className={
                  uploadsLocked
                    ? 'mint-step mint-step--error'
                    : readiness?.ready
                      ? 'mint-step mint-step--done'
                      : 'mint-step mint-step--pending'
                }
              >
                <span className="meta-label">Upload readiness</span>
                <span className="meta-value">
                  {uploadsLocked
                    ? uploadLockReason
                    : readinessLoading
                    ? 'Checking upload readiness...'
                    : readiness?.ready
                      ? readiness.predeployUploadsReady && !readiness.deployReady
                        ? 'Ready. Draft upload staging is enabled before deploy.'
                        : readiness.deployReady
                          ? 'Ready. Deployment is confirmed on-chain.'
                          : readiness.reason ?? 'Ready to upload.'
                      : readiness?.reason ??
                        'Enter a valid collection id to check readiness.'}
                </span>
                <span className="meta-value">
                  Collection state: <strong>{collectionState || 'draft'}</strong>
                </span>
                <span className="meta-value">
                  Pricing lock:{' '}
                  {deployPricingLock
                    ? `${deployPricingLock.assetCount} assets · max ${deployPricingLock.maxChunks} chunks · locked ${new Date(
                        deployPricingLock.lockedAt
                      ).toLocaleString()}`
                    : 'Not locked yet'}
                </span>
                {readiness?.deployTxId && (
                  <a
                    className="button button--ghost button--mini"
                    href={buildTxExplorerUrl(readiness.deployTxId, readiness.network)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View deployment transaction
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {status && <p className="meta-value">{status}</p>}
        {lastUploadTrace.requestId && (
          <p className="meta-value">
            Last upload trace: request {lastUploadTrace.requestId}
            {lastUploadTrace.mode ? ` · ${lastUploadTrace.mode}` : ''}
            {lastUploadTrace.binding ? ` · ${lastUploadTrace.binding}` : ''}
            {lastUploadTrace.filePath ? ` · ${lastUploadTrace.filePath}` : ''}
            {lastUploadTrace.step ? ` · step ${lastUploadTrace.step}` : ''}
          </p>
        )}
      </section>

      <section className="asset-staging__section asset-staging__list">
        <h3 className="info-label">
          Staged assets checker
          <InfoTooltip text="Browse staged files, verify mint order, and inspect preview metadata before launch." />
        </h3>
        <p className="field__hint">
          Browse uploaded items in 4x4 pages, verify ordering, and inspect one asset
          in detail before launch.
        </p>

        <div className="asset-staging__controls">
          <label className="field">
            <span className="field__label info-label">
              Mint order checker
              <InfoTooltip text="Changes the sort mode used for this verification view only." />
            </span>
            <select
              className="select"
              value={assetOrderMode}
              onChange={(event) => {
                setAssetOrderMode(event.target.value as AssetOrderMode);
                setAssetGridPage(1);
              }}
            >
              {ASSET_ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={showImagesOnly}
              onChange={(event) => {
                setShowImagesOnly(event.target.checked);
                setAssetGridPage(1);
              }}
            />
            <span className="field__label info-label">
              Show images only
              <InfoTooltip text="Filter to image assets when you want a purely visual QA pass." />
            </span>
          </label>
        </div>

        <div className="asset-staging__summary">
          <span className="meta-value">
            Showing {previewableAssets.length} of {orderedAssets.length} staged assets ·
            page {assetGridPage} of {totalAssetPages}
          </span>
          <div className="asset-staging__pager">
            <span className="info-label">
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={() =>
                  setAssetGridPage((current) => Math.max(1, current - 1))
                }
                disabled={assetGridPage <= 1}
              >
                Previous 16
              </button>
              <InfoTooltip text="Go to the previous 4x4 page of staged assets." />
            </span>
            <span className="info-label">
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={() =>
                  setAssetGridPage((current) =>
                    Math.min(totalAssetPages, current + 1)
                  )
                }
                disabled={assetGridPage >= totalAssetPages}
              >
                Next 16
              </button>
              <InfoTooltip text="Go to the next 4x4 page of staged assets." />
            </span>
          </div>
        </div>

        {loading && <p>Loading…</p>}
        {!loading && orderedAssets.length === 0 && <p>No staged assets yet.</p>}
        {!loading && orderedAssets.length > 0 && previewableAssets.length === 0 && (
          <p className="meta-value">
            No image assets found in the current filter. Uncheck "Show images only" to
            inspect non-image files.
          </p>
        )}

        {!loading && previewableAssets.length > 0 && (
          <div className="asset-staging__viewer">
            <div className="asset-staging__grid" role="list">
              {currentAssetPage.map((asset, index) => {
                const isSelected = selectedPreviewAssetId === asset.asset_id;
                const imageFailed = Boolean(assetImageErrors[asset.asset_id]);
                const mediaKind = getAssetMediaKind(asset);
                const gridIndex = pageStartIndex + index + 1;
                const previewUrl = buildAssetPreviewUrl(
                  normalizedCollectionId,
                  asset.asset_id
                );
                const removeBlockedReason = getAssetRemovalBlockedReason(asset);
                const removeDisabled = removeBlockedReason !== null;

                return (
                  <div
                    key={asset.asset_id}
                    className={`asset-staging__thumb${
                      isSelected ? ' asset-staging__thumb--active' : ''
                    }`}
                    role="listitem"
                  >
                    <button
                      className="asset-staging__thumb-select"
                      type="button"
                      title={getAssetDisplayName(asset)}
                      aria-label={`Select ${getAssetDisplayName(asset)} for preview`}
                      onClick={() => setSelectedPreviewAssetId(asset.asset_id)}
                    >
                      <span className="asset-staging__thumb-index">#{gridIndex}</span>
                      <span className="asset-staging__thumb-frame">
                        {isImageAsset(asset) && !imageFailed ? (
                          <img
                            src={previewUrl}
                            alt={getAssetDisplayName(asset)}
                            loading="lazy"
                            onError={() => markAssetImageError(asset.asset_id)}
                          />
                        ) : (
                          <span className="asset-staging__thumb-placeholder">
                            {isImageAsset(asset)
                              ? 'Preview unavailable'
                              : `${mediaKind} · ${asset.mime_type}`}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      className="asset-staging__thumb-remove"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeStagedAsset(asset);
                      }}
                      disabled={removeDisabled}
                      aria-label={`Remove ${getAssetDisplayName(asset)} from staged assets`}
                      title={removeBlockedReason ?? 'Remove this staged asset'}
                    >
                      {removingAssetId === asset.asset_id ? '...' : 'Remove'}
                    </button>
                  </div>
                );
              })}

              {Array.from({ length: currentPageEmptySlots }).map((_, index) => (
                <div
                  key={`empty-${assetGridPage}-${index}`}
                  className="asset-staging__thumb asset-staging__thumb--empty"
                  aria-hidden="true"
                />
              ))}
            </div>

            <div className="asset-staging__preview">
              {!selectedPreviewAsset && (
                <p className="meta-value">
                  Select an item in the grid to see a larger preview.
                </p>
              )}

              {selectedPreviewAsset && (
                <>
                  <div className="asset-staging__preview-toolbar">
                    <div className="asset-staging__preview-summary">
                      <span
                        className="asset-staging__preview-title"
                        title={getAssetDisplayName(selectedPreviewAsset)}
                      >
                        {getAssetDisplayName(selectedPreviewAsset)}
                      </span>
                      <div className="asset-staging__preview-chips">
                        <span className="asset-staging__preview-chip">
                          Slot {selectedPreviewIndex > 0 ? `#${selectedPreviewIndex}` : 'n/a'}
                        </span>
                        <span className="asset-staging__preview-chip">
                          {formatBytes(BigInt(selectedPreviewAsset.total_bytes))}
                        </span>
                        <span className="asset-staging__preview-chip">
                          {selectedPreviewAsset.total_chunks} chunk
                          {selectedPreviewAsset.total_chunks === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                    <div className="asset-staging__preview-actions">
                      <div
                        className="asset-staging__preview-toggle"
                        role="group"
                        aria-label="Preview panel view"
                      >
                        <span className="info-label">
                          <button
                            className={`asset-staging__preview-toggle-button${
                              previewPanelView === 'image'
                                ? ' asset-staging__preview-toggle-button--active'
                                : ''
                            }`}
                            type="button"
                            onClick={() => setPreviewPanelView('image')}
                          >
                            Preview
                          </button>
                          <InfoTooltip text="Shows best-available preview by MIME type (image, video, audio, HTML/PDF, or text)." />
                        </span>
                        <span className="info-label">
                          <button
                            className={`asset-staging__preview-toggle-button${
                              previewPanelView === 'metadata'
                                ? ' asset-staging__preview-toggle-button--active'
                                : ''
                            }`}
                            type="button"
                            onClick={() => setPreviewPanelView('metadata')}
                          >
                            Metadata
                          </button>
                          <InfoTooltip text="Shows path, MIME, chunk count, size, and hash details for QA." />
                        </span>
                      </div>
                      <button
                        className="asset-staging__preview-remove"
                        type="button"
                        onClick={() => void removeStagedAsset(selectedPreviewAsset)}
                        disabled={
                          getAssetRemovalBlockedReason(selectedPreviewAsset) !== null
                        }
                        title={
                          getAssetRemovalBlockedReason(selectedPreviewAsset) ??
                          'Remove this staged asset'
                        }
                      >
                        {removingAssetId === selectedPreviewAsset.asset_id
                          ? 'Removing...'
                          : 'Remove'}
                      </button>
                    </div>
                  </div>

                  <div className="asset-staging__preview-body">
                    {previewPanelView === 'image' ? (
                      <div className="asset-staging__preview-frame">
                        {selectedPreviewUrl &&
                        isImageAsset(selectedPreviewAsset) &&
                        !assetImageErrors[selectedPreviewAsset.asset_id] ? (
                          <img
                            src={selectedPreviewUrl}
                            alt={getAssetDisplayName(selectedPreviewAsset)}
                            onError={() =>
                              markAssetImageError(selectedPreviewAsset.asset_id)
                            }
                          />
                        ) : selectedPreviewUrl &&
                          selectedPreviewMediaKind === 'video' ? (
                          <video
                            src={selectedPreviewUrl}
                            controls
                            preload="metadata"
                          />
                        ) : selectedPreviewUrl &&
                          selectedPreviewMediaKind === 'audio' ? (
                          <audio
                            src={selectedPreviewUrl}
                            controls
                            preload="metadata"
                          />
                        ) : selectedPreviewUrl && isHtmlAsset(selectedPreviewAsset) ? (
                          <iframe
                            src={selectedPreviewUrl}
                            title={getAssetDisplayName(selectedPreviewAsset)}
                            sandbox="allow-scripts allow-same-origin"
                          />
                        ) : selectedPreviewMediaKind === 'text' ? (
                          selectedPreviewTextPending ? (
                            <span className="asset-staging__thumb-placeholder">
                              Loading text preview...
                            </span>
                          ) : selectedPreviewTextError ? (
                            <span className="asset-staging__thumb-placeholder">
                              {selectedPreviewTextError}
                            </span>
                          ) : (
                            <pre className="asset-staging__preview-text">
                              {selectedPreviewText ?? ''}
                              {selectedPreviewTextTruncated
                                ? '\n\n[preview truncated]'
                                : ''}
                            </pre>
                          )
                        ) : (
                          <span className="asset-staging__thumb-placeholder">
                            {isImageAsset(selectedPreviewAsset)
                              ? 'Preview unavailable'
                              : `${selectedPreviewMediaKind ?? 'binary'} · ${
                                  selectedPreviewAsset.mime_type
                                }`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="asset-staging__preview-meta">
                        <p>
                          <strong>Order slot:</strong>{' '}
                          {selectedPreviewIndex > 0
                            ? `#${selectedPreviewIndex}`
                            : 'n/a'}
                        </p>
                        <p>
                          <strong>Name:</strong>{' '}
                          {getAssetDisplayName(selectedPreviewAsset)}
                        </p>
                        <p>
                          <strong>Path:</strong>{' '}
                          <code>{selectedPreviewAsset.path}</code>
                        </p>
                        <p>
                          <strong>MIME:</strong> {selectedPreviewAsset.mime_type}
                        </p>
                        <p>
                          <strong>Size:</strong>{' '}
                          {formatBytes(BigInt(selectedPreviewAsset.total_bytes))}
                        </p>
                        <p>
                          <strong>Chunks:</strong> {selectedPreviewAsset.total_chunks}
                        </p>
                        <p>
                          <strong>State:</strong> {selectedPreviewAsset.state}
                        </p>
                        <p>
                          <strong>Uploaded:</strong>{' '}
                          {new Date(selectedPreviewAsset.created_at).toLocaleString()}
                        </p>
                        {selectedPreviewAsset.expires_at ? (
                          <p>
                            <strong>Expires:</strong>{' '}
                            {new Date(
                              selectedPreviewAsset.expires_at
                            ).toLocaleString()}
                          </p>
                        ) : null}
                        {selectedPreviewAsset.expected_hash ? (
                          <p className="asset-staging__hash">
                            <strong>Expected hash:</strong>{' '}
                            <code>{selectedPreviewAsset.expected_hash}</code>
                          </p>
                        ) : null}
                        <p className="asset-staging__traits">
                          <strong>Trait hints:</strong>{' '}
                          {selectedPreviewTraits.length > 0
                            ? selectedPreviewTraits.join(' · ')
                            : 'No folder-based traits detected'}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
