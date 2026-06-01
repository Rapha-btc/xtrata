import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const CONTRACT = "xboard-v1";
const PROXY = "xboard-v1-proxy";

const ERR_NOT_AUTHORIZED = Cl.uint(100);
const ERR_INVALID_TILE = Cl.uint(101);
const ERR_INVALID_PROGRAM = Cl.uint(102);
const ERR_BID_TOO_LOW = Cl.uint(104);
const ERR_NOT_OWNER = Cl.uint(105);
const ERR_PAUSED = Cl.uint(107);
const ERR_INVALID_AMOUNT = Cl.uint(108);
const ERR_INVALID_PAGE = Cl.uint(109);

const MIN_BID = 1_000_000;
const MIN_OUTBID = 1_010_000;
const FEE_1_STX = 10_000;
const LOCKED_1_STX = 990_000;
const FEE_MIN_OUTBID = 10_100;
const LOCKED_MIN_OUTBID = 999_900;

function accounts() {
  const accounts = simnet.getAccounts();
  return {
    deployer: accounts.get("deployer")!,
    wallet1: accounts.get("wallet_1")!,
    wallet2: accounts.get("wallet_2")!,
  };
}

function contractPrincipal() {
  return `${accounts().deployer}.${CONTRACT}`;
}

function ro(method: string, args: any[] = [], sender?: string) {
  return simnet.callReadOnlyFn(CONTRACT, method, args, sender ?? accounts().deployer).result;
}

function receipt(method: string, args: any[], sender: string, contract = CONTRACT) {
  return simnet.callPublicFn(contract, method, args, sender);
}

function call(method: string, args: any[], sender: string, contract = CONTRACT) {
  return receipt(method, args, sender, contract).result;
}

function program(text: string) {
  return Cl.stringAscii(text);
}

function stxBalance(principal: string) {
  return simnet.getAssetsMap().get("STX")?.get(principal) ?? 0n;
}

function expectPrintEvent(transaction: ReturnType<typeof receipt>, event: string) {
  expect(JSON.stringify(transaction.events)).toContain(`"${event}"`);
}

function stats(protocolFees: number | bigint, totalLocked: number | bigint, paused = false) {
  return Cl.tuple({
    "protocol-fees": Cl.uint(protocolFees),
    "total-locked": Cl.uint(totalLocked),
    paused: Cl.bool(paused),
  });
}

function emptyTile(tileId: number) {
  return Cl.tuple({
    owner: Cl.none(),
    "gross-bid": Cl.uint(0),
    locked: Cl.uint(0),
    program: program(`B1${wireCode(tileId)}X0000`),
    "updated-at": Cl.uint(0),
    "claimed-at": Cl.uint(0),
  });
}

function tilePageEntry(tileId: number, tile = tileId <= 92 ? Cl.some(emptyTile(tileId)) : Cl.none()) {
  return Cl.tuple({
    "tile-id": Cl.uint(tileId),
    tile,
  });
}

function wireCode(tileId: number) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return alphabet[Math.floor(tileId / 62)] + alphabet[tileId % 62];
}

describe("xboard-v1 read-only defaults", () => {
  it("returns the minimum bid, no owner, and initial stats", () => {
    const { deployer } = accounts();

    expect(ro("get-required-bid", [Cl.uint(0)], deployer)).toBeOk(Cl.uint(MIN_BID));
    expect(ro("get-owner", [Cl.uint(0)], deployer)).toBeOk(Cl.none());
    expect(ro("can-program", [Cl.uint(0), Cl.principal(deployer)], deployer)).toBeOk(Cl.bool(false));
    expect(ro("get-contract-stats", [], deployer)).toBeOk(stats(0, 0));
  });

  it("rejects out-of-range tile ids", () => {
    const { deployer } = accounts();

    expect(ro("get-required-bid", [Cl.uint(93)], deployer)).toBeErr(ERR_INVALID_TILE);
    expect(ro("get-owner", [Cl.uint(93)], deployer)).toBeErr(ERR_INVALID_TILE);
  });

  it("returns bounded pages with optional tail entries", () => {
    expect(ro("get-tile-page", [Cl.uint(0), Cl.uint(2)])).toBeOk(
      Cl.list([tilePageEntry(0), tilePageEntry(1)])
    );
    expect(ro("get-tile-page", [Cl.uint(92), Cl.uint(2)])).toBeOk(
      Cl.list([tilePageEntry(92), tilePageEntry(93)])
    );
    expect(ro("get-tile-page", [Cl.uint(93), Cl.uint(1)])).toBeErr(ERR_INVALID_PAGE);
    expect(ro("get-tile-page", [Cl.uint(0), Cl.uint(0)])).toBeErr(ERR_INVALID_PAGE);
    expect(ro("get-tile-page", [Cl.uint(0), Cl.uint(11)])).toBeErr(ERR_INVALID_PAGE);
  });
});

