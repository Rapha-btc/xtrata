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
