import { useEffect, useMemo, useState } from 'react';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
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

const isValidCoverUrl = (value: string) =>
  /^(https?:\/\/|ipfs:\/\/|data:image\/)/i.test(value);

type PublishOpsPanelProps = {
  activeCollectionId?: string;
};

export default function PublishOpsPanel(props: PublishOpsPanelProps) {
  const [collectionId, setCollectionId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Array<Record<string, unknown>>>([]);
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [assets, setAssets] = useState<ManagedAsset[]>([]);
  const [coverSource, setCoverSource] = useState<CoverImageSource>('collection-asset');
  const [selectedCoverAssetId, setSelectedCoverAssetId] = useState('');
  const [inscribedCoverUrl, setInscribedCoverUrl] = useState('');
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverPreviewFailed, setCoverPreviewFailed] = useState(false);
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
      toText(metadataCollection?.description) ||
      'Add a short description so collectors instantly understand your drop.',
    [metadataCollection]
  );
  const previewSupply = useMemo(
    () => parsePositiveInt(metadataCollection?.supply),
    [metadataCollection]
  );
  const previewMintPrice = useMemo(
    () => toText(metadataCollection?.mintPriceStx) || '0',
    [metadataCollection]
  );

  const loadReadiness = async () => {
    const normalizedCollectionId = collectionId.trim();
    if (!normalizedCollectionId) {
      setCollection(null);
      setAssets([]);
      setCoverSource('collection-asset');
      setSelectedCoverAssetId('');
      setInscribedCoverUrl('');
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

      setCollection(loadedCollection);
      setAssets(loadedAssets);
      setCoverSource(savedSource ?? 'collection-asset');
      setSelectedCoverAssetId(savedAssetId);
      setInscribedCoverUrl(savedUrl);
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
  }, [normalizedActiveCollectionId]);

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
    if (!readiness.contractConnected) {
      blockers.push('Deploy the contract in Step 1 before publishing.');
    }
    if (readiness.mintType !== 'pre-inscribed' && readiness.activeAssets <= 0) {
      blockers.push('Upload at least one artwork file in Step 2 before publishing.');
    }
    return blockers;
  }, [collectionId, readiness]);

  const canPublish = publishBlockers.length === 0;

  const liveState = toText(collection?.state).toLowerCase() === 'published'
    ? 'Live'
    : 'Draft';

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

      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title">Publish readiness</p>
        <ul>
          <li>Contract deployed: {readiness.contractConnected ? 'Yes' : 'No'}</li>
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
        <p className="deploy-wizard__defaults-title">Collection cover image</p>
        <p className="field__hint">
          Set the hero image for your live collection page. You can use an uploaded
          collection image or an existing inscribed image URL.
        </p>

        <label className="field">
          <span className="field__label">Cover source</span>
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

        <div className="mint-actions">
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => void saveCoverSettings()}
            disabled={coverSaving || !collectionId.trim()}
          >
            {coverSaving ? 'Saving...' : 'Save cover image'}
          </button>
        </div>
        {coverMessage && <p className="meta-value">{coverMessage}</p>}
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
          <p>{previewDescription}</p>
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
          Publish collection
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
