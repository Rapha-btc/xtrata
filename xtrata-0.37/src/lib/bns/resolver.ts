import { validateStacksAddress } from '@stacks/transactions';
import type { NetworkType } from '../network/types';
import { getApiBaseUrls } from '../network/config';
import { logDebug, logWarn } from '../utils/logger';
import { getBnsHubBaseUrls } from './config';
import {
  buildBnsCacheKey,
  normalizeBnsName,
  pickPrimaryBnsName,
  sortBnsNames
} from './helpers';

export type BnsNamesResult = {
  address: string;
  names: string[];
  primary: string | null;
  source: string | null;
};

export type BnsAddressResult = {
  name: string;
  address: string | null;
  source: string | null;
};

const BNS_MAX_CONCURRENT = 2;
const BNS_RETRIES = 2;
const BNS_BASE_DELAY_MS = 400;
const BNS_RATE_LIMIT_DELAY_MS = 1200;
const BNS_JITTER_MS = 120;
const BNS_FAILURE_WINDOW_MS = 10000;
const BNS_FAILURE_THRESHOLD = 3;
const BNS_BACKOFF_BASE_MS = 10000;
const BNS_BACKOFF_MAX_MS = 60000;
const BNS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getErrorMessage = (error: unknown) => {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.name || 'Error';
  }
  try {
    return JSON.stringify(error);
  } catch (stringifyError) {
    return String(error);
  }
};

class BnsBackoffError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`BNS calls paused for ${retryAfterMs}ms`);
    this.name = 'BnsBackoffError';
    this.retryAfterMs = retryAfterMs;
  }
}

const isRateLimitError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit')
  );
};

const getHttpStatusFromError = (error: unknown) => {
  const message = getErrorMessage(error);
  const match = message.match(/\((\d{3})\)/);
  if (!match) {
    return null;
  }
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : null;
};

const isBnsNetworkError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('timeout') ||
    message.includes('cors') ||
    message.includes('access-control-allow-origin')
  );
};

const isTransientBnsError = (error: unknown) => {
  if (error instanceof BnsBackoffError) {
    return true;
  }
  if (isRateLimitError(error) || isBnsNetworkError(error)) {
    return true;
  }
  const status = getHttpStatusFromError(error);
  return status !== null && status >= 500 && status < 600;
};

let bnsFailureCount = 0;
let bnsFailureWindowStart = 0;
let bnsBackoffUntil = 0;
let bnsBackoffMs = BNS_BACKOFF_BASE_MS;

const getBnsBackoffMs = () => Math.max(0, bnsBackoffUntil - Date.now());

const isBnsBackoffActive = () => getBnsBackoffMs() > 0;

const noteBnsSuccess = () => {
  bnsFailureCount = 0;
  bnsFailureWindowStart = 0;
  bnsBackoffUntil = 0;
  bnsBackoffMs = BNS_BACKOFF_BASE_MS;
};

const noteBnsFailure = (error: unknown) => {
  if (!isTransientBnsError(error)) {
    return;
  }
  const now = Date.now();
  if (now - bnsFailureWindowStart > BNS_FAILURE_WINDOW_MS) {
    bnsFailureWindowStart = now;
    bnsFailureCount = 0;
  }
  bnsFailureCount += 1;
  if (bnsFailureCount < BNS_FAILURE_THRESHOLD) {
    return;
  }
  bnsFailureCount = 0;
  bnsFailureWindowStart = now;
  if (now < bnsBackoffUntil) {
    return;
  }
  bnsBackoffUntil = now + bnsBackoffMs;
  bnsBackoffMs = Math.min(
    BNS_BACKOFF_MAX_MS,
    Math.floor(bnsBackoffMs * 1.6)
  );
};

const getRetryDelay = (
  attempt: number,
  rateLimited: boolean,
  baseDelayMs: number
) => {
  const base = rateLimited
    ? Math.max(baseDelayMs, BNS_RATE_LIMIT_DELAY_MS)
    : baseDelayMs;
  const jitter = Math.floor(Math.random() * BNS_JITTER_MS);
  return base * Math.pow(2, attempt) + jitter;
};

let activeBnsCalls = 0;
const bnsQueue: Array<() => void> = [];

const withBnsLimit = async <T>(task: () => Promise<T>): Promise<T> => {
  if (BNS_MAX_CONCURRENT <= 0) {
    return task();
  }
  return new Promise((resolve, reject) => {
    const run = () => {
      activeBnsCalls += 1;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeBnsCalls = Math.max(0, activeBnsCalls - 1);
          const next = bnsQueue.shift();
          if (next) {
            next();
          }
        });
    };

    if (activeBnsCalls < BNS_MAX_CONCURRENT) {
      run();
      return;
    }

    bnsQueue.push(run);
  });
};

