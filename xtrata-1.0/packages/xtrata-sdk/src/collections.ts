import type {
  CollectionMintSnapshot,
  CollectionMintStatus,
  CollectionPhase
} from './types.js';

const slugPattern = /^[a-z0-9-]{3,64}$/;

export const normalizeCollectionSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

export const isValidCollectionSlug = (value: string) => slugPattern.test(value);

export const getEffectiveMintPrice = (status: {
  mintPrice: bigint;
  activePhaseId: bigint;
  activePhase: CollectionPhase | null;
}) => {
  if (status.activePhaseId > 0n && status.activePhase) {
    return status.activePhase.mintPrice;
  }
  return status.mintPrice;
};

export const createCollectionMintSnapshot = (
  status: CollectionMintStatus
): CollectionMintSnapshot => {
  const consumed = status.mintedCount + status.reservedCount;
  const remainingRaw = status.maxSupply - consumed;
  const remaining = remainingRaw > 0n ? remainingRaw : 0n;
  const soldOut = remaining === 0n;
  const live = !status.paused && !status.finalized && !soldOut;

  return {
    ...status,
    remaining,
    soldOut,
    live
  };
};

export const isCollectionMintLive = (status: CollectionMintStatus) =>
  createCollectionMintSnapshot(status).live;

export const shouldShowLiveMintPage = (params: {
  state?: string | null;
  status: CollectionMintStatus;
}) => {
  const normalizedState = String(params.state ?? '').trim().toLowerCase();
  if (normalizedState && normalizedState !== 'published') {
    return false;
  }
  return isCollectionMintLive(params.status);
};

export const COLLECTION_RESERVATION_TIMEOUT_MS = 20 * 60 * 1000;

export type PendingCollectionReservation = {
  hashHex: string;
  itemLabel: string;
  startedAtMs: number;
};

const isHashHex = (value: string) => /^[0-9a-f]{64}$/i.test(value);

const normalizeHashHex = (value: string) => value.trim().toLowerCase();

const normalizeReservation = (value: unknown): PendingCollectionReservation | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.hashHex !== 'string') {
    return null;
  }
  const hashHex = normalizeHashHex(raw.hashHex);
  if (!isHashHex(hashHex)) {
    return null;
  }
  const itemLabel =
    typeof raw.itemLabel === 'string' && raw.itemLabel.trim().length > 0
      ? raw.itemLabel.trim()
      : 'Collection item';
  const startedAtMs =
    typeof raw.startedAtMs === 'number' && Number.isFinite(raw.startedAtMs)
      ? Math.max(0, Math.floor(raw.startedAtMs))
      : 0;
  if (startedAtMs <= 0) {
    return null;
  }
  return { hashHex, itemLabel, startedAtMs };
};

export const parseStoredReservations = (raw: string | null) => {
  if (!raw) {
    return [] as PendingCollectionReservation[];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as PendingCollectionReservation[];
    }
    const next: PendingCollectionReservation[] = [];
    const seen = new Set<string>();
    parsed.forEach((entry) => {
      const normalized = normalizeReservation(entry);
      if (!normalized) {
        return;
      }
      if (seen.has(normalized.hashHex)) {
        return;
      }
      seen.add(normalized.hashHex);
      next.push(normalized);
    });
    return next;
  } catch {
    return [] as PendingCollectionReservation[];
  }
};

export const serializeReservations = (
  reservations: PendingCollectionReservation[]
) => JSON.stringify(reservations);

export const upsertReservation = (
  reservations: PendingCollectionReservation[],
  reservation: PendingCollectionReservation
) => {
  const normalized = normalizeReservation(reservation);
  if (!normalized) {
    return reservations;
  }
  const next = reservations.filter((entry) => entry.hashHex !== normalized.hashHex);
  next.push(normalized);
  return next.sort((left, right) => left.startedAtMs - right.startedAtMs);
};

export const removeReservationsByHashes = (
  reservations: PendingCollectionReservation[],
  hashes: string[]
) => {
  const hashSet = new Set(
    hashes.map((value) => normalizeHashHex(value)).filter((value) => isHashHex(value))
  );
  if (hashSet.size === 0) {
    return reservations;
  }
  return reservations.filter((entry) => !hashSet.has(entry.hashHex));
};

