import { createHash } from "crypto";
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const xtrataContract = `${deployer}.xtrata-v2-1-0`;
const xstContract = `${deployer}.xst-token-v1-1`;
const mime = "text/plain";

function computeFinalHash(chunksHex: string[]) {
  let running = Buffer.alloc(32, 0);
  for (const chunkHex of chunksHex) {
    const chunk = Buffer.from(chunkHex, "hex");
    const digest = createHash("sha256");
    digest.update(Buffer.concat([running, chunk]));
    running = digest.digest();
  }
  return running.toString("hex");
}

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

function unwrapUInt(result: any) {
  expect(result.type).toBe(ClarityType.UInt);
  return result.value as bigint;
}

function expectNone(result: any) {
  expect(result.type).toBe(ClarityType.OptionalNone);
}

function expectSome(result: any) {
  expect(result.type).toBe(ClarityType.OptionalSome);
  return result.value;
}

function setNextId(value: bigint) {
  return simnet.callPublicFn(
    xtrataContract,
    "set-next-id",
    [Cl.uint(value)],
    deployer
  ).result;
}

function unpauseXtrata() {
  return simnet.callPublicFn(
    xtrataContract,
    "set-paused",
    [Cl.bool(false)],
    deployer
  ).result;
}

function beginInscription(sender: string, expectedHash: string, size: number, totalChunks: number) {
  return simnet.callPublicFn(
    xtrataContract,
    "begin-inscription",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(size),
      Cl.uint(totalChunks),
    ],
    sender
  ).result;
}

function addChunkBatch(sender: string, expectedHash: string, chunksHex: string[]) {
  return simnet.callPublicFn(
    xtrataContract,
    "add-chunk-batch",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
    ],
    sender
  ).result;
}

