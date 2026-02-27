import { applyHiroApiKey, getHiroApiKeys, shouldRetryWithNextHiroKey } from './hiro-keys';

const DEFAULT_TARGET_BASES: Record<string, string> = {
  mainnet: 'https://api.mainnet.hiro.so',
  testnet: 'https://api.testnet.hiro.so'
};
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const HIRO_KEY_COOLDOWN_MS = 2 * 60_000;
const CALL_READ_FUNCTION_TTLS_MS: Record<string, number> = {
  'get-last-token-id': 8_000,
  'get-next-token-id': 8_000,
  'get-inscription-meta': 20_000,
  'get-owner': 20_000,
  'get-token-uri': 30_000,
  'get-svg-data-uri': 30_000,
  'get-svg': 30_000,
  'get-max-supply': 15_000
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-hiro-api-key'
};
const inFlightSafeRequests = new Map<string, Promise<Response>>();
const hiroKeyCooldownUntil = new Map<string, number>();
const cachedProxyResponses = new Map<string, CachedProxyResponse>();
const inFlightCacheableRequests = new Map<string, Promise<Response>>();

type CachedProxyResponse = {
  status: number;
  headers: Array<[string, string]>;
  body: Uint8Array;
  expiresAt: number;
};

type ProxyCachePolicy = {
  ttlMs: number;
};

const normalizeBase = (value: string) => value.trim().replace(/\/+$/, '');

const getTargetBase = (network: string, env: Record<string, string | undefined>) => {
  const normalized = String(network || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'mainnet') {
    return (
      env.ARCADE_HIRO_API_BASE_MAINNET ||
      env.HIRO_API_BASE_MAINNET ||
      env.VITE_STACKS_API_MAINNET ||
      DEFAULT_TARGET_BASES.mainnet
    );
  }
  if (normalized === 'testnet') {
    return (
      env.ARCADE_HIRO_API_BASE_TESTNET ||
      env.HIRO_API_BASE_TESTNET ||
      env.VITE_STACKS_API_TESTNET ||
      DEFAULT_TARGET_BASES.testnet
    );
  }
  return null;
};

const toPathString = (value?: string | string[]) =>
  Array.isArray(value) ? value.join('/') : value || '';

const isSafeMethod = (method: string) =>
  SAFE_METHODS.has(String(method || '').toUpperCase());

const serializeHeaders = (headers: Headers) =>
  (() => {
    const entries: Array<[string, string]> = [];
    headers.forEach((value, name) => {
      entries.push([name.toLowerCase(), value.trim()]);
    });
    return entries;
  })()
    .sort((left, right) => {
      if (left[0] < right[0]) {
        return -1;
      }
      if (left[0] > right[0]) {
        return 1;
      }
      if (left[1] < right[1]) {
        return -1;
      }
      if (left[1] > right[1]) {
        return 1;
      }
      return 0;
    })
    .map(([name, value]) => `${name}:${value}`)
    .join('\n');

const buildSafeRequestKey = (params: {
  method: string;
  targetUrl: string;
  headers: Headers;
}) =>
  `${params.method.toUpperCase()}|${params.targetUrl}|${serializeHeaders(
    params.headers
  )}`;

const normalizePath = (value: string) =>
  value.replace(/^\/+/, '').split('?')[0] ?? '';

const extractCallReadFunctionName = (path: string) => {
  const normalized = normalizePath(path);
  const match = /^v2\/contracts\/call-read\/[^/]+\/[^/]+\/([^/]+)$/i.exec(normalized);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
};

const getProxyCachePolicy = (params: {
  method: string;
  path: string;
}): ProxyCachePolicy | null => {
  if (params.method !== 'POST') {
    return null;
  }
  const functionName = extractCallReadFunctionName(params.path);
  if (!functionName) {
    return null;
  }
  const ttlMs = CALL_READ_FUNCTION_TTLS_MS[functionName];
  if (!ttlMs || ttlMs <= 0) {
    return null;
  }
  return { ttlMs };
};

const getBodyFingerprint = (body?: ArrayBuffer) => {
  if (!body || body.byteLength === 0) {
    return '0:0';
  }
  const bytes = new Uint8Array(body);
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return `${bytes.length}:${(hash >>> 0).toString(16)}`;
};

const buildCacheableRequestKey = (params: {
  network: string;
  targetUrl: string;
  method: string;
  body?: ArrayBuffer;
}) =>
  `${params.network.toLowerCase()}|${params.method.toUpperCase()}|${params.targetUrl}|${getBodyFingerprint(
    params.body
  )}`;

const cleanupExpiredProxyResponses = (now = Date.now()) => {
  cachedProxyResponses.forEach((value, key) => {
    if (value.expiresAt <= now) {
      cachedProxyResponses.delete(key);
    }
  });
};

const restoreCachedResponse = (cached: CachedProxyResponse) => {
  const headers = new Headers(cached.headers);
  headers.set('x-xtrata-proxy-cache', 'hit');
  return new Response(cached.body.slice(), {
    status: cached.status,
    headers
  });
};

const cacheProxyResponse = async (params: {
  key: string;
  response: Response;
  ttlMs: number;
}) => {
  if (params.response.status !== 200 || params.ttlMs <= 0) {
    return;
  }
  const bytes = new Uint8Array(await params.response.clone().arrayBuffer());
  const headerPairs: Array<[string, string]> = [];
  params.response.headers.forEach((value, name) => {
    headerPairs.push([name, value]);
  });
  cachedProxyResponses.set(params.key, {
    status: params.response.status,
    headers: headerPairs,
    body: bytes,
    expiresAt: Date.now() + params.ttlMs
  });
};

