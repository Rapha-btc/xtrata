const slugPattern = /^[a-z0-9-]{3,64}$/;
const XTRATA_MANAGE_FIXED_RECIPIENT_ADDRESS =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';

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

export const canonicalizeManageCollectionMetadata = (metadata: unknown) => {
  const parsed = parseCollectionMetadata(metadata);
  if (!parsed) {
    return null;
  }

  const toRecord = (value: unknown) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const coreContractId = toNullableString(parsed.coreContractId);
  const [coreAddress = ''] = coreContractId?.split('.') ?? [];
  const lockedRecipient =
    coreAddress.trim().toUpperCase() || XTRATA_MANAGE_FIXED_RECIPIENT_ADDRESS;
  const hardcodedDefaults = toRecord(parsed.hardcodedDefaults);
  const recipients = toRecord(hardcodedDefaults?.recipients);

  return {
    ...parsed,
    hardcodedDefaults: {
      ...(hardcodedDefaults ?? {}),
      recipients: {
        ...(recipients ?? {}),
        marketplace: lockedRecipient,
        operator: lockedRecipient
      }
    }
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

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

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

export const getCollectionDisplayOrder = (metadata: unknown) => {
  const metadataRecord = parseCollectionMetadata(metadata);
  const collectionPage = toRecord(metadataRecord?.collectionPage);
  const rawOrder = toFiniteNumber(collectionPage?.displayOrder);
  if (rawOrder === null) {
    return null;
  }
  return Math.trunc(rawOrder);
};

export const sortCollectionsForPublicDisplay = <
  T extends {
    id?: unknown;
    created_at?: unknown;
    metadata?: unknown;
  }
>(
  rows: T[]
) => {
  const copy = [...rows];
  copy.sort((left, right) => {
    const leftOrder = getCollectionDisplayOrder(left.metadata);
    const rightOrder = getCollectionDisplayOrder(right.metadata);
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== null && rightOrder === null) {
      return -1;
    }
    if (leftOrder === null && rightOrder !== null) {
      return 1;
    }
    const leftCreated = toFiniteNumber(left.created_at) ?? 0;
    const rightCreated = toFiniteNumber(right.created_at) ?? 0;
    if (leftCreated !== rightCreated) {
      return rightCreated - leftCreated;
    }
    const leftId = String(left.id ?? '');
    const rightId = String(right.id ?? '');
    return leftId.localeCompare(rightId);
  });
  return copy;
};

export const isCollectionPublished = (state: unknown) =>
  String(state ?? '')
    .trim()
    .toLowerCase() === 'published';
