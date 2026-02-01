const normalizeAddress = (value: string) => value.trim().toUpperCase();

const parseAllowlist = (value: string | undefined | null) => {
  if (!value) {
    return new Set<string>();
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => normalizeAddress(entry));
  return new Set(entries);
};

const ADMIN_ALLOWLIST = parseAllowlist(import.meta.env.VITE_ADMIN_ALLOWLIST);

export const isAdminAddressAllowed = (address: string, owner?: string | null) => {
  const normalized = normalizeAddress(address);
  if (owner && normalizeAddress(owner) === normalized) {
    return true;
  }
  return ADMIN_ALLOWLIST.has(normalized);
};

export const getAdminAllowlist = () => Array.from(ADMIN_ALLOWLIST.values());