const callBnsWithRetry = async <T>(params: {
  task: () => Promise<T>;
  context: string;
  signal?: AbortSignal;
}) => {
  if (isBnsBackoffActive()) {
    throw new BnsBackoffError(getBnsBackoffMs());
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= BNS_RETRIES; attempt += 1) {
    if (params.signal?.aborted) {
      throw new Error('BNS request aborted');
    }
    try {
      const result = await withBnsLimit(params.task);
      noteBnsSuccess();
      return result;
    } catch (error) {
      lastError = error;
      const rateLimited = isRateLimitError(error);
      noteBnsFailure(error);
      logDebug('bns', 'BNS request failed', {
        context: params.context,
        attempt,
        rateLimited,
        error: getErrorMessage(error)
      });
      if (attempt >= BNS_RETRIES) {
        break;
      }
      const delay = getRetryDelay(attempt, rateLimited, BNS_BASE_DELAY_MS);
      await sleep(delay);
    }
  }

  logDebug('bns', 'BNS request exhausted retries', {
    context: params.context,
    error: getErrorMessage(lastError)
  });

  throw (lastError instanceof Error
    ? lastError
    : new Error(getErrorMessage(lastError)));
};

type BnsProvider = {
  id: string;
  getBaseUrls: (network: NetworkType) => string[];
};

type AddressNamesResponse = {
  status: 'ok' | 'not-found';
  names: string[];
  displayName: string | null;
};

type NameDetailsResponse = {
  status: 'ok' | 'not-found';
  address: string | null;
};

type AddressResolution = {
  result: BnsNamesResult;
  cacheable: boolean;
};

const BNS_PROVIDERS: BnsProvider[] = [
  { id: 'bns-hub', getBaseUrls: getBnsHubBaseUrls },
  { id: 'stacks-api', getBaseUrls: getApiBaseUrls }
];

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === 'string') as string[];
};

const extractAddressNames = (data: unknown) => {
  if (!data || typeof data !== 'object') {
    return { names: [], displayName: null };
  }
  const record = data as Record<string, unknown>;
  const names = toStringArray(record.names ?? record.bns_names ?? record.domains);
  const displayName =
    (typeof record.displayName === 'string' && record.displayName) ||
    (typeof record.primaryName === 'string' && record.primaryName) ||
    (typeof record.primary === 'string' && record.primary) ||
    (typeof record.name === 'string' && record.name) ||
    null;
  return { names, displayName };
};

const extractNameAddress = (data: unknown) => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  return (
    (typeof record.address === 'string' && record.address) ||
    (typeof record.owner === 'string' && record.owner) ||
    (typeof record.owner_address === 'string' && record.owner_address) ||
    (typeof record.principal === 'string' && record.principal) ||
    null
  );
};

const fetchAddressNames = async (
  baseUrl: string,
  address: string,
  signal?: AbortSignal
): Promise<AddressNamesResponse> => {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/addresses/stacks/${encodeURIComponent(
    address
  )}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal
  });
  if (response.status === 404) {
    return { status: 'not-found', names: [], displayName: null };
  }
  if (!response.ok) {
    throw new Error(`BNS address lookup failed (${response.status})`);
  }
  const data = await response.json();
  const { names, displayName } = extractAddressNames(data);
  return { status: 'ok', names, displayName };
};

const fetchNameDetails = async (
  baseUrl: string,
  name: string,
  signal?: AbortSignal
): Promise<NameDetailsResponse> => {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/names/${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal
  });
  if (response.status === 404) {
    return { status: 'not-found', address: null };
  }
  if (!response.ok) {
    throw new Error(`BNS name lookup failed (${response.status})`);
  }
  const data = await response.json();
  const address = extractNameAddress(data);
  return { status: 'ok', address };
};

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightCache = new Map<string, Promise<unknown>>();

const readCache = <T>(key: string): CacheEntry<T> | null => {
  const now = Date.now();
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached) {
    if (now - cached.updatedAt < BNS_CACHE_TTL_MS) {
      return cached;
    }
    memoryCache.delete(key);
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CacheEntry<T> | null;
    if (!parsed || typeof parsed.updatedAt !== 'number') {
      return null;
    }
    if (now - parsed.updatedAt >= BNS_CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch (error) {
    return null;
  }
};

const writeCache = <T>(key: string, value: T) => {
  const entry: CacheEntry<T> = { value, updatedAt: Date.now() };
  memoryCache.set(key, entry);
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    // ignore storage errors
  }
};

const resolveWithInFlight = async <T>(key: string, task: () => Promise<T>) => {
  const existing = inflightCache.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const promise = task().finally(() => inflightCache.delete(key));
  inflightCache.set(key, promise);
  return promise;
};

