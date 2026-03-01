import { isReadOnlyBackoffActive } from '../contract/read-only';
import type { XtrataClient } from '../contract/client';
import {
  loadRelationshipSyncCursor,
  saveRelationshipChildDependencies,
  saveRelationshipSyncCursor
} from './relationship-index';

export type RelationshipSyncProgress = {
  scanned: bigint;
  total: bigint;
  found: bigint;
  currentId: bigint;
};

export type RelationshipSyncResult = {
  scanned: bigint;
  total: bigint;
  found: bigint;
  cancelled: boolean;
  nextMintedIndex: bigint;
};

const CURSOR_FLUSH_INTERVAL = 20n;

export const syncRelationshipIndex = async (params: {
  client: XtrataClient;
  contractId: string;
  senderAddress: string;
  parentId?: bigint;
  shouldCancel?: () => boolean;
  onProgress?: (progress: RelationshipSyncProgress) => void;
}): Promise<RelationshipSyncResult> => {
  if (isReadOnlyBackoffActive()) {
    throw new Error('Read-only backoff active');
  }
  if (!params.client.supportsMintedIndex) {
    throw new Error(
      'Child indexing requires xtrata-v2.1.0 tokens. Migrate v1 inscriptions to v2.'
    );
  }

  const shouldCancel = params.shouldCancel ?? (() => false);
  let nextMintedIndex = await loadRelationshipSyncCursor(params.contractId);
  const mintedCount = await params.client.getMintedCount(params.senderAddress);
  if (nextMintedIndex > mintedCount) {
    nextMintedIndex = mintedCount;
  }
  const minChildTokenId =
    params.parentId !== undefined ? params.parentId + 1n : null;
  const startIndex = nextMintedIndex;
  const total = mintedCount - startIndex;
  let scanned = 0n;
  let found = 0n;
  let cancelled = false;

  for (let index = startIndex; index < mintedCount; index += 1n) {
    if (shouldCancel()) {
      cancelled = true;
      nextMintedIndex = index;
      break;
    }
    if (isReadOnlyBackoffActive()) {
      throw new Error('Read-only backoff active');
    }
    const tokenId = await params.client.getMintedId(index, params.senderAddress);
    nextMintedIndex = index + 1n;
    scanned += 1n;
    if (tokenId === null) {
      params.onProgress?.({
        scanned,
        total,
        found,
        currentId: 0n
      });
      if ((nextMintedIndex - startIndex) % CURSOR_FLUSH_INTERVAL === 0n) {
        await saveRelationshipSyncCursor({
          contractId: params.contractId,
          nextMintedIndex
        });
      }
      continue;
    }
    if (minChildTokenId !== null && tokenId < minChildTokenId) {
      params.onProgress?.({
        scanned,
        total,
        found,
        currentId: tokenId
      });
      if ((nextMintedIndex - startIndex) % CURSOR_FLUSH_INTERVAL === 0n) {
        await saveRelationshipSyncCursor({
          contractId: params.contractId,
          nextMintedIndex
        });
      }
      continue;
    }
    const dependencies = await params.client.getDependencies(
      tokenId,
      params.senderAddress
    );
    await saveRelationshipChildDependencies({
      contractId: params.contractId,
      childId: tokenId,
      parentIds: dependencies
    });
    if (
      params.parentId !== undefined &&
      dependencies.some((dependencyId) => dependencyId === params.parentId)
    ) {
      found += 1n;
    }
    params.onProgress?.({
      scanned,
      total,
      found,
      currentId: tokenId
    });
    if ((nextMintedIndex - startIndex) % CURSOR_FLUSH_INTERVAL === 0n) {
      await saveRelationshipSyncCursor({
        contractId: params.contractId,
        nextMintedIndex
      });
    }
  }

  await saveRelationshipSyncCursor({
    contractId: params.contractId,
    nextMintedIndex
  });

  return {
    scanned,
    total,
    found,
    cancelled,
    nextMintedIndex
  };
};
