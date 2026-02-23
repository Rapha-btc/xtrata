import { createHash } from "crypto";
import { Cl, ClarityType, cvToValue } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const xtrataContract = `${deployer}.xtrata-v2-1-0`;
const saleContract = `${deployer}.xtrata-preinscribed-collection-sale-v1-0`;

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

function expectErr(result: any, code: bigint | number) {
  expect(result).toBeErr(Cl.uint(code));
}

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

function unpauseXtrata() {
  return simnet.callPublicFn(
    xtrataContract,
    "set-paused",
    [Cl.bool(false)],
    deployer
  ).result;
}

function mintToken(owner: string, chunkHex: string, tokenUri = "data:text/plain,preinscribed") {
  const hash = computeFinalHash([chunkHex]);
  unwrapOk(simnet.callPublicFn(
    xtrataContract,
    "begin-inscription",
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii("text/plain"),
      Cl.uint(1),
      Cl.uint(1),
    ],
    owner
  ).result);
  unwrapOk(simnet.callPublicFn(
    xtrataContract,
    "add-chunk-batch",
    [Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex(chunkHex)])],
    owner
  ).result);
  const seal = simnet.callPublicFn(
    xtrataContract,
    "seal-inscription",
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    owner
  ).result;
  const tokenId = unwrapOk(seal);
  expect(tokenId.type).toBe(ClarityType.UInt);
  return tokenId.value as bigint;
}

function readCounts(sender = deployer) {
  const result = simnet.callReadOnlyFn(
    saleContract,
    "get-counts",
    [],
    sender
  ).result;
  const counts = cvToValue(unwrapOk(result)) as Record<string, any>;
  const availableRaw =
    counts?.available?.value ?? counts?.value?.available?.value ?? counts?.available ?? 0n;
  const soldRaw =
    counts?.sold?.value ?? counts?.value?.sold?.value ?? counts?.sold ?? 0n;
  return {
    available: BigInt(String(availableRaw)),
    sold: BigInt(String(soldRaw)),
  };
}