describe("xboard-v1 programme validation", () => {
  it("accepts valid text, inscription, and clear programmes", () => {
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1324HELLO")])).toBeOk(Cl.bool(true));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I0004159")])).toBeOk(Cl.bool(true));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100X0000")])).toBeOk(Cl.bool(true));
    expect(ro("is-valid-program", [Cl.uint(92), program("B11UX0000")])).toBeOk(Cl.bool(true));
  });

  it("rejects bad prefixes, mismatched slots, invalid tile ids, modes, and styles", () => {
    expect(ro("is-valid-program", [Cl.uint(0), program("K100T1324HELLO")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(1), program("B100T1324HELLO")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(93), program("B11VX0000")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100Q1324HELLO")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T5324HELLO")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1924HELLO")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1394HELLO")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T132AHELLO")])).toBeOk(Cl.bool(false));
  });

  it("rejects invalid payloads", () => {
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1324")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100X0000BAD")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I0004")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I0004abc")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I00041a")])).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I00041234567890123")])).toBeOk(Cl.bool(false));
  });
});

describe("xboard-v1 claiming and accounting", () => {
  it("moves the first bid into the contract and records its fee", () => {
    const { wallet1 } = accounts();
    const walletBefore = stxBalance(wallet1);
    const contractBefore = stxBalance(contractPrincipal());
    const transaction = receipt("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324HELLO")], wallet1);

    expect(transaction.result).toBeOk(Cl.bool(true));
    expectPrintEvent(transaction, "claim");
    expect(stxBalance(wallet1)).toBe(walletBefore - BigInt(MIN_BID));
    expect(stxBalance(contractPrincipal())).toBe(contractBefore + BigInt(MIN_BID));
    expect(ro("get-owner", [Cl.uint(0)], wallet1)).toBeOk(Cl.some(Cl.principal(wallet1)));
    expect(ro("can-program", [Cl.uint(0), Cl.principal(wallet1)], wallet1)).toBeOk(Cl.bool(true));
    expect(ro("get-required-bid", [Cl.uint(0)], wallet1)).toBeOk(Cl.uint(MIN_OUTBID));
    expect(ro("get-contract-stats", [], wallet1)).toBeOk(stats(FEE_1_STX, LOCKED_1_STX));
  });

  it("rejects invalid claims without changing balances or tile state", () => {
    const { wallet1 } = accounts();
    const walletBefore = stxBalance(wallet1);
    const contractBefore = stxBalance(contractPrincipal());

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID - 1), program("B100T1324HELLO")], wallet1)).toBeErr(ERR_BID_TOO_LOW);
    expect(call("claim-tile", [Cl.uint(93), Cl.uint(MIN_BID), program("B11VX0000")], wallet1)).toBeErr(ERR_INVALID_TILE);
    expect(call("claim-tile", [Cl.uint(1), Cl.uint(MIN_BID), program("B100T1324HELLO")], wallet1)).toBeErr(ERR_INVALID_PROGRAM);
    expect(stxBalance(wallet1)).toBe(walletBefore);
    expect(stxBalance(contractPrincipal())).toBe(contractBefore);
    expect(ro("get-owner", [Cl.uint(0)])).toBeOk(Cl.none());
    expect(ro("get-contract-stats")).toBeOk(stats(0, 0));
  });

  it("rolls back when the bidder cannot transfer the requested STX", () => {
    const { wallet1 } = accounts();
    const walletBefore = stxBalance(wallet1);
    const contractBefore = stxBalance(contractPrincipal());
    const result = call("claim-tile", [Cl.uint(0), Cl.uint(walletBefore + 1n), program("B100T1324TOOMUCH")], wallet1);

    expect(Cl.prettyPrint(result)).toMatch(/^\(err /);
    expect(stxBalance(wallet1)).toBe(walletBefore);
    expect(stxBalance(contractPrincipal())).toBe(contractBefore);
    expect(ro("get-owner", [Cl.uint(0)])).toBeOk(Cl.none());
    expect(ro("get-contract-stats")).toBeOk(stats(0, 0));
  });

  it("refunds the previous owner and preserves the balance invariant on outbid", () => {
    const { wallet1, wallet2 } = accounts();
    const wallet1Before = stxBalance(wallet1);
    const wallet2Before = stxBalance(wallet2);

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324ALICE")], wallet1)).toBeOk(Cl.bool(true));
    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_OUTBID - 1), program("B100T1324BOB")], wallet2)).toBeErr(ERR_BID_TOO_LOW);
    const transaction = receipt("claim-tile", [Cl.uint(0), Cl.uint(MIN_OUTBID), program("B100T1324BOB")], wallet2);

    expect(transaction.result).toBeOk(Cl.bool(true));
    expectPrintEvent(transaction, "claim");
    expect(stxBalance(wallet1)).toBe(wallet1Before - BigInt(FEE_1_STX));
    expect(stxBalance(wallet2)).toBe(wallet2Before - BigInt(MIN_OUTBID));
    expect(stxBalance(contractPrincipal())).toBe(BigInt(FEE_1_STX + FEE_MIN_OUTBID + LOCKED_MIN_OUTBID));
    expect(ro("get-owner", [Cl.uint(0)])).toBeOk(Cl.some(Cl.principal(wallet2)));
    expect(ro("get-contract-stats")).toBeOk(stats(FEE_1_STX + FEE_MIN_OUTBID, LOCKED_MIN_OUTBID));
  });

  it("rounds the required outbid increment up to the next microSTX", () => {
    const { wallet1 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(1_000_001), program("B100T1324ROUND")], wallet1)).toBeOk(Cl.bool(true));
    expect(ro("get-required-bid", [Cl.uint(0)])).toBeOk(Cl.uint(1_010_002));
  });
});

