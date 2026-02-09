import { isReadOnlyBackoffActive } from '../contract/read-only';
import type { XtrataClient } from '../contract/client';
import type { TokenSummary } from './types';

export type ParentScanProgress = {
  scanned: bigint;
  total: bigint;
  found: bigint;
  currentId: bigint;
};

export const fetchParents = async (params: {
  client: XtrataClient;
  tokenId: bigint;
  senderAddress: string;
}): Promise<bigint[]> => {
  return params.client.getDependencies(params.tokenId, params.senderAddress);
};

export const findChildrenFromKnownTokens = (
  tokenSummaries: TokenSummary[],
  parentId: bigint,
  dependenciesById?: Map<string, bigint[]>
): bigint[] => {
  const matches = new Set<string>();
  for (const token of tokenSummaries) {
    const deps =
      dependenciesById?.get(token.id.toString()) ?? [];
    if (deps.some((dep) => dep === parentId)) {
      matches.add(token.id.toString());
    }
  }
  return Array.from(matches)
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

export const scanChildren = async (params: {
  client: XtrataClient;
  parentId: bigint;
  lastTokenId: bigint;
  senderAddress: string;
  concurrency?: number;
  shouldCancel?: () => boolean;
  onProgress?: (progress: ParentScanProgress) => void;
}): Promise<bigint[]> => {
  if (isReadOnlyBackoffActive()) {
    throw new Error('Read-only backoff active');
  }

  const concurrency = Math.max(1, Math.min(params.concurrency ?? 4, 8));
  const shouldCancel = params.shouldCancel ?? (() => false);
  const maxId = params.lastTokenId;
  const total = maxId + 1n;
  let nextId = 0n;
  let scanned = 0n;
  let found = 0n;
  const results = new Set<string>();

  const worker = async () => {
    while (true) {
      if (shouldCancel()) {
        return;
      }
      if (isReadOnlyBackoffActive()) {
        throw new Error('Read-only backoff active');
      }
      const current = nextId;
      if (current > maxId) {
        return;
      }
      nextId += 1n;
      const deps = await params.client.getDependencies(
        current,
        params.senderAddress
      );
      scanned += 1n;
      if (deps.some((dep) => dep === params.parentId)) {
        results.add(current.toString());
        found += 1n;
      }
      params.onProgress?.({
        scanned,
        total,
        found,
        currentId: current
      });
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return Array.from(results)
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};
