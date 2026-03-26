import { normalizeModuleTokenUriPath } from '../../src/lib/viewer/module-paths';
import { rewriteRuntimeWorkspaceAssetUrl } from '../../src/lib/viewer/runtime-asset-urls';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  Vary: 'Referer'
};

const toPathString = (value?: string | string[]) =>
  Array.isArray(value) ? value.join('/') : value || '';

const badResponse = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'no-store'
    }
  });

const resolveAbsoluteUrl = (value: string, base: string) => {
  try {
    return new URL(value, base).toString();
  } catch (error) {
    return value;
  }
};

const buildNormalizedRequestUrl = (requestUrl: string, requestedPath: string) => {
  const url = new URL(requestUrl);
  url.pathname = `/${requestedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
  return url.toString();
};

const resolveWorkspaceRedirectTarget = (request: Request, requestedPath: string) => {
  const referer = request.headers.get('referer');
  if (!referer) {
    return null;
  }

  let refererUrl: URL;
  try {
    refererUrl = new URL(referer);
  } catch (error) {
    return null;
  }

  const normalizedRequestUrl = buildNormalizedRequestUrl(request.url, requestedPath);
  const moduleBase = refererUrl.searchParams.get('moduleBase');
  const candidates = [
    moduleBase ? resolveAbsoluteUrl(moduleBase, refererUrl.toString()) : null,
    refererUrl.toString()
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const baseUrl of candidates) {
    const remapped = rewriteRuntimeWorkspaceAssetUrl({
      requestUrl: normalizedRequestUrl,
      baseUrl,
      origin: new URL(request.url).origin
    });
    if (remapped && remapped !== normalizedRequestUrl) {
      return remapped;
    }
  }

  return null;
};

export const createRuntimeWorkspaceRootHandler =
  (root: string) =>
  async (context: {
    request: Request;
    params: {
      path?: string | string[];
    };
  }) => {
    const { request, params } = context;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return badResponse(405, 'Method not allowed');
    }

    const relativePath = toPathString(params.path);
    if (!relativePath.trim()) {
      return badResponse(400, 'Invalid workspace path');
    }

    const requestedPath = normalizeModuleTokenUriPath(`${root}/${relativePath}`, {
      decodeSegments: true
    });
    if (!requestedPath) {
      return badResponse(400, 'Invalid workspace path');
    }

    const redirectTarget = resolveWorkspaceRedirectTarget(request, requestedPath);
    if (!redirectTarget) {
      return badResponse(404, 'Runtime workspace path not found');
    }

    return new Response(null, {
      status: 307,
      headers: {
        ...CORS_HEADERS,
        Location: redirectTarget,
        'Cache-Control': 'public, max-age=300'
      }
    });
  };
