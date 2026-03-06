import { getNetworkFromAddress } from '../network/guard';
import { parseContractPrincipal } from './contract-link';

export type CoverImageSource =
  | 'collection-asset'
  | 'inscribed-image-url'
  | 'inscription-id';

const UINT_PATTERN = /^\d+$/;

const toRecord = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const normalizeCoverImageSource = (
  value: unknown
): CoverImageSource | null => {
  if (value === 'collection-asset') {
    return 'collection-asset';
  }
  if (value === 'inscribed-image-url') {
    return 'inscribed-image-url';
  }
  if (value === 'inscription-id') {
    return 'inscription-id';
  }
  return null;
};

export const parseInscriptionTokenId = (value: unknown): string | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return null;
    }
    return BigInt(value).toString();
  }
  if (typeof value === 'bigint') {
    return value >= 0n ? value.toString() : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!UINT_PATTERN.test(trimmed)) {
    return null;
  }
  try {
    return BigInt(trimmed).toString();
  } catch {
    return null;
  }
};

export const buildRuntimeInscriptionContentUrl = (params: {
  coreContractId: string | null | undefined;
  tokenId: unknown;
}) => {
  const parsedContract = parseContractPrincipal(toText(params.coreContractId));
  const parsedTokenId = parseInscriptionTokenId(params.tokenId);
  if (!parsedContract || !parsedTokenId) {
    return null;
  }
  const contractId = `${parsedContract.address}.${parsedContract.contractName}`;
  const network = getNetworkFromAddress(parsedContract.address) ?? 'mainnet';
  const query = new URLSearchParams({
    contractId,
    tokenId: parsedTokenId,
    network
  });
  return `/runtime/content?${query.toString()}`;
};

export const resolveCollectionCoverImageUrl = (params: {
  coverImage: unknown;
  collectionId?: string | null;
  fallbackCoreContractId?: string | null;
}) => {
  const coverImage = toRecord(params.coverImage);
  if (!coverImage) {
    return null;
  }
  const source = normalizeCoverImageSource(coverImage.source);
  if (!source) {
    return null;
  }

  if (source === 'collection-asset') {
    const collectionId = toText(params.collectionId);
    const assetId = toText(coverImage.assetId);
    if (!collectionId || !assetId) {
      return null;
    }
    return `/collections/${encodeURIComponent(
      collectionId
    )}/asset-preview?assetId=${encodeURIComponent(assetId)}`;
  }

  if (source === 'inscribed-image-url') {
    const imageUrl = toText(coverImage.imageUrl);
    return imageUrl || null;
  }

  const runtimeUrl = buildRuntimeInscriptionContentUrl({
    coreContractId: toText(coverImage.coreContractId) || params.fallbackCoreContractId,
    tokenId: coverImage.tokenId ?? coverImage.inscriptionId
  });
  if (runtimeUrl) {
    return runtimeUrl;
  }
  const fallbackImageUrl = toText(coverImage.imageUrl);
  return fallbackImageUrl || null;
};

export const hasCoverImageMetadata = (value: unknown) => {
  const coverImage = toRecord(value);
  if (!coverImage) {
    return false;
  }
  const source = normalizeCoverImageSource(coverImage.source);
  if (source === 'collection-asset') {
    return toText(coverImage.assetId).length > 0;
  }
  if (source === 'inscribed-image-url') {
    return toText(coverImage.imageUrl).length > 0;
  }
  if (source === 'inscription-id') {
    return (
      parseInscriptionTokenId(coverImage.tokenId ?? coverImage.inscriptionId) !==
      null
    );
  }
  return false;
};