const resolveAddressNamesFromProviders = async (params: {
  address: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<AddressResolution> => {
  let lastError: unknown = null;
  let sawNotFound = false;
  let backoffTriggered = false;

  for (const provider of BNS_PROVIDERS) {
    if (backoffTriggered) {
      break;
    }
    const bases = provider.getBaseUrls(params.network);
    for (const baseUrl of bases) {
      try {
        const response = await callBnsWithRetry({
          task: () => fetchAddressNames(baseUrl, params.address, params.signal),
          context: `${provider.id}:address:${params.address}`,
          signal: params.signal
        });

        if (response.status === 'not-found') {
          sawNotFound = true;
          continue;
        }

        const combined = sortBnsNames([
          ...response.names,
          ...(response.displayName ? [response.displayName] : [])
        ]);
        const primary = pickPrimaryBnsName(combined, response.displayName);
        return {
          result: {
            address: params.address,
            names: combined,
            primary,
            source: provider.id
          },
          cacheable: true
        };
      } catch (error) {
        lastError = error;
        if (error instanceof BnsBackoffError) {
          backoffTriggered = true;
          break;
        }
        continue;
      }
    }
  }

  if (lastError) {
    if (isTransientBnsError(lastError)) {
      logDebug('bns', 'BNS address lookup unavailable, using address fallback', {
        address: params.address,
        error: getErrorMessage(lastError)
      });
      return {
        result: {
          address: params.address,
          names: [],
          primary: null,
          source: null
        },
        cacheable: false
      };
    }
    logWarn('bns', 'BNS address lookup failed', {
      address: params.address,
      error: getErrorMessage(lastError)
    });
    throw lastError;
  }

  if (sawNotFound) {
    return {
      result: {
        address: params.address,
        names: [],
        primary: null,
        source: null
      },
      cacheable: true
    };
  }

  return {
    result: {
      address: params.address,
      names: [],
      primary: null,
      source: null
    },
    cacheable: true
  };
};

const resolveNameAddressFromProviders = async (params: {
  name: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<BnsAddressResult> => {
  let lastError: unknown = null;
  let sawNotFound = false;
  let backoffTriggered = false;

  for (const provider of BNS_PROVIDERS) {
    if (backoffTriggered) {
      break;
    }
    const bases = provider.getBaseUrls(params.network);
    for (const baseUrl of bases) {
      try {
        const response = await callBnsWithRetry({
          task: () => fetchNameDetails(baseUrl, params.name, params.signal),
          context: `${provider.id}:name:${params.name}`,
          signal: params.signal
        });

        if (response.status === 'not-found') {
          sawNotFound = true;
          continue;
        }

        if (!response.address) {
          sawNotFound = true;
          continue;
        }

        if (!validateStacksAddress(response.address)) {
          logWarn('bns', 'BNS name resolved to non-Stacks address', {
            name: params.name,
            address: response.address,
            provider: provider.id
          });
          sawNotFound = true;
          continue;
        }

        return {
          name: params.name,
          address: response.address,
          source: provider.id
        };
      } catch (error) {
        lastError = error;
        if (error instanceof BnsBackoffError) {
          backoffTriggered = true;
          break;
        }
        continue;
      }
    }
  }

  if (lastError) {
    logWarn('bns', 'BNS name lookup failed', {
      name: params.name,
      error: getErrorMessage(lastError)
    });
    throw lastError;
  }

  if (sawNotFound) {
    return { name: params.name, address: null, source: null };
  }

  return { name: params.name, address: null, source: null };
};

export const resolveBnsNames = async (params: {
  address: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<BnsNamesResult> => {
  const trimmed = params.address.trim();
  if (!validateStacksAddress(trimmed)) {
    return {
      address: trimmed,
      names: [],
      primary: null,
      source: null
    };
  }

  const cacheKey = buildBnsCacheKey({
    network: params.network,
    kind: 'address',
    value: trimmed
  });
  const cached = readCache<BnsNamesResult>(cacheKey);
  if (cached) {
    return cached.value;
  }

  return resolveWithInFlight(cacheKey, async () => {
    const resolution = await resolveAddressNamesFromProviders({
      address: trimmed,
      network: params.network,
      signal: params.signal
    });
    if (resolution.cacheable) {
      writeCache(cacheKey, resolution.result);
    }
    return resolution.result;
  });
};

export const resolveBnsAddress = async (params: {
  name: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<BnsAddressResult> => {
  const normalizedName = normalizeBnsName(params.name);
  if (!normalizedName) {
    return { name: params.name.trim(), address: null, source: null };
  }

  const cacheKey = buildBnsCacheKey({
    network: params.network,
    kind: 'name',
    value: normalizedName
  });
  const cached = readCache<BnsAddressResult>(cacheKey);
  if (cached) {
    return cached.value;
  }

  return resolveWithInFlight(cacheKey, async () => {
    const result = await resolveNameAddressFromProviders({
      name: normalizedName,
      network: params.network,
      signal: params.signal
    });
    writeCache(cacheKey, result);
    return result;
  });
};

export const __resetBnsResolverStateForTests = () => {
  bnsFailureCount = 0;
  bnsFailureWindowStart = 0;
  bnsBackoffUntil = 0;
  bnsBackoffMs = BNS_BACKOFF_BASE_MS;
  activeBnsCalls = 0;
  bnsQueue.length = 0;
  memoryCache.clear();
  inflightCache.clear();
};
