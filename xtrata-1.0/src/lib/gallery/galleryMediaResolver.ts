import { getMediaKind, getMimeTypeEssence } from '../viewer/content';
import type { TokenSummary } from '../viewer/types';
import type { GalleryLayoutItem } from './gallerySchema';

export type GalleryMediaKind =
  | 'image'
  | 'video'
  | 'gif'
  | 'audio'
  | 'html'
  | 'text'
  | 'unknown';

export type GallerySourceRef = {
  protocol: 'xtrata';
  inscriptionId: string;
  tokenId: bigint | null;
};

export type GalleryMedia = {
  id: string;
  source: string;
  sourceRef: GallerySourceRef | null;
  token: TokenSummary | null;
  tokenId: bigint | null;
  kind: GalleryMediaKind;
  mimeType: string | null;
  title: string;
  subtitle: string;
};

export const parseGallerySource = (source: string): GallerySourceRef | null => {
  const trimmed = source.trim();
  if (!trimmed.toLowerCase().startsWith('xtrata://')) {
    return null;
  }
  const inscriptionId = trimmed.slice('xtrata://'.length).split(/[?#]/, 1)[0]?.trim();
  if (!inscriptionId) {
    return null;
  }
  let tokenId: bigint | null = null;
  if (/^[0-9]+$/.test(inscriptionId)) {
    try {
      tokenId = BigInt(inscriptionId);
    } catch {
      tokenId = null;
    }
  }
  return {
    protocol: 'xtrata',
    inscriptionId,
    tokenId
  };
};

export const getGalleryMediaKind = (
  mimeType?: string | null
): GalleryMediaKind => {
  const essence = getMimeTypeEssence(mimeType);
  if (essence === 'image/gif') {
    return 'gif';
  }
  const mediaKind = getMediaKind(mimeType ?? null);
  switch (mediaKind) {
    case 'image':
    case 'svg':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'html':
      return 'html';
    case 'text':
      return 'text';
    default:
      return 'unknown';
  }
};

export const resolveGalleryMedia = (params: {
  item: GalleryLayoutItem;
  token?: TokenSummary | null;
}): GalleryMedia => {
  const sourceRef = parseGallerySource(params.item.source);
  const token = params.token ?? null;
  const tokenId = token?.id ?? sourceRef?.tokenId ?? null;
  const mimeType = token?.meta?.mimeType ?? null;
  const kind = token ? getGalleryMediaKind(mimeType) : 'unknown';
  const idLabel = tokenId !== null ? `#${tokenId.toString()}` : sourceRef?.inscriptionId ?? params.item.id;
  const title = token ? `Inscription ${idLabel}` : `Missing ${idLabel}`;
  const subtitle = mimeType ?? (token ? 'Unknown media type' : 'Not loaded');

  return {
    id: params.item.id,
    source: params.item.source,
    sourceRef,
    token,
    tokenId,
    kind,
    mimeType,
    title,
    subtitle
  };
};
