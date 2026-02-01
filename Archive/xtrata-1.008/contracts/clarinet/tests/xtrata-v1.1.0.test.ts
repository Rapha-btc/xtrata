import { createHash } from "crypto";
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const contract = `${deployer}.xtrata-v1-1-0`;
const mime = "text/plain";
const zeroHash = "00".repeat(32);
const chunkSize = 16384;
const maxTotalChunks = 2048;
const maxTotalSize = chunkSize * maxTotalChunks;
const feeMin = 1000;
const feeMax = 1000000;
const uploadExpiryBlocks = 4320;

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

function unwrapOptionalTuple(result: any) {
  expect(result.type).toBe(ClarityType.OptionalSome);
  const tuple = result.value;
  expect(tuple.type).toBe(ClarityType.Tuple);
  return tuple.value as Record<string, any>;
}

function unwrapUInt(result: any) {
  expect(result.type).toBe(ClarityType.UInt);
  return result.value as bigint;
}

function beginInscription(sender: string, expectedHash: string, size: number, totalChunks: number) {
  return simnet.callPublicFn(
    contract,
    "begin-inscription",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(size),
      Cl.uint(totalChunks),
    ],
    sender
  );
}

function beginOrGet(sender: string, expectedHash: string, size: number, totalChunks: number) {
  return simnet.callPublicFn(
    contract,
    "begin-or-get",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(size),
      Cl.uint(totalChunks),
    ],
    sender
  );
}

function addChunkBatch(sender: string, expectedHash: string, chunksHex: string[]) {
  return simnet.callPublicFn(
    contract,
    "add-chunk-batch",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
    ],
    sender
  );
}

function sealInscription(sender: string, expectedHash: string, tokenUri: string) {
  return simnet.callPublicFn(
    contract,
    "seal-inscription",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(tokenUri),
    ],
    sender
  );
}

function sealInscriptionBatch(
  sender: string,
  items: { hash: string; tokenUri: string }[]
) {
  return simnet.callPublicFn(
    contract,
    "seal-inscription-batch",
    [
      Cl.list(
        items.map((item) =>
          Cl.tuple({
            hash: Cl.bufferFromHex(item.hash),
            "token-uri": Cl.stringAscii(item.tokenUri),
          })
        )
      ),
    ],
    sender
  );
}

function sealRecursive(sender: string, expectedHash: string, tokenUri: string, deps: number[]) {
  return simnet.callPublicFn(
    contract,
    "seal-recursive",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(tokenUri),
      Cl.list(deps.map((dep) => Cl.uint(dep))),
    ],
    sender
  );
}

function abandonUpload(sender: string, expectedHash: string) {
  return simnet.callPublicFn(
    contract,
    "abandon-upload",
    [Cl.bufferFromHex(expectedHash)],
    sender
  );
}

function purgeExpiredChunkBatch(sender: string, expectedHash: string, owner: string, indexes: number[]) {
  return simnet.callPublicFn(
    contract,
    "purge-expired-chunk-batch",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.standardPrincipal(owner),
      Cl.list(indexes.map((index) => Cl.uint(index))),
    ],
    sender
  );
}

function setPaused(sender: string, value: boolean) {
  return simnet.callPublicFn(
    contract,
    "set-paused",
    [Cl.bool(value)],
    sender
  );
}

function unpauseForPublic() {
  const result = setPaused(deployer, false);
  expect(result.result).toBeOk(Cl.bool(true));
}

function setFeeUnit(sender: string, value: number) {
  return simnet.callPublicFn(
    contract,
    "set-fee-unit",
    [Cl.uint(value)],
    sender
  );
}

function setRoyaltyRecipient(sender: string, recipient: string) {
  return simnet.callPublicFn(
    contract,
    "set-royalty-recipient",
    [Cl.standardPrincipal(recipient)],
    sender
  );
}

function transferContractOwnership(sender: string, newOwner: string) {
  return simnet.callPublicFn(
    contract,
    "transfer-contract-ownership",
    [Cl.standardPrincipal(newOwner)],
    sender
  );
}

function transferToken(sender: string, id: number, recipient: string) {
  return simnet.callPublicFn(
    contract,
    "transfer",
    [
      Cl.uint(id),
      Cl.standardPrincipal(sender),
      Cl.standardPrincipal(recipient),
    ],
    sender
  );
}

