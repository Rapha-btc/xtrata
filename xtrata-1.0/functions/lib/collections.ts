const slugPattern = /^[a-z0-9-]{3,64}$/;

export const normalizeSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

export const isValidSlug = (value: string) => slugPattern.test(value);

export const staysWithinLimit = (
  currentBytes: number,
  upcomingBytes: number,
  limitBytes: number
) => currentBytes + upcomingBytes <= limitBytes;

export const parseCollectionMetadata = (value: unknown) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCollectionState = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export const isCollectionUploadsLocked = (state: unknown) => {
  const normalizedState = normalizeCollectionState(state);
  return normalizedState === 'published' || normalizedState === 'archived';
};

export const canStageUploadsBeforeDeploy = (params: {
  contractAddress: unknown;
  state: unknown;
}) => {
  const hasContract = toNullableString(params.contractAddress) !== null;
  return !hasContract && normalizeCollectionState(params.state) === 'draft';
};

export const mergeCollectionMetadata = (
  existingMetadata: unknown,
  incomingMetadata: unknown
) => {
  const existing = parseCollectionMetadata(existingMetadata);
  const incoming =
    incomingMetadata && typeof incomingMetadata === 'object'
      ? (incomingMetadata as Record<string, unknown>)
      : null;
  if (!existing && !incoming) {
    return null;
  }
  return {
    ...(existing ?? {}),
    ...(incoming ?? {})
  };
};

export const stripDeployPricingLockFromMetadata = (metadata: unknown) => {
  const parsed = parseCollectionMetadata(metadata);
  if (!parsed) {
    return {
      metadata: null as Record<string, unknown> | null,
      changed: false
    };
  }
  if (!Object.prototype.hasOwnProperty.call(parsed, 'deployPricingLock')) {
    return {
      metadata: parsed,
      changed: false
    };
  }
  const next = { ...parsed };
  delete next.deployPricingLock;
  return {
    metadata: next,
    changed: true
  };
};

export const canReuseCollectionSlug = (params: {
  incomingArtistAddress: string;
  existingArtistAddress: unknown;
  contractAddress: unknown;
  metadata: unknown;
  state: unknown;
}) => {
  const incomingArtist = params.incomingArtistAddress.trim().toUpperCase();
  const existingArtist =
    toNullableString(params.existingArtistAddress)?.toUpperCase() ?? '';
  if (!incomingArtist || !existingArtist || incomingArtist !== existingArtist) {
    return false;
  }

  if (toNullableString(params.contractAddress)) {
    return false;
  }

  const metadataRecord = parseCollectionMetadata(params.metadata);
  if (toNullableString(metadataRecord?.deployTxId)) {
    return false;
  }

  if (normalizeCollectionState(params.state) === 'published') {
    return false;
  }

  return true;
};

const toRecord = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return null;
};

export const isCollectionPublicVisible = (metadata: unknown) => {
  const metadataRecord = parseCollectionMetadata(metadata);
  const collectionPage = toRecord(metadataRecord?.collectionPage);
  return toBoolean(collectionPage?.showOnPublicPage) === true;
};

export const isCollectionPublished = (state: unknown) =>
  String(state ?? '')
    .trim()
    .toLowerCase() === 'published';
