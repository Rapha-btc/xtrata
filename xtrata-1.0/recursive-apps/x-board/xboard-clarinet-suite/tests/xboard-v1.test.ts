import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const CONTRACT = "xboard-v1";

const ERR_NOT_AUTHORIZED = Cl.uint(100);
const ERR_INVALID_TILE = Cl.uint(101);
const ERR_INVALID_PROGRAM = Cl.uint(102);
const ERR_BID_TOO_LOW = Cl.uint(104);
const ERR_NOT_OWNER = Cl.uint(105);
const ERR_PAUSED = Cl.uint(107);
const ERR_INVALID_AMOUNT = Cl.uint(108);

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
    wallet3: accounts.get("wallet_3")!,
  };
}

function ro(method: string, args: any[] = [], sender?: string) {
  const { deployer } = accounts();
  return simnet.callReadOnlyFn(CONTRACT, method, args, sender ?? deployer).result;
}

function call(method: string, args: any[], sender: string) {
  return simnet.callPublicFn(CONTRACT, method, args, sender).result;
}

function program(text: string) {
  return Cl.stringAscii(text);
}

describe("xboard-v1 read-only defaults", () => {
  it("returns the minimum bid and no owner for an unused tile", () => {
    const { deployer } = accounts();

    expect(ro("get-required-bid", [Cl.uint(0)], deployer)).toBeOk(Cl.uint(MIN_BID));
    expect(ro("get-owner", [Cl.uint(0)], deployer)).toBeOk(Cl.none());
    expect(ro("can-program", [Cl.uint(0), Cl.principal(deployer)], deployer)).toBeOk(Cl.bool(false));
  });

  it("rejects out-of-range tile ids", () => {
    const { deployer } = accounts();

    expect(ro("get-required-bid", [Cl.uint(93)], deployer)).toBeErr(ERR_INVALID_TILE);
    expect(ro("get-owner", [Cl.uint(93)], deployer)).toBeErr(ERR_INVALID_TILE);
  });

  it("returns initial contract stats", () => {
    const { deployer } = accounts();

    expect(ro("get-contract-stats", [], deployer)).toBeOk(
      Cl.tuple({
        "protocol-fees": Cl.uint(0),
        "total-locked": Cl.uint(0),
        paused: Cl.bool(false),
      })
    );
  });
});

describe("xboard-v1 programme validation", () => {
  it("accepts valid text, inscription, and clear programmes", () => {
    const { deployer } = accounts();

    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1324HELLO")], deployer)).toBeOk(Cl.bool(true));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I0004159")], deployer)).toBeOk(Cl.bool(true));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100X0000")], deployer)).toBeOk(Cl.bool(true));
    expect(ro("is-valid-program", [Cl.uint(92), program("B11UX0000")], deployer)).toBeOk(Cl.bool(true));
  });

  it("rejects bad prefixes, mismatched slots, and invalid tile ids", () => {
    const { deployer } = accounts();

    expect(ro("is-valid-program", [Cl.uint(0), program("K100T1324HELLO")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(1), program("B100T1324HELLO")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(93), program("B11VX0000")], deployer)).toBeOk(Cl.bool(false));
  });

  it("rejects invalid modes and style codes", () => {
    const { deployer } = accounts();

    expect(ro("is-valid-program", [Cl.uint(0), program("B100Q1324HELLO")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T5324HELLO")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1924HELLO")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1394HELLO")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100T132AHELLO")], deployer)).toBeOk(Cl.bool(false));
  });

  it("rejects invalid payloads", () => {
    const { deployer } = accounts();

    expect(ro("is-valid-program", [Cl.uint(0), program("B100T1324")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100X0000BAD")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I000")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I000abc")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I0001a")], deployer)).toBeOk(Cl.bool(false));
    expect(ro("is-valid-program", [Cl.uint(0), program("B100I0001234567890123")], deployer)).toBeOk(Cl.bool(false));
  });
});

