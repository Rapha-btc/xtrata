import { createHash } from "crypto";
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const v1Contract = `${deployer}.xtrata-v1-1-1`;
const v2Contract = `${deployer}.xtrata-v2-1-0`;
const mintContract = `${deployer}.xtrata-collection-mint-v1-0`;
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

function beginInscription(sender: string, expectedHash: string, size: number, totalChunks: number) {
  return simnet.callPublicFn(
    v1Contract,
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
    v1Contract,
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
    v1Contract,
    "seal-inscription",
    [Cl.bufferFromHex(expectedHash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function mintV1Token(sender: string, chunkHex: string, tokenUri: string) {
  const expectedHash = computeFinalHash([chunkHex]);
  const size = chunkHex.length / 2;
  unwrapOk(beginInscription(sender, expectedHash, size, 1));
  unwrapOk(addChunkBatch(sender, expectedHash, [chunkHex]));
  const seal = sealInscription(sender, expectedHash, tokenUri);
  return unwrapUInt(unwrapOk(seal));
}

describe("xtrata-v2.1.0", () => {
  it("rejects non-allowlisted callers while paused", () => {
    const hash = computeFinalHash(["01"]);
    const result = simnet.callPublicFn(
      v2Contract,
      "begin-inscription",
      [
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      wallet1
    ).result;
    expect(result).toBeErr(Cl.uint(109));
  });

  it("sets next-id only once", () => {
    const first = simnet.callPublicFn(
      v2Contract,
      "set-next-id",
      [Cl.uint(42)],
      deployer
    ).result;
    unwrapOk(first);

    const second = simnet.callPublicFn(
      v2Contract,
      "set-next-id",
      [Cl.uint(99)],
      deployer
    ).result;
    expect(second.type).toBe(ClarityType.ResponseErr);
  });

  it("allows allowlisted callers while paused", () => {
    const allow = simnet.callPublicFn(
      v2Contract,
      "set-allowed-caller",
      [Cl.contractPrincipal(deployer, "xtrata-collection-mint-v1-0"), Cl.bool(true)],
      deployer
    ).result;
    unwrapOk(allow);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-max-supply",
      [Cl.uint(50)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const hash = computeFinalHash(["00"]);
    const begin = simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      wallet1
    ).result;
    unwrapOk(begin);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-add-chunk-batch",
      [Cl.contractPrincipal(deployer, "xtrata-v2-1-0"), Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex("00")])],
      wallet1
    ).result);

    const seal = simnet.callPublicFn(
      mintContract,
      "mint-seal",
      [Cl.contractPrincipal(deployer, "xtrata-v2-1-0"), Cl.bufferFromHex(hash), Cl.stringAscii("data:text/plain,zero")],
      wallet1
    ).result;
    unwrapOk(seal);
  });

  it("migrates from v1", () => {
    unwrapOk(simnet.callPublicFn(
      v1Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const tokenId = mintV1Token(wallet2, "ff", "data:text/plain,legacy");

    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const migrate = simnet.callPublicFn(
      v2Contract,
      "migrate-from-v1",
      [Cl.uint(tokenId)],
      wallet2
    ).result;
    unwrapOk(migrate);

    const v2Owner = simnet.callReadOnlyFn(
      v2Contract,
      "get-owner",
      [Cl.uint(tokenId)],
      wallet2
    ).result;
    expect(v2Owner).toBeOk(Cl.some(Cl.standardPrincipal(wallet2)));

    const v1Owner = simnet.callReadOnlyFn(
      v1Contract,
      "get-owner",
      [Cl.uint(tokenId)],
      wallet2
    ).result;
    expect(v1Owner).toBeOk(
      Cl.some(Cl.contractPrincipal(deployer, "xtrata-v2-1-0"))
    );
  });

  it("seals a batch directly in core", () => {
    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const startId = unwrapUInt(unwrapOk(simnet.callReadOnlyFn(
      v2Contract,
      "get-next-token-id",
      [],
      wallet1
    ).result));

    const hashA = computeFinalHash(["aa"]);
    const hashB = computeFinalHash(["bb"]);

    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "begin-inscription",
      [
        Cl.bufferFromHex(hashA),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      wallet1
    ).result);

    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "begin-inscription",
      [
        Cl.bufferFromHex(hashB),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      wallet1
    ).result);

    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "add-chunk-batch",
      [Cl.bufferFromHex(hashA), Cl.list([Cl.bufferFromHex("aa")])],
      wallet1
    ).result);

    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "add-chunk-batch",
      [Cl.bufferFromHex(hashB), Cl.list([Cl.bufferFromHex("bb")])],
      wallet1
    ).result);

    const batch = simnet.callPublicFn(
      v2Contract,
      "seal-inscription-batch",
      [Cl.list([
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii("data:text/plain,a") }),
        Cl.tuple({ hash: Cl.bufferFromHex(hashB), "token-uri": Cl.stringAscii("data:text/plain,b") }),
      ])],
      wallet1
    ).result;
    unwrapOk(batch);

    const ownerA = simnet.callReadOnlyFn(
      v2Contract,
      "get-owner",
      [Cl.uint(startId)],
      wallet1
    ).result;
    expect(ownerA).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));

    const ownerB = simnet.callReadOnlyFn(
      v2Contract,
      "get-owner",
      [Cl.uint(startId + 1n)],
      wallet1
    ).result;
    expect(ownerB).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));
  });

  it("rejects duplicate hashes in core batch seal", () => {
    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const hashA = computeFinalHash(["cc"]);

    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "begin-inscription",
      [
        Cl.bufferFromHex(hashA),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      wallet1
    ).result);

    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "add-chunk-batch",
      [Cl.bufferFromHex(hashA), Cl.list([Cl.bufferFromHex("cc")])],
      wallet1
    ).result);

    const dup = simnet.callPublicFn(
      v2Contract,
      "seal-inscription-batch",
      [Cl.list([
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii("data:text/plain,a") }),
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii("data:text/plain,a") }),
      ])],
      wallet1
    ).result;
    expect(dup.type).toBe(ClarityType.ResponseErr);
  });
});