describe("xboard-v1 programming, pause, and release", () => {
  it("lets only the current owner update a programme and emits the update", () => {
    const { wallet1, wallet2 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324START")], wallet1)).toBeOk(Cl.bool(true));
    const transaction = receipt("program-tile", [Cl.uint(0), program("B100T2425UPDATED")], wallet1);
    expect(transaction.result).toBeOk(Cl.bool(true));
    expectPrintEvent(transaction, "program");
    expect(call("program-tile", [Cl.uint(0), program("B100T2425HACK")], wallet2)).toBeErr(ERR_NOT_OWNER);
    expect(call("program-tile", [Cl.uint(0), program("B101T2425WRONG")], wallet1)).toBeErr(ERR_INVALID_PROGRAM);
  });

  it("blocks claims and programming while paused but always lets an owner release funds", () => {
    const { deployer, wallet1 } = accounts();
    const walletBefore = stxBalance(wallet1);

    expect(call("set-paused", [Cl.bool(true)], wallet1)).toBeErr(ERR_NOT_AUTHORIZED);
    const pause = receipt("set-paused", [Cl.bool(true)], deployer);
    expect(pause.result).toBeOk(Cl.bool(true));
    expectPrintEvent(pause, "set-paused");
    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324PAUSED")], wallet1)).toBeErr(ERR_PAUSED);
    expect(call("set-paused", [Cl.bool(false)], deployer)).toBeOk(Cl.bool(true));
    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324LIVE")], wallet1)).toBeOk(Cl.bool(true));
    expect(call("set-paused", [Cl.bool(true)], deployer)).toBeOk(Cl.bool(true));
    expect(call("program-tile", [Cl.uint(0), program("B100T1324BLOCKED")], wallet1)).toBeErr(ERR_PAUSED);

    const release = receipt("release-tile", [Cl.uint(0)], wallet1);
    expect(release.result).toBeOk(Cl.bool(true));
    expectPrintEvent(release, "release");
    expect(stxBalance(wallet1)).toBe(walletBefore - BigInt(FEE_1_STX));
    expect(stxBalance(contractPrincipal())).toBe(BigInt(FEE_1_STX));
    expect(ro("get-owner", [Cl.uint(0)])).toBeOk(Cl.none());
    expect(ro("get-contract-stats")).toBeOk(stats(FEE_1_STX, 0, true));
  });
});

describe("xboard-v1 fees and direct-call security", () => {
  it("withdraws only accrued fees to a standard principal and leaves locked funds untouched", () => {
    const { deployer, wallet1, wallet2 } = accounts();
    const recipientBefore = stxBalance(wallet2);

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324FEES")], wallet1)).toBeOk(Cl.bool(true));
    expect(call("withdraw-fees", [Cl.uint(FEE_1_STX), Cl.principal(wallet2)], wallet1)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(call("withdraw-fees", [Cl.uint(FEE_1_STX + 1), Cl.principal(wallet2)], deployer)).toBeErr(ERR_INVALID_AMOUNT);
    expect(call("withdraw-fees", [Cl.uint(FEE_1_STX), Cl.contractPrincipal(deployer, CONTRACT)], deployer)).toBeErr(ERR_NOT_AUTHORIZED);

    const transaction = receipt("withdraw-fees", [Cl.uint(FEE_1_STX), Cl.principal(wallet2)], deployer);
    expect(transaction.result).toBeOk(Cl.bool(true));
    expectPrintEvent(transaction, "withdraw-fees");
    expect(stxBalance(wallet2)).toBe(recipientBefore + BigInt(FEE_1_STX));
    expect(stxBalance(contractPrincipal())).toBe(BigInt(LOCKED_1_STX));
    expect(ro("get-contract-stats")).toBeOk(stats(0, LOCKED_1_STX));
  });

  it("rejects every state-changing entry point when forwarded through a contract", () => {
    const { deployer, wallet1, wallet2 } = accounts();
    const walletBefore = stxBalance(wallet1);
    const contractBefore = stxBalance(contractPrincipal());

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324PROXY")], wallet1, PROXY)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(call("program-tile", [Cl.uint(0), program("B100T1324PROXY")], wallet1, PROXY)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(call("release-tile", [Cl.uint(0)], wallet1, PROXY)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(call("withdraw-fees", [Cl.uint(1), Cl.principal(wallet2)], deployer, PROXY)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(call("set-paused", [Cl.bool(true)], deployer, PROXY)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(stxBalance(wallet1)).toBe(walletBefore);
    expect(stxBalance(contractPrincipal())).toBe(contractBefore);
    expect(ro("get-contract-stats")).toBeOk(stats(0, 0));
  });
});
