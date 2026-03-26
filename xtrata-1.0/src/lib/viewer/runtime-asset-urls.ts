const WORKSPACE_PREFIX = '/on-chain-modules/workspace/';
const RUNTIME_MODULES_PREFIX = '/runtime/modules/';
const ABSOLUTE_WORKSPACE_ROOTS = [
  '/System/',
  '/Plugins/',
  '/Samples/',
  '/Presets/',
  '/Assets/',
  '/Themes/',
  '/Skins/',
  '/Modules/',
  '/Instruments/',
  '/Effects/'
];

const safeUrl = (value: string, base?: string) => {
  try {
    return new URL(value, base);
  } catch (error) {
    return null;
  }
};

export const deriveRuntimeWorkspaceBaseUrl = (
  value: string | null | undefined
) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }
  const url = safeUrl(trimmed, 'https://xtrata.local');
  if (!url) {
    return null;
  }
  const markerIndex = url.pathname.indexOf(WORKSPACE_PREFIX);
  if (markerIndex === -1) {
    return null;
  }
  return `${url.origin}${url.pathname.slice(0, markerIndex + WORKSPACE_PREFIX.length)}`;
};

const isLikelyWorkspaceAbsolutePath = (pathname: string) =>
  pathname.startsWith(WORKSPACE_PREFIX) ||
  ABSOLUTE_WORKSPACE_ROOTS.some((prefix) => pathname.startsWith(prefix));

export const rewriteRuntimeWorkspaceAssetUrl = (params: {
  requestUrl: string;
  baseUrl: string | null | undefined;
  origin: string | null | undefined;
}) => {
  const requestUrl = typeof params.requestUrl === 'string' ? params.requestUrl.trim() : '';
  if (!requestUrl) {
    return null;
  }
  const baseUrl =
    typeof params.baseUrl === 'string' && params.baseUrl.trim().length > 0
      ? params.baseUrl.trim()
      : params.origin && params.origin.trim().length > 0
        ? params.origin.trim()
        : 'https://xtrata.local';
  const resolved = safeUrl(requestUrl, baseUrl);
  if (!resolved) {
    return null;
  }
  if (resolved.pathname.startsWith(RUNTIME_MODULES_PREFIX)) {
    return resolved.toString();
  }
  const expectedOrigin = typeof params.origin === 'string' ? params.origin.trim() : '';
  if (expectedOrigin && resolved.origin !== expectedOrigin) {
    return null;
  }
  if (!isLikelyWorkspaceAbsolutePath(resolved.pathname)) {
    return null;
  }
  const workspaceBase = deriveRuntimeWorkspaceBaseUrl(baseUrl);
  if (!workspaceBase) {
    return null;
  }
  const target = safeUrl(workspaceBase);
  if (!target) {
    return null;
  }
  if (resolved.pathname.startsWith(WORKSPACE_PREFIX)) {
    target.pathname = `${target.pathname}${resolved.pathname.slice(WORKSPACE_PREFIX.length)}`;
  } else {
    target.pathname = `${target.pathname}${resolved.pathname.slice(1)}`;
  }
  target.search = resolved.search;
  target.hash = resolved.hash;
  return target.toString();
};
