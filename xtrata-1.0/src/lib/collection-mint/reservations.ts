export const COLLECTION_RESERVATION_TIMEOUT_MS = 20 * 60 * 1000;

export type PendingCollectionReservation = {
  hashHex: string;
  itemLabel: string;
  startedAtMs: number;
};

const isHashHex = (value: string) => /^[0-9a-f]{64}$/i.test(value);

const normalizeHashHex = (value: string) => value.trim().toLowerCase();

const normalizeReservation = (value: unknown): PendingCollectionReservation | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.hashHex !== 'string') {
    return null;
  }
  const hashHex = normalizeHashHex(raw.hashHex);
  if (!isHashHex(hashHex)) {
    return null;
  }
  const itemLabel =
    typeof raw.itemLabel === 'string' && raw.itemLabel.trim().length > 0
      ? raw.itemLabel.trim()
      : 'Collection item';
  const startedAtMs =
    typeof raw.startedAtMs === 'number' && Number.isFinite(raw.startedAtMs)
      ? Math.max(0, Math.floor(raw.startedAtMs))
      : 0;
  if (startedAtMs <= 0) {
    return null;
  }
  return { hashHex, itemLabel, startedAtMs };
};

export const parseStoredReservations = (raw: string | null) => {
  if (!raw) {
    return [] as PendingCollectionReservation[];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as PendingCollectionReservation[];
    }
    const next: PendingCollectionReservation[] = [];
    const seen = new Set<string>();
    parsed.forEach((entry) => {
      const normalized = normalizeReservation(entry);
      if (!normalized) {
        return;
      }
      if (seen.has(normalized.hashHex)) {
        return;
      }
      seen.add(normalized.hashHex);
      next.push(normalized);
    });
    return next;
  } catch {
    return [] as PendingCollectionReservation[];
  }
};

export const serializeReservations = (
  reservations: PendingCollectionReservation[]
) => JSON.stringify(reservations);

export const upsertReservation = (
  reservations: PendingCollectionReservation[],
  reservation: PendingCollectionReservation
) => {
  const normalized = normalizeReservation(reservation);
  if (!normalized) {
    return reservations;
  }
  const next = reservations.filter((entry) => entry.hashHex !== normalized.hashHex);
  next.push(normalized);
  return next.sort((left, right) => left.startedAtMs - right.startedAtMs);
};

export const removeReservationsByHashes = (
  reservations: PendingCollectionReservation[],
  hashes: string[]
) => {
  const hashSet = new Set(
    hashes.map((value) => normalizeHashHex(value)).filter((value) => isHashHex(value))
  );
  if (hashSet.size === 0) {
    return reservations;
  }
  return reservations.filter((entry) => !hashSet.has(entry.hashHex));
};

export const getSoonestReservationRemainingMs = (
  reservations: PendingCollectionReservation[],
  nowMs = Date.now(),
  timeoutMs = COLLECTION_RESERVATION_TIMEOUT_MS
) => {
  if (reservations.length === 0) {
    return null;
  }
  const soonestExpiryMs = Math.min(
    ...reservations.map((entry) => entry.startedAtMs + timeoutMs)
  );
  return Math.max(0, soonestExpiryMs - nowMs);
};

export const formatRemainingMinutesSeconds = (remainingMs: number) => {
  const safe = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};
