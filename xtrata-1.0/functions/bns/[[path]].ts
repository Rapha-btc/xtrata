const DEFAULT_BNS_BASE = 'https://api.bns.xyz';

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
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type'
      }
    });
  }

  const url = new URL(request.url);
  const pathParam = params.path;
  const path = Array.isArray(pathParam) ? pathParam.join('/') : pathParam ?? '';
  const targetBase =
    env.BNS_API_BASE || env.VITE_BNS_API_BASE || DEFAULT_BNS_BASE;
  const targetUrl = `${targetBase}/${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');

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
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'content-type');

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders
  });
};
