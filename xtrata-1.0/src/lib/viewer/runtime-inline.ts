import { createXtrataClient, type XtrataClient } from '../contract/client';
import { getContractId, parseContractId } from '../contract/config';
import { fetchOnChainContent } from './content';

export type RuntimeContentReference = {
  rawUrl: string;
  contractId: string;
  tokenId: bigint;
  fallbackContractId: string | null;
};

export const RUNTIME_INLINE_HTML_VERSION = 'v2';

const RUNTIME_CONTENT_URL_PATTERN =
  /\/runtime\/content\?[^"'`\s<>)]+/g;

const parseTokenId = (value: string | null) => {
  if (!value || !/^\d+$/.test(value.trim())) {
    return null;
  }
  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  throw new Error('Base64 encoding is unavailable in this environment');
};

const decodeText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const extractRuntimeTemplateConstants = (html: string) => {
  const constants = new Map<string, string>();
  if (!html) {
    return constants;
  }

  const patterns = [
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*Number\(\s*(["'])([^"'`]+)\2\s*\)/g,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*BigInt\(\s*(["'])([^"'`]+)\2\s*\)/g,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'`]+)\2/g,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(\d+)/g
  ] as const;

  patterns.forEach((pattern) => {
    for (const match of html.matchAll(pattern)) {
      const name = match[1];
      const value = match[3] ?? match[2];
      if (name && value) {
        constants.set(name, value);
      }
    }
  });

  return constants;
};

const resolveRuntimeTemplateUrl = (
  rawUrl: string,
  constants: Map<string, string>
) =>
  rawUrl.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (_match, name: string) =>
    constants.get(name) ?? _match
  );

export const extractRuntimeContentUrls = (html: string) => {
  if (!html) {
    return [] as string[];
  }
  const matches = html.match(RUNTIME_CONTENT_URL_PATTERN) ?? [];
  return Array.from(new Set(matches));
};

export const hasRuntimeContentUrls = (html: string) =>
  extractRuntimeContentUrls(html).length > 0;

export const parseRuntimeContentReference = (
  rawUrl: string,
  constants?: Map<string, string>
): RuntimeContentReference | null => {
  if (!rawUrl) {
    return null;
  }
  try {
    const resolvedUrl = resolveRuntimeTemplateUrl(
      rawUrl.replace(/&amp;/g, '&'),
      constants ?? new Map<string, string>()
    );
    const parsed = new URL(resolvedUrl, 'https://xtrata.local');
    if (parsed.pathname !== '/runtime/content') {
      return null;
    }
    const contract = parseContractId(parsed.searchParams.get('contractId') ?? '');
    const tokenId = parseTokenId(parsed.searchParams.get('tokenId'));
    const fallbackContract = parseContractId(
      parsed.searchParams.get('fallbackContractId') ?? ''
    );
    if (!contract || tokenId === null) {
      return null;
    }
    return {
      rawUrl,
      contractId: getContractId(contract),
      tokenId,
      fallbackContractId: fallbackContract
        ? getContractId(fallbackContract)
        : null
    };
  } catch {
    return null;
  }
};

export const replaceRuntimeContentUrls = (
  html: string,
  replacements: Map<string, string>
) => {
  let output = html;
  for (const [rawUrl, replacement] of replacements.entries()) {
    output = output.split(rawUrl).join(replacement);
  }
  return output;
};

const escapeInlineStyleText = (value: string) =>
  value.replace(/<\/style/gi, '<\\/style');

const toNamedImportDestructure = (value: string) =>
  value
    .trim()
    .replace(/^\{\s*/, '')
    .replace(/\s*\}$/, '')
    .replace(/\s+as\s+/g, ': ');

const buildDynamicImportStatement = (bindings: string, dataUri: string) => {
  const trimmed = bindings.trim();
  const importCall = `await import('${dataUri}')`;

  if (!trimmed) {
    return importCall;
  }

  if (trimmed.startsWith('* as ')) {
    return `const ${trimmed.slice(5).trim()} = ${importCall}`;
  }

  if (trimmed.startsWith('{')) {
    return `const { ${toNamedImportDestructure(trimmed)} } = ${importCall}`;
  }

  if (trimmed.includes(',')) {
    const [defaultBinding, namedBinding] = trimmed.split(/,(.+)/).map((part) =>
      part.trim()
    );
    if (namedBinding.startsWith('{')) {
      return `const { default: ${defaultBinding}, ${toNamedImportDestructure(
        namedBinding
      )} } = ${importCall}`;
    }
    if (namedBinding.startsWith('* as ')) {
      const namespaceBinding = namedBinding.slice(5).trim();
      const tempName = `__xtrataInlineImport_${defaultBinding.replace(/\W+/g, '_')}`;
      return `const ${tempName} = ${importCall}; const ${defaultBinding} = ${tempName}.default; const ${namespaceBinding} = ${tempName}`;
    }
  }

  return `const { default: ${trimmed} } = ${importCall}`;
};

const replaceRuntimeStylesheetLinks = (
  html: string,
  rawUrl: string,
  styleText: string
) => {
  const escapedUrl = escapeRegExp(rawUrl);
  const pattern = new RegExp(
    `<link\\b([^>]*?)href=(["'])${escapedUrl}\\2([^>]*?)>`,
    'gi'
  );
  const inlineStyle = `<style data-xtrata-inline-runtime="true">\n${escapeInlineStyleText(
    styleText
  )}\n</style>`;
  return html.replace(pattern, () => inlineStyle);
};

const replaceStaticRuntimeImports = (
  html: string,
  rawUrl: string,
  dataUri: string
) => {
  const escapedUrl = escapeRegExp(rawUrl);
  const fromPattern = new RegExp(
    `(^|[\\r\\n])([ \\t]*)import\\s+([^;\\r\\n]+?)\\s+from\\s+(["'])${escapedUrl}\\4\\s*;?`,
    'g'
  );
  let output = html.replace(
    fromPattern,
    (_match, lineStart: string, indent: string, bindings: string) =>
      `${lineStart}${indent}${buildDynamicImportStatement(bindings, dataUri)};`
  );

  const sideEffectPattern = new RegExp(
    `(^|[\\r\\n])([ \\t]*)import\\s+(["'])${escapedUrl}\\3\\s*;?`,
    'g'
  );
  output = output.replace(
    sideEffectPattern,
    (match, lineStart: string, indent: string) => {
      if (match.includes(' from ')) {
        return match;
      }
      return `${lineStart}${indent}await import('${dataUri}');`;
    }
  );

  return output;
};

const toDataUri = (bytes: Uint8Array, mimeType?: string | null) =>
  `data:${mimeType ?? 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;

export const inlineRuntimeContentUrls = async (params: {
  html: string;
  client: XtrataClient;
  fallbackClient?: XtrataClient | null;
}) => {
  const templateConstants = extractRuntimeTemplateConstants(params.html);
  const urls = extractRuntimeContentUrls(params.html);
  if (urls.length === 0) {
    return params.html;
  }

  const clientCache = new Map<string, XtrataClient>();
  clientCache.set(getContractId(params.client.contract), params.client);
  if (params.fallbackClient) {
    clientCache.set(getContractId(params.fallbackClient.contract), params.fallbackClient);
  }

  const getClient = (contractId: string) => {
    const existing = clientCache.get(contractId);
    if (existing) {
      return existing;
    }
    const contract = parseContractId(contractId);
    if (!contract) {
      return null;
    }
    const client = createXtrataClient({ contract });
    clientCache.set(contractId, client);
    return client;
  };

  const replacements = new Map<string, string>();
  const textAssets = new Map<string, { mimeType: string | null; text: string; dataUri: string }>();

  await Promise.all(
    urls.map(async (rawUrl) => {
      const reference = parseRuntimeContentReference(rawUrl, templateConstants);
      if (!reference) {
        return;
      }
      const client = getClient(reference.contractId);
      if (!client) {
        return;
      }
      const fallbackClient = reference.fallbackContractId
        ? getClient(reference.fallbackContractId)
        : null;
      const meta = await client.getInscriptionMeta(
        reference.tokenId,
        client.contract.address
      );
      if (!meta || meta.totalSize <= 0n) {
        return;
      }
      const bytes = await fetchOnChainContent({
        client,
        fallbackClient,
        cacheContractId: reference.contractId,
        id: reference.tokenId,
        senderAddress: client.contract.address,
        totalSize: meta.totalSize,
        mimeType: meta.mimeType ?? null
      });
      const dataUri = toDataUri(bytes, meta.mimeType);
      replacements.set(rawUrl, dataUri);
      textAssets.set(rawUrl, {
        mimeType: meta.mimeType ?? null,
        text: decodeText(bytes),
        dataUri
      });
    })
  );

  if (replacements.size === 0) {
    return params.html;
  }

  let output = params.html;

  for (const [rawUrl, asset] of textAssets.entries()) {
    const normalizedMime = asset.mimeType?.trim().toLowerCase() ?? null;
    if (normalizedMime === 'text/css') {
      output = replaceRuntimeStylesheetLinks(output, rawUrl, asset.text);
      continue;
    }
    if (
      normalizedMime === 'text/javascript' ||
      normalizedMime === 'application/javascript' ||
      normalizedMime === 'application/x-javascript'
    ) {
      output = replaceStaticRuntimeImports(output, rawUrl, asset.dataUri);
    }
  }

  return replaceRuntimeContentUrls(output, replacements);
};