describe("xtrata-preinscribed-collection-sale-v1.0", () => {
  it("deposits then sells escrowed tokens", () => {
    unwrapOk(unpauseXtrata());
    unwrapOk(simnet.callPublicFn(saleContract, "set-price", [Cl.uint(0)], deployer).result);
    unwrapOk(simnet.callPublicFn(saleContract, "set-paused", [Cl.bool(false)], deployer).result);

    const tokenId = mintToken(deployer, "aa");
    unwrapOk(simnet.callPublicFn(
      saleContract,
      "deposit-token",
      [Cl.uint(tokenId)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      saleContract,
      "buy",
      [Cl.uint(tokenId)],
      wallet1
    ).result);

    const owner = simnet.callReadOnlyFn(
      xtrataContract,
      "get-owner",
      [Cl.uint(tokenId)],
      wallet1
    ).result;
    expect(owner).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));

    const counts = readCounts();
    expect(counts.available).toBe(0n);
    expect(counts.sold).toBe(1n);

    const walletStats = simnet.callReadOnlyFn(
      saleContract,
      "get-wallet-stats",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    ).result;
    const parsed = cvToValue(walletStats) as Record<string, any>;
    const boughtRaw =
      parsed?.value?.bought?.value ?? parsed?.bought?.value ?? parsed?.value?.bought ?? parsed?.bought ?? 0n;
    expect(BigInt(String(boughtRaw))).toBe(1n);
  });

  it("enforces allowlist and per-address allowance", () => {
    unwrapOk(unpauseXtrata());
    unwrapOk(simnet.callPublicFn(saleContract, "set-price", [Cl.uint(0)], deployer).result);
    unwrapOk(simnet.callPublicFn(saleContract, "set-paused", [Cl.bool(false)], deployer).result);
    unwrapOk(simnet.callPublicFn(saleContract, "set-allowlist-enabled", [Cl.bool(true)], deployer).result);
    unwrapOk(simnet.callPublicFn(
      saleContract,
      "set-allowlist",
      [Cl.standardPrincipal(wallet1), Cl.uint(1)],
      deployer
    ).result);

    const tokenA = mintToken(deployer, "ab");
    const tokenB = mintToken(deployer, "ac");
    unwrapOk(simnet.callPublicFn(
      saleContract,
      "deposit-batch",
      [Cl.list([Cl.uint(tokenA), Cl.uint(tokenB)])],
      deployer
    ).result);

    const blocked = simnet.callPublicFn(
      saleContract,
      "buy",
      [Cl.uint(tokenA)],
      wallet2
    ).result;
    expectErr(blocked, 105);

    unwrapOk(simnet.callPublicFn(
      saleContract,
      "buy",
      [Cl.uint(tokenA)],
      wallet1
    ).result);

    const allowanceHit = simnet.callPublicFn(
      saleContract,
      "buy",
      [Cl.uint(tokenB)],
      wallet1
    ).result;
    expectErr(allowanceHit, 106);
  });

  it("enforces global per-wallet cap", () => {
    unwrapOk(unpauseXtrata());
    unwrapOk(simnet.callPublicFn(saleContract, "set-price", [Cl.uint(0)], deployer).result);
    unwrapOk(simnet.callPublicFn(saleContract, "set-paused", [Cl.bool(false)], deployer).result);
    unwrapOk(simnet.callPublicFn(saleContract, "set-allowlist-enabled", [Cl.bool(false)], deployer).result);
    unwrapOk(simnet.callPublicFn(saleContract, "set-max-per-wallet", [Cl.uint(1)], deployer).result);

    const tokenA = mintToken(deployer, "ad");
    const tokenB = mintToken(deployer, "ae");
    unwrapOk(simnet.callPublicFn(
      saleContract,
      "deposit-batch",
      [Cl.list([Cl.uint(tokenA), Cl.uint(tokenB)])],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      saleContract,
      "buy",
      [Cl.uint(tokenA)],
      wallet2
    ).result);

    const blocked = simnet.callPublicFn(
      saleContract,
      "buy",
      [Cl.uint(tokenB)],
      wallet2
    ).result;
    expectErr(blocked, 106);
  });

  it("blocks purchases outside the sale window", () => {
    unwrapOk(unpauseXtrata());
    unwrapOk(simnet.callPublicFn(saleContract, "set-price", [Cl.uint(0)], deployer).result);
    unwrapOk(simnet.callPublicFn(saleContract, "set-paused", [Cl.bool(false)], deployer).result);
    unwrapOk(simnet.callPublicFn(
      saleContract,
      "set-sale-window",
      [Cl.uint(999_999), Cl.uint(0)],
      deployer
    ).result);

    const tokenId = mintToken(deployer, "af");
    unwrapOk(simnet.callPublicFn(
      saleContract,
      "deposit-token",
      [Cl.uint(tokenId)],
      deployer
    ).result);

    const blocked = simnet.callPublicFn(
      saleContract,
      "buy",
      [Cl.uint(tokenId)],
      wallet1
    ).result;
    expectErr(blocked, 108);
  });

  it("withdraws unsold inventory", () => {
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(deployer, "b0");
    unwrapOk(simnet.callPublicFn(
      saleContract,
      "deposit-token",
      [Cl.uint(tokenId)],
      deployer
    ).result);

    unwrapOk(simnet.callPublicFn(
      saleContract,
      "withdraw-token",
      [Cl.uint(tokenId), Cl.standardPrincipal(wallet2)],
      deployer
    ).result);

    const owner = simnet.callReadOnlyFn(
      xtrataContract,
      "get-owner",
      [Cl.uint(tokenId)],
      wallet2
    ).result;
    expect(owner).toBeOk(Cl.some(Cl.standardPrincipal(wallet2)));

    const counts = readCounts();
    expect(counts.available).toBe(0n);
    expect(counts.sold).toBe(0n);
  });
});