describe("xboard-v1 claiming", () => {
  it("allows a first claim at the minimum bid and updates accounting", () => {
    const { wallet1 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324HELLO")], wallet1)).toBeOk(Cl.bool(true));

    expect(ro("get-owner", [Cl.uint(0)], wallet1)).toBeOk(Cl.some(Cl.principal(wallet1)));
    expect(ro("can-program", [Cl.uint(0), Cl.principal(wallet1)], wallet1)).toBeOk(Cl.bool(true));
    expect(ro("get-required-bid", [Cl.uint(0)], wallet1)).toBeOk(Cl.uint(MIN_OUTBID));
    expect(ro("get-contract-stats", [], wallet1)).toBeOk(
      Cl.tuple({
        "protocol-fees": Cl.uint(FEE_1_STX),
        "total-locked": Cl.uint(LOCKED_1_STX),
        paused: Cl.bool(false),
      })
    );
  });

  it("rejects below-minimum claims and invalid programmes", () => {
    const { wallet1 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID - 1), program("B100T1324HELLO")], wallet1)).toBeErr(ERR_BID_TOO_LOW);
    expect(call("claim-tile", [Cl.uint(93), Cl.uint(MIN_BID), program("B11VX0000")], wallet1)).toBeErr(ERR_INVALID_TILE);
    expect(call("claim-tile", [Cl.uint(1), Cl.uint(MIN_BID), program("B100T1324HELLO")], wallet1)).toBeErr(ERR_INVALID_PROGRAM);
  });
});

describe("xboard-v1 outbidding", () => {
  it("requires a 1% minimum outbid increment", () => {
    const { wallet1, wallet2 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324ALICE")], wallet1)).toBeOk(Cl.bool(true));

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324BOB")], wallet2)).toBeErr(ERR_BID_TOO_LOW);
    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_OUTBID - 1), program("B100T1324BOB")], wallet2)).toBeErr(ERR_BID_TOO_LOW);

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_OUTBID), program("B100T1324BOB")], wallet2)).toBeOk(Cl.bool(true));

    expect(ro("get-owner", [Cl.uint(0)], wallet2)).toBeOk(Cl.some(Cl.principal(wallet2)));
    expect(ro("can-program", [Cl.uint(0), Cl.principal(wallet1)], wallet2)).toBeOk(Cl.bool(false));
    expect(ro("can-program", [Cl.uint(0), Cl.principal(wallet2)], wallet2)).toBeOk(Cl.bool(true));
    expect(ro("get-contract-stats", [], wallet2)).toBeOk(
      Cl.tuple({
        "protocol-fees": Cl.uint(FEE_1_STX + FEE_MIN_OUTBID),
        "total-locked": Cl.uint(LOCKED_MIN_OUTBID),
        paused: Cl.bool(false),
      })
    );
  });
});

describe("xboard-v1 programming", () => {
  it("allows only the current owner to update the tile programme", () => {
    const { wallet1, wallet2 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324START")], wallet1)).toBeOk(Cl.bool(true));
    expect(call("program-tile", [Cl.uint(0), program("B100T2425UPDATED")], wallet1)).toBeOk(Cl.bool(true));

    expect(call("program-tile", [Cl.uint(0), program("B100T2425HACK")], wallet2)).toBeErr(ERR_NOT_OWNER);
    expect(call("program-tile", [Cl.uint(0), program("B101T2425WRONG")], wallet1)).toBeErr(ERR_INVALID_PROGRAM);
  });

  it("old owners cannot programme after being outbid", () => {
    const { wallet1, wallet2 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324ALICE")], wallet1)).toBeOk(Cl.bool(true));
    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_OUTBID), program("B100T1324BOB")], wallet2)).toBeOk(Cl.bool(true));

    expect(call("program-tile", [Cl.uint(0), program("B100T1324ALICEAGAIN")], wallet1)).toBeErr(ERR_NOT_OWNER);
    expect(call("program-tile", [Cl.uint(0), program("B100T1324BOBAGAIN")], wallet2)).toBeOk(Cl.bool(true));
  });
});

