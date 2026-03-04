const DEFAULT_EXPLORER_BASE = 'https://explorer.hiro.so';

export const onRequest = async (context: {
  request: Request;
  params: { path?: string | string[] };
  env: Record<string, string | undefined>;
}) => {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type'
      }
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type'
      }
    });
  }

  const pathParam = params.path;
  const path = Array.isArray(pathParam) ? pathParam.join('/') : pathParam ?? '';
  const url = new URL(request.url);
  const targetBase =
    env.STACKS_EXPLORER_BASE ||
    env.VITE_STACKS_EXPLORER_BASE ||
    env.VITE_STACKS_EXPLORER_BASE_MAINNET ||
    DEFAULT_EXPLORER_BASE;
  const targetUrl = `${targetBase.replace(/\/+$/, '')}/${path}${url.search}`;

  const headers = new Headers();
  headers.set('accept', request.headers.get('accept') ?? 'text/html,*/*;q=0.8');
  headers.set(
    'user-agent',
    request.headers.get('user-agent') ??
      'xtrata-explorer-proxy/1.0 (+https://xtrata.xyz)'
  );

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    redirect: 'follow'
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'content-type');

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders
  });
};
