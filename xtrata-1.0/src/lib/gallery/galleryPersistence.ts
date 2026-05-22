import {
  parseGalleryLayoutJson,
  serializeGalleryLayout,
  type GalleryLayout,
  type GalleryValidationResult
} from './gallerySchema';

export const GALLERY_LAYOUT_STORAGE_VERSION = 'v1';

export type GalleryStorageScope = {
  contractId: string;
  walletAddress?: string | null;
};

export const createGalleryLayoutStorageKey = (scope: GalleryStorageScope) => {
  const wallet = scope.walletAddress?.trim().toLowerCase() || 'connected';
  return `xtrata.gallery.${GALLERY_LAYOUT_STORAGE_VERSION}.${scope.contractId}.${wallet}`;
};

export const loadGalleryLayout = (
  storage: Storage | null,
  scope: GalleryStorageScope
): GalleryValidationResult | null => {
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(createGalleryLayoutStorageKey(scope));
  if (!raw) {
    return null;
  }
  return parseGalleryLayoutJson(raw);
};

export const saveGalleryLayout = (
  storage: Storage | null,
  scope: GalleryStorageScope,
  layout: GalleryLayout
) => {
  if (!storage) {
    return false;
  }
  storage.setItem(createGalleryLayoutStorageKey(scope), serializeGalleryLayout(layout));
  return true;
};

export const deleteGalleryLayout = (
  storage: Storage | null,
  scope: GalleryStorageScope
) => {
  if (!storage) {
    return false;
  }
  storage.removeItem(createGalleryLayoutStorageKey(scope));
  return true;
};
