import { applyHiroApiKey, getHiroApiKeys, shouldRetryWithNextHiroKey } from './hiro-keys';

const DEFAULT_TARGET_BASES: Record<string, string> = {
  mainnet: 'https://api.mainnet.hiro.so',
  testnet: 'https://api.testnet.hiro.so'
};
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const HIRO_KEY_COOLDOWN_MS = 2 * 60_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-hiro-api-key'
};
const inFlightSafeRequests = new Map<string, Promise<Response>>();
const hiroKeyCooldownUntil = new Map<string, number>();

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

  const response = await load();
  return withCorsHeaders(response);
};

export const __testing = {
  resetHiroProxyRuntimeState() {
    inFlightSafeRequests.clear();
    hiroKeyCooldownUntil.clear();
  }
};
