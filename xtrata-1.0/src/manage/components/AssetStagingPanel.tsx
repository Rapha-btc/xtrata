import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
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
  deployTxId: string | null;
  deployTxStatus: string | null;
  network: 'mainnet' | 'testnet' | null;
};

type CollectionRecord = {
  display_name?: string | null;
  slug?: string | null;
  metadata?: Record<string, unknown> | null;
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

export default function AssetStagingPanel() {
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
  const [collectionLabel, setCollectionLabel] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [orderMode, setOrderMode] = useState<UploadOrderMode>('path-natural');
  const [seededOrderSeed, setSeededOrderSeed] = useState(createSecureRandomSeed);
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('warn');
  const [preflightOnly, setPreflightOnly] = useState(false);
  const [includeExtensionsInput, setIncludeExtensionsInput] = useState('');
  const [excludeExtensionsInput, setExcludeExtensionsInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedCollectionId = useMemo(() => collectionId.trim(), [collectionId]);

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
    } catch (error) {
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
      setCollectionLabel(null);
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
        setCollectionTargetSupply(parseTargetSupply(payload.metadata ?? null));
      } catch {
        if (!controller.signal.aborted) {
          setCollectionLabel(null);
          setCollectionTargetSupply(null);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedCollectionId) {
      setStatus('Enter a collection ID first.');
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
      setStatus(readiness?.reason ?? 'Upload is locked until deployment is confirmed.');
      return;
    }
    setUploading(true);
    setStatus(`Uploading 1/${filesForUpload.length}: ${fileSortKey(filesForUpload[0])}`);

    let uploadedCount = 0;
    let failedAtIndex: number | null = null;
    let failedMessage: string | null = null;

    for (let index = 0; index < filesForUpload.length; index += 1) {
      const selectedFile = filesForUpload[index];
      const path = fileSortKey(selectedFile);
      try {
        if (index > 0) {
          setStatus(`Uploading ${index + 1}/${filesForUpload.length}: ${path}`);
        }
        const tokenResponse = await fetch(
          `/collections/${encodeURIComponent(normalizedCollectionId)}/upload-url`
        );
        const token = await parseManageJsonResponse<{ uploadUrl: string; key: string }>(
          tokenResponse,
          'Upload URL'
        );

        const storageResponse = await fetch(token.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
          body: selectedFile
        });
        if (!storageResponse.ok) {
          throw new Error(`Storage upload failed (${storageResponse.status}).`);
        }

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
        uploadedCount += 1;
      } catch (error) {
        failedAtIndex = index;
        failedMessage = toManageApiErrorMessage(error, 'Upload error');
        break;
      }
    }

    await loadAssets(normalizedCollectionId);
    setUploading(false);

    if (failedAtIndex === null) {
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
      } ${remaining.length} file${remaining.length === 1 ? '' : 's'} remain selected for retry.`
    );
  };

  const canUpload = preflightOnly
    ? filesForUpload.length > 0 && !uploading
    : filesForUpload.length > 0 &&
      !!readiness?.ready &&
      !readinessLoading &&
      !uploading;

  return (
    <div className="asset-staging-panel">
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
            disabled={uploading}
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
            disabled={uploading}
          />
          <span className="field__hint">
            Folder uploads keep relative paths so collection structure stays clear.
          </span>
        </label>

        <div className="mint-actions">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            disabled={uploading}
          >
            {showAdvanced ? 'Hide advanced upload settings' : 'Show advanced upload settings'}
          </button>
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
                      onChange={(event) => setSeededOrderSeed(event.target.value.trim())}
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
              Selected {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} ·
              ready {filesForUpload.length} file{filesForUpload.length === 1 ? '' : 's'} ·{' '}
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

        <div className="mint-actions">
          <button className="button" type="submit" disabled={!canUpload}>
            {uploading
              ? 'Uploading...'
              : preflightOnly
                ? 'Run preflight checks'
                : `Upload selected file${filesForUpload.length === 1 ? '' : 's'}`}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={clearSelectedFiles}
            disabled={selectedFiles.length === 0 || uploading}
          >
            Clear selection
          </button>
        </div>
      </form>
      {collectionId && (
        <div className={readiness?.ready ? 'mint-step mint-step--done' : 'mint-step mint-step--pending'}>
          <span className="meta-label">Upload readiness</span>
          <span className="meta-value">
            {readinessLoading
              ? 'Checking deployment confirmation...'
              : readiness?.ready
                ? 'Ready. Deployment is confirmed on-chain.'
                : readiness?.reason ?? 'Enter a valid collection id to check readiness.'}
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
      {status && <p className="meta-value">{status}</p>}
      <div className="asset-staging__list">
        <h3>Staged assets</h3>
        {loading && <p>Loading…</p>}
        {!loading && assets.length === 0 && <p>No staged assets yet.</p>}
        <ul>
          {assets.map((asset) => (
            <li key={asset.asset_id}>
              <strong>{asset.filename ?? asset.path}</strong> ·{' '}
              {Math.round(asset.total_bytes / 1024)} KB · {asset.state}
              {asset.expires_at && (
                <>
                  {' '}
                  · expires {new Date(asset.expires_at).toLocaleString()}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
