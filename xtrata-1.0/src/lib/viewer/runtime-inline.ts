import { createXtrataClient, type XtrataClient } from '../contract/client';
import { getContractId, parseContractId } from '../contract/config';
import { fetchOnChainContent } from './content';

export type RuntimeContentReference = {
  rawUrl: string;
  contractId: string;
  tokenId: bigint;
  fallbackContractId: string | null;
};

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
  rawUrl: string
): RuntimeContentReference | null => {
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl.replace(/&amp;/g, '&'), 'https://xtrata.local');
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

const toDataUri = (bytes: Uint8Array, mimeType?: string | null) =>
  `data:${mimeType ?? 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;

export const inlineRuntimeContentUrls = async (params: {
  html: string;
  client: XtrataClient;
  fallbackClient?: XtrataClient | null;
}) => {
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

  await Promise.all(
    urls.map(async (rawUrl) => {
      const reference = parseRuntimeContentReference(rawUrl);
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
      replacements.set(rawUrl, toDataUri(bytes, meta.mimeType));
    })
  );

  if (replacements.size === 0) {
    return params.html;
  }

  return replaceRuntimeContentUrls(params.html, replacements);
};
