import { createHash } from "crypto";
import { Cl, ClarityType, cvToValue } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const owner = accounts.get("wallet_1")!;
const outsider = accounts.get("wallet_2")!;

const xtrataContract = `${deployer}.xtrata-v2-1-0`;
const vaultContract = `${deployer}.xtrata-vault`;
const sbtcContract = `${deployer}.mock-sbtc`;

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

function normalizeValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value && typeof value === "object" && "type" in value && "value" in value) {
    if (value.type === "uint") {
      return BigInt(String(value.value));
    }
    if (value.type === "bool") {
      return Boolean(value.value);
    }
    if (value.type === "principal") {
      return String(value.value);
    }
    return normalizeValue(value.value);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)])
    );
  }
  return value;
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

function mintToken(holder: string, chunkHex: string, tokenUri = "data:text/plain,xtrata-vault") {
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
    holder
  ).result);
  unwrapOk(simnet.callPublicFn(
    xtrataContract,
    "add-chunk-batch",
    [Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex(chunkHex)])],
    holder
  ).result);
  const seal = simnet.callPublicFn(
    xtrataContract,
    "seal-inscription",
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    holder
  ).result;
  return unwrapUInt(unwrapOk(seal));
}

function mintSbtc(recipient: string, amount: bigint) {
  return simnet.callPublicFn(
    sbtcContract,
    "mint",
    [Cl.uint(amount), Cl.standardPrincipal(recipient)],
    deployer
  ).result;
}

function getSbtcBalance(principalCv: any) {
  const result = simnet.callReadOnlyFn(
    sbtcContract,
    "get-balance",
    [principalCv],
    deployer
  ).result;
  return unwrapUInt(unwrapOk(result));
}

function getVaultRecord(vaultId: bigint) {
  const result = simnet.callReadOnlyFn(
    vaultContract,
    "get-vault",
    [Cl.uint(vaultId)],
    deployer
  ).result;
  expect(result.type).toBe(ClarityType.OptionalSome);
  return normalizeValue(cvToValue(result.value)) as Record<string, any>;
}

function getTier(amount: bigint) {
  const result = simnet.callReadOnlyFn(
    vaultContract,
    "get-tier-for-amount",
    [Cl.uint(amount)],
    deployer
  ).result;
  return unwrapUInt(unwrapOk(result));
}

