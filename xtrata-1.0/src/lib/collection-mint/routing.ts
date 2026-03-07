import { SMALL_MINT_HELPER_MAX_CHUNKS } from '../mint/constants';

const toTemplateVersionParts = (templateVersion: string) => {
  const normalized = templateVersion.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/v(\d+)[.-](\d+)/);
  if (!match) {
    return null;
  }
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) {
    return null;
  }
  return { major, minor };
};

export const supportsCollectionSmallSingleTx = (templateVersion: string) => {
  const parts = toTemplateVersionParts(templateVersion);
  if (!parts) {
    return false;
  }
  return parts.major === 1 && parts.minor >= 4;
};

type ShouldUseCollectionSmallSingleTxParams = {
  templateVersion: string;
  chunkCount: number;
  hasReservation: boolean;
  hasUploadState: boolean;
  maxChunkCount?: number;
};

export const shouldUseCollectionSmallSingleTx = (
  params: ShouldUseCollectionSmallSingleTxParams
) => {
  if (!supportsCollectionSmallSingleTx(params.templateVersion)) {
    return false;
  }
  if (params.hasReservation || params.hasUploadState) {
    return false;
  }
  if (!Number.isSafeInteger(params.chunkCount) || params.chunkCount <= 0) {
    return false;
  }
  const maxChunkCount =
    params.maxChunkCount && params.maxChunkCount > 0
      ? params.maxChunkCount
      : SMALL_MINT_HELPER_MAX_CHUNKS;
  return params.chunkCount <= maxChunkCount;
};
