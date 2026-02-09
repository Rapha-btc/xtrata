import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearMintAttempt, loadMintAttempt, saveMintAttempt } from "../attempt-cache";

type StorageRecord = Record<string, string>;

const contractId = "SP123.fake-contract";

const baseAttempt = {
  contractId,
  expectedHashHex: "deadbeef",
  fileName: "test.txt",
  mimeType: "text/plain",
  totalBytes: 12,
  totalChunks: 1,
  batchSize: 1,
  tokenUri: "ipfs://example",
  updatedAt: 1234
};

const installLocalStorage = (store: StorageRecord) => {
  const localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    }
  };
  (globalThis as any).window = { localStorage };
  (globalThis as any).indexedDB = undefined;
};

const resetGlobals = (originalWindow: any, originalIndexedDb: any) => {
  if (originalWindow === undefined) {
    delete (globalThis as any).window;
  } else {
    (globalThis as any).window = originalWindow;
  }
  (globalThis as any).indexedDB = originalIndexedDb;
};

describe("mint attempt cache", () => {
  let originalWindow: any;
  let originalIndexedDb: any;
  let store: StorageRecord;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    originalIndexedDb = (globalThis as any).indexedDB;
    store = {};
    installLocalStorage(store);
  });

  afterEach(() => {
    resetGlobals(originalWindow, originalIndexedDb);
  });

  it("saves and loads attempt with dependency ids", async () => {
    const attempt = { ...baseAttempt, dependencyIds: ["1", "2", "3"] };
    await saveMintAttempt(attempt);

    const loaded = await loadMintAttempt(contractId);
    expect(loaded).toEqual(attempt);
  });

  it("loads legacy attempt without dependency ids", async () => {
    store[`xtrata.mint.attempt.${contractId}`] = JSON.stringify(baseAttempt);

    const loaded = await loadMintAttempt(contractId);
    expect(loaded).toEqual(baseAttempt);
  });

  it("clears dependency ids on clear", async () => {
    const attempt = { ...baseAttempt, dependencyIds: ["9"] };
    await saveMintAttempt(attempt);

    await clearMintAttempt(contractId);
    const loaded = await loadMintAttempt(contractId);
    expect(loaded).toBeNull();
  });

  it("roundtrips via localStorage fallback path", async () => {
    const attempt = { ...baseAttempt, dependencyIds: ["7", "8"] };
    await saveMintAttempt(attempt);
    const raw = store[`xtrata.mint.attempt.${contractId}`];
    expect(raw).toBeTruthy();

    const loaded = await loadMintAttempt(contractId);
    expect(loaded).toEqual(attempt);
  });
});
