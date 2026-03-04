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
    if (token.id <= parentId) {
      continue;
    }
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
  const startId = params.parentId + 1n;
  if (startId > maxId) {
    return [];
  }
  const total = maxId - startId + 1n;
  let nextId = startId;
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

export const findSiblingsFromParents = async (params: {
  client: XtrataClient;
  selectedTokenId: bigint;
  parentIds: bigint[];
  lastTokenId: bigint | null;
  senderAddress: string;
  loadIndexedChildren: (parentId: bigint) => Promise<bigint[]>;
  shouldCancel?: () => boolean;
  concurrency?: number;
}): Promise<bigint[]> => {
  const merged = new Set<string>();
  const selectedKey = params.selectedTokenId.toString();

  for (const parentId of params.parentIds) {
    if (params.shouldCancel?.()) {
      break;
    }
    const indexedChildren = await params.loadIndexedChildren(parentId);
    const indexedSet = new Set(indexedChildren.map((id) => id.toString()));

    const canScanForward =
      params.lastTokenId !== null && params.lastTokenId > parentId;
    const needsForwardScan = canScanForward && !indexedSet.has(selectedKey);

    let combinedChildren = indexedChildren;
    if (needsForwardScan && params.lastTokenId !== null) {
      const scannedChildren = await scanChildren({
        client: params.client,
        parentId,
        lastTokenId: params.lastTokenId,
        senderAddress: params.senderAddress,
        concurrency: params.concurrency ?? 2,
        shouldCancel: params.shouldCancel
      });
      const mergedIds = new Set([
        ...indexedChildren.map((id) => id.toString()),
        ...scannedChildren.map((id) => id.toString())
      ]);
      combinedChildren = Array.from(mergedIds).map((value) => BigInt(value));
    }

    combinedChildren.forEach((childId) => {
      if (childId.toString() !== selectedKey) {
        merged.add(childId.toString());
      }
    });
  }

  return Array.from(merged)
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};
