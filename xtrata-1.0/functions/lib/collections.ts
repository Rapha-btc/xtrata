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
