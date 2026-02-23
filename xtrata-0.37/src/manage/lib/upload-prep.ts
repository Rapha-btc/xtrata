export type UploadOrderMode =
  | 'as-selected'
  | 'path-natural'
  | 'filename-natural'
  | 'seeded-random';

export type DuplicatePolicy = 'warn' | 'skip';

export type UploadPrepItem<TPayload = unknown> = {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  lastModified: number;
  payload: TPayload;
};

export type UploadPrepResult<TPayload = unknown> = {
  items: UploadPrepItem<TPayload>[];
  includeExtensions: string[];
  excludeExtensions: string[];
  skippedByFilter: number;
  skippedDuplicates: number;
};

type UploadPrepParams<TPayload = unknown> = {
  items: UploadPrepItem<TPayload>[];
  includeExtensionsInput: string;
  excludeExtensionsInput: string;
  orderMode: UploadOrderMode;
  duplicatePolicy: DuplicatePolicy;
  seededOrderSeed: string;
};

const normalize = (value: string) => value.trim().toLowerCase();

const parseExtensionToken = (token: string) => {
  const cleaned = normalize(token.replace(/\*/g, ''));
  if (!cleaned) {
    return null;
  }
  return cleaned.startsWith('.') ? cleaned : `.${cleaned}`;
};

export const parseExtensionList = (input: string) => {
  const tokens = input
    .split(/[\s,;|]+/g)
    .map(parseExtensionToken)
    .filter((token): token is string => token !== null);
  return Array.from(new Set(tokens));
};

const extractExtension = (pathOrName: string) => {
  const normalized = pathOrName.replace(/\\/g, '/');
  const leaf = normalized.split('/').filter(Boolean).pop() ?? normalized;
  const dotIndex = leaf.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === leaf.length - 1) {
    return '';
  }
  return leaf.slice(dotIndex).toLowerCase();
};

const compareNatural = (left: string, right: string) =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base'
  });

const seededOrderScore = (seed: string, item: UploadPrepItem) => {
  const source = `${normalize(seed)}|${normalize(item.path)}|${item.size}|${
    item.lastModified
  }|${normalize(item.mimeType)}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const dedupeKey = (item: UploadPrepItem) =>
  `${normalize(item.path)}|${item.size}|${item.lastModified}|${normalize(
    item.mimeType
  )}`;

export const createSecureRandomSeed = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

export const prepareUploadSelection = <TPayload>(
  params: UploadPrepParams<TPayload>
): UploadPrepResult<TPayload> => {
  const includeExtensions = parseExtensionList(params.includeExtensionsInput);
  const excludeExtensions = parseExtensionList(params.excludeExtensionsInput);
  const includeSet = new Set(includeExtensions);
  const excludeSet = new Set(excludeExtensions);

  let skippedByFilter = 0;
  let skippedDuplicates = 0;

  const filtered = params.items.filter((item) => {
    const extension = extractExtension(item.path || item.name);
    if (excludeSet.has(extension)) {
      skippedByFilter += 1;
      return false;
    }
    if (includeSet.size > 0 && !includeSet.has(extension)) {
      skippedByFilter += 1;
      return false;
    }
    return true;
  });

  const dedupeTracker = new Set<string>();
  const deduped =
    params.duplicatePolicy === 'skip'
      ? filtered.filter((item) => {
          const key = dedupeKey(item);
          const seen = dedupeTracker.has(key);
          if (seen) {
            skippedDuplicates += 1;
            return false;
          }
          dedupeTracker.add(key);
          return true;
        })
      : filtered;

  const ordered = deduped
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (params.orderMode === 'as-selected') {
        return left.index - right.index;
      }
      if (params.orderMode === 'path-natural') {
        return compareNatural(left.item.path, right.item.path);
      }
      if (params.orderMode === 'filename-natural') {
        return compareNatural(left.item.name, right.item.name);
      }
      const leftScore = seededOrderScore(params.seededOrderSeed, left.item);
      const rightScore = seededOrderScore(params.seededOrderSeed, right.item);
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return compareNatural(left.item.path, right.item.path);
    })
    .map((entry) => entry.item);

  return {
    items: ordered,
    includeExtensions,
    excludeExtensions,
    skippedByFilter,
    skippedDuplicates
  };
};