describe("xboard-v1 release / unlink", () => {
  it("lets the owner release a tile and resets the price to the minimum", () => {
    const { wallet1, wallet2 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324HELD")], wallet1)).toBeOk(Cl.bool(true));
    expect(call("release-tile", [Cl.uint(0)], wallet2)).toBeErr(ERR_NOT_OWNER);
    expect(call("release-tile", [Cl.uint(0)], wallet1)).toBeOk(Cl.bool(true));

    expect(ro("get-owner", [Cl.uint(0)], wallet1)).toBeOk(Cl.none());
    expect(ro("get-required-bid", [Cl.uint(0)], wallet1)).toBeOk(Cl.uint(MIN_BID));
    expect(ro("can-program", [Cl.uint(0), Cl.principal(wallet1)], wallet1)).toBeOk(Cl.bool(false));
    expect(ro("get-contract-stats", [], wallet1)).toBeOk(
      Cl.tuple({
        "protocol-fees": Cl.uint(FEE_1_STX),
        "total-locked": Cl.uint(0),
        paused: Cl.bool(false),
      })
    );

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324NEW")], wallet2)).toBeOk(Cl.bool(true));
    expect(ro("get-owner", [Cl.uint(0)], wallet2)).toBeOk(Cl.some(Cl.principal(wallet2)));
  });
});

describe("xboard-v1 fees and pause", () => {
  it("allows only contract owner to withdraw accrued protocol fees", () => {
    const { deployer, wallet1, wallet2 } = accounts();

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324FEES")], wallet1)).toBeOk(Cl.bool(true));

    expect(call("withdraw-fees", [Cl.uint(FEE_1_STX), Cl.principal(wallet2)], wallet1)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(call("withdraw-fees", [Cl.uint(FEE_1_STX + 1), Cl.principal(wallet2)], deployer)).toBeErr(ERR_INVALID_AMOUNT);
    expect(call("withdraw-fees", [Cl.uint(FEE_1_STX), Cl.principal(wallet2)], deployer)).toBeOk(Cl.bool(true));

    expect(ro("get-contract-stats", [], deployer)).toBeOk(
      Cl.tuple({
        "protocol-fees": Cl.uint(0),
        "total-locked": Cl.uint(LOCKED_1_STX),
        paused: Cl.bool(false),
      })
    );
  });

  it("allows only contract owner to pause and blocks write actions while paused", () => {
    const { deployer, wallet1, wallet2 } = accounts();

    expect(call("set-paused", [Cl.bool(true)], wallet1)).toBeErr(ERR_NOT_AUTHORIZED);
    expect(call("set-paused", [Cl.bool(true)], deployer)).toBeOk(Cl.bool(true));

    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324PAUSED")], wallet1)).toBeErr(ERR_PAUSED);

    expect(call("set-paused", [Cl.bool(false)], deployer)).toBeOk(Cl.bool(true));
    expect(call("claim-tile", [Cl.uint(0), Cl.uint(MIN_BID), program("B100T1324LIVE")], wallet1)).toBeOk(Cl.bool(true));

    expect(call("set-paused", [Cl.bool(true)], deployer)).toBeOk(Cl.bool(true));
    expect(call("program-tile", [Cl.uint(0), program("B100T1324BLOCKED")], wallet1)).toBeErr(ERR_PAUSED);
    expect(call("release-tile", [Cl.uint(0)], wallet1)).toBeErr(ERR_PAUSED);

    // Read-only calls should still work while paused.
    expect(ro("get-owner", [Cl.uint(0)], wallet2)).toBeOk(Cl.some(Cl.principal(wallet1)));
  });
});

// The contract intends to preserve this accounting invariant after every successful
// claim, outbid, release, and fee withdrawal:
// contract STX balance >= total-locked + protocol-fees.
// The state-facing part is covered above. Add explicit STX balance assertions once
// the exact Clarinet SDK asset-map API for the project version is confirmed.
