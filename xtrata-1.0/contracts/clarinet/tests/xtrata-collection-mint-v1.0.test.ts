import { createHash } from "crypto";
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const artist = accounts.get("wallet_1")!;
const marketplace = accounts.get("wallet_2")!;
const minter = accounts.get("wallet_3")!;

const v2Contract = `${deployer}.xtrata-v2-1-0`;
const mintContract = `${deployer}.xtrata-collection-mint-v1-0`;
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
      [Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex("00")])],
      minter
    ).result);

    const sealResult = simnet.callPublicFn(
      mintContract,
      "mint-seal",
      [Cl.bufferFromHex(hash), Cl.stringAscii("data:text/plain,zero")],
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
});
