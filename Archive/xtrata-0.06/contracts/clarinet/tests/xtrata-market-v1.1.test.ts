import { createHash } from "crypto";
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const seller = accounts.get("wallet_1")!;
const buyer = accounts.get("wallet_2")!;
const nftContract = `${deployer}.xtrata-v1-1-0`;
const marketContract = `${deployer}.xtrata-market-v1-1`;
const mime = "text/plain";
const price = 250000n;

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

function beginInscription(sender: string, expectedHash: string, size: number) {
  return simnet.callPublicFn(
    nftContract,
    "begin-inscription",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(size),
      Cl.uint(1),
    ],
    sender
  ).result;
}

function addChunkBatch(sender: string, expectedHash: string, chunkHex: string) {
  return simnet.callPublicFn(
    nftContract,
    "add-chunk-batch",
    [
      Cl.bufferFromHex(expectedHash),
      Cl.list([Cl.bufferFromHex(chunkHex)]),
    ],
    sender
  ).result;
}

function sealInscription(sender: string, expectedHash: string, tokenUri: string) {
  return simnet.callPublicFn(
    nftContract,
    "seal-inscription",
    [Cl.bufferFromHex(expectedHash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function mintToken(sender: string, chunkHex: string, tokenUri: string) {
  const expectedHash = computeFinalHash([chunkHex]);
  const size = chunkHex.length / 2;
  unwrapOk(beginInscription(sender, expectedHash, size));
  unwrapOk(addChunkBatch(sender, expectedHash, chunkHex));
  const seal = sealInscription(sender, expectedHash, tokenUri);
  return unwrapUInt(unwrapOk(seal));
}

describe("xtrata-market-v1.1", () => {
  it("transfers NFT to buyer and STX to seller", () => {
    mintToken(deployer, "00", "data:text/plain,zero");
    const tokenId = mintToken(deployer, "01", "data:text/plain,one");
    expect(tokenId).toBeGreaterThan(0n);

    unwrapOk(
      simnet.callPublicFn(
        nftContract,
        "transfer",
        [
          Cl.uint(tokenId),
          Cl.standardPrincipal(deployer),
          Cl.standardPrincipal(seller),
        ],
        deployer
      ).result
    );

    const ownerBefore = simnet.callReadOnlyFn(
      nftContract,
      "get-owner",
      [Cl.uint(tokenId)],
      deployer
    ).result;
    expect(ownerBefore).toBeOk(Cl.some(Cl.standardPrincipal(seller)));

    const listResult = simnet.callPublicFn(
      marketContract,
      "list-token",
      [
        Cl.contractPrincipal(deployer, "xtrata-v1-1-0"),
        Cl.uint(tokenId),
        Cl.uint(price),
      ],
      seller
    ).result;
    const listingId = unwrapUInt(unwrapOk(listResult));

    const buyerBefore = simnet.getAssetsMap().get("STX")?.get(buyer) || 0n;
    const sellerBefore = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;

    unwrapOk(
      simnet.callPublicFn(
        marketContract,
        "buy",
        [Cl.contractPrincipal(deployer, "xtrata-v1-1-0"), Cl.uint(listingId)],
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

    const buyerAfter = simnet.getAssetsMap().get("STX")?.get(buyer) || 0n;
    const sellerAfter = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;

    expect(sellerAfter - sellerBefore).toBe(price);
    expect(buyerBefore - buyerAfter).toBe(price);
  });
});
