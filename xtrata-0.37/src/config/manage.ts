import { normalizeBnsName } from '../lib/bns/helpers';

const normalizeAddress = (value: string) => value.trim().toUpperCase();
const ENTRY_SEPARATOR_PATTERN = /[\s,;]+/;
const WRAPPER_CHARS_PATTERN = /^[\[\]'"`]+|[\[\]'"`]+$/g;

const normalizeAllowlistEntry = (entry: string) =>
  entry.trim().replace(WRAPPER_CHARS_PATTERN, '').trim();

export type ParsedArtistAllowlist = {
  entries: string[];
  literalAddresses: Set<string>;
  bnsNames: Set<string>;
};

export const parseArtistAllowlist = (value?: string | null): ParsedArtistAllowlist => {
  const entries: string[] = [];
  const seenEntries = new Set<string>();
  const literalAddresses = new Set<string>();
  const bnsNames = new Set<string>();

  const pushEntry = (entry: string) => {
    if (seenEntries.has(entry)) {
      return;
    }
    seenEntries.add(entry);
    entries.push(entry);
  };

  if (!value) {
    return { entries, literalAddresses, bnsNames };
  }

  value
    .split(ENTRY_SEPARATOR_PATTERN)
    .map(normalizeAllowlistEntry)
    .filter((entry) => entry.length > 0)
    .forEach((entry) => {
      const normalizedBns = normalizeBnsName(entry);
      if (normalizedBns) {
        bnsNames.add(normalizedBns);
        pushEntry(normalizedBns);
        return;
      }
      const normalizedAddress = normalizeAddress(entry);
      literalAddresses.add(normalizedAddress);
      pushEntry(normalizedAddress);
    });

  return { entries, literalAddresses, bnsNames };
};

const ARTIST_ALLOWLIST = parseArtistAllowlist(import.meta.env.VITE_ARTIST_ALLOWLIST);

export const MANAGE_PATH = '/manage';
export const XTRATA_OWNER_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';

export const isArtistAddressAllowed = (address?: string | null) => {
  if (!address) {
    return false;
  }
  return ARTIST_ALLOWLIST.literalAddresses.has(normalizeAddress(address));
};

export const isXtrataOwnerAddress = (address?: string | null) => {
  if (!address) {
    return false;
  }
  return normalizeAddress(address) === XTRATA_OWNER_ADDRESS;
};

export const getArtistAllowlist = () => ARTIST_ALLOWLIST.entries.slice();

export const getArtistAllowlistLiteralAddresses = () =>
  Array.from(ARTIST_ALLOWLIST.literalAddresses.values());

export const getArtistAllowlistBnsNames = () =>
  Array.from(ARTIST_ALLOWLIST.bnsNames.values());
