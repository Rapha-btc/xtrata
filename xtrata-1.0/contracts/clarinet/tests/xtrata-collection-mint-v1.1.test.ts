import { createHash } from "crypto";
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const minter = accounts.get("wallet_3")!;
const minterTwo = accounts.get("wallet_4")!;

const v1Contract = `${deployer}.xtrata-v1-1-1`;
const v2Contract = `${deployer}.xtrata-v2-1-0`;
const mintContract = `${deployer}.xtrata-collection-mint-v1-1`;

const coreContractPrincipal = Cl.contractPrincipal(deployer, "xtrata-v2-1-0");
const wrongCorePrincipal = Cl.contractPrincipal(deployer, "xtrata-v1-1-1");
const mime = "text/plain";

const ALLOWLIST_INHERIT = 0;
const ALLOWLIST_PUBLIC = 1;
const ALLOWLIST_GLOBAL = 2;
const ALLOWLIST_PHASE = 3;

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

function expectErr(result: any, code: bigint | number) {
  expect(result).toBeErr(Cl.uint(code));
}

function beginMint(
  sender: string,
  hash: string,
  coreContract = coreContractPrincipal,
  totalSize = 1,
  totalChunks = 1
) {
  return simnet.callPublicFn(
    mintContract,
    "mint-begin",
    [
      coreContract,
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.uint(totalChunks),
    ],
    sender
  ).result;
}

function addChunk(sender: string, hash: string, chunkHex: string) {
  return simnet.callPublicFn(
    mintContract,
    "mint-add-chunk-batch",
    [coreContractPrincipal, Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex(chunkHex)])],
    sender
  ).result;
}

function sealMint(sender: string, hash: string, tokenUri: string) {
  return simnet.callPublicFn(
    mintContract,
    "mint-seal",
    [coreContractPrincipal, Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function beginCoreMint(sender: string, hash: string, totalSize = 1, totalChunks = 1) {
  return simnet.callPublicFn(
    v2Contract,
    "begin-inscription",
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.uint(totalChunks),
    ],
    sender
  ).result;
}

function addCoreChunk(sender: string, hash: string, chunkHex: string) {
  return simnet.callPublicFn(
    v2Contract,
    "add-chunk-batch",
    [Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex(chunkHex)])],
    sender
  ).result;
}

