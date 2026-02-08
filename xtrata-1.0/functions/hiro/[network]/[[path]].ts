const getTargetBase = (network: string) => {
  if (network === 'mainnet') {
    return 'https://api.mainnet.hiro.so';
  }
  if (network === 'testnet') {
    return 'https://api.testnet.hiro.so';
  }
  return null;
};

export const onRequest = async (context: {
  request: Request;
  params: { network?: string; path?: string | string[] };
  env: Record<string, string | undefined>;
}) => {
  const { request, params, env } = context;
  const network = params.network ?? '';
  const targetBase = getTargetBase(network);
  if (!targetBase) {
    return new Response('Unknown network', { status: 404 });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type,x-hiro-api-key'
      }
    });
  }

  const url = new URL(request.url);
  const pathParam = params.path;
  const path = Array.isArray(pathParam) ? pathParam.join('/') : pathParam ?? '';
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
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'content-type,x-hiro-api-key');

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders
  });
};