const withCorsHeaders = (response: Response) => {
  const responseHeaders = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    responseHeaders.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders
  });
};

const cleanupExpiredHiroKeyCooldowns = (now = Date.now()) => {
  hiroKeyCooldownUntil.forEach((until, key) => {
    if (until <= now) {
      hiroKeyCooldownUntil.delete(key);
    }
  });
};

const buildKeyCandidates = (apiKeys: string[]) => {
  if (apiKeys.length === 0) {
    return [null] as Array<string | null>;
  }
  cleanupExpiredHiroKeyCooldowns();
  const now = Date.now();
  const available = apiKeys.filter((key) => {
    const cooldownUntil = hiroKeyCooldownUntil.get(key) ?? 0;
    return cooldownUntil <= now;
  });
  const cooling = apiKeys.filter((key) => {
    const cooldownUntil = hiroKeyCooldownUntil.get(key) ?? 0;
    return cooldownUntil > now;
  });
  return [...available, ...cooling];
};

const noteRetryableHiroKeyFailure = (apiKey: string | null, status: number) => {
  if (!apiKey) {
    return;
  }
  if (!shouldRetryWithNextHiroKey(status)) {
    return;
  }
  hiroKeyCooldownUntil.set(apiKey, Date.now() + HIRO_KEY_COOLDOWN_MS);
};

const forwardToHiro = async (params: {
  targetUrl: string;
  method: string;
  headers: Headers;
  body?: ArrayBuffer;
  env: Record<string, string | undefined>;
}) => {
  const { targetUrl, method, headers, body, env } = params;
  const apiKeys = getHiroApiKeys(env);
  const keyCandidates = buildKeyCandidates(apiKeys);
  let response: Response | null = null;

  for (let i = 0; i < keyCandidates.length; i += 1) {
    const keyCandidate = keyCandidates[i];
    const attemptHeaders = new Headers(headers);
    applyHiroApiKey(attemptHeaders, keyCandidate);
    let attemptResponse: Response;
    try {
      attemptResponse = await fetch(targetUrl, {
        method,
        headers: attemptHeaders,
        body,
        redirect: 'follow'
      });
    } catch {
      if (i < keyCandidates.length - 1) {
        continue;
      }
      break;
    }

    const hasNextKey = i < keyCandidates.length - 1;
    if (hasNextKey && shouldRetryWithNextHiroKey(attemptResponse.status)) {
      noteRetryableHiroKeyFailure(keyCandidate, attemptResponse.status);
      continue;
    }
    response = attemptResponse;
    break;
  }

  if (!response) {
    return new Response('Hiro request failed.', { status: 502 });
  }
  return response;
};

export const proxyHiroRequest = async (params: {
  request: Request;
  env: Record<string, string | undefined>;
  network: string;
  path?: string | string[];
}) => {
  const { request, env } = params;
  const targetBaseRaw = getTargetBase(params.network, env);

  if (!targetBaseRaw) {
    return new Response('Unknown network', { status: 404 });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  const url = new URL(request.url);
  const path = toPathString(params.path);
  const targetBase = normalizeBase(targetBaseRaw);
  const targetUrl = `${targetBase}/${path}${url.search}`;
  const method = request.method.toUpperCase();

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');

  const body =
    isSafeMethod(method)
      ? undefined
      : await request.arrayBuffer();
  const load = () =>
    forwardToHiro({
      targetUrl,
      method,
      headers,
      body,
      env
    });

  if (isSafeMethod(method)) {
    const safeKey = buildSafeRequestKey({
      method,
      targetUrl,
      headers
    });
    let inFlight = inFlightSafeRequests.get(safeKey);
    if (!inFlight) {
      inFlight = load();
      inFlightSafeRequests.set(safeKey, inFlight);
      void inFlight.finally(() => {
        inFlightSafeRequests.delete(safeKey);
      });
    }
    const response = await inFlight;
    return withCorsHeaders(response.clone());
  }

  const cachePolicy = getProxyCachePolicy({
    method,
    path
  });
  if (cachePolicy) {
    cleanupExpiredProxyResponses();
    const cacheKey = buildCacheableRequestKey({
      network: params.network,
      targetUrl,
      method,
      body
    });
    const cached = cachedProxyResponses.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return withCorsHeaders(restoreCachedResponse(cached));
    }
    let inFlight = inFlightCacheableRequests.get(cacheKey);
    if (!inFlight) {
      inFlight = (async () => {
        const response = await load();
        await cacheProxyResponse({
          key: cacheKey,
          response,
          ttlMs: cachePolicy.ttlMs
        });
        return response;
      })();
      inFlightCacheableRequests.set(cacheKey, inFlight);
      void inFlight.finally(() => {
        inFlightCacheableRequests.delete(cacheKey);
      });
    }
    const response = await inFlight;
    return withCorsHeaders(response.clone());
  }

  const response = await load();
  return withCorsHeaders(response);
};

export const __testing = {
  resetHiroProxyRuntimeState() {
    inFlightSafeRequests.clear();
    hiroKeyCooldownUntil.clear();
    cachedProxyResponses.clear();
    inFlightCacheableRequests.clear();
  }
};
