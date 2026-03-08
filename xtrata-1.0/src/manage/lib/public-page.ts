const toRecord = (value: unknown): Record<string, unknown> | null =>
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

const getCollectionPageMetadata = (metadata: unknown) => {
  const metadataRecord = toRecord(metadata);
  return toRecord(metadataRecord?.collectionPage);
};

const mergeCollectionPageMetadata = (
  metadata: unknown,
  patch: Record<string, unknown>
) => {
  const metadataRecord = toRecord(metadata) ?? {};
  const collectionPage = getCollectionPageMetadata(metadata) ?? {};
  return {
    ...metadataRecord,
    collectionPage: {
      ...collectionPage,
      ...patch
    }
  };
};

export const isCollectionVisibleOnPublicPage = (metadata: unknown) =>
  toBoolean(getCollectionPageMetadata(metadata)?.showOnPublicPage) === true;

export const getCollectionPublicDisplayOrder = (metadata: unknown) => {
  const rawOrder = toFiniteNumber(getCollectionPageMetadata(metadata)?.displayOrder);
  if (rawOrder === null) {
    return null;
  }
  return Math.trunc(rawOrder);
};

export const sortCollectionsForPublicPage = <
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
    const leftOrder = getCollectionPublicDisplayOrder(left.metadata);
    const rightOrder = getCollectionPublicDisplayOrder(right.metadata);
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
    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
  return copy;
};

export const mergeCollectionPublicVisibilityMetadata = (
  metadata: unknown,
  visible: boolean
) =>
  mergeCollectionPageMetadata(metadata, {
    showOnPublicPage: visible
  });

export const mergeCollectionPublicDisplayOrderMetadata = (
  metadata: unknown,
  displayOrder: number
) =>
  mergeCollectionPageMetadata(metadata, {
    displayOrder: Math.trunc(displayOrder)
  });
