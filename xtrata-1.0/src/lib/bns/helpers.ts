import type { NetworkType } from '../network/types';

const BNS_NAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const BNS_CACHE_VERSION = 'v2';

export type BnsCacheKeyParams = {
  network: NetworkType;
  kind: 'address' | 'name';
  value: string;
};

const normalizeKeySegment = (value: string) => value.trim().toLowerCase();

export const normalizeBnsName = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.toLowerCase();
  return BNS_NAME_PATTERN.test(normalized) ? normalized : null;
};

export const isValidBnsName = (value?: string | null) =>
  !!normalizeBnsName(value);

export const buildBnsCacheKey = (params: BnsCacheKeyParams) =>
  `xtrata.bns.${BNS_CACHE_VERSION}.${params.network}.${params.kind}.${normalizeKeySegment(
    params.value
  )}`;

const isBtcName = (value: string) => value.endsWith('.btc');

export const sortBnsNames = (names: string[]) => {
  const normalized = names
    .map((name) => normalizeKeySegment(name))
    .filter((name) => normalizeBnsName(name) !== null);
  const unique = Array.from(new Set(normalized));
  unique.sort((left, right) => {
    const leftBtc = isBtcName(left);
    const rightBtc = isBtcName(right);
    if (leftBtc !== rightBtc) {
      return leftBtc ? -1 : 1;
    }
    return left.localeCompare(right);
  });
  return unique;
};

export const pickPrimaryBnsName = (
  names: string[],
  preferred?: string | null
) => {
  const normalizedPreferred = normalizeBnsName(preferred);
  if (normalizedPreferred && normalizedPreferred.endsWith('.btc')) {
    return normalizedPreferred;
  }
  const sorted = sortBnsNames(names);
  const firstBtc = sorted.find((name) => name.endsWith('.btc'));
  if (firstBtc) {
    return firstBtc;
  }
  if (normalizedPreferred) {
    return normalizedPreferred;
  }
  return sorted[0] ?? null;
};
