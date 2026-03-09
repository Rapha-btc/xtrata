import { createHash } from "crypto";
import { Cl, ClarityType, cvToValue } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const seller = accounts.get("wallet_1")!;
const buyer = accounts.get("wallet_2")!;

const nftContract = `${deployer}.xtrata-v2-1-0`;
const marketContract = `${deployer}.xtrata-market-stx-v1-0`;
const price = 250_000n;

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
    nftContract,
    "set-paused",
    [Cl.bool(false)],
    deployer
  ).result;
}

function mintToken(owner: string, chunkHex: string, tokenUri = "data:text/plain,xtrata-market-stx") {
  const hash = computeFinalHash([chunkHex]);
  const size = chunkHex.length / 2;
  unwrapOk(simnet.callPublicFn(
    nftContract,
    "begin-inscription",
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii("text/plain"),
      Cl.uint(size),
      Cl.uint(1),
    ],
    owner
  ).result);
  unwrapOk(simnet.callPublicFn(
    nftContract,
    "add-chunk-batch",
    [Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex(chunkHex)])],
    owner
  ).result);
  const seal = simnet.callPublicFn(
    nftContract,
    "seal-inscription",
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    owner
  ).result;
  return unwrapUInt(unwrapOk(seal));
}

function getStxBalance(address: string) {
  return simnet.getAssetsMap().get("STX")?.get(address) || 0n;
}

function getListingRecord(listingId: bigint) {
  const result = simnet.callReadOnlyFn(
    marketContract,
    "get-listing",
    [Cl.uint(listingId)],
    deployer
  ).result;
  expect(result.type).toBe(ClarityType.OptionalSome);
  return normalizeValue(cvToValue(result.value)) as Record<string, any>;
}

