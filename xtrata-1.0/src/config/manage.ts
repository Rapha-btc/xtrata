const normalizeAddress = (value: string) => value.trim().toUpperCase();

const parseAllowlist = (value?: string | null) => {
  if (!value) {
    return new Set<string>();
  }
  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(normalizeAddress)
  );
};

const ARTIST_ALLOWLIST = parseAllowlist(import.meta.env.VITE_ARTIST_ALLOWLIST);

export const MANAGE_PATH = '/manage';

export const isArtistAddressAllowed = (address?: string | null) => {
  if (!address) {
    return false;
  }
  return ARTIST_ALLOWLIST.has(normalizeAddress(address));
};

export const getArtistAllowlist = () => Array.from(ARTIST_ALLOWLIST.values());