describe("xtrata-vault", () => {
  it("opens vaults, returns getter state, and moves sBTC balances", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(owner, "b1");
    unwrapOk(mintSbtc(owner, 1_000n));

    const ownerBefore = getSbtcBalance(Cl.standardPrincipal(owner));
    const vaultBefore = getSbtcBalance(Cl.contractPrincipal(deployer, "xtrata-vault"));

    const openResult = simnet.callPublicFn(
      vaultContract,
      "open-vault",
      [Cl.uint(assetId), Cl.uint(100n)],
      owner
    ).result;
    const vaultId = unwrapUInt(unwrapOk(openResult));
    expect(vaultId).toBe(0n);

    const ownerAfter = getSbtcBalance(Cl.standardPrincipal(owner));
    const vaultAfter = getSbtcBalance(Cl.contractPrincipal(deployer, "xtrata-vault"));
    expect(ownerBefore - ownerAfter).toBe(100n);
    expect(vaultAfter - vaultBefore).toBe(100n);

    const nextVaultId = simnet.callReadOnlyFn(
      vaultContract,
      "get-next-vault-id",
      [],
      deployer
    ).result;
    expect(nextVaultId).toBeOk(Cl.uint(1));

    const vault = getVaultRecord(vaultId);
    expect(vault["asset-id"]).toBe(assetId);
    expect(vault.owner).toBe(owner);
    expect(vault.amount).toBe(100n);
    expect(vault.tier).toBe(1n);
    expect(vault.reserved).toBe(false);
    expect(vault["created-at"]).toBeGreaterThan(0n);
    expect(vault["updated-at"]).toBe(vault["created-at"]);

    const ownerAccess = simnet.callReadOnlyFn(
      vaultContract,
      "has-premium-access",
      [Cl.uint(assetId), Cl.standardPrincipal(owner)],
      deployer
    ).result;
    expect(ownerAccess).toBeOk(Cl.bool(true));

    const outsiderAccess = simnet.callReadOnlyFn(
      vaultContract,
      "has-premium-access",
      [Cl.uint(assetId), Cl.standardPrincipal(outsider)],
      deployer
    ).result;
    expect(outsiderAccess).toBeOk(Cl.bool(false));
  });

  it("rejects zero-amount vault opens", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(owner, "b2");

    const result = simnet.callPublicFn(
      vaultContract,
      "open-vault",
      [Cl.uint(assetId), Cl.uint(0)],
      owner
    ).result;

    expectErr(result, 102);
  });

  it("allows owner deposits and upgrades tiers on boundary crossings", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(owner, "b3");
    unwrapOk(mintSbtc(owner, 1_000n));

    const vaultId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      vaultContract,
      "open-vault",
      [Cl.uint(assetId), Cl.uint(490n)],
      owner
    ).result));

    const accessBefore = simnet.callReadOnlyFn(
      vaultContract,
      "has-premium-access",
      [Cl.uint(assetId), Cl.standardPrincipal(owner)],
      deployer
    ).result;
    expect(accessBefore).toBeOk(Cl.bool(true));

    unwrapOk(simnet.callPublicFn(
      vaultContract,
      "deposit-sbtc",
      [Cl.uint(vaultId), Cl.uint(10n)],
      owner
    ).result);

    const vault = getVaultRecord(vaultId);
    expect(vault.amount).toBe(500n);
    expect(vault.tier).toBe(2n);
    expect(vault["updated-at"]).toBeGreaterThanOrEqual(vault["created-at"]);
  });

  it("rejects deposits from non-owners", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(owner, "b4");
    unwrapOk(mintSbtc(owner, 500n));
    unwrapOk(mintSbtc(outsider, 500n));

    const vaultId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      vaultContract,
      "open-vault",
      [Cl.uint(assetId), Cl.uint(100n)],
      owner
    ).result));

    const result = simnet.callPublicFn(
      vaultContract,
      "deposit-sbtc",
      [Cl.uint(vaultId), Cl.uint(10n)],
      outsider
    ).result;

    expectErr(result, 100);
  });

  it("returns deterministic premium tier boundaries", () => {
    expect(getTier(0n)).toBe(0n);
    expect(getTier(99n)).toBe(0n);
    expect(getTier(100n)).toBe(1n);
    expect(getTier(499n)).toBe(1n);
    expect(getTier(500n)).toBe(2n);
    expect(getTier(999n)).toBe(2n);
    expect(getTier(1_000n)).toBe(3n);
  });

  it("marks reserve state and handles missing vault lookups", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(owner, "b5");
    unwrapOk(mintSbtc(owner, 500n));
    const vaultId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      vaultContract,
      "open-vault",
      [Cl.uint(assetId), Cl.uint(100n)],
      owner
    ).result));

    const missingVault = simnet.callReadOnlyFn(
      vaultContract,
      "get-vault",
      [Cl.uint(999n)],
      deployer
    ).result;
    expect(missingVault).toBeNone();

    unwrapOk(simnet.callPublicFn(
      vaultContract,
      "mark-reserved",
      [Cl.uint(vaultId), Cl.bool(true)],
      owner
    ).result);
    expect(getVaultRecord(vaultId).reserved).toBe(true);

    unwrapOk(simnet.callPublicFn(
      vaultContract,
      "mark-reserved",
      [Cl.uint(vaultId), Cl.bool(false)],
      owner
    ).result);
    expect(getVaultRecord(vaultId).reserved).toBe(false);

    const missingAccess = simnet.callReadOnlyFn(
      vaultContract,
      "has-premium-access",
      [Cl.uint(999n), Cl.standardPrincipal(owner)],
      deployer
    ).result;
    expect(missingAccess).toBeOk(Cl.bool(false));
  });
});
