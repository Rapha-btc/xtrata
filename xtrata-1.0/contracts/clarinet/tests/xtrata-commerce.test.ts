import { createHash } from "crypto";
import { Cl, ClarityType, cvToValue } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const seller = accounts.get("wallet_1")!;
const buyer = accounts.get("wallet_2")!;
const buyer2 = accounts.get("wallet_3")!;
const outsider = accounts.get("wallet_4")!;

const xtrataContract = `${deployer}.xtrata-v2-1-0`;
const commerceContract = `${deployer}.xtrata-commerce`;
const usdcContract = `${deployer}.mock-usdcx`;

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

function mintToken(owner: string, chunkHex: string, tokenUri = "data:text/plain,xtrata-commerce") {
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
  return unwrapUInt(unwrapOk(seal));
}

function mintUsdc(recipient: string, amount: bigint) {
  return simnet.callPublicFn(
    usdcContract,
    "mint",
    [Cl.uint(amount), Cl.standardPrincipal(recipient)],
    deployer
  ).result;
}

function getUsdcBalance(principalCv: any) {
  const result = simnet.callReadOnlyFn(
    usdcContract,
    "get-balance",
    [principalCv],
    deployer
  ).result;
  return unwrapUInt(unwrapOk(result));
}

function getNextListingId() {
  const result = simnet.callReadOnlyFn(
    commerceContract,
    "get-next-listing-id",
    [],
    deployer
  ).result;
  return unwrapUInt(unwrapOk(result));
}

function getListingRecord(listingId: bigint) {
  const result = simnet.callReadOnlyFn(
    commerceContract,
    "get-listing",
    [Cl.uint(listingId)],
    deployer
  ).result;
  expect(result.type).toBe(ClarityType.OptionalSome);
  return normalizeValue(cvToValue(result.value)) as Record<string, any>;
}

describe("xtrata-commerce", () => {
  it("creates listings and returns read-only listing state", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(seller, "a1");

    expect(getNextListingId()).toBe(0n);

    const createResult = simnet.callPublicFn(
      commerceContract,
      "create-listing",
      [Cl.uint(assetId), Cl.uint(250n)],
      seller
    ).result;
    const listingId = unwrapUInt(unwrapOk(createResult));
    expect(listingId).toBe(0n);
    expect(getNextListingId()).toBe(1n);

    const listing = getListingRecord(listingId);
    expect(listing["asset-id"]).toBe(assetId);
    expect(listing.seller).toBe(seller);
    expect(listing.price).toBe(250n);
    expect(listing.active).toBe(true);
    expect(listing["created-at"]).toBeGreaterThan(0n);
    expect(listing["updated-at"]).toBe(listing["created-at"]);

    const hasEntitlement = simnet.callReadOnlyFn(
      commerceContract,
      "has-entitlement",
      [Cl.uint(assetId), Cl.standardPrincipal(buyer)],
      deployer
    ).result;
    expect(hasEntitlement).toBeOk(Cl.bool(false));
  });

  it("rejects zero-price listings", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(seller, "a2");

    const result = simnet.callPublicFn(
      commerceContract,
      "create-listing",
      [Cl.uint(assetId), Cl.uint(0)],
      seller
    ).result;

    expectErr(result, 102);
  });

  it("allows seller and admin to activate or deactivate a listing", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(seller, "a3");
    const listingId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      commerceContract,
      "create-listing",
      [Cl.uint(assetId), Cl.uint(300n)],
      seller
    ).result));

    unwrapOk(simnet.callPublicFn(
      commerceContract,
      "set-listing-active",
      [Cl.uint(listingId), Cl.bool(false)],
      seller
    ).result);
    const afterSellerToggle = getListingRecord(listingId);
    expect(afterSellerToggle.active).toBe(false);

    unwrapOk(simnet.callPublicFn(
      commerceContract,
      "set-listing-active",
      [Cl.uint(listingId), Cl.bool(true)],
      deployer
    ).result);
    const afterAdminToggle = getListingRecord(listingId);
    expect(afterAdminToggle.active).toBe(true);
    expect(afterAdminToggle["updated-at"]).toBeGreaterThanOrEqual(afterAdminToggle["created-at"]);
  });

  it("rejects unauthorized listing management", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(seller, "a4");
    const listingId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      commerceContract,
      "create-listing",
      [Cl.uint(assetId), Cl.uint(400n)],
      seller
    ).result));

    const result = simnet.callPublicFn(
      commerceContract,
      "set-listing-active",
      [Cl.uint(listingId), Cl.bool(false)],
      outsider
    ).result;

    expectErr(result, 100);
  });

  it("purchases with USDCx, writes entitlements, enforces one purchase per buyer, and moves balances", () => {
    unwrapOk(unpauseXtrata());
    const assetId = mintToken(seller, "a5");
    unwrapOk(mintUsdc(buyer, 1_000n));
    unwrapOk(mintUsdc(buyer2, 1_000n));

    const listingId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      commerceContract,
      "create-listing",
      [Cl.uint(assetId), Cl.uint(250n)],
      seller
    ).result));

    const sellerBefore = getUsdcBalance(Cl.standardPrincipal(seller));
    const buyerBefore = getUsdcBalance(Cl.standardPrincipal(buyer));

    unwrapOk(simnet.callPublicFn(
      commerceContract,
      "buy-with-usdc",
      [Cl.uint(listingId)],
      buyer
    ).result);

    const sellerAfter = getUsdcBalance(Cl.standardPrincipal(seller));
    const buyerAfter = getUsdcBalance(Cl.standardPrincipal(buyer));
    expect(sellerAfter - sellerBefore).toBe(250n);
    expect(buyerBefore - buyerAfter).toBe(250n);

    const entitlementAfterFirstBuy = simnet.callReadOnlyFn(
      commerceContract,
      "has-entitlement",
      [Cl.uint(assetId), Cl.standardPrincipal(buyer)],
      deployer
    ).result;
    expect(entitlementAfterFirstBuy).toBeOk(Cl.bool(true));

    const duplicate = simnet.callPublicFn(
      commerceContract,
      "buy-with-usdc",
      [Cl.uint(listingId)],
      buyer
    ).result;
    expectErr(duplicate, 105);

    unwrapOk(simnet.callPublicFn(
      commerceContract,
      "buy-with-usdc",
      [Cl.uint(listingId)],
      buyer2
    ).result);

    const entitlementAfterSecondBuyer = simnet.callReadOnlyFn(
      commerceContract,
      "has-entitlement",
      [Cl.uint(assetId), Cl.standardPrincipal(buyer2)],
      deployer
    ).result;
    expect(entitlementAfterSecondBuyer).toBeOk(Cl.bool(true));
  });

  it("rejects missing and inactive listings", () => {
    unwrapOk(unpauseXtrata());

    const missing = simnet.callPublicFn(
      commerceContract,
      "buy-with-usdc",
      [Cl.uint(999n)],
      buyer
    ).result;
    expectErr(missing, 101);

    const assetId = mintToken(seller, "a6");
    unwrapOk(mintUsdc(buyer, 500n));
    const listingId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      commerceContract,
      "create-listing",
      [Cl.uint(assetId), Cl.uint(200n)],
      seller
    ).result));

    unwrapOk(simnet.callPublicFn(
      commerceContract,
      "set-listing-active",
      [Cl.uint(listingId), Cl.bool(false)],
      seller
    ).result);

    const inactive = simnet.callPublicFn(
      commerceContract,
      "buy-with-usdc",
      [Cl.uint(listingId)],
      buyer
    ).result;
    expectErr(inactive, 104);
  });
});
