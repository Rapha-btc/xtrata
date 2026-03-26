import type { NetworkType } from '../network/types';

export type RuntimeModuleContractRef = {
  address: string;
  contractName: string;
};

const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

const decodeSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const parseRuntimeModuleContractId = (
  value: string | null | undefined
): RuntimeModuleContractRef | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex <= 0 || dotIndex >= trimmed.length - 1) {
    return null;
  }
  const address = trimmed.slice(0, dotIndex).trim();
  const contractName = trimmed.slice(dotIndex + 1).trim();
  if (!address || !contractName) {
    return null;
  }
  return {
    address,
    contractName
  };
};

export const normalizeModuleTokenUriPath = (
  value: string | null | undefined,
  options?: { decodeSegments?: boolean }
) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed.startsWith('//') || URI_SCHEME_PATTERN.test(trimmed)) {
    return null;
  }
  const withoutQuery = trimmed.split('#')[0]?.split('?')[0] ?? trimmed;
  const rawSegments = withoutQuery.split('/');
  const segments: string[] = [];
  for (const rawSegment of rawSegments) {
    const segment = options?.decodeSegments ? decodeSegment(rawSegment) : rawSegment;
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      return null;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    return null;
  }
  return segments.join('/');
};

export const isPathBasedModuleTokenUri = (value: string | null | undefined) =>
  normalizeModuleTokenUriPath(value) !== null;

const encodePathSegments = (path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const buildRuntimeModulesPrefix = (params: {
  network: NetworkType;
  contractId: string;
}) => {
  const contract = parseRuntimeModuleContractId(params.contractId);
  if (!contract) {
    return null;
  }
  return `/runtime/modules/${encodeURIComponent(params.network)}/${encodeURIComponent(contract.address)}/${encodeURIComponent(contract.contractName)}`;
};

export const buildRuntimeModuleAssetUrl = (params: {
  network: NetworkType;
  contractId: string;
  tokenUriPath: string | null | undefined;
}) => {
  const prefix = buildRuntimeModulesPrefix(params);
  const normalizedPath = normalizeModuleTokenUriPath(params.tokenUriPath);
  if (!prefix || !normalizedPath) {
    return null;
  }
  return `${prefix}/${encodePathSegments(normalizedPath)}`;
};

export const buildRuntimeModuleBaseHref = (params: {
  network: NetworkType;
  contractId: string;
  tokenUriPath: string | null | undefined;
}) => {
  const prefix = buildRuntimeModulesPrefix(params);
  const normalizedPath = normalizeModuleTokenUriPath(params.tokenUriPath);
  if (!prefix || !normalizedPath) {
    return null;
  }
  const segments = normalizedPath.split('/');
  segments.pop();
  if (segments.length === 0) {
    return `${prefix}/`;
  }
  return `${prefix}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}/`;
};

const injectAfterTag = (html: string, tagName: string, content: string) => {
  const regex = new RegExp(`<${tagName}[^>]*>`, 'i');
  const match = html.match(regex);
  if (!match || match.index === undefined) {
    return null;
  }
  const insertionPoint = match.index + match[0].length;
  return `${html.slice(0, insertionPoint)}${content}${html.slice(insertionPoint)}`;
};

export const injectHtmlBaseHref = (html: string, baseHref: string | null | undefined) => {
  if (!html || !baseHref) {
    return html;
  }
  if (/<base[\s>]/i.test(html)) {
    return html;
  }
  const baseTag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  const afterHead = injectAfterTag(html, 'head', baseTag);
  if (afterHead) {
    return afterHead;
  }
  const afterHtml = injectAfterTag(html, 'html', `<head>${baseTag}</head>`);
  if (afterHtml) {
    return afterHtml;
  }
  const beforeBody = html.match(/<body[^>]*>/i);
  if (beforeBody && beforeBody.index !== undefined) {
    return `${html.slice(0, beforeBody.index)}<head>${baseTag}</head>${html.slice(beforeBody.index)}`;
  }
  return `<head>${baseTag}</head>${html}`;
};