export const getSoonestReservationRemainingMs = (
  reservations: PendingCollectionReservation[],
  nowMs = Date.now(),
  timeoutMs = COLLECTION_RESERVATION_TIMEOUT_MS
) => {
  if (reservations.length === 0) {
    return null;
  }
  const soonestExpiryMs = Math.min(
    ...reservations.map((entry) => entry.startedAtMs + timeoutMs)
  );
  return Math.max(0, soonestExpiryMs - nowMs);
};

export const formatRemainingMinutesSeconds = (remainingMs: number) => {
  const safe = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

export type RandomDropAsset = {
  url: string;
  mimeType?: string;
  label?: string;
};

type RandomDropManifestObject = {
  assets?: unknown;
};

type RandomDropAssetInput =
  | string
  | {
      url?: unknown;
      mimeType?: unknown;
      label?: unknown;
    };

const isHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const normalizeAsset = (
  entry: RandomDropAssetInput,
  index: number
): { asset: RandomDropAsset | null; error: string | null } => {
  if (typeof entry === 'string') {
    const url = entry.trim();
    if (!url) {
      return { asset: null, error: `Asset ${index + 1} url is empty.` };
    }
    if (!isHttpUrl(url)) {
      return {
        asset: null,
        error: `Asset ${index + 1} url must use http or https.`
      };
    }
    return { asset: { url, label: `Drop item ${index + 1}` }, error: null };
  }

  if (!entry || typeof entry !== 'object') {
    return { asset: null, error: `Asset ${index + 1} is invalid.` };
  }

  const urlValue =
    typeof entry.url === 'string'
      ? entry.url.trim()
      : typeof entry.url === 'number'
        ? String(entry.url)
        : '';
  if (!urlValue) {
    return { asset: null, error: `Asset ${index + 1} is missing url.` };
  }
  if (!isHttpUrl(urlValue)) {
    return {
      asset: null,
      error: `Asset ${index + 1} url must use http or https.`
    };
  }

  const mimeType =
    typeof entry.mimeType === 'string' && entry.mimeType.trim().length > 0
      ? entry.mimeType.trim()
      : undefined;
  const label =
    typeof entry.label === 'string' && entry.label.trim().length > 0
      ? entry.label.trim()
      : `Drop item ${index + 1}`;

  return { asset: { url: urlValue, mimeType, label }, error: null };
};

export const parseRandomDropManifest = (raw: unknown) => {
  const source: unknown =
    Array.isArray(raw) || !raw || typeof raw !== 'object'
      ? raw
      : (raw as RandomDropManifestObject).assets;
  if (!Array.isArray(source)) {
    return {
      assets: [] as RandomDropAsset[],
      errors: ['Manifest must be an array or an object with an assets array.']
    };
  }

  const assets: RandomDropAsset[] = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();
  source.forEach((entry, index) => {
    const normalized = normalizeAsset(entry as RandomDropAssetInput, index);
    if (normalized.error) {
      errors.push(normalized.error);
      return;
    }
    if (!normalized.asset) {
      return;
    }
    const key = normalized.asset.url.toLowerCase();
    if (seenUrls.has(key)) {
      errors.push(`Asset ${index + 1} duplicates an existing url.`);
      return;
    }
    seenUrls.add(key);
    assets.push(normalized.asset);
  });

  if (assets.length === 0 && errors.length === 0) {
    errors.push('Manifest has no valid assets.');
  }

  return { assets, errors };
};

export const selectRandomDropAssets = (
  assets: RandomDropAsset[],
  quantity: number,
  random: () => number = Math.random
) => {
  if (!Number.isFinite(quantity) || quantity <= 0 || assets.length === 0) {
    return [] as RandomDropAsset[];
  }
  const limit = Math.min(Math.floor(quantity), assets.length);
  const shuffled = [...assets];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const temp = shuffled[index];
    shuffled[index] = shuffled[swapIndex] as RandomDropAsset;
    shuffled[swapIndex] = temp as RandomDropAsset;
  }
  return shuffled.slice(0, limit);
};
