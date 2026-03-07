export type CollectionMintPaymentModel = 'begin' | 'seal' | 'unknown';

const toFiniteInt = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
};

export const resolveCollectionMintPaymentModel = (
  templateVersion: string
): CollectionMintPaymentModel => {
  const normalized = templateVersion.trim().toLowerCase();
  if (!normalized) {
    return 'unknown';
  }

  const versionMatch = normalized.match(/v(\d+)[.-](\d+)/);
  if (!versionMatch) {
    return 'unknown';
  }

  const major = toFiniteInt(versionMatch[1]);
  const minor = toFiniteInt(versionMatch[2]);
  if (major !== 1 || minor === null) {
    return 'unknown';
  }
  if (minor <= 1) {
    return 'begin';
  }
  return 'seal';
};
