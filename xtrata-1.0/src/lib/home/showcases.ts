import { validateStacksAddress } from '@stacks/transactions';
import { normalizeBnsName } from '../bns/helpers';

export type HomeWalletShowcase = {
  id: string;
  title: string;
  kicker: string;
  description: string;
  lookup: string;
  cta: string;
};

export type HomeGalleryToken = {
  tokenId: string;
  label: string;
};

export type HomeTokenGallery = {
  id: string;
  title: string;
  kicker: string;
  description: string;
  tokens: HomeGalleryToken[];
};

export type HomeGalleryManifest = {
  walletShowcases: HomeWalletShowcase[];
  tokenGalleries: HomeTokenGallery[];
};

const SIMPLE_BTC_NAME_PATTERN = /^[a-z0-9-]+$/;

export const normalizePublicWalletLookup = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (validateStacksAddress(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const explicitName = normalizeBnsName(lower);
  if (explicitName) {
    return explicitName;
  }
  if (SIMPLE_BTC_NAME_PATTERN.test(lower)) {
    return `${lower}.btc`;
  }
  return null;
};

export const parseHomeGalleryTokenIds = (gallery: HomeTokenGallery) => {
  const ids: bigint[] = [];
  const seen = new Set<string>();
  gallery.tokens.forEach((token) => {
    try {
      const parsed = BigInt(token.tokenId);
      if (parsed < 0n) {
        return;
      }
      const key = parsed.toString();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      ids.push(parsed);
    } catch {
      return;
    }
  });
  return ids;
};
