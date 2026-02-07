import { createHash } from "crypto";
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const artist = accounts.get("wallet_1")!;
const marketplace = accounts.get("wallet_2")!;
const minter = accounts.get("wallet_3")!;
const minterTwo = accounts.get("wallet_4")!;

const v2Contract = `${deployer}.xtrata-v2-1-0`;
const mintContract = `${deployer}.xtrata-collection-mint-v1-0`;
const xtrataContractPrincipal = Cl.contractPrincipal(deployer, "xtrata-v2-1-0");
const mime = "text/plain";
const mintPrice = 1_000_000n;

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

function getStxBalance(principal: string) {
  return simnet.getAssetsMap().get("STX")?.get(principal) || 0n;
}

describe("xtrata-collection-mint-v1.0", () => {
  it("rejects minting while paused", () => {
    const hash = computeFinalHash(["aa"]);
    const result = simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result;
    expect(result).toBeErr(Cl.uint(103));
  });

  it("enforces max supply and supports reservation release", () => {
    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-max-supply",
      [Cl.uint(1)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-mint-price",
      [Cl.uint(0)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-splits",
      [Cl.uint(0), Cl.uint(0), Cl.uint(0)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const hashA = computeFinalHash(["ab"]);
    const hashB = computeFinalHash(["cd"]);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashA),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result);

    const blocked = simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashB),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minterTwo
    ).result;
    expect(blocked).toBeErr(Cl.uint(104));

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "release-reservation",
      [Cl.standardPrincipal(minter), Cl.bufferFromHex(hashA)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashB),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minterTwo
    ).result);
  });

  it("rejects invalid split totals", () => {
    const result = simnet.callPublicFn(
      mintContract,
      "set-splits",
      [Cl.uint(9000), Cl.uint(2000), Cl.uint(0)],
      deployer
    ).result;
    expect(result).toBeErr(Cl.uint(102));
  });

  it("charges splits once and mints via xtrata", () => {
    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-max-supply",
      [Cl.uint(50)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-mint-price",
      [Cl.uint(mintPrice)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-recipients",
      [
        Cl.standardPrincipal(artist),
        Cl.standardPrincipal(marketplace),
        Cl.standardPrincipal(deployer),
      ],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-splits",
      [Cl.uint(8000), Cl.uint(1000), Cl.uint(1000)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const hash = computeFinalHash(["00"]);

    const artistBefore = getStxBalance(artist);
    const marketBefore = getStxBalance(marketplace);
    const operatorBefore = getStxBalance(deployer);
    const minterBefore = getStxBalance(minter);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result);

    const artistAfter = getStxBalance(artist);
    const marketAfter = getStxBalance(marketplace);
    const operatorAfter = getStxBalance(deployer);
    const minterAfter = getStxBalance(minter);

    expect(artistAfter - artistBefore).toBe(800_000n);
    expect(marketAfter - marketBefore).toBe(100_000n);
    expect(operatorAfter - operatorBefore).toBe(200_000n);
    expect(minterBefore - minterAfter).toBe(1_100_000n);

    const repeatBefore = getStxBalance(minter);
    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result);
    const repeatAfter = getStxBalance(minter);
    expect(repeatBefore - repeatAfter).toBe(0n);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-add-chunk-batch",
      [xtrataContractPrincipal, Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex("00")])],
      minter
    ).result);

    const sealResult = simnet.callPublicFn(
      mintContract,
      "mint-seal",
      [xtrataContractPrincipal, Cl.bufferFromHex(hash), Cl.stringAscii("data:text/plain,zero")],
      minter
    ).result;
    const tokenId = unwrapOk(sealResult);
    expect(tokenId.type).toBe(ClarityType.UInt);

    const owner = simnet.callReadOnlyFn(
      v2Contract,
      "get-owner",
      [Cl.uint(tokenId.value)],
      minter
    ).result;
    expect(owner).toBeOk(Cl.some(Cl.standardPrincipal(minter)));

    const mintedCount = simnet.callReadOnlyFn(
      mintContract,
      "get-minted-count",
      [],
      minter
    ).result;
    expect(mintedCount).toBeOk(Cl.uint(1));
  });

  it("enforces allowlist gating and allowance caps", () => {
    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-max-supply",
      [Cl.uint(5)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-mint-price",
      [Cl.uint(0)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-splits",
      [Cl.uint(0), Cl.uint(0), Cl.uint(0)],
      deployer
    ).result);

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
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const hashA = computeFinalHash(["01"]);
    const hashB = computeFinalHash(["02"]);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashA),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result);

    const blockedNonAllowlisted = simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashB),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minterTwo
    ).result;
    expect(blockedNonAllowlisted).toBeErr(Cl.uint(106));

    const blockedAllowance = simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashB),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result;
    expect(blockedAllowance).toBeErr(Cl.uint(107));
  });

  it("enforces max per wallet in public mode", () => {
    unwrapOk(simnet.callPublicFn(
      v2Contract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-max-supply",
      [Cl.uint(5)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-mint-price",
      [Cl.uint(0)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-splits",
      [Cl.uint(0), Cl.uint(0), Cl.uint(0)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-allowlist-enabled",
      [Cl.bool(false)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-max-per-wallet",
      [Cl.uint(2)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "set-paused",
      [Cl.bool(false)],
      deployer
    ).result);

    const hashA = computeFinalHash(["aa"]);
    const hashB = computeFinalHash(["bb"]);
    const hashC = computeFinalHash(["cc"]);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashA),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashB),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result);

    const blocked = simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashC),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result;
    expect(blocked).toBeErr(Cl.uint(107));

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "release-reservation",
      [Cl.standardPrincipal(minter), Cl.bufferFromHex(hashA)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      mintContract,
      "mint-begin",
      [
        xtrataContractPrincipal,
        Cl.bufferFromHex(hashC),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.uint(1),
      ],
      minter
    ).result);
  });
});
