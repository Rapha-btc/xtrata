type RuntimeEnv = Record<string, string | undefined>;

const HIRO_RETRYABLE_STATUSES = new Set([401, 403, 429]);

const toNonEmpty = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const splitList = (value: string | null | undefined) => {
  const normalized = toNonEmpty(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const appendUnique = (target: string[], values: string[]) => {
  values.forEach((value) => {
    if (!target.includes(value)) {
      target.push(value);
    }
  });
};

const getNumberedHiroKeys = (env: RuntimeEnv) => {
  return Object.entries(env)
    .map(([name, value]) => {
      const match = /^HIRO_API_KEY_(\d+)$/.exec(name);
      if (!match) {
        return null;
      }
      const normalized = toNonEmpty(value);
      if (!normalized) {
        return null;
      }
      return {
        index: Number.parseInt(match[1], 10),
        value: normalized
      };
    })
    .filter((entry): entry is { index: number; value: string } => entry !== null)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.value);
};

export const getHiroApiKeys = (env: RuntimeEnv) => {
  const keys: string[] = [];
  appendUnique(keys, getNumberedHiroKeys(env));
  appendUnique(keys, splitList(env.HIRO_API_KEYS));
  appendUnique(keys, splitList(env.HIRO_API_KEY));
  appendUnique(keys, splitList(env.VITE_HIRO_API_KEY));
  return keys;
};

export const applyHiroApiKey = (headers: Headers, apiKey: string | null) => {
  headers.delete('x-hiro-api-key');
  headers.delete('x-api-key');
  if (!apiKey) {
    return;
  }
  headers.set('x-hiro-api-key', apiKey);
  headers.set('x-api-key', apiKey);
};

export const shouldRetryWithNextHiroKey = (status: number) => HIRO_RETRYABLE_STATUSES.has(status);
