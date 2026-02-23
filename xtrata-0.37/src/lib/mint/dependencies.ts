const TOKEN_PATTERN = /^\d+$/;
const SPLIT_PATTERN = /[,\s]+/;

export type DependencyParseResult = {
  ids: bigint[];
  invalidTokens: string[];
};

export type DependencyValidation = {
  ok: boolean;
  reason?: string;
};

export function parseDependencyInput(raw: string): DependencyParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ids: [], invalidTokens: [] };
  }

  const tokens = trimmed.split(SPLIT_PATTERN).filter(Boolean);
  const ids: bigint[] = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    if (TOKEN_PATTERN.test(token)) {
      ids.push(BigInt(token));
    } else {
      invalidTokens.push(token);
    }
  }

  return { ids, invalidTokens };
}

export function normalizeDependencyIds(ids: bigint[]): bigint[] {
  const unique = Array.from(new Set(ids));
  unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return unique;
}

export function mergeDependencySources(...sources: bigint[][]): bigint[] {
  const merged: bigint[] = [];
  for (const source of sources) {
    merged.push(...source);
  }
  return normalizeDependencyIds(merged);
}

export function validateDependencyIds(ids: bigint[]): DependencyValidation {
  if (ids.length > 50) {
    return { ok: false, reason: "max-50" };
  }
  for (const id of ids) {
    if (id < 0n) {
      return { ok: false, reason: "negative-id" };
    }
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: "duplicate-ids" };
  }
  return { ok: true };
}

export function toDependencyStrings(ids: bigint[]): string[] {
  return ids.map((id) => id.toString());
}

export function fromDependencyStrings(ids: string[]): bigint[] {
  const parsed: bigint[] = [];
  for (const token of ids) {
    if (TOKEN_PATTERN.test(token)) {
      parsed.push(BigInt(token));
    }
  }
  return normalizeDependencyIds(parsed);
}
