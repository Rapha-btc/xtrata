import { validateStacksAddress } from '@stacks/transactions';
import type { NetworkType } from '../network/types';
import { getApiBaseUrls } from '../network/config';
import { logDebug, logWarn } from '../utils/logger';
import { getBnsV2ApiBaseUrls, getExplorerHtmlBaseUrls } from './config';
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
const BNS_TRANSIENT_FALLBACK_COOLDOWN_MS = 60 * 1000;

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
  scope: string;

  constructor(retryAfterMs: number, scope: string) {
    super(`BNS calls paused for ${retryAfterMs}ms`);
    this.name = 'BnsBackoffError';
    this.retryAfterMs = retryAfterMs;
    this.scope = scope;
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

type BnsBackoffState = {
  failureCount: number;
  failureWindowStart: number;
  backoffUntil: number;
  backoffMs: number;
};

const bnsBackoffByScope = new Map<string, BnsBackoffState>();

const getBnsScopeFromContext = (context: string) => {
  const scope = context.split(':')[0]?.trim().toLowerCase();
  return scope || 'default';
};

const getBnsBackoffState = (scope: string): BnsBackoffState => {
  const existing = bnsBackoffByScope.get(scope);
  if (existing) {
    return existing;
  }
  const initialState: BnsBackoffState = {
    failureCount: 0,
    failureWindowStart: 0,
    backoffUntil: 0,
    backoffMs: BNS_BACKOFF_BASE_MS
  };
  bnsBackoffByScope.set(scope, initialState);
  return initialState;
};

const getBnsBackoffMs = (scope: string) =>
  Math.max(0, getBnsBackoffState(scope).backoffUntil - Date.now());

const isBnsBackoffActive = (scope: string) => getBnsBackoffMs(scope) > 0;

const noteBnsSuccess = (scope: string) => {
  const state = getBnsBackoffState(scope);
  state.failureCount = 0;
  state.failureWindowStart = 0;
  state.backoffUntil = 0;
  state.backoffMs = BNS_BACKOFF_BASE_MS;
};

const noteBnsFailure = (scope: string, error: unknown) => {
  if (!isTransientBnsError(error)) {
    return;
  }
  const state = getBnsBackoffState(scope);
  const now = Date.now();
  if (now - state.failureWindowStart > BNS_FAILURE_WINDOW_MS) {
    state.failureWindowStart = now;
    state.failureCount = 0;
  }
  state.failureCount += 1;
  if (state.failureCount < BNS_FAILURE_THRESHOLD) {
    return;
  }
  state.failureCount = 0;
  state.failureWindowStart = now;
  if (now < state.backoffUntil) {
    return;
  }
  state.backoffUntil = now + state.backoffMs;
  state.backoffMs = Math.min(
    BNS_BACKOFF_MAX_MS,
    Math.floor(state.backoffMs * 1.6)
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
  const scope = getBnsScopeFromContext(params.context);
  if (isBnsBackoffActive(scope)) {
    throw new BnsBackoffError(getBnsBackoffMs(scope), scope);
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= BNS_RETRIES; attempt += 1) {
    if (params.signal?.aborted) {
      throw new Error('BNS request aborted');
    }
    try {
      const result = await withBnsLimit(params.task);
      noteBnsSuccess(scope);
      return result;
    } catch (error) {
      lastError = error;
      const rateLimited = isRateLimitError(error);
      noteBnsFailure(scope, error);
      if (rateLimited || attempt >= BNS_RETRIES) {
        logDebug('bns', 'BNS request failed', {
          context: params.context,
          scope,
          attempt,
          rateLimited,
          error: getErrorMessage(error)
        });
      }
      if (attempt >= BNS_RETRIES) {
        break;
      }
      const delay = getRetryDelay(attempt, rateLimited, BNS_BASE_DELAY_MS);
      await sleep(delay);
    }
  }

  logDebug('bns', 'BNS request exhausted retries', {
    context: params.context,
    scope,
    error: getErrorMessage(lastError)
  });

  if (lastError && isTransientBnsError(lastError) && isBnsBackoffActive(scope)) {
    throw new BnsBackoffError(getBnsBackoffMs(scope), scope);
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error(getErrorMessage(lastError)));
};

type ExplorerHtmlResponse = {
  status: 'ok' | 'not-found';
  html: string;
};

type AddressResolution = {
  result: BnsNamesResult;
  cacheable: boolean;
};

const BNS_V2_PROVIDER_ID = 'bnsv2-api';
const BNS_API_PROVIDER_ID = 'hiro-names-api';
const EXPLORER_PROVIDER_ID = 'explorer-html';
const HTML_TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;
const HTML_OG_TITLE_PATTERN =
  /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i;
const JSON_NAME_FIELD_PATTERN =
  /"(?:displayName|primaryName|primary|name|bns_name)"\s*:\s*"([a-z0-9-]+(?:\.[a-z0-9-]+)+)"/gi;
const JSON_NAME_LIST_PATTERN =
  /"(?:bns_names|names|domains)"\s*:\s*\[([^\]]*)\]/gi;
const JSON_LIST_ENTRY_PATTERN = /"([a-z0-9-]+(?:\.[a-z0-9-]+)+)"/gi;
const NEXT_BNS_NAMES_BLOCK_PATTERN =
  /\\?"initialAddressBNSNamesData\\?"\s*:\s*\{[\s\S]{0,600}?\\?"names\\?"\s*:\s*\[([^\]]*)\]/gi;
const NEXT_BNS_LIST_ENTRY_PATTERN =
  /\\?"([a-z0-9-]+(?:\.[a-z0-9-]+)+)\\?"/gi;
const ASSOCIATED_BNS_NAME_PATTERN =
  /Associated\s*BNS\s*Name[\s\S]{0,300}?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const LINKED_ADDRESS_PATTERN = /\/address\/([A-Z0-9]{40,64})(?:[?"'/<#]|$)/gi;
const JSON_ADDRESS_FIELD_PATTERN =
  /"(?:address|owner|owner_address|principal)"\s*:\s*"([A-Z0-9.]+)"/gi;
const RAW_ADDRESS_PATTERN = /\b(S[PTMN][A-Z0-9]{38})\b/g;
const NON_BNS_DOMAIN_DENYLIST = new Set([
  'explorer.hiro.so',
  'api.hiro.so',
  'hiro.so',
  'stacks.co',
  'stacks.org',
  'localhost'
]);

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .trim();

const sanitizeBnsCandidate = (value: string) => {
  const normalized = normalizeBnsName(value);
  if (!normalized) {
    return null;
  }
  if (NON_BNS_DOMAIN_DENYLIST.has(normalized)) {
    return null;
  }
  return normalized;
};

const addBnsCandidate = (
  candidates: Set<string>,
  value: string,
  source: 'payload' | 'label' | 'title' | 'og' | 'json-field' | 'json-list'
) => {
  const normalized = sanitizeBnsCandidate(value);
  if (!normalized) {
    return;
  }
  // Generic page-level scans can match assets/domains; only trust those when they
  // are explicit .btc names.
  if (
    source !== 'payload' &&
    source !== 'label' &&
    !normalized.endsWith('.btc')
  ) {
    return;
  }
  candidates.add(normalized);
};

const parseNamesFromTitle = (rawTitle: string | null) => {
  if (!rawTitle) {
    return [] as string[];
  }
  const title = decodeHtmlEntities(rawTitle);
  const firstSegment = title.split('|')[0]?.trim() ?? '';
  const candidates = new Set<string>();
  const parenCandidate = firstSegment.includes('(')
    ? firstSegment.split('(')[0]?.trim() ?? ''
    : firstSegment;
  const normalizedParen = sanitizeBnsCandidate(parenCandidate);
  if (normalizedParen && normalizedParen.endsWith('.btc')) {
    candidates.add(normalizedParen);
  }
  const fieldMatches = firstSegment.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) ?? [];
  fieldMatches.forEach((entry) => {
    const normalized = sanitizeBnsCandidate(entry);
    if (normalized && normalized.endsWith('.btc')) {
      candidates.add(normalized);
    }
  });
  return Array.from(candidates.values());
};

const extractAddressNamesFromExplorerHtml = (html: string) => {
  const candidates = new Set<string>();

  NEXT_BNS_NAMES_BLOCK_PATTERN.lastIndex = 0;
  let payloadMatch: RegExpExecArray | null = null;
  while ((payloadMatch = NEXT_BNS_NAMES_BLOCK_PATTERN.exec(html)) !== null) {
    const payloadBlock = payloadMatch[1] ?? '';
    NEXT_BNS_LIST_ENTRY_PATTERN.lastIndex = 0;
    let payloadEntry: RegExpExecArray | null = null;
    while ((payloadEntry = NEXT_BNS_LIST_ENTRY_PATTERN.exec(payloadBlock)) !== null) {
      addBnsCandidate(candidates, payloadEntry[1] ?? '', 'payload');
    }
  }

  const titleMatch = html.match(HTML_TITLE_PATTERN);
  parseNamesFromTitle(titleMatch ? titleMatch[1] : null).forEach((entry) =>
    addBnsCandidate(candidates, entry, 'title')
  );
  const ogTitleMatch = html.match(HTML_OG_TITLE_PATTERN);
  parseNamesFromTitle(ogTitleMatch ? ogTitleMatch[1] : null).forEach((entry) =>
    addBnsCandidate(candidates, entry, 'og')
  );

  JSON_NAME_FIELD_PATTERN.lastIndex = 0;
  let fieldMatch: RegExpExecArray | null = null;
  while ((fieldMatch = JSON_NAME_FIELD_PATTERN.exec(html)) !== null) {
    addBnsCandidate(candidates, fieldMatch[1] ?? '', 'json-field');
  }

  JSON_NAME_LIST_PATTERN.lastIndex = 0;
  let listMatch: RegExpExecArray | null = null;
  while ((listMatch = JSON_NAME_LIST_PATTERN.exec(html)) !== null) {
    const block = listMatch[1] ?? '';
    JSON_LIST_ENTRY_PATTERN.lastIndex = 0;
    let entryMatch: RegExpExecArray | null = null;
    while ((entryMatch = JSON_LIST_ENTRY_PATTERN.exec(block)) !== null) {
      addBnsCandidate(candidates, entryMatch[1] ?? '', 'json-list');
    }
  }

  ASSOCIATED_BNS_NAME_PATTERN.lastIndex = 0;
  let labelMatch: RegExpExecArray | null = null;
  while ((labelMatch = ASSOCIATED_BNS_NAME_PATTERN.exec(html)) !== null) {
    addBnsCandidate(candidates, labelMatch[1] ?? '', 'label');
  }

  const names = sortBnsNames(Array.from(candidates.values()));
  return {
    names,
    primary: pickPrimaryBnsName(names, names[0] ?? null)
  };
};

const extractAddressFromPrincipalCandidate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const address = trimmed.split('.')[0] ?? trimmed;
  return validateStacksAddress(address) ? address : null;
};

const extractAddressFromExplorerHtml = (html: string) => {
  const candidates = new Set<string>();

  LINKED_ADDRESS_PATTERN.lastIndex = 0;
  let linkMatch: RegExpExecArray | null = null;
  while ((linkMatch = LINKED_ADDRESS_PATTERN.exec(html)) !== null) {
    const normalized = extractAddressFromPrincipalCandidate(linkMatch[1] ?? '');
    if (normalized) {
      candidates.add(normalized);
    }
  }

  JSON_ADDRESS_FIELD_PATTERN.lastIndex = 0;
  let fieldMatch: RegExpExecArray | null = null;
  while ((fieldMatch = JSON_ADDRESS_FIELD_PATTERN.exec(html)) !== null) {
    const normalized = extractAddressFromPrincipalCandidate(fieldMatch[1] ?? '');
    if (normalized) {
      candidates.add(normalized);
    }
  }

  RAW_ADDRESS_PATTERN.lastIndex = 0;
  let rawMatch: RegExpExecArray | null = null;
  while ((rawMatch = RAW_ADDRESS_PATTERN.exec(html)) !== null) {
    const normalized = extractAddressFromPrincipalCandidate(rawMatch[1] ?? '');
    if (normalized) {
      candidates.add(normalized);
    }
  }

  return Array.from(candidates.values())[0] ?? null;
};

type BnsJsonResponse = {
  status: 'ok' | 'not-found';
  json: unknown;
};

type ExtractedNames = {
  names: string[];
  preferred: string | null;
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeBnsNameCandidate = (value: unknown) =>
  typeof value === 'string' ? normalizeBnsName(value) : null;

const extractNamesFromApiResponse = (value: unknown): ExtractedNames => {
  const candidates: string[] = [];
  let preferred: string | null = null;

  const notePreferred = (entry: unknown) => {
    const normalized = normalizeBnsNameCandidate(entry);
    if (!normalized) {
      return;
    }
    preferred = normalized;
  };

  const pushName = (entry: unknown) => {
    const normalized = normalizeBnsNameCandidate(entry);
    if (normalized) {
      candidates.push(normalized);
    }
  };

  const pushNameRecord = (entry: unknown) => {
    const entryRecord = toRecord(entry);
    if (!entryRecord) {
      pushName(entry);
      return;
    }
    const resolvedName =
      normalizeBnsNameCandidate(entryRecord.full_name) ||
      normalizeBnsNameCandidate(entryRecord.fqdn) ||
      normalizeBnsNameCandidate(entryRecord.name);
    if (resolvedName) {
      candidates.push(resolvedName);
      if (
        entryRecord.primary === true ||
        entryRecord.is_primary === true ||
        entryRecord.isPrimary === true
      ) {
        preferred = resolvedName;
      }
    }
    notePreferred(entryRecord.primary_name);
    notePreferred(entryRecord.primaryName);
    notePreferred(entryRecord.preferred_name);
    notePreferred(entryRecord.preferredName);
  };

  if (Array.isArray(value)) {
    value.forEach(pushNameRecord);
  }

  const record = toRecord(value);
  if (record) {
    pushNameRecord(record);
    notePreferred(record.primary_name);
    notePreferred(record.primaryName);
    notePreferred(record.preferred_name);
    notePreferred(record.preferredName);
    const names = record.names;
    if (Array.isArray(names)) {
      names.forEach(pushNameRecord);
    }
    const results = record.results;
    if (Array.isArray(results)) {
      results.forEach(pushNameRecord);
    }
  }

  return {
    names: sortBnsNames(candidates),
    preferred
  };
};

const extractAddressFromApiResponse = (value: unknown) => {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const candidates = [
    record.address,
    record.owner,
    record.owner_address,
    record.principal
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const normalized = extractAddressFromPrincipalCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const extractAddressFromZonefileData = (entry: unknown): string | null => {
    if (!entry) {
      return null;
    }
    if (typeof entry === 'string') {
      const normalized = extractAddressFromPrincipalCandidate(entry);
      if (normalized) {
        return normalized;
      }
      const trimmed = entry.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return extractAddressFromZonefileData(JSON.parse(trimmed));
        } catch (error) {
          return null;
        }
      }
      return null;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        const normalized = extractAddressFromZonefileData(item);
        if (normalized) {
          return normalized;
        }
      }
      return null;
    }
    const entryRecord = toRecord(entry);
    if (!entryRecord) {
      return null;
    }
    const directCandidates = [
      entryRecord.owner,
      entryRecord.address,
      entryRecord.owner_address,
      entryRecord.principal,
      entryRecord.stx,
      entryRecord.stacks,
      entryRecord.stacks_address,
      entryRecord.stacksAddress
    ];
    for (const candidate of directCandidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const normalized = extractAddressFromPrincipalCandidate(candidate);
      if (normalized) {
        return normalized;
      }
    }
    const addresses = entryRecord.addresses;
    if (Array.isArray(addresses)) {
      for (const addressEntry of addresses) {
        const addressRecord = toRecord(addressEntry);
        if (!addressRecord || typeof addressRecord.address !== 'string') {
          continue;
        }
        const network =
          typeof addressRecord.network === 'string'
            ? addressRecord.network.trim().toLowerCase()
            : '';
        if (
          network &&
          network !== 'stx' &&
          network !== 'stacks' &&
          network !== 'stacks-mainnet' &&
          network !== 'stacks-testnet'
        ) {
          continue;
        }
        const normalized = extractAddressFromPrincipalCandidate(
          addressRecord.address
        );
        if (normalized) {
          return normalized;
        }
      }
    }
    return null;
  };

  const nestedCandidates = [
    record.zonefile,
    record.zonefile_json,
    record.zonefileJson,
    record.resolved_zonefile,
    record.resolvedZonefile,
    record.profile,
    record.data
  ];
  for (const candidate of nestedCandidates) {
    const normalized = extractAddressFromZonefileData(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const fetchBnsApiJson = async (
  baseUrl: string,
  path: string,
  signal?: AbortSignal
): Promise<BnsJsonResponse> => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal
  });
  if (response.status === 404) {
    return { status: 'not-found', json: null };
  }
  if (!response.ok) {
    throw new Error(`BNS API lookup failed (${response.status})`);
  }
  return { status: 'ok', json: await response.json() };
};