function sealInscription(sender: string, expectedHash: string, tokenUri: string) {
  return simnet.callPublicFn(
    xtrataContract,
    "seal-inscription",
    [Cl.bufferFromHex(expectedHash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function sealRecursive(
  sender: string,
  expectedHash: string,
  tokenUri: string,
  dependencies: bigint[]
) {
  return simnet.callPublicFn(
    xtrataContract,
    "seal-recursive",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(tokenUri),
      Cl.list(dependencies.map((dep) => Cl.uint(dep))),
    ],
    sender
  ).result;
}

function mintToken(sender: string, chunkHex: string, tokenUri: string) {
  const expectedHash = computeFinalHash([chunkHex]);
  const size = chunkHex.length / 2;
  unwrapOk(beginInscription(sender, expectedHash, size, 1));
  unwrapOk(addChunkBatch(sender, expectedHash, [chunkHex]));
  const seal = sealInscription(sender, expectedHash, tokenUri);
  return unwrapUInt(unwrapOk(seal));
}

function mintTokenRecursive(
  sender: string,
  chunkHex: string,
  tokenUri: string,
  dependencies: bigint[]
) {
  const expectedHash = computeFinalHash([chunkHex]);
  const size = chunkHex.length / 2;
  unwrapOk(beginInscription(sender, expectedHash, size, 1));
  unwrapOk(addChunkBatch(sender, expectedHash, [chunkHex]));
  const seal = sealRecursive(sender, expectedHash, tokenUri, dependencies);
  return unwrapUInt(unwrapOk(seal));
}

describe("xst-token-v1.1 lineage bonus", () => {
  it("does not start emissions before inscription #1000", () => {
    unwrapOk(setNextId(1n));
    unwrapOk(unpauseXtrata());
    mintToken(wallet1, "01", "ipfs://xst/1");

    unwrapOk(simnet.callPublicFn(xstContract, "update-emissions", [], wallet1).result);
    const start = unwrapOk(
      simnet.callReadOnlyFn(xstContract, "get-emissions-start-block", [], deployer).result
    );
    expectNone(start);
  });

  it("starts emissions at inscription #1000", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    mintToken(wallet1, "02", "ipfs://xst/1000");

    unwrapOk(simnet.callPublicFn(xstContract, "update-emissions", [], wallet1).result);
    const start = unwrapOk(
      simnet.callReadOnlyFn(xstContract, "get-emissions-start-block", [], deployer).result
    );
    expectSome(start);
  });

  it("registers owner + participant weights together", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(wallet1, "03", "ipfs://xst/1000");

    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(tokenId)], wallet1).result
    );

    const registeredCount = unwrapUInt(
      unwrapOk(simnet.callReadOnlyFn(xstContract, "get-registered-count", [], deployer).result)
    );
    expect(registeredCount).toBe(1n);

    const participantCount = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-participant-count",
          [Cl.standardPrincipal(wallet1)],
          deployer
        ).result
      )
    );
    expect(participantCount).toBe(1n);

    const participantWeight = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-participant-weight",
          [Cl.standardPrincipal(wallet1)],
          deployer
        ).result
      )
    );
    expect(participantWeight).toBe(1n);
  });

  it("accrues owner and participant rewards", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(wallet1, "04", "ipfs://xst/1000");
    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(tokenId)], wallet1).result
    );

    simnet.mineEmptyBlocks(10);

    const ownerPending = unwrapUInt(
      unwrapOk(
        simnet.callPublicFn(xstContract, "claim-owner", [Cl.uint(tokenId)], wallet1).result
      )
    );
    expect(ownerPending > 0n).toBe(true);

    const participantPending = unwrapUInt(
      unwrapOk(simnet.callPublicFn(xstContract, "claim-participant", [], wallet1).result)
    );
    expect(participantPending > 0n).toBe(true);
  });

  it("does not double-register inscriptions", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(wallet1, "05", "ipfs://xst/1000");

    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(tokenId)], wallet1).result
    );
    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(tokenId)], wallet1).result
    );

    const registeredCount = unwrapUInt(
      unwrapOk(simnet.callReadOnlyFn(xstContract, "get-registered-count", [], deployer).result)
    );
    expect(registeredCount).toBe(1n);

    const participantCount = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-participant-count",
          [Cl.standardPrincipal(wallet1)],
          deployer
        ).result
      )
    );
    expect(participantCount).toBe(1n);
  });

  it("updates participant counts after transfer and settles prior owner", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(wallet1, "06", "ipfs://xst/1000");

    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(tokenId)], wallet1).result
    );
    simnet.mineEmptyBlocks(5);

    const beforeBalance = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-balance",
          [Cl.standardPrincipal(wallet1)],
          deployer
        ).result
      )
    );

    unwrapOk(
      simnet.callPublicFn(
        xtrataContract,
        "transfer",
        [Cl.uint(tokenId), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      ).result
    );

    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(tokenId)], wallet2).result
    );

    const afterBalance = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-balance",
          [Cl.standardPrincipal(wallet1)],
          deployer
        ).result
      )
    );
    expect(afterBalance >= beforeBalance).toBe(true);

    const wallet1Count = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-participant-count",
          [Cl.standardPrincipal(wallet1)],
          deployer
        ).result
      )
    );
    const wallet2Count = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-participant-count",
          [Cl.standardPrincipal(wallet2)],
          deployer
        ).result
      )
    );
    expect(wallet1Count).toBe(0n);
    expect(wallet2Count).toBe(1n);

    const wallet1Pending = unwrapUInt(
      unwrapOk(simnet.callPublicFn(xstContract, "claim-participant", [], wallet1).result)
    );
    expect(wallet1Pending).toBe(0n);
  });

  it("batch registration handles duplicates and updates sqrt weight", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    const tokenA = mintToken(wallet1, "07", "ipfs://xst/1000");
    const tokenB = mintToken(wallet1, "08", "ipfs://xst/1001");
    const tokenC = mintToken(wallet1, "09", "ipfs://xst/1002");
    const tokenD = mintToken(wallet1, "0a", "ipfs://xst/1003");

    const result = unwrapOk(
      simnet.callPublicFn(
        xstContract,
        "register-inscriptions",
        [Cl.list([Cl.uint(tokenA), Cl.uint(tokenA), Cl.uint(tokenB), Cl.uint(tokenC), Cl.uint(tokenD)])],
        wallet1
      ).result
    );
    const registered = unwrapUInt(result);
    expect(registered).toBe(4n);

    const participantWeight = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-participant-weight",
          [Cl.standardPrincipal(wallet1)],
          deployer
        ).result
      )
    );
    expect(participantWeight).toBe(2n);
  });

  it("applies lineage bonus from max-tier parent", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    const parentHigh = mintToken(wallet1, "0b", "ipfs://xst/parent-high");
    const parentLow = mintToken(wallet1, "0c", "ipfs://xst/parent-low");

    const child = mintTokenRecursive(wallet1, "0d", "ipfs://xst/child", [parentLow, parentHigh]);

    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(child)], wallet1).result
    );

    const parentValue = expectSome(
      simnet.callReadOnlyFn(xstContract, "get-inscription-parent", [Cl.uint(child)], deployer).result
    );
    const parentId = unwrapUInt(parentValue);
    expect(parentId).toBe(parentHigh);

    const bonus = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-inscription-lineage-bonus",
          [Cl.uint(child)],
          deployer
        ).result
      )
    );
    expect(bonus).toBe(40n);

    const weightOpt = unwrapOk(
      simnet.callReadOnlyFn(xstContract, "get-inscription-weight", [Cl.uint(child)], deployer).result
    );
    const weight = unwrapUInt(expectSome(weightOpt));
    expect(weight).toBe(680n);

    const childCount = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(xstContract, "get-parent-child-count", [Cl.uint(parentHigh)], deployer)
          .result
      )
    );
    expect(childCount).toBe(1n);
  });

  it("diminishes lineage bonus as child count increases", () => {
    unwrapOk(setNextId(1000n));
    unwrapOk(unpauseXtrata());
    const parent = mintToken(wallet1, "0e", "ipfs://xst/parent");

    const child1 = mintTokenRecursive(wallet1, "0f", "ipfs://xst/child-1", [parent]);
    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(child1)], wallet1).result
    );

    const child2 = mintTokenRecursive(wallet1, "10", "ipfs://xst/child-2", [parent]);
    unwrapOk(
      simnet.callPublicFn(xstContract, "register-inscription", [Cl.uint(child2)], wallet1).result
    );

    const bonus1 = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-inscription-lineage-bonus",
          [Cl.uint(child1)],
          deployer
        ).result
      )
    );
    const bonus2 = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(
          xstContract,
          "get-inscription-lineage-bonus",
          [Cl.uint(child2)],
          deployer
        ).result
      )
    );
    expect(bonus1).toBe(40n);
    expect(bonus2).toBe(39n);

    const childCount = unwrapUInt(
      unwrapOk(
        simnet.callReadOnlyFn(xstContract, "get-parent-child-count", [Cl.uint(parent)], deployer)
          .result
      )
    );
    expect(childCount).toBe(2n);
  });
});