describe("xtrata-market-stx-v1.0", () => {
  it("lists into escrow and exposes aligned read-only state", () => {
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(seller, "0a", "data:text/plain,token-zero");
    expect(tokenId).toBe(0n);

    const listResult = simnet.callPublicFn(
      marketContract,
      "list-token",
      [
        Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
        Cl.uint(tokenId),
        Cl.uint(price),
      ],
      seller
    ).result;
    const listingId = unwrapUInt(unwrapOk(listResult));

    const ownerAfterList = simnet.callReadOnlyFn(
      nftContract,
      "get-owner",
      [Cl.uint(tokenId)],
      deployer
    ).result;
    expect(ownerAfterList).toBeOk(Cl.some(Cl.contractPrincipal(deployer, "xtrata-market-stx-v1-0")));

    expect(
      simnet.callReadOnlyFn(
        marketContract,
        "get-nft-contract",
        [],
        deployer
      ).result
    ).toBeOk(Cl.contractPrincipal(deployer, "xtrata-v2-1-0"));

    const listing = getListingRecord(listingId);
    expect(listing.seller).toBe(seller);
    expect(listing["nft-contract"]).toBe(nftContract);
    expect(listing["token-id"]).toBe(tokenId);
    expect(listing.price).toBe(price);
    expect(listing["created-at"]).toBeGreaterThan(0n);

    const listingIdByToken = simnet.callReadOnlyFn(
      marketContract,
      "get-listing-id-by-token",
      [Cl.contractPrincipal(deployer, "xtrata-v2-1-0"), Cl.uint(tokenId)],
      deployer
    ).result;
    expect(listingIdByToken).toBeSome(Cl.uint(listingId));
  });

  it("transfers NFT to buyer and STX to seller", () => {
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(seller, "0b");

    const listingId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      marketContract,
      "list-token",
      [
        Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
        Cl.uint(tokenId),
        Cl.uint(price),
      ],
      seller
    ).result));

    const sellerBefore = getStxBalance(seller);
    const buyerBefore = getStxBalance(buyer);

    unwrapOk(
      simnet.callPublicFn(
        marketContract,
        "buy",
        [Cl.contractPrincipal(deployer, "xtrata-v2-1-0"), Cl.uint(listingId)],
        buyer
      ).result
    );

    const ownerAfter = simnet.callReadOnlyFn(
      nftContract,
      "get-owner",
      [Cl.uint(tokenId)],
      deployer
    ).result;
    expect(ownerAfter).toBeOk(Cl.some(Cl.standardPrincipal(buyer)));

    const sellerAfter = getStxBalance(seller);
    const buyerAfter = getStxBalance(buyer);
    expect(sellerAfter - sellerBefore).toBe(price);
    expect(buyerBefore - buyerAfter).toBe(price);

    expect(
      simnet.callReadOnlyFn(
        marketContract,
        "get-listing",
        [Cl.uint(listingId)],
        deployer
      ).result
    ).toBeNone();

    expect(
      simnet.callReadOnlyFn(
        marketContract,
        "get-listing-id-by-token",
        [Cl.contractPrincipal(deployer, "xtrata-v2-1-0"), Cl.uint(tokenId)],
        deployer
      ).result
    ).toBeNone();
  });

  it("applies fee bps to STX settlement", () => {
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(seller, "0c");
    unwrapOk(simnet.callPublicFn(
      marketContract,
      "set-fee-bps",
      [Cl.uint(1_000n)],
      deployer
    ).result);

    const listingId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      marketContract,
      "list-token",
      [
        Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
        Cl.uint(tokenId),
        Cl.uint(price),
      ],
      seller
    ).result));

    const sellerBefore = getStxBalance(seller);
    const ownerBefore = getStxBalance(deployer);
    const fee = price / 10n;

    unwrapOk(simnet.callPublicFn(
      marketContract,
      "buy",
      [Cl.contractPrincipal(deployer, "xtrata-v2-1-0"), Cl.uint(listingId)],
      buyer
    ).result);

    const sellerAfter = getStxBalance(seller);
    const ownerAfter = getStxBalance(deployer);
    expect(sellerAfter - sellerBefore).toBe(price - fee);
    expect(ownerAfter - ownerBefore).toBe(fee);
  });

  it("returns escrow to seller on cancel", () => {
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(seller, "0d");

    const listingId = unwrapUInt(unwrapOk(simnet.callPublicFn(
      marketContract,
      "list-token",
      [
        Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
        Cl.uint(tokenId),
        Cl.uint(price),
      ],
      seller
    ).result));

    unwrapOk(simnet.callPublicFn(
      marketContract,
      "cancel",
      [Cl.contractPrincipal(deployer, "xtrata-v2-1-0"), Cl.uint(listingId)],
      seller
    ).result);

    const ownerAfterCancel = simnet.callReadOnlyFn(
      nftContract,
      "get-owner",
      [Cl.uint(tokenId)],
      deployer
    ).result;
    expect(ownerAfterCancel).toBeOk(Cl.some(Cl.standardPrincipal(seller)));

    expect(
      simnet.callReadOnlyFn(
        marketContract,
        "get-listing",
        [Cl.uint(listingId)],
        deployer
      ).result
    ).toBeNone();
  });

  it("rejects zero-price listings", () => {
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(seller, "0e");

    expectErr(
      simnet.callPublicFn(
        marketContract,
        "list-token",
        [
          Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
          Cl.uint(tokenId),
          Cl.uint(0),
        ],
        seller
      ).result,
      103
    );
  });

  it("rejects duplicate listings for the same token", () => {
    unwrapOk(unpauseXtrata());
    const tokenId = mintToken(seller, "0f");

    unwrapOk(simnet.callPublicFn(
      marketContract,
      "list-token",
      [
        Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
        Cl.uint(tokenId),
        Cl.uint(price),
      ],
      seller
    ).result);

    expectErr(
      simnet.callPublicFn(
        marketContract,
        "list-token",
        [
          Cl.contractPrincipal(deployer, "xtrata-v2-1-0"),
          Cl.uint(tokenId),
          Cl.uint(price),
        ],
        seller
      ).result,
      102
    );
  });
});
