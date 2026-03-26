const REMAPPABLE_URL_PATTERN = /^(?:\.\.?\/|\/|https?:\/\/)/i;

const RUNTIME_URL_HELPER = `const __xtrataResolveRuntimeModuleUrl = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    const currentUrl = new URL(import.meta.url);
    const resolvedUrl = new URL(value, currentUrl);
    const runtimePrefix = '/runtime/modules/';
    const workspacePrefix = '/on-chain-modules/workspace/';
    const workspaceRoots = ['/System/', '/Plugins/', '/Samples/', '/Presets/', '/Assets/', '/Themes/', '/Skins/', '/Modules/', '/Instruments/', '/Effects/'];
    if (resolvedUrl.pathname.startsWith(runtimePrefix)) {
      return resolvedUrl.toString();
    }
    const workspaceIndex = currentUrl.pathname.indexOf(workspacePrefix);
    const isWorkspaceAbsolute =
      resolvedUrl.pathname.startsWith(workspacePrefix) ||
      workspaceRoots.some((prefix) => resolvedUrl.pathname.startsWith(prefix));
    if (
      workspaceIndex !== -1 &&
      resolvedUrl.origin === currentUrl.origin &&
      isWorkspaceAbsolute
    ) {
      const target = new URL(currentUrl.origin + currentUrl.pathname.slice(0, workspaceIndex + workspacePrefix.length));
      if (resolvedUrl.pathname.startsWith(workspacePrefix)) {
        target.pathname = target.pathname + resolvedUrl.pathname.slice(workspacePrefix.length);
      } else {
        target.pathname = target.pathname + resolvedUrl.pathname.slice(1);
      }
      target.search = resolvedUrl.search;
      target.hash = resolvedUrl.hash;
      return target.toString();
    }
    if (/^(?:\\.\\.?\\/)/.test(value)) {
      return resolvedUrl.toString();
    }
  } catch (error) {}
  try {
    if (
      typeof window !== 'undefined' &&
      window &&
      typeof window.__xtrataResolveRuntimeAssetUrl === 'function'
    ) {
      const remapped = window.__xtrataResolveRuntimeAssetUrl(value);
      if (typeof remapped === 'string' && remapped) {
        return remapped;
      }
    }
  } catch (error) {}
  return value;
};`;

const replaceRelativeRuntimeApi = (
  source: string,
  pattern: RegExp
) => {
  let changed = false;
  const output = source.replace(
    pattern,
    (_match, prefix: string, quote: string, value: string, suffix = '') => {
      if (!REMAPPABLE_URL_PATTERN.test(value)) {
        return _match;
      }
      changed = true;
      return `${prefix}__xtrataResolveRuntimeModuleUrl(${quote}${value}${quote})${suffix}`;
    }
  );
  return {
    source: output,
    changed
  };
};

export const transformRuntimeModuleSource = (source: string) => {
  let transformed = source;
  let changed = false;

  const addModuleRewrite = replaceRelativeRuntimeApi(
    transformed,
    /(\.addModule\s*\(\s*)(['"`])((?:\.\.?\/|\/|https?:\/\/)[^'"`\r\n]+)\2(\s*(?:,\s*[^)]*)?\))/g
  );
  transformed = addModuleRewrite.source;
  changed ||= addModuleRewrite.changed;

  const workerRewrite = replaceRelativeRuntimeApi(
    transformed,
    /(\bnew\s+(?:Worker|SharedWorker)\s*\(\s*)(['"`])((?:\.\.?\/|\/|https?:\/\/)[^'"`\r\n]+)\2(\s*(?:,\s*[^)]*)?\))/g
  );
  transformed = workerRewrite.source;
  changed ||= workerRewrite.changed;

  if (!changed) {
    return {
      source,
      changed: false
    };
  }

  return {
    source: `${RUNTIME_URL_HELPER}\n${transformed}`,
    changed: true
  };
};

export const isTransformableRuntimeModulePath = (requestedPath: string) => {
  const extension =
    requestedPath.split('/').pop()?.split('.').pop()?.trim().toLowerCase() ?? '';
  return extension === 'js' || extension === 'mjs' || extension === 'cjs';
};