const fetchExplorerHtml = async (
  baseUrl: string,
  path: string,
  network: NetworkType,
  signal?: AbortSignal
): Promise<ExplorerHtmlResponse> => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const querySeparator = normalizedPath.includes('?') ? '&' : '?';
  const url = `${normalizeBaseUrl(baseUrl)}${normalizedPath}${querySeparator}chain=${encodeURIComponent(
    network
  )}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'text/html,application/xhtml+xml' },
    signal
  });
  if (response.status === 404) {
    return { status: 'not-found', html: '' };
  }
  if (!response.ok) {
    throw new Error(`Explorer page lookup failed (${response.status})`);
  }
  return { status: 'ok', html: await response.text() };
};

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightCache = new Map<string, Promise<unknown>>();
const transientFallbackByKey = new Map<string, number>();

const isTransientFallbackActive = (key: string) => {
  const until = transientFallbackByKey.get(key) ?? 0;
  if (until <= Date.now()) {
    transientFallbackByKey.delete(key);
    return false;
  }
  return true;
};

const noteTransientFallback = (key: string) => {
  transientFallbackByKey.set(
    key,
    Date.now() + BNS_TRANSIENT_FALLBACK_COOLDOWN_MS
  );
};

const clearTransientFallback = (key: string) => {
  transientFallbackByKey.delete(key);
};

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

const resolveAddressNamesFromApi = async (params: {
  address: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<AddressResolution | null> => {
  let lastError: unknown = null;

  const bases = getApiBaseUrls(params.network);
  for (const baseUrl of bases) {
    try {
      const response = await callBnsWithRetry({
        task: () =>
          fetchBnsApiJson(
            baseUrl,
            `/v1/addresses/stacks/${encodeURIComponent(params.address)}`,
            params.signal
          ),
        context: `${BNS_API_PROVIDER_ID}:address:${params.address}`,
        signal: params.signal
      });

      if (response.status === 'not-found') {
        continue;
      }

      const extracted = extractNamesFromApiResponse(response.json);
      if (extracted.names.length === 0) {
        continue;
      }

      return {
        result: {
          address: params.address,
          names: extracted.names,
          primary: pickPrimaryBnsName(extracted.names, extracted.preferred),
          source: BNS_API_PROVIDER_ID
        },
        cacheable: true
      };
    } catch (error) {
      lastError = error;
      if (error instanceof BnsBackoffError) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
};

const resolveAddressNamesFromBnsV2 = async (params: {
  address: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<AddressResolution | null> => {
  let lastError: unknown = null;

  const bases = getBnsV2ApiBaseUrls(params.network);
  for (const baseUrl of bases) {
    try {
      const response = await callBnsWithRetry({
        task: () =>
          fetchBnsApiJson(
            baseUrl,
            `/names/address/${encodeURIComponent(params.address)}/valid`,
            params.signal
          ),
        context: `${BNS_V2_PROVIDER_ID}:address:${params.address}`,
        signal: params.signal
      });

      if (response.status === 'not-found') {
        continue;
      }

      const extracted = extractNamesFromApiResponse(response.json);
      if (extracted.names.length === 0) {
        continue;
      }

      return {
        result: {
          address: params.address,
          names: extracted.names,
          primary: pickPrimaryBnsName(extracted.names, extracted.preferred),
          source: BNS_V2_PROVIDER_ID
        },
        cacheable: true
      };
    } catch (error) {
      lastError = error;
      if (error instanceof BnsBackoffError) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
};

const resolveAddressNamesFromExplorer = async (params: {
  address: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<AddressResolution> => {
  let lastError: unknown = null;
  let sawNotFound = false;

  const bases = getExplorerHtmlBaseUrls(params.network);
  for (const baseUrl of bases) {
    try {
      const response = await callBnsWithRetry({
        task: () =>
          fetchExplorerHtml(
            baseUrl,
            `/address/${encodeURIComponent(params.address)}`,
            params.network,
            params.signal
          ),
        context: `${EXPLORER_PROVIDER_ID}:address:${params.address}`,
        signal: params.signal
      });

      if (response.status === 'not-found') {
        sawNotFound = true;
        continue;
      }

      const extracted = extractAddressNamesFromExplorerHtml(response.html);
      return {
        result: {
          address: params.address,
          names: extracted.names,
          primary: extracted.primary,
          source: extracted.names.length > 0 ? EXPLORER_PROVIDER_ID : null
        },
        cacheable: true
      };
    } catch (error) {
      lastError = error;
      if (error instanceof BnsBackoffError) {
        break;
      }
      continue;
    }
  }

  if (lastError) {
    if (isTransientBnsError(lastError)) {
      logDebug('bns', 'Explorer address lookup unavailable, using address fallback', {
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
    logWarn('bns', 'Explorer address lookup failed', {
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

const resolveNameAddressFromApi = async (params: {
  name: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<BnsAddressResult | null> => {
  let lastError: unknown = null;

  const bases = getApiBaseUrls(params.network);
  for (const baseUrl of bases) {
    try {
      const response = await callBnsWithRetry({
        task: () =>
          fetchBnsApiJson(
            baseUrl,
            `/v1/names/${encodeURIComponent(params.name)}`,
            params.signal
          ),
        context: `${BNS_API_PROVIDER_ID}:name:${params.name}`,
        signal: params.signal
      });

      if (response.status === 'not-found') {
        continue;
      }

      const resolvedAddress = extractAddressFromApiResponse(response.json);
      if (!resolvedAddress) {
        continue;
      }

      return {
        name: params.name,
        address: resolvedAddress,
        source: BNS_API_PROVIDER_ID
      };
    } catch (error) {
      lastError = error;
      if (error instanceof BnsBackoffError) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
};

const resolveNameAddressFromExplorer = async (params: {
  name: string;
  network: NetworkType;
  signal?: AbortSignal;
}): Promise<BnsAddressResult> => {
  let lastError: unknown = null;
  let sawNotFound = false;

  const bases = getExplorerHtmlBaseUrls(params.network);
  for (const baseUrl of bases) {
    try {
      const response = await callBnsWithRetry({
        task: () =>
          fetchExplorerHtml(
            baseUrl,
            `/name/${encodeURIComponent(params.name)}`,
            params.network,
            params.signal
          ),
        context: `${EXPLORER_PROVIDER_ID}:name:${params.name}`,
        signal: params.signal
      });

      if (response.status === 'not-found') {
        sawNotFound = true;
        continue;
      }

      const resolvedAddress = extractAddressFromExplorerHtml(response.html);
      if (!resolvedAddress) {
        sawNotFound = true;
        continue;
      }

      if (!validateStacksAddress(resolvedAddress)) {
        logWarn('bns', 'Explorer name resolved to non-Stacks address', {
          name: params.name,
          address: resolvedAddress,
          source: EXPLORER_PROVIDER_ID
        });
        sawNotFound = true;
        continue;
      }

      return {
        name: params.name,
        address: resolvedAddress,
        source: EXPLORER_PROVIDER_ID
      };
    } catch (error) {
      lastError = error;
      if (error instanceof BnsBackoffError) {
        break;
      }
      continue;
    }
  }

  if (lastError) {
    logWarn('bns', 'Explorer name lookup failed', {
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
  if (isTransientFallbackActive(cacheKey)) {
    return {
      address: trimmed,
      names: [],
      primary: null,
      source: null
    };
  }

  return resolveWithInFlight(cacheKey, async () => {
    let resolution: AddressResolution | null = null;
    let bnsV2Error: unknown = null;
    let apiError: unknown = null;

    try {
      resolution = await resolveAddressNamesFromBnsV2({
        address: trimmed,
        network: params.network,
        signal: params.signal
      });
    } catch (error) {
      bnsV2Error = error;
    }

    if (!resolution) {
      try {
        resolution = await resolveAddressNamesFromApi({
          address: trimmed,
          network: params.network,
          signal: params.signal
        });
      } catch (error) {
        apiError = error;
      }
    }

    if (!resolution) {
      try {
        resolution = await resolveAddressNamesFromExplorer({
          address: trimmed,
          network: params.network,
          signal: params.signal
        });
      } catch (error) {
        if (bnsV2Error) {
          throw bnsV2Error;
        }
        if (apiError) {
          throw apiError;
        }
        throw error;
      }
    }

    if (!resolution) {
      const resolvedError = bnsV2Error ?? apiError;
      throw (resolvedError instanceof Error
        ? resolvedError
        : new Error(getErrorMessage(resolvedError)));
    }

    if (resolution.cacheable) {
      writeCache(cacheKey, resolution.result);
      clearTransientFallback(cacheKey);
    } else {
      noteTransientFallback(cacheKey);
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
    let result: BnsAddressResult | null = null;
    let apiError: unknown = null;

    try {
      result = await resolveNameAddressFromApi({
        name: normalizedName,
        network: params.network,
        signal: params.signal
      });
    } catch (error) {
      apiError = error;
    }

    if (!result) {
      try {
        result = await resolveNameAddressFromExplorer({
          name: normalizedName,
          network: params.network,
          signal: params.signal
        });
      } catch (error) {
        if (apiError) {
          throw apiError;
        }
        throw error;
      }
    }

    if (!result) {
      throw (apiError instanceof Error
        ? apiError
        : new Error(getErrorMessage(apiError)));
    }

    writeCache(cacheKey, result);
    return result;
  });
};

export const __resetBnsResolverStateForTests = () => {
  bnsBackoffByScope.clear();
  activeBnsCalls = 0;
  bnsQueue.length = 0;
  memoryCache.clear();
  inflightCache.clear();
  transientFallbackByKey.clear();
};
