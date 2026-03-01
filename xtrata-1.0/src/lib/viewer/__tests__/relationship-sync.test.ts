import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { XtrataClient } from '../../contract/client';

vi.mock('../relationship-index', () => ({
  loadRelationshipSyncCursor: vi.fn(),
  saveRelationshipChildDependencies: vi.fn(),
  saveRelationshipSyncCursor: vi.fn()
}));

import {
  loadRelationshipSyncCursor,
  saveRelationshipChildDependencies,
  saveRelationshipSyncCursor
} from '../relationship-index';
import { syncRelationshipIndex } from '../relationship-sync';

const loadRelationshipSyncCursorMock = vi.mocked(loadRelationshipSyncCursor);
const saveRelationshipChildDependenciesMock = vi.mocked(
  saveRelationshipChildDependencies
);
const saveRelationshipSyncCursorMock = vi.mocked(saveRelationshipSyncCursor);

const makeClient = (overrides: Partial<XtrataClient>): XtrataClient =>
  ({
    contract: {
      address: 'SP123',
      contractName: 'xtrata-v2-1-0',
      network: 'mainnet'
    },
    network: 'mainnet',
    supportsChunkBatchRead: true,
    supportsMintedIndex: true,
    getLastTokenId: vi.fn(),
    getNextTokenId: vi.fn(),
    getMintedCount: vi.fn(),
    getMintedId: vi.fn(),
    getAdmin: vi.fn(),
    getRoyaltyRecipient: vi.fn(),
    getFeeUnit: vi.fn(),
    isPaused: vi.fn(),
    getTokenUri: vi.fn(),
    getOwner: vi.fn(),
    getSvg: vi.fn(),
    getSvgDataUri: vi.fn(),
    getInscriptionMeta: vi.fn(),
    getDependencies: vi.fn(),
    getChunk: vi.fn(),
    getChunkBatch: vi.fn(),
    getUploadState: vi.fn(),
    getIdByHash: vi.fn(),
    getPendingChunk: vi.fn(),
    ...overrides
  }) as XtrataClient;

describe('relationship sync', () => {
  beforeEach(() => {
    loadRelationshipSyncCursorMock.mockReset();
    saveRelationshipChildDependenciesMock.mockReset();
    saveRelationshipSyncCursorMock.mockReset();
    loadRelationshipSyncCursorMock.mockResolvedValue(0n);
    saveRelationshipChildDependenciesMock.mockResolvedValue(undefined);
    saveRelationshipSyncCursorMock.mockResolvedValue(undefined);
  });

  it('requires minted index support', async () => {
    const client = makeClient({
      supportsMintedIndex: false
    });

    await expect(
      syncRelationshipIndex({
        client,
        contractId: 'SP123.xtrata-v1-1-1',
        senderAddress: 'SPTEST'
      })
    ).rejects.toThrow('requires xtrata-v2.1.0');
  });

  it('indexes newly minted ids and updates cursor', async () => {
    loadRelationshipSyncCursorMock.mockResolvedValue(1n);
    const client = makeClient({
      getMintedCount: vi.fn().mockResolvedValue(3n),
      getMintedId: vi
        .fn()
        .mockResolvedValueOnce(10n)
        .mockResolvedValueOnce(11n),
      getDependencies: vi
        .fn()
        .mockResolvedValueOnce([5n])
        .mockResolvedValueOnce([6n, 5n])
    });
    const progress: Array<{ scanned: bigint; total: bigint; found: bigint }> = [];

    const result = await syncRelationshipIndex({
      client,
      contractId: 'SP123.xtrata-v2-1-0',
      senderAddress: 'SPTEST',
      parentId: 5n,
      onProgress: (value) =>
        progress.push({
          scanned: value.scanned,
          total: value.total,
          found: value.found
        })
    });

    expect(result.cancelled).toBe(false);
    expect(result.scanned).toBe(2n);
    expect(result.total).toBe(2n);
    expect(result.found).toBe(2n);
    expect(result.nextMintedIndex).toBe(3n);
    expect(saveRelationshipChildDependenciesMock).toHaveBeenCalledTimes(2);
    expect(saveRelationshipChildDependenciesMock).toHaveBeenNthCalledWith(1, {
      contractId: 'SP123.xtrata-v2-1-0',
      childId: 10n,
      parentIds: [5n]
    });
    expect(saveRelationshipChildDependenciesMock).toHaveBeenNthCalledWith(2, {
      contractId: 'SP123.xtrata-v2-1-0',
      childId: 11n,
      parentIds: [6n, 5n]
    });
    expect(saveRelationshipSyncCursorMock).toHaveBeenLastCalledWith({
      contractId: 'SP123.xtrata-v2-1-0',
      nextMintedIndex: 3n
    });
    expect(progress).toEqual([
      { scanned: 1n, total: 2n, found: 1n },
      { scanned: 2n, total: 2n, found: 2n }
    ]);
  });

  it('supports cancellation and persists progress', async () => {
    let cancel = false;
    const client = makeClient({
      getMintedCount: vi.fn().mockResolvedValue(3n),
      getMintedId: vi
        .fn()
        .mockResolvedValueOnce(2n)
        .mockResolvedValueOnce(3n),
      getDependencies: vi
        .fn()
        .mockResolvedValueOnce([1n])
        .mockResolvedValueOnce([1n])
    });

    const result = await syncRelationshipIndex({
      client,
      contractId: 'SP123.xtrata-v2-1-0',
      senderAddress: 'SPTEST',
      shouldCancel: () => cancel,
      onProgress: () => {
        cancel = true;
      }
    });

    expect(result.cancelled).toBe(true);
    expect(result.scanned).toBe(1n);
    expect(result.nextMintedIndex).toBe(1n);
    expect(saveRelationshipSyncCursorMock).toHaveBeenLastCalledWith({
      contractId: 'SP123.xtrata-v2-1-0',
      nextMintedIndex: 1n
    });
  });

  it('skips dependency reads at or below the parent id floor', async () => {
    const getDependencies = vi
      .fn()
      .mockResolvedValueOnce([8n]);
    const client = makeClient({
      getMintedCount: vi.fn().mockResolvedValue(3n),
      getMintedId: vi
        .fn()
        .mockResolvedValueOnce(5n)
        .mockResolvedValueOnce(8n)
        .mockResolvedValueOnce(9n),
      getDependencies
    });

    const result = await syncRelationshipIndex({
      client,
      contractId: 'SP123.xtrata-v2-1-0',
      senderAddress: 'SPTEST',
      parentId: 8n
    });

    expect(result.scanned).toBe(3n);
    expect(result.total).toBe(3n);
    expect(result.found).toBe(1n);
    expect(getDependencies).toHaveBeenCalledTimes(1);
    expect(getDependencies).toHaveBeenCalledWith(9n, 'SPTEST');
    expect(saveRelationshipChildDependenciesMock).toHaveBeenCalledTimes(1);
    expect(saveRelationshipChildDependenciesMock).toHaveBeenCalledWith({
      contractId: 'SP123.xtrata-v2-1-0',
      childId: 9n,
      parentIds: [8n]
    });
  });
});