describe("xtrata-v1.1.0 contract", () => {
  it("starts paused and only owner can inscribe", () => {
    const pausedAfter = simnet.callReadOnlyFn(contract, "is-paused", [], deployer);
    expect(pausedAfter.result).toBeOk(Cl.bool(true));

    const chunkHex = "00";
    const expectedHash = computeFinalHash([chunkHex]);

    const nonOwnerBegin = beginInscription(wallet1, expectedHash, 1, 1);
    expect(nonOwnerBegin.result).toBeErr(Cl.uint(109));

    const ownerBegin = beginInscription(deployer, expectedHash, 1, 1);
    expect(ownerBegin.result).toBeOk(Cl.bool(true));

    const nonOwnerBeginOrGet = beginOrGet(wallet1, expectedHash, 1, 1);
    expect(nonOwnerBeginOrGet.result).toBeErr(Cl.uint(109));

    const ownerAdd = addChunkBatch(deployer, expectedHash, [chunkHex]);
    expect(ownerAdd.result).toBeOk(Cl.bool(true));

    const ownerSeal = sealInscription(deployer, expectedHash, "ipfs://xtrata/owner-paused");
    expect(ownerSeal.result).toBeOk(Cl.uint(0));

    const abandonHash = computeFinalHash(["01"]);
    const abandonBegin = beginInscription(deployer, abandonHash, 1, 1);
    expect(abandonBegin.result).toBeOk(Cl.bool(true));

    const ownerAbandon = abandonUpload(deployer, abandonHash);
    expect(ownerAbandon.result).toBeOk(Cl.bool(true));

    const nonOwnerAbandon = abandonUpload(wallet1, abandonHash);
    expect(nonOwnerAbandon.result).toBeErr(Cl.uint(101));
  });

  it("mints, stores metadata, and exposes readers", () => {
    unpauseForPublic();
    const chunkHex = "00";
    const expectedHash = computeFinalHash([chunkHex]);
    const tokenUri = "ipfs://xtrata/0";

    const svgBefore = simnet.callReadOnlyFn(contract, "get-svg", [Cl.uint(0)], deployer);
    const svgBeforeValue = unwrapOk(svgBefore.result);
    expect(svgBeforeValue.type).toBe(ClarityType.OptionalNone);

    const uriBefore = simnet.callReadOnlyFn(contract, "get-token-uri", [Cl.uint(0)], deployer);
    expect(uriBefore.result).toBeOk(Cl.none());

    const ownerBefore = simnet.callReadOnlyFn(contract, "get-owner", [Cl.uint(0)], deployer);
    expect(ownerBefore.result).toBeOk(Cl.none());

    const begin = beginInscription(wallet1, expectedHash, 1, 1);
    expect(begin.result).toBeOk(Cl.bool(true));

    const add = addChunkBatch(wallet1, expectedHash, [chunkHex]);
    expect(add.result).toBeOk(Cl.bool(true));

    const seal = sealInscription(wallet1, expectedHash, tokenUri);
    expect(seal.result).toBeOk(Cl.uint(0));

    const owner = simnet.callReadOnlyFn(contract, "get-owner", [Cl.uint(0)], deployer);
    expect(owner.result).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));

    const meta = simnet.callReadOnlyFn(contract, "get-inscription-meta", [Cl.uint(0)], deployer);
    expect(meta.result).toBeSome(Cl.tuple({
      owner: Cl.standardPrincipal(wallet1),
      creator: Cl.standardPrincipal(wallet1),
      "mime-type": Cl.stringAscii(mime),
      "total-size": Cl.uint(1),
      "total-chunks": Cl.uint(1),
      sealed: Cl.bool(true),
      "final-hash": Cl.bufferFromHex(expectedHash),
    }));

    const uri = simnet.callReadOnlyFn(contract, "get-token-uri", [Cl.uint(0)], deployer);
    expect(uri.result).toBeOk(Cl.some(Cl.stringAscii(tokenUri)));

    const svgAfter = simnet.callReadOnlyFn(contract, "get-svg", [Cl.uint(0)], deployer);
    const svgValue = unwrapOk(svgAfter.result);
    expect(svgValue.type).toBe(ClarityType.OptionalSome);
    expect(svgValue.value.type).toBe(ClarityType.StringASCII);

    const svgDataUri = simnet.callReadOnlyFn(contract, "get-svg-data-uri", [Cl.uint(0)], deployer);
    const svgDataValue = unwrapOk(svgDataUri.result);
    expect(svgDataValue.type).toBe(ClarityType.OptionalSome);
    expect(svgDataValue.value.type).toBe(ClarityType.StringASCII);

    const idByHash = simnet.callReadOnlyFn(contract, "get-id-by-hash", [Cl.bufferFromHex(expectedHash)], deployer);
    expect(idByHash.result).toBeSome(Cl.uint(0));

    const chunk = simnet.callReadOnlyFn(contract, "get-chunk", [Cl.uint(0), Cl.uint(0)], deployer);
    expect(chunk.result).toBeSome(Cl.bufferFromHex(chunkHex));

    const chunkBatch = simnet.callReadOnlyFn(
      contract,
      "get-chunk-batch",
      [Cl.uint(0), Cl.list([Cl.uint(0), Cl.uint(1)])],
      deployer
    );
    expect(chunkBatch.result).toBeList([Cl.some(Cl.bufferFromHex(chunkHex)), Cl.none()]);

    const missingChunk = simnet.callReadOnlyFn(contract, "get-chunk", [Cl.uint(999), Cl.uint(0)], deployer);
    expect(missingChunk.result).toBeNone();

    const missingBatch = simnet.callReadOnlyFn(
      contract,
      "get-chunk-batch",
      [Cl.uint(999), Cl.list([Cl.uint(0)])],
      deployer
    );
    expect(missingBatch.result).toBeList([]);

    const lastId = simnet.callReadOnlyFn(contract, "get-last-token-id", [], deployer);
    expect(lastId.result).toBeOk(Cl.uint(0));

    const nextId = simnet.callReadOnlyFn(contract, "get-next-token-id", [], deployer);
    expect(nextId.result).toBeOk(Cl.uint(1));
  });

  it("supports resume and exposes upload state", () => {
    unpauseForPublic();
    const chunkHex = "10";
    const expectedHash = computeFinalHash([chunkHex]);

    const begin = beginInscription(wallet1, expectedHash, 1, 1);
    expect(begin.result).toBeOk(Cl.bool(true));

    const state = simnet.callReadOnlyFn(
      contract,
      "get-upload-state",
      [Cl.bufferFromHex(expectedHash), Cl.standardPrincipal(wallet1)],
      deployer
    );
    const stateData = unwrapOptionalTuple(state.result);
    expect(stateData["mime-type"]).toEqual(Cl.stringAscii(mime));
    expect(stateData["total-size"]).toEqual(Cl.uint(1));
    expect(stateData["total-chunks"]).toEqual(Cl.uint(1));
    expect(stateData["current-index"]).toEqual(Cl.uint(0));
    expect(stateData["running-hash"]).toEqual(Cl.bufferFromHex(zeroHash));
    expect(stateData["purge-index"]).toEqual(Cl.uint(0));
    expect(stateData["last-touched"].type).toBe(ClarityType.UInt);

    const pendingBefore = simnet.callReadOnlyFn(
      contract,
      "get-pending-chunk",
      [Cl.bufferFromHex(expectedHash), Cl.standardPrincipal(wallet1), Cl.uint(0)],
      deployer
    );
    expect(pendingBefore.result).toBeNone();

    const unauthorizedAdd = addChunkBatch(wallet2, expectedHash, [chunkHex]);
    expect(unauthorizedAdd.result).toBeErr(Cl.uint(101));

    const unauthorizedSeal = sealInscription(wallet2, expectedHash, "ipfs://xtrata/unauth");
    expect(unauthorizedSeal.result).toBeErr(Cl.uint(101));

    const unauthorizedAbandon = abandonUpload(wallet2, expectedHash);
    expect(unauthorizedAbandon.result).toBeErr(Cl.uint(101));

    const add = addChunkBatch(wallet1, expectedHash, [chunkHex]);
    expect(add.result).toBeOk(Cl.bool(true));

    const pendingAfter = simnet.callReadOnlyFn(
      contract,
      "get-pending-chunk",
      [Cl.bufferFromHex(expectedHash), Cl.standardPrincipal(wallet1), Cl.uint(0)],
      deployer
    );
    expect(pendingAfter.result).toBeSome(Cl.bufferFromHex(chunkHex));

    const stateAfter = simnet.callReadOnlyFn(
      contract,
      "get-upload-state",
      [Cl.bufferFromHex(expectedHash), Cl.standardPrincipal(wallet1)],
      deployer
    );
    const stateAfterData = unwrapOptionalTuple(stateAfter.result);
    expect(stateAfterData["current-index"]).toEqual(Cl.uint(1));
    expect(stateAfterData["running-hash"]).toEqual(Cl.bufferFromHex(expectedHash));

    const resume = beginInscription(wallet1, expectedHash, 1, 1);
    expect(resume.result).toBeOk(Cl.bool(true));

    const mismatch = beginInscription(wallet1, expectedHash, 2, 1);
    expect(mismatch.result).toBeErr(Cl.uint(102));
  });

  it("charges begin fee once on resume", () => {
    unpauseForPublic();
    const recipient = setRoyaltyRecipient(deployer, wallet2);
    expect(recipient.result).toBeOk(Cl.bool(true));

    const feeResult = simnet.callReadOnlyFn(contract, "get-fee-unit", [], deployer);
    const feeUnit = unwrapUInt(unwrapOk(feeResult.result));

    const chunkHex = "12";
    const expectedHash = computeFinalHash([chunkHex]);
    const balanceBefore = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0n;

    const begin = beginInscription(wallet1, expectedHash, 1, 1);
    expect(begin.result).toBeOk(Cl.bool(true));

    const balanceAfterBegin = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0n;
    expect(balanceAfterBegin - balanceBefore).toBe(feeUnit);

    const resume = beginInscription(wallet1, expectedHash, 1, 1);
    expect(resume.result).toBeOk(Cl.bool(true));

    const balanceAfterResume = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0n;
    expect(balanceAfterResume - balanceAfterBegin).toBe(0n);
  });

  it("enforces batch and size constraints", () => {
    unpauseForPublic();
    const zeroChunks = beginInscription(wallet1, computeFinalHash(["11"]), 1, 0);
    expect(zeroChunks.result).toBeErr(Cl.uint(102));

    const tooMany = beginInscription(wallet1, computeFinalHash(["12"]), 1, maxTotalChunks + 1);
    expect(tooMany.result).toBeErr(Cl.uint(102));

    const tooLarge = beginInscription(wallet1, computeFinalHash(["13"]), maxTotalSize + 1, 1);
    expect(tooLarge.result).toBeErr(Cl.uint(102));

    const tooLargeForChunks = beginInscription(wallet1, computeFinalHash(["15"]), chunkSize + 1, 1);
    expect(tooLargeForChunks.result).toBeErr(Cl.uint(102));

    const expectedHash = computeFinalHash(["14"]);
    beginInscription(wallet1, expectedHash, 1, 1);

    const emptyBatch = addChunkBatch(wallet1, expectedHash, []);
    expect(emptyBatch.result).toBeErr(Cl.uint(102));

    const overshoot = addChunkBatch(wallet1, expectedHash, ["00", "01"]);
    expect(overshoot.result).toBeErr(Cl.uint(102));
  });

  it("requires full upload and non-empty uri to seal", () => {
    unpauseForPublic();
    const chunks = ["aa", "bb"];
    const expectedHash = computeFinalHash(chunks);

    beginInscription(wallet1, expectedHash, 2, 2);
    addChunkBatch(wallet1, expectedHash, [chunks[0]]);

    const sealIncomplete = sealInscription(wallet1, expectedHash, "ipfs://xtrata/incomplete");
    expect(sealIncomplete.result).toBeErr(Cl.uint(102));

    addChunkBatch(wallet1, expectedHash, [chunks[1]]);

    const sealEmpty = sealInscription(wallet1, expectedHash, "");
    expect(sealEmpty.result).toBeErr(Cl.uint(107));

    const sealOk = sealInscription(wallet1, expectedHash, "ipfs://xtrata/complete");
    expect(sealOk.result).toBeOk(Cl.uint(0));

    const uri = simnet.callReadOnlyFn(contract, "get-token-uri", [Cl.uint(0)], deployer);
    expect(uri.result).toBeOk(Cl.some(Cl.stringAscii("ipfs://xtrata/complete")));
  });

  it("seals a batch of inscriptions with contiguous ids", () => {
    unpauseForPublic();
    const hashA = computeFinalHash(["01"]);
    const hashB = computeFinalHash(["02"]);

    beginInscription(wallet1, hashA, 1, 1);
    beginInscription(wallet1, hashB, 1, 1);

    addChunkBatch(wallet1, hashA, ["01"]);
    addChunkBatch(wallet1, hashB, ["02"]);

    const result = sealInscriptionBatch(wallet1, [
      { hash: hashA, tokenUri: "ipfs://xtrata/batch-a" },
      { hash: hashB, tokenUri: "ipfs://xtrata/batch-b" },
    ]);
    expect(result.result).toBeOk(Cl.tuple({ start: Cl.uint(0), count: Cl.uint(2) }));

    const owner0 = simnet.callReadOnlyFn(contract, "get-owner", [Cl.uint(0)], deployer);
    expect(owner0.result).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));
    const owner1 = simnet.callReadOnlyFn(contract, "get-owner", [Cl.uint(1)], deployer);
    expect(owner1.result).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));

    const nextId = simnet.callReadOnlyFn(contract, "get-next-token-id", [], deployer);
    expect(nextId.result).toBeOk(Cl.uint(2));
  });

  it("charges seal fees for each item in the batch", () => {
    unpauseForPublic();
    const recipient = setRoyaltyRecipient(deployer, wallet2);
    expect(recipient.result).toBeOk(Cl.bool(true));

    const feeResult = simnet.callReadOnlyFn(contract, "get-fee-unit", [], deployer);
    const feeUnit = unwrapUInt(unwrapOk(feeResult.result));

    const hashA = computeFinalHash(["03"]);
    const hashB = computeFinalHash(["04"]);

    beginInscription(wallet1, hashA, 1, 1);
    beginInscription(wallet1, hashB, 1, 1);
    addChunkBatch(wallet1, hashA, ["03"]);
    addChunkBatch(wallet1, hashB, ["04"]);

    const balanceBefore = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0n;

    const result = sealInscriptionBatch(wallet1, [
      { hash: hashA, tokenUri: "ipfs://xtrata/fee-a" },
      { hash: hashB, tokenUri: "ipfs://xtrata/fee-b" },
    ]);
    expect(result.result).toBeOk(Cl.tuple({ start: Cl.uint(0), count: Cl.uint(2) }));

    const balanceAfter = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0n;
    const expectedPerSeal = feeUnit * (1n + 1n);
    const expectedDelta = expectedPerSeal * 2n;
    expect(balanceAfter - balanceBefore).toBe(expectedDelta);
  });

  it("rejects duplicate hashes in a seal batch", () => {
    unpauseForPublic();
    const hash = computeFinalHash(["05"]);

    beginInscription(wallet1, hash, 1, 1);
    addChunkBatch(wallet1, hash, ["05"]);

    const result = sealInscriptionBatch(wallet1, [
      { hash, tokenUri: "ipfs://xtrata/dup-a" },
      { hash, tokenUri: "ipfs://xtrata/dup-b" },
    ]);
    expect(result.result).toBeErr(Cl.uint(114));
  });

  it("records dependencies on recursive seal", () => {
    unpauseForPublic();
    const hash0 = computeFinalHash(["21"]);
    beginInscription(wallet1, hash0, 1, 1);
    addChunkBatch(wallet1, hash0, ["21"]);
    sealInscription(wallet1, hash0, "ipfs://xtrata/dep-0");

    const hash1 = computeFinalHash(["22"]);
    beginInscription(wallet1, hash1, 1, 1);
    addChunkBatch(wallet1, hash1, ["22"]);
    sealInscription(wallet1, hash1, "ipfs://xtrata/dep-1");

    const hash2 = computeFinalHash(["23"]);
    beginInscription(wallet1, hash2, 1, 1);
    addChunkBatch(wallet1, hash2, ["23"]);

    const seal = sealRecursive(wallet1, hash2, "ipfs://xtrata/dep-2", [0, 1]);
    expect(seal.result).toBeOk(Cl.uint(2));

    const deps = simnet.callReadOnlyFn(contract, "get-dependencies", [Cl.uint(2)], deployer);
    expect(deps.result).toBeList([Cl.uint(0), Cl.uint(1)]);

    const depsEmpty = simnet.callReadOnlyFn(contract, "get-dependencies", [Cl.uint(0)], deployer);
    expect(depsEmpty.result).toBeList([]);
  });

  it("abandon expires uploads and purge removes pending chunks", () => {
    unpauseForPublic();
    const chunks = ["31", "32"];
    const expectedHash = computeFinalHash(chunks);

    beginInscription(wallet1, expectedHash, 2, 2);
    addChunkBatch(wallet1, expectedHash, [chunks[0]]);

    const notExpired = purgeExpiredChunkBatch(wallet2, expectedHash, wallet1, [0, 1]);
    expect(notExpired.result).toBeErr(Cl.uint(113));

    simnet.mineEmptyBlocks(uploadExpiryBlocks + 1);

    const abandon = abandonUpload(wallet1, expectedHash);
    expect(abandon.result).toBeOk(Cl.bool(true));

    const addExpired = addChunkBatch(wallet1, expectedHash, [chunks[1]]);
    expect(addExpired.result).toBeErr(Cl.uint(112));

    const wrongIndexes = purgeExpiredChunkBatch(wallet2, expectedHash, wallet1, [1]);
    expect(wrongIndexes.result).toBeErr(Cl.uint(102));

    const firstPurge = purgeExpiredChunkBatch(wallet2, expectedHash, wallet1, [0]);
    expect(firstPurge.result).toBeOk(Cl.bool(true));

    const stateAfterFirst = simnet.callReadOnlyFn(
      contract,
      "get-upload-state",
      [Cl.bufferFromHex(expectedHash), Cl.standardPrincipal(wallet1)],
      deployer
    );
    const stateAfterFirstData = unwrapOptionalTuple(stateAfterFirst.result);
    expect(stateAfterFirstData["purge-index"]).toEqual(Cl.uint(1));

    const secondPurge = purgeExpiredChunkBatch(wallet2, expectedHash, wallet1, [1]);
    expect(secondPurge.result).toBeOk(Cl.bool(true));

    const state = simnet.callReadOnlyFn(
      contract,
      "get-upload-state",
      [Cl.bufferFromHex(expectedHash), Cl.standardPrincipal(wallet1)],
      deployer
    );
    expect(state.result).toBeNone();

    const pending = simnet.callReadOnlyFn(
      contract,
      "get-pending-chunk",
      [Cl.bufferFromHex(expectedHash), Cl.standardPrincipal(wallet1), Cl.uint(0)],
      deployer
    );
    expect(pending.result).toBeNone();
  });

  it("enforces admin controls and ownership transfer", () => {
    const admin = simnet.callReadOnlyFn(contract, "get-admin", [], deployer);
    expect(admin.result).toBeOk(Cl.standardPrincipal(deployer));

    const pausedAfter = simnet.callReadOnlyFn(contract, "is-paused", [], deployer);
    expect(pausedAfter.result).toBeOk(Cl.bool(true));

    const nonAdminPause = setPaused(wallet1, true);
    expect(nonAdminPause.result).toBeErr(Cl.uint(100));

    const nonAdminRoyalty = setRoyaltyRecipient(wallet1, wallet2);
    expect(nonAdminRoyalty.result).toBeErr(Cl.uint(100));

    const nonAdminTransfer = transferContractOwnership(wallet1, wallet1);
    expect(nonAdminTransfer.result).toBeErr(Cl.uint(100));

    const transfer = transferContractOwnership(deployer, wallet1);
    expect(transfer.result).toBeOk(Cl.bool(true));

    const adminAfter = simnet.callReadOnlyFn(contract, "get-admin", [], deployer);
    expect(adminAfter.result).toBeOk(Cl.standardPrincipal(wallet1));

    const pause = setPaused(wallet1, true);
    expect(pause.result).toBeOk(Cl.bool(true));

    const paused = simnet.callReadOnlyFn(contract, "is-paused", [], deployer);
    expect(paused.result).toBeOk(Cl.bool(true));

    const oldAdminFee = setFeeUnit(deployer, 200000);
    expect(oldAdminFee.result).toBeErr(Cl.uint(100));
  });

  it("enforces fee bounds and admin gating", () => {
    const fee = simnet.callReadOnlyFn(contract, "get-fee-unit", [], deployer);
    expect(fee.result).toBeOk(Cl.uint(100000));

    const nonAdmin = setFeeUnit(wallet1, 200000);
    expect(nonAdmin.result).toBeErr(Cl.uint(100));

    const tooHighRelative = setFeeUnit(deployer, 300000);
    expect(tooHighRelative.result).toBeErr(Cl.uint(110));

    const okUp = setFeeUnit(deployer, 200000);
    expect(okUp.result).toBeOk(Cl.bool(true));

    const tooLowRelative = setFeeUnit(deployer, 10000);
    expect(tooLowRelative.result).toBeErr(Cl.uint(110));

    const tooLowAbsolute = setFeeUnit(deployer, feeMin - 1);
    expect(tooLowAbsolute.result).toBeErr(Cl.uint(110));

    const tooHighAbsolute = setFeeUnit(deployer, feeMax + 1);
    expect(tooHighAbsolute.result).toBeErr(Cl.uint(110));

    const okDown = setFeeUnit(deployer, 20000);
    expect(okDown.result).toBeOk(Cl.bool(true));

    const feeAfter = simnet.callReadOnlyFn(contract, "get-fee-unit", [], deployer);
    expect(feeAfter.result).toBeOk(Cl.uint(20000));
  });

  it("transfers fees to the royalty recipient across batches", () => {
    unpauseForPublic();
    const recipient = setRoyaltyRecipient(deployer, wallet2);
    expect(recipient.result).toBeOk(Cl.bool(true));

    const royalty = simnet.callReadOnlyFn(contract, "get-royalty-recipient", [], deployer);
    expect(royalty.result).toBeOk(Cl.standardPrincipal(wallet2));

    const feeResult = simnet.callReadOnlyFn(contract, "get-fee-unit", [], deployer);
    const feeUnit = unwrapUInt(unwrapOk(feeResult.result));

    const totalChunks = 51;
    const chunks = Array.from({ length: totalChunks }, () => "00");
    const expectedHash = computeFinalHash(chunks);

    const balanceBefore = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0n;

    const begin = beginInscription(wallet1, expectedHash, totalChunks, totalChunks);
    expect(begin.result).toBeOk(Cl.bool(true));

    const addFirst = addChunkBatch(wallet1, expectedHash, chunks.slice(0, 50));
    expect(addFirst.result).toBeOk(Cl.bool(true));

    const addSecond = addChunkBatch(wallet1, expectedHash, chunks.slice(50));
    expect(addSecond.result).toBeOk(Cl.bool(true));

    const seal = sealInscription(wallet1, expectedHash, "ipfs://xtrata/fees");
    expect(seal.result).toBeOk(Cl.uint(0));

    const balanceAfter = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0n;

    const batches = 2n;
    const expectedDelta = feeUnit + (feeUnit * (1n + batches));
    expect(balanceAfter - balanceBefore).toBe(expectedDelta);
  });

  it("returns canonical id from begin-or-get and rejects duplicates", () => {
    unpauseForPublic();
    const chunkHex = "01";
    const expectedHash = computeFinalHash([chunkHex]);
    const tokenUri = "ipfs://xtrata/1";

    const start = beginOrGet(wallet1, expectedHash, 1, 1);
    expect(start.result).toBeOk(Cl.none());

    addChunkBatch(wallet1, expectedHash, [chunkHex]);
    const seal = sealInscription(wallet1, expectedHash, tokenUri);
    expect(seal.result).toBeOk(Cl.uint(0));

    const getCanonical = beginOrGet(wallet1, expectedHash, 1, 1);
    expect(getCanonical.result).toBeOk(Cl.some(Cl.uint(0)));

    const getCanonicalOther = beginOrGet(wallet2, expectedHash, 1, 1);
    expect(getCanonicalOther.result).toBeOk(Cl.some(Cl.uint(0)));

    const missingId = simnet.callReadOnlyFn(contract, "get-id-by-hash", [Cl.bufferFromHex(zeroHash)], deployer);
    expect(missingId.result).toBeNone();

    const duplicate = beginInscription(wallet1, expectedHash, 1, 1);
    expect(duplicate.result).toBeErr(Cl.uint(114));
  });

  it("exposes canonical lookup helpers", () => {
    unpauseForPublic();
    const hash = computeFinalHash(["aa"]);

    beginInscription(wallet1, hash, 1, 1);
    addChunkBatch(wallet1, hash, ["aa"]);
    const seal = sealInscription(wallet1, hash, "ipfs://xtrata/lookup");
    expect(seal.result).toBeOk(Cl.uint(0));

    const byHash = simnet.callReadOnlyFn(
      contract,
      "get-id-by-hash",
      [Cl.bufferFromHex(hash)],
      deployer
    );
    expect(byHash.result).toBeSome(Cl.uint(0));

    const exists = simnet.callReadOnlyFn(
      contract,
      "inscription-exists",
      [Cl.uint(0)],
      deployer
    );
    expect(exists.result).toBeOk(Cl.bool(true));

    const hashResult = simnet.callReadOnlyFn(
      contract,
      "get-inscription-hash",
      [Cl.uint(0)],
      deployer
    );
    expect(hashResult.result).toBeSome(Cl.bufferFromHex(hash));

    const rawUri = simnet.callReadOnlyFn(
      contract,
      "get-token-uri-raw",
      [Cl.uint(0)],
      deployer
    );
    expect(rawUri.result).toBeSome(Cl.stringAscii("ipfs://xtrata/lookup"));

    const creator = simnet.callReadOnlyFn(
      contract,
      "get-inscription-creator",
      [Cl.uint(0)],
      deployer
    );
    expect(creator.result).toBeSome(Cl.standardPrincipal(wallet1));

    const size = simnet.callReadOnlyFn(
      contract,
      "get-inscription-size",
      [Cl.uint(0)],
      deployer
    );
    expect(size.result).toBeSome(Cl.uint(1));

    const chunks = simnet.callReadOnlyFn(
      contract,
      "get-inscription-chunks",
      [Cl.uint(0)],
      deployer
    );
    expect(chunks.result).toBeSome(Cl.uint(1));

    const sealed = simnet.callReadOnlyFn(
      contract,
      "is-inscription-sealed",
      [Cl.uint(0)],
      deployer
    );
    expect(sealed.result).toBeSome(Cl.bool(true));
  });

  it("rejects seal when the hash mismatches", () => {
    unpauseForPublic();
    const expectedHash = computeFinalHash(["00"]);
    const badChunkHex = "01";

    beginInscription(wallet1, expectedHash, 1, 1);
    addChunkBatch(wallet1, expectedHash, [badChunkHex]);

    const seal = sealInscription(wallet1, expectedHash, "ipfs://xtrata/bad");
    expect(seal.result).toBeErr(Cl.uint(103));
  });

  it("blocks inscription writes when paused but allows transfers", () => {
    unpauseForPublic();
    const chunkHex = "04";
    const expectedHash = computeFinalHash([chunkHex]);
    beginInscription(wallet1, expectedHash, 1, 1);
    addChunkBatch(wallet1, expectedHash, [chunkHex]);
    sealInscription(wallet1, expectedHash, "ipfs://xtrata/pause-0");

    const blockedHash = computeFinalHash(["05"]);
    const pending = beginInscription(wallet1, blockedHash, 1, 1);
    expect(pending.result).toBeOk(Cl.bool(true));

    const paused = setPaused(deployer, true);
    expect(paused.result).toBeOk(Cl.bool(true));

    const blockedBegin = beginInscription(wallet1, computeFinalHash(["06"]), 1, 1);
    expect(blockedBegin.result).toBeErr(Cl.uint(109));

    const blockedBeginOrGet = beginOrGet(wallet1, computeFinalHash(["07"]), 1, 1);
    expect(blockedBeginOrGet.result).toBeErr(Cl.uint(109));

    const blockedAdd = addChunkBatch(wallet1, blockedHash, ["05"]);
    expect(blockedAdd.result).toBeErr(Cl.uint(109));

    const blockedSeal = sealInscription(wallet1, blockedHash, "ipfs://xtrata/pause-blocked");
    expect(blockedSeal.result).toBeErr(Cl.uint(109));

    const blockedAbandon = abandonUpload(wallet1, blockedHash);
    expect(blockedAbandon.result).toBeErr(Cl.uint(109));

    const transfer = transferToken(wallet1, 0, wallet2);
    expect(transfer.result).toBeOk(Cl.bool(true));

    const owner = simnet.callReadOnlyFn(contract, "get-owner", [Cl.uint(0)], deployer);
    expect(owner.result).toBeOk(Cl.some(Cl.standardPrincipal(wallet2)));

    const meta = simnet.callReadOnlyFn(contract, "get-inscription-meta", [Cl.uint(0)], deployer);
    const metaData = unwrapOptionalTuple(meta.result);
    expect(metaData.owner).toEqual(Cl.standardPrincipal(wallet2));
  });

  it("rejects unauthorized transfers", () => {
    unpauseForPublic();
    const chunkHex = "06";
    const expectedHash = computeFinalHash([chunkHex]);
    beginInscription(wallet1, expectedHash, 1, 1);
    addChunkBatch(wallet1, expectedHash, [chunkHex]);
    sealInscription(wallet1, expectedHash, "ipfs://xtrata/transfer");

    const badTransfer = transferToken(wallet2, 0, wallet2);
    expect(badTransfer.result).toBeErr(Cl.uint(100));
  });
});
