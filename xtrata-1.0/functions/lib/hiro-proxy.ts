const DEFAULT_TARGET_BASES: Record<string, string> = {
  mainnet: 'https://api.mainnet.hiro.so',
  testnet: 'https://api.testnet.hiro.so'
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-hiro-api-key'
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

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  const apiKey = env.HIRO_API_KEY || env.VITE_HIRO_API_KEY;
  if (apiKey) {
    headers.set('x-hiro-api-key', apiKey);
    headers.set('x-api-key', apiKey);
  }

  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    redirect: 'follow'
  });

  const responseHeaders = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    responseHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders
  });
};
