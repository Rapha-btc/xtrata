export type UploadFileCandidate = {
  name: string;
  path: string;
  size: number;
  mimeType: string;
};

export type ExistingAssetCandidate = {
  path: string;
  filename: string | null;
  state: string;
};

type UploadSafetyParams = {
  selectedFiles: UploadFileCandidate[];
  existingAssets: ExistingAssetCandidate[];
  targetSupply: number | null;
};

const LARGE_FILE_WARNING_BYTES = 25 * 1024 * 1024;

const normalize = (value: string) => value.trim().toLowerCase();

const countLabel = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const isActiveAssetState = (state: string) => {
  const normalized = normalize(state);
  return normalized !== 'expired' && normalized !== 'sold-out';
};

const mimeCategory = (mimeType: string) => {
  const normalized = normalize(mimeType);
  if (!normalized || !normalized.includes('/')) {
    return 'unknown';
  }
  const [topLevel = 'unknown'] = normalized.split('/');
  if (
    topLevel === 'image' ||
    topLevel === 'audio' ||
    topLevel === 'video' ||
    topLevel === 'text' ||
    topLevel === 'application'
  ) {
    return topLevel;
  }
  return 'other';
};

export const buildUploadSafetyWarnings = (
  params: UploadSafetyParams
): string[] => {
  if (params.selectedFiles.length === 0) {
    return [];
  }

  const warnings: string[] = [];

  const activeExistingAssets = params.existingAssets.filter((asset) =>
    isActiveAssetState(asset.state)
  );

  if (params.targetSupply !== null && params.targetSupply > 0) {
    const existingCount = activeExistingAssets.length;
    const remaining = params.targetSupply - existingCount;
    if (remaining < 0) {
      warnings.push(
        `This drop targets ${params.targetSupply} editions, but ${existingCount} assets are already staged.`
      );
    } else if (params.selectedFiles.length !== remaining) {
      if (params.selectedFiles.length < remaining) {
        warnings.push(
          `Supply target is ${params.targetSupply}. You still need ${remaining} files, but selected ${params.selectedFiles.length}.`
        );
      } else {
        warnings.push(
          `Supply target is ${params.targetSupply}. You need ${remaining} more files, but selected ${params.selectedFiles.length}.`
        );
      }
    }
  }

  const selectedPathCounts = new Map<string, number>();
  params.selectedFiles.forEach((file) => {
    const key = normalize(file.path || file.name);
    selectedPathCounts.set(key, (selectedPathCounts.get(key) ?? 0) + 1);
  });
  const duplicateSelectedCount = Array.from(selectedPathCounts.values()).filter(
    (count) => count > 1
  ).length;
  if (duplicateSelectedCount > 0) {
    warnings.push(
      `${countLabel(
        duplicateSelectedCount,
        'duplicate path',
        'duplicate paths'
      )} detected in this selection.`
    );
  }

  const existingKeys = new Set<string>();
  activeExistingAssets.forEach((asset) => {
    const pathKey = normalize(asset.path);
    if (pathKey) {
      existingKeys.add(pathKey);
    }
    const fileNameKey = normalize(asset.filename ?? '');
    if (fileNameKey) {
      existingKeys.add(fileNameKey);
    }
  });
  let overlaps = 0;
  params.selectedFiles.forEach((file) => {
    const pathKey = normalize(file.path);
    const fileNameKey = normalize(file.name);
    if (
      (pathKey && existingKeys.has(pathKey)) ||
      (fileNameKey && existingKeys.has(fileNameKey))
    ) {
      overlaps += 1;
    }
  });
  if (overlaps > 0) {
    warnings.push(
      `${countLabel(overlaps, 'selected file', 'selected files')} match already staged entries.`
    );
  }

  const categories = Array.from(
    new Set(params.selectedFiles.map((file) => mimeCategory(file.mimeType)))
  );
  if (categories.length > 1) {
    warnings.push(
      `Mixed file types detected (${categories.join(', ')}). This can be intentional.`
    );
  }

  const zeroByteCount = params.selectedFiles.filter((file) => file.size <= 0).length;
  if (zeroByteCount > 0) {
    warnings.push(
      `${countLabel(zeroByteCount, 'file has', 'files have')} zero bytes.`
    );
  }

  const largeFileCount = params.selectedFiles.filter(
    (file) => file.size > LARGE_FILE_WARNING_BYTES
  ).length;
  if (largeFileCount > 0) {
    warnings.push(
      `${countLabel(
        largeFileCount,
        'file is',
        'files are'
      )} larger than 25 MB and may upload slowly.`
    );
  }

  return warnings;
};
