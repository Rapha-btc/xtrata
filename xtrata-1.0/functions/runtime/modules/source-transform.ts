const REMAPPABLE_URL_PATTERN = /^(?:\.\.?\/|\/|https?:\/\/)/i;

const RUNTIME_URL_HELPER = `const __xtrataResolveRuntimeModuleUrl = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
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
  if (!/^(?:\\.\\.?\\/)/.test(value)) {
    return value;
  }
  try {
    return new URL(value, import.meta.url).toString();
  } catch (error) {
    return value;
  }
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