function sealCoreMint(sender: string, hash: string, tokenUri: string) {
  return simnet.callPublicFn(
    v2Contract,
    "seal-inscription",
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function getTokenUriRaw(tokenId: bigint, sender: string = minter) {
  return simnet.callReadOnlyFn(
    v2Contract,
    "get-token-uri-raw",
    [Cl.uint(tokenId)],
    sender
  ).result;
}

function configureOpenMint(maxSupply: bigint = 50n, mintPrice: bigint = 0n) {
  unwrapOk(simnet.callPublicFn(v2Contract, "set-paused", [Cl.bool(false)], deployer).result);
  unwrapOk(simnet.callPublicFn(mintContract, "set-max-supply", [Cl.uint(maxSupply)], deployer).result);
  unwrapOk(simnet.callPublicFn(mintContract, "set-mint-price", [Cl.uint(mintPrice)], deployer).result);
  unwrapOk(simnet.callPublicFn(mintContract, "set-splits", [Cl.uint(0), Cl.uint(0), Cl.uint(0)], deployer).result);
  unwrapOk(simnet.callPublicFn(mintContract, "set-paused", [Cl.bool(false)], deployer).result);
}

describe("xtrata-collection-mint-v1.1", () => {
  it("locks minting to xtrata-v2.1.0", () => {
    configureOpenMint();

    const hash = computeFinalHash(["aa"]);
    const blocked = beginMint(minter, hash, wrongCorePrincipal);
    expectErr(blocked, 112);
  });

  it("enforces phase windows", () => {
    configureOpenMint();

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(999_999),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-active-phase",
      [Cl.uint(1)],
      deployer
    ).result);

    const hash = computeFinalHash(["ab"]);
    const blocked = beginMint(minter, hash);
    expectErr(blocked, 114);
  });

  it("supports phase allowlist mode and per-phase wallet caps", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(1),
        Cl.uint(2),
        Cl.uint(ALLOWLIST_PHASE),
      ],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase-allowlist",
      [Cl.uint(1), Cl.standardPrincipal(minter), Cl.uint(1)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-active-phase",
      [Cl.uint(1)],
      deployer
    ).result);

    const hashA = computeFinalHash(["01"]);
    const hashB = computeFinalHash(["02"]);
    const hashC = computeFinalHash(["03"]);

    unwrapOk(beginMint(minter, hashA));
    expectErr(beginMint(minterTwo, hashB), 106);
    expectErr(beginMint(minter, hashC), 107);
  });

  it("supports inherited global allowlist mode in phases", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-allowlist-enabled",
      [Cl.bool(true)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-allowlist",
      [Cl.standardPrincipal(minter), Cl.uint(1)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_INHERIT),
      ],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-active-phase",
      [Cl.uint(1)],
      deployer
    ).result);

    unwrapOk(beginMint(minter, computeFinalHash(["10"])));
    expectErr(beginMint(minterTwo, computeFinalHash(["11"])), 106);
  });

  it("enforces per-phase supply cap", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(1),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-active-phase",
      [Cl.uint(1)],
      deployer
    ).result);

    unwrapOk(beginMint(minter, computeFinalHash(["20"])));
    expectErr(beginMint(minterTwo, computeFinalHash(["21"])), 115);
  });

  it("allows user cancellation and supports expired reservation release", () => {
    configureOpenMint(10n, 0n);

    const hashA = computeFinalHash(["30"]);
    unwrapOk(beginMint(minter, hashA));
    unwrapOk(simnet.callPublicFn(
      mintContract,
      "cancel-reservation",
      [Cl.bufferFromHex(hashA)],
      minter
    ).result);

    const statsAfterCancel = simnet.callReadOnlyFn(
      mintContract,
      "get-wallet-stats",
      [Cl.standardPrincipal(minter)],
      minter
    ).result;
    expect(statsAfterCancel).toBeOk(
      Cl.tuple({
        minted: Cl.uint(0),
        reserved: Cl.uint(0),
      })
    );

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-reservation-expiry-blocks",
      [Cl.uint(1)],
      deployer
    ).result);

    const hashB = computeFinalHash(["31"]);
    unwrapOk(beginMint(minter, hashB));

    // Advance one block before expiry check.
    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-allowlist-enabled",
      [Cl.bool(false)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "release-expired-reservation",
      [Cl.standardPrincipal(minter), Cl.bufferFromHex(hashB)],
      deployer
    ).result);

    const reservedCount = simnet.callReadOnlyFn(
      mintContract,
      "get-reserved-count",
      [],
      deployer
    ).result;
    expect(reservedCount).toBeOk(Cl.uint(0));
  });

  it("rejects release-expired when reservation is not old enough", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-reservation-expiry-blocks",
      [Cl.uint(100)],
      deployer
    ).result);

    const hash = computeFinalHash(["32"]);
    unwrapOk(beginMint(minter, hash));

    const notExpired = simnet.callPublicFn(
      mintContract,
      "release-expired-reservation",
      [Cl.standardPrincipal(minter), Cl.bufferFromHex(hash)],
      deployer
    ).result;
    expectErr(notExpired, 119);
  });

  it("uses two-step ownership transfer", () => {
    unwrapOk(simnet.callPublicFn(
      mintContract,
      "transfer-contract-ownership",
      [Cl.standardPrincipal(wallet1)],
      deployer
    ).result);

    const wrongAcceptor = simnet.callPublicFn(
      mintContract,
      "accept-contract-ownership",
      [],
      wallet2
    ).result;
    expectErr(wrongAcceptor, 100);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "accept-contract-ownership",
      [],
      wallet1
    ).result);

    const oldOwnerBlocked = simnet.callPublicFn(
      mintContract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result;
    expectErr(oldOwnerBlocked, 100);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-paused",
      [Cl.bool(false)],
      wallet1
    ).result);
  });

  it("supports operator and finance role separation", () => {
    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-operator-admin",
      [Cl.standardPrincipal(wallet1)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-finance-admin",
      [Cl.standardPrincipal(wallet2)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      wallet1
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-splits",
      [Cl.uint(4000), Cl.uint(3000), Cl.uint(3000)],
      wallet2
    ).result);

    const operatorCannotSetSplits = simnet.callPublicFn(
      mintContract,
      "set-splits",
      [Cl.uint(3000), Cl.uint(3000), Cl.uint(3000)],
      wallet1
    ).result;
    expectErr(operatorCannotSetSplits, 100);

    const financeCannotSetPhase = simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(2),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      wallet2
    ).result;
    expectErr(financeCannotSetPhase, 100);
  });

  it("records minted index and mint context", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      deployer
    ).result);
    unwrapOk(simnet.callPublicFn(mintContract, "set-active-phase", [Cl.uint(1)], deployer).result);

    const hash = computeFinalHash(["40"]);
    unwrapOk(beginMint(minter, hash));
    unwrapOk(addChunk(minter, hash, "40"));
    const sealResult = sealMint(minter, hash, "data:text/plain,forty");
    const tokenId = unwrapUInt(unwrapOk(sealResult));

    const indexCount = simnet.callReadOnlyFn(
      mintContract,
      "get-minted-index-count",
      [],
      minter
    ).result;
    expect(indexCount).toBeOk(Cl.uint(1));

    const mintedId0 = simnet.callReadOnlyFn(
      mintContract,
      "get-minted-id",
      [Cl.uint(0)],
      minter
    ).result;
    expect(mintedId0).toBeSome(Cl.tuple({ "token-id": Cl.uint(tokenId) }));

    const context = simnet.callReadOnlyFn(
      mintContract,
      "get-token-mint-context",
      [Cl.uint(tokenId)],
      minter
    ).result;
    expect(context.type).toBe(ClarityType.OptionalSome);
  });

  it("rejects mixed-phase batch seals", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      deployer
    ).result);
    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(2),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      deployer
    ).result);

    const hashA = computeFinalHash(["50"]);
    const hashB = computeFinalHash(["51"]);

    unwrapOk(simnet.callPublicFn(mintContract, "set-active-phase", [Cl.uint(1)], deployer).result);
    unwrapOk(beginMint(minter, hashA));
    unwrapOk(addChunk(minter, hashA, "50"));

    unwrapOk(simnet.callPublicFn(mintContract, "set-active-phase", [Cl.uint(2)], deployer).result);
    unwrapOk(beginMint(minter, hashB));
    unwrapOk(addChunk(minter, hashB, "51"));

    const mixedBatch = simnet.callPublicFn(
      mintContract,
      "mint-seal-batch",
      [coreContractPrincipal, Cl.list([
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii("data:text/plain,a") }),
        Cl.tuple({ hash: Cl.bufferFromHex(hashB), "token-uri": Cl.stringAscii("data:text/plain,b") }),
      ])],
      minter
    ).result;
    expectErr(mixedBatch, 111);
  });

  it("supports batch seals and indexed results in one phase", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      deployer
    ).result);
    unwrapOk(simnet.callPublicFn(mintContract, "set-active-phase", [Cl.uint(1)], deployer).result);

    const hashA = computeFinalHash(["60"]);
    const hashB = computeFinalHash(["61"]);
    unwrapOk(beginMint(minter, hashA));
    unwrapOk(beginMint(minter, hashB));
    unwrapOk(addChunk(minter, hashA, "60"));
    unwrapOk(addChunk(minter, hashB, "61"));

    const batch = simnet.callPublicFn(
      mintContract,
      "mint-seal-batch",
      [coreContractPrincipal, Cl.list([
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii("data:text/plain,sixty") }),
        Cl.tuple({ hash: Cl.bufferFromHex(hashB), "token-uri": Cl.stringAscii("data:text/plain,sixty-one") }),
      ])],
      minter
    ).result;
    expect(batch.type).toBe(ClarityType.ResponseOk);

    const indexCount = simnet.callReadOnlyFn(
      mintContract,
      "get-minted-index-count",
      [],
      minter
    ).result;
    expect(indexCount).toBeOk(Cl.uint(2));

    const minted0 = simnet.callReadOnlyFn(mintContract, "get-minted-id", [Cl.uint(0)], minter).result;
    const minted1 = simnet.callReadOnlyFn(mintContract, "get-minted-id", [Cl.uint(1)], minter).result;
    expect(minted0.type).toBe(ClarityType.OptionalSome);
    expect(minted1.type).toBe(ClarityType.OptionalSome);
  });

  it("applies default parent dependencies on mint-seal", () => {
    configureOpenMint(10n, 0n);

    const parentHash = computeFinalHash(["80"]);
    unwrapOk(beginCoreMint(minter, parentHash));
    unwrapOk(addCoreChunk(minter, parentHash, "80"));
    const parentId = unwrapUInt(
      unwrapOk(sealCoreMint(minter, parentHash, "data:text/plain,parent"))
    );

    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        "set-default-dependencies",
        [Cl.list([Cl.uint(parentId)])],
        deployer
      ).result
    );

    const childHash = computeFinalHash(["81"]);
    unwrapOk(beginMint(minter, childHash));
    unwrapOk(addChunk(minter, childHash, "81"));
    const childId = unwrapUInt(
      unwrapOk(sealMint(minter, childHash, "data:text/plain,child"))
    );

    const dependencies = simnet.callReadOnlyFn(
      v2Contract,
      "get-dependencies",
      [Cl.uint(childId)],
      minter
    ).result;
    expect(dependencies).toEqual(Cl.list([Cl.uint(parentId)]));
  });

  it("rejects mint-seal-batch when default parent dependencies are set", () => {
    configureOpenMint(10n, 0n);

    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        "set-default-dependencies",
        [Cl.list([Cl.uint(1)])],
        deployer
      ).result
    );

    const hashA = computeFinalHash(["90"]);
    const hashB = computeFinalHash(["91"]);

    unwrapOk(beginMint(minter, hashA));
    unwrapOk(beginMint(minter, hashB));
    unwrapOk(addChunk(minter, hashA, "90"));
    unwrapOk(addChunk(minter, hashB, "91"));

    const result = simnet.callPublicFn(
      mintContract,
      "mint-seal-batch",
      [coreContractPrincipal, Cl.list([
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii("data:text/plain,a") }),
        Cl.tuple({ hash: Cl.bufferFromHex(hashB), "token-uri": Cl.stringAscii("data:text/plain,b") }),
      ])],
      minter
    ).result;
    expectErr(result, 120);
  });

  it("locks admin mutability after finalize", () => {
    configureOpenMint(1n, 0n);

    const hash = computeFinalHash(["70"]);
    unwrapOk(beginMint(minter, hash));
    unwrapOk(addChunk(minter, hash, "70"));
    unwrapOk(sealMint(minter, hash, "data:text/plain,final"));

    unwrapOk(simnet.callPublicFn(mintContract, "finalize", [], deployer).result);

    const setPhaseBlocked = simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PUBLIC),
      ],
      deployer
    ).result;
    expectErr(setPhaseBlocked, 108);

    const metadataBlocked = simnet.callPublicFn(
      mintContract,
      "set-collection-metadata",
      [
        Cl.stringAscii("Collection"),
        Cl.stringAscii("XTRA"),
        Cl.stringAscii("ipfs://collection"),
        Cl.stringAscii("Desc"),
        Cl.uint(0),
      ],
      deployer
    ).result;
    expectErr(metadataBlocked, 108);

    const mintBlocked = beginMint(minterTwo, computeFinalHash(["71"]));
    expectErr(mintBlocked, 108);
  });

  it("supports metadata and batch allowlist administration", () => {
    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-collection-metadata",
      [
        Cl.stringAscii("Artist Collection"),
        Cl.stringAscii("ARTX"),
        Cl.stringAscii("ipfs://artist"),
        Cl.stringAscii("Flexible collection"),
        Cl.uint(12345),
      ],
      deployer
    ).result);

    const metadata = simnet.callReadOnlyFn(
      mintContract,
      "get-collection-metadata",
      [],
      deployer
    ).result;
    expect(metadata).toBeOk(
      Cl.tuple({
        name: Cl.stringAscii("Artist Collection"),
        symbol: Cl.stringAscii("ARTX"),
        "base-uri": Cl.stringAscii("ipfs://artist"),
        description: Cl.stringAscii("Flexible collection"),
        "reveal-block": Cl.uint(12345),
      })
    );

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-allowlist-batch",
      [Cl.list([
        Cl.tuple({ owner: Cl.standardPrincipal(wallet1), allowance: Cl.uint(2) }),
        Cl.tuple({ owner: Cl.standardPrincipal(wallet2), allowance: Cl.uint(3) }),
      ])],
      deployer
    ).result);

    const globalEntry = simnet.callReadOnlyFn(
      mintContract,
      "get-allowlist-entry",
      [Cl.standardPrincipal(wallet2)],
      deployer
    ).result;
    expect(globalEntry).toBeSome(Cl.tuple({ allowance: Cl.uint(3) }));

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase",
      [
        Cl.uint(1),
        Cl.bool(true),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(0),
        Cl.uint(ALLOWLIST_PHASE),
      ],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-phase-allowlist-batch",
      [Cl.uint(1), Cl.list([
        Cl.tuple({ owner: Cl.standardPrincipal(wallet1), allowance: Cl.uint(1) }),
        Cl.tuple({ owner: Cl.standardPrincipal(wallet2), allowance: Cl.uint(2) }),
      ])],
      deployer
    ).result);

    const phaseEntry = simnet.callReadOnlyFn(
      mintContract,
      "get-phase-allowlist-entry",
      [Cl.uint(1), Cl.standardPrincipal(wallet2)],
      deployer
    ).result;
    expect(phaseEntry).toBeSome(Cl.tuple({ allowance: Cl.uint(2) }));
  });

  it("uses registered and default token URI precedence", () => {
    configureOpenMint(10n, 0n);

    const defaultUri = "data:text/plain,project-default";
    const registeredUri = "data:text/plain,hash-registered";

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-default-token-uri",
      [Cl.stringAscii(defaultUri)],
      deployer
    ).result);

    const hashA = computeFinalHash(["a1"]);
    const hashB = computeFinalHash(["a2"]);
    const hashC = computeFinalHash(["a3"]);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-registered-token-uri",
      [Cl.bufferFromHex(hashA), Cl.stringAscii(registeredUri)],
      deployer
    ).result);

    const registeredEntry = simnet.callReadOnlyFn(
      mintContract,
      "get-registered-token-uri",
      [Cl.bufferFromHex(hashA)],
      deployer
    ).result;
    expect(registeredEntry).toBeSome(Cl.tuple({ "token-uri": Cl.stringAscii(registeredUri) }));

    const defaultRead = simnet.callReadOnlyFn(
      mintContract,
      "get-default-token-uri",
      [],
      deployer
    ).result;
    expect(defaultRead).toBeOk(Cl.stringAscii(defaultUri));

    unwrapOk(beginMint(minter, hashA));
    unwrapOk(addChunk(minter, hashA, "a1"));
    const sealA = sealMint(minter, hashA, "data:text/plain,user-a");
    const tokenA = unwrapUInt(unwrapOk(sealA));

    unwrapOk(beginMint(minter, hashB));
    unwrapOk(addChunk(minter, hashB, "a2"));
    const sealB = sealMint(minter, hashB, "data:text/plain,user-b");
    const tokenB = unwrapUInt(unwrapOk(sealB));

    expect(getTokenUriRaw(tokenA)).toBeSome(Cl.stringAscii(registeredUri));
    expect(getTokenUriRaw(tokenB)).toBeSome(Cl.stringAscii(defaultUri));

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-default-token-uri",
      [Cl.stringAscii("")],
      deployer
    ).result);

    unwrapOk(beginMint(minter, hashC));
    unwrapOk(addChunk(minter, hashC, "a3"));
    const sealC = sealMint(minter, hashC, "data:text/plain,user-c");
    const tokenC = unwrapUInt(unwrapOk(sealC));

    expect(getTokenUriRaw(tokenC)).toBeSome(Cl.stringAscii("data:text/plain,user-c"));
  });

  it("resolves registered and default token URIs during batch seal", () => {
    configureOpenMint(10n, 0n);

    const defaultUri = "data:text/plain,batch-default";
    const registeredUri = "data:text/plain,batch-registered";
    const hashA = computeFinalHash(["b1"]);
    const hashB = computeFinalHash(["b2"]);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-default-token-uri",
      [Cl.stringAscii(defaultUri)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-registered-token-uri-batch",
      [Cl.list([
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii(registeredUri) }),
      ])],
      deployer
    ).result);

    unwrapOk(beginMint(minter, hashA));
    unwrapOk(beginMint(minter, hashB));
    unwrapOk(addChunk(minter, hashA, "b1"));
    unwrapOk(addChunk(minter, hashB, "b2"));

    const batchResult = simnet.callPublicFn(
      mintContract,
      "mint-seal-batch",
      [coreContractPrincipal, Cl.list([
        Cl.tuple({ hash: Cl.bufferFromHex(hashA), "token-uri": Cl.stringAscii("data:text/plain,user-a") }),
        Cl.tuple({ hash: Cl.bufferFromHex(hashB), "token-uri": Cl.stringAscii("data:text/plain,user-b") }),
      ])],
      minter
    ).result;

    unwrapOk(batchResult);
    expect(getTokenUriRaw(0n)).toBeSome(Cl.stringAscii(registeredUri));
    expect(getTokenUriRaw(1n)).toBeSome(Cl.stringAscii(defaultUri));
  });

  it("keeps compatibility with legacy function shapes", () => {
    configureOpenMint(5n, 0n);

    const hash = computeFinalHash(["80"]);
    unwrapOk(beginMint(minter, hash, coreContractPrincipal));
    unwrapOk(addChunk(minter, hash, "80"));
    const seal = sealMint(minter, hash, "data:text/plain,compat");
    const tokenId = unwrapUInt(unwrapOk(seal));

    const owner = simnet.callReadOnlyFn(
      v2Contract,
      "get-owner",
      [Cl.uint(tokenId)],
      minter
    ).result;
    expect(owner).toBeOk(Cl.some(Cl.standardPrincipal(minter)));

    const wrongCore = beginMint(minterTwo, computeFinalHash(["81"]), Cl.contractPrincipal(deployer, "xtrata-v1-1-1"));
    expectErr(wrongCore, 112);
  });

  it("exposes locked core contract in read-only state", () => {
    const core = simnet.callReadOnlyFn(
      mintContract,
      "get-locked-core-contract",
      [],
      deployer
    ).result;
    expect(core).toBeOk(Cl.contractPrincipal(deployer, "xtrata-v2-1-0"));
  });

  it("keeps v1.1 independent from v1 core usage", () => {
    configureOpenMint(2n, 0n);

    const hash = computeFinalHash(["90"]);
    const blocked = beginMint(minter, hash, Cl.contractPrincipal(deployer, "xtrata-v1-1-1"));
    expectErr(blocked, 112);

    // Ensure v1 contract still functions independently in the test environment.
    const v1Hash = computeFinalHash(["91"]);
    unwrapOk(simnet.callPublicFn(
      v1Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);
    unwrapOk(simnet.callPublicFn(
      v1Contract,
      "begin-inscription",
      [Cl.bufferFromHex(v1Hash), Cl.stringAscii(mime), Cl.uint(1), Cl.uint(1)],
      minter
    ).result);
  });
});
