import { describe, expect, it } from "vitest";
import type { XtrataClient } from "../../contract/client";
import type { TokenSummary } from "../types";
import { fetchParents, findChildrenFromKnownTokens, scanChildren } from "../relationships";

const makeClient = (
  resolver: (id: bigint) => bigint[] | Promise<bigint[]>
): XtrataClient =>
  ({
    getDependencies: async (id: bigint) => resolver(id)
  }) as unknown as XtrataClient;

describe("viewer relationships", () => {
  it("fetchParents returns exact dependency ids", async () => {
    const client = makeClient(() => [1n, 2n, 3n]);
    const parents = await fetchParents({
      client,
      tokenId: 10n,
      senderAddress: "SP123"
    });
    expect(parents).toEqual([1n, 2n, 3n]);
  });

  it("finds children from known token summaries", () => {
    const tokens: TokenSummary[] = [
      { id: 1n, owner: null, tokenUri: null, meta: null, svgDataUri: null },
      { id: 2n, owner: null, tokenUri: null, meta: null, svgDataUri: null },
      { id: 3n, owner: null, tokenUri: null, meta: null, svgDataUri: null }
    ];
    const map = new Map<string, bigint[]>([
      ["2", [1n]],
      ["3", [4n, 1n]]
    ]);
    const children = findChildrenFromKnownTokens(tokens, 1n, map);
    expect(children).toEqual([2n, 3n]);
  });

  it("scanChildren discovers all matches", async () => {
    const client = makeClient((id) => (id === 2n || id === 4n ? [9n] : []));
    const children = await scanChildren({
      client,
      parentId: 9n,
      lastTokenId: 5n,
      senderAddress: "SP123",
      concurrency: 2
    });
    expect(children).toEqual([2n, 4n]);
  });

  it("scanChildren supports cancellation", async () => {
    const client = makeClient((id) => (id <= 1n ? [5n] : []));
    let cancel = false;
    const children = await scanChildren({
      client,
      parentId: 5n,
      lastTokenId: 4n,
      senderAddress: "SP123",
      concurrency: 1,
      shouldCancel: () => cancel,
      onProgress: (progress) => {
        if (progress.scanned >= 2n) {
          cancel = true;
        }
      }
    });
    expect(children).toEqual([0n, 1n]);
  });

  it("scanChildren respects concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const client = makeClient(async (id) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return id === 3n ? [7n] : [];
    });

    await scanChildren({
      client,
      parentId: 7n,
      lastTokenId: 6n,
      senderAddress: "SP123",
      concurrency: 2
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
