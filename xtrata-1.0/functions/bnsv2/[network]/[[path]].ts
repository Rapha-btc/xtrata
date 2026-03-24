const DEFAULT_TARGET_BASES: Record<string, string> = {
  mainnet: 'https://api.bnsv2.com',
  testnet: 'https://api.bnsv2.com/testnet'
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};

const toPathString = (value?: string | string[]) =>
  Array.isArray(value) ? value.join('/') : value || '';

const getTargetBase = (
  network: string,
  env: Record<string, string | undefined>
) => {
  const normalized = String(network || '').trim().toLowerCase();
  if (normalized === 'mainnet') {
    return (
      env.BNSV2_API_BASE_MAINNET ||
      env.VITE_BNSV2_API_BASE_MAINNET ||
      env.VITE_BNSV2_API_BASE ||
      DEFAULT_TARGET_BASES.mainnet
    );
  }
  if (normalized === 'testnet') {
    return (
      env.BNSV2_API_BASE_TESTNET ||
      env.VITE_BNSV2_API_BASE_TESTNET ||
      env.VITE_BNSV2_API_BASE ||
      DEFAULT_TARGET_BASES.testnet
    );
  }
  return null;
};

export const onRequest = async (context: {
  request: Request;
  params: { network?: string; path?: string | string[] };
  env: Record<string, string | undefined>;
}) => {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: CORS_HEADERS
    });
  }

  const targetBase = getTargetBase(params.network || '', env);
  if (!targetBase) {
    return new Response('Unsupported network', {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  const url = new URL(request.url);
  const path = toPathString(params.path);
  const targetUrl = `${targetBase.replace(/\/+$/, '')}/${path}${url.search}`;

  const headers = new Headers();
  headers.set('accept', request.headers.get('accept') ?? 'application/json,*/*;q=0.8');
  headers.set(
    'user-agent',
    request.headers.get('user-agent') ??
      'xtrata-bnsv2-proxy/1.0 (+https://xtrata.xyz)'
  );

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
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
