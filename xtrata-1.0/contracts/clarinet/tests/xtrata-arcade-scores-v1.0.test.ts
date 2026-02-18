import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const faucet = accounts.get("faucet")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const wallet4 = accounts.get("wallet_4")!;
const wallet5 = accounts.get("wallet_5")!;
const wallet6 = accounts.get("wallet_6")!;
const wallet7 = accounts.get("wallet_7")!;
const wallet8 = accounts.get("wallet_8")!;

const contract = `${deployer}.xtrata-arcade-scores-v1-0`;

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

function unwrapTop10(result: any) {
  const listValue = unwrapOk(result);
  expect(listValue.type).toBe(ClarityType.List);
  const list = (listValue as any).list || (listValue as any).value || [];
  const entries: any[] = [];
  for (const item of list) {
    if (item.type === ClarityType.OptionalSome) {
      expect(item.value.type).toBe(ClarityType.Tuple);
      entries.push(item.value.value);
    }
  }
  return entries;
}

describe("xtrata-arcade-scores-v1.0", () => {
  it("stores first score submission and rank", () => {
    const submit = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("astro_blaster"),
        Cl.uint(0),
        Cl.uint(1000),
        Cl.stringAscii("AAA"),
      ],
      wallet1
    ).result;
    expect(submit).toBeOk(Cl.uint(1));

    const top1 = simnet.callReadOnlyFn(
      contract,
      "get-top10-entry",
      [
        Cl.stringAscii("astro_blaster"),
        Cl.uint(0),
        Cl.uint(1),
      ],
      deployer
    ).result;

    const top1Value = unwrapOk(top1);
    expect(top1Value.type).toBe(ClarityType.OptionalSome);
    const top1Tuple = (top1Value as any).value.value;
    expect(top1Tuple.score).toEqual(Cl.uint(1000));
    expect(top1Tuple.name).toEqual(Cl.stringAscii("AAA"));
    expect(top1Tuple.player).toEqual(Cl.standardPrincipal(wallet1));
  });

  it("rejects score-mode submissions that are not improvements", () => {
    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("block_drop"),
          Cl.uint(0),
          Cl.uint(5000),
          Cl.stringAscii("ACE"),
        ],
        wallet1
      ).result
    ).toBeOk(Cl.uint(1));

    const lower = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("block_drop"),
        Cl.uint(0),
        Cl.uint(4999),
        Cl.stringAscii("ACE"),
      ],
      wallet1
    ).result;
    expect(lower).toBeErr(Cl.uint(101));

    const equal = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("block_drop"),
        Cl.uint(0),
        Cl.uint(5000),
        Cl.stringAscii("ACE"),
      ],
      wallet1
    ).result;
    expect(equal).toBeErr(Cl.uint(101));

    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("block_drop"),
          Cl.uint(0),
          Cl.uint(7000),
          Cl.stringAscii("ACE"),
        ],
        wallet1
      ).result
    ).toBeOk(Cl.uint(1));
  });

  it("requires lower times for time mode", () => {
    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("maze_escape"),
          Cl.uint(1),
          Cl.uint(5500),
          Cl.stringAscii("RUN"),
        ],
        wallet2
      ).result
    ).toBeOk(Cl.uint(1));

    const slower = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("maze_escape"),
        Cl.uint(1),
        Cl.uint(5600),
        Cl.stringAscii("RUN"),
      ],
      wallet2
    ).result;
    expect(slower).toBeErr(Cl.uint(101));

    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("maze_escape"),
          Cl.uint(1),
          Cl.uint(5400),
          Cl.stringAscii("RUN"),
        ],
        wallet2
      ).result
    ).toBeOk(Cl.uint(1));
  });

  it("maintains a ranked top10 and rejects non-qualifying entries", () => {
    const participants = [
      deployer,
      faucet,
      wallet1,
      wallet2,
      wallet3,
      wallet4,
      wallet5,
      wallet6,
      wallet7,
      wallet8,
    ];
    const scores = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];

    for (let i = 0; i < participants.length; i++) {
      const result = simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("snakebyte"),
          Cl.uint(0),
          Cl.uint(scores[i]),
          Cl.stringAscii(`P${String(i).padStart(2, "0")}`),
        ],
        participants[i]
      ).result;
      expect(result.type).toBe(ClarityType.ResponseOk);
    }

    const reject = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("snakebyte"),
        Cl.uint(0),
        Cl.uint(50),
        Cl.stringAscii("LOW"),
      ],
      "ST000000000000000000002AMW42H"
    ).result;
    expect(reject).toBeErr(Cl.uint(105));

    const board = simnet.callReadOnlyFn(
      contract,
      "get-top10",
      [Cl.stringAscii("snakebyte"), Cl.uint(0)],
      deployer
    ).result;
    const entries = unwrapTop10(board);
    expect(entries.length).toBe(10);
    expect(entries[0].score).toEqual(Cl.uint(1000));
    expect(entries[9].score).toEqual(Cl.uint(100));
  });

  it("removes old slot and re-ranks improved player without duplicates", () => {
    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("bubble_pop"),
          Cl.uint(0),
          Cl.uint(500),
          Cl.stringAscii("A01"),
        ],
        wallet1
      ).result
    ).toBeOk(Cl.uint(1));
    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("bubble_pop"),
          Cl.uint(0),
          Cl.uint(400),
          Cl.stringAscii("B02"),
        ],
        wallet2
      ).result
    ).toBeOk(Cl.uint(2));
    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("bubble_pop"),
          Cl.uint(0),
          Cl.uint(300),
          Cl.stringAscii("C03"),
        ],
        wallet3
      ).result
    ).toBeOk(Cl.uint(3));

    expect(
      simnet.callPublicFn(
        contract,
        "submit-score",
        [
          Cl.stringAscii("bubble_pop"),
          Cl.uint(0),
          Cl.uint(600),
          Cl.stringAscii("C03"),
        ],
        wallet3
      ).result
    ).toBeOk(Cl.uint(1));

    const board = simnet.callReadOnlyFn(
      contract,
      "get-top10",
      [Cl.stringAscii("bubble_pop"), Cl.uint(0)],
      deployer
    ).result;
    const entries = unwrapTop10(board);
    expect(entries.length).toBe(3);
    expect(entries[0].player).toEqual(Cl.standardPrincipal(wallet3));
    expect(entries[0].score).toEqual(Cl.uint(600));
    expect(entries[1].player).toEqual(Cl.standardPrincipal(wallet1));
    expect(entries[2].player).toEqual(Cl.standardPrincipal(wallet2));
  });

  it("validates mode, name length, and score", () => {
    const badMode = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("snakebyte"),
        Cl.uint(2),
        Cl.uint(100),
        Cl.stringAscii("SNA"),
      ],
      wallet1
    ).result;
    expect(badMode).toBeErr(Cl.uint(100));

    const badName = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("snakebyte"),
        Cl.uint(0),
        Cl.uint(100),
        Cl.stringAscii("AA"),
      ],
      wallet1
    ).result;
    expect(badName).toBeErr(Cl.uint(102));

    const badScore = simnet.callPublicFn(
      contract,
      "submit-score",
      [
        Cl.stringAscii("snakebyte"),
        Cl.uint(0),
        Cl.uint(0),
        Cl.stringAscii("SNA"),
      ],
      wallet1
    ).result;
    expect(badScore).toBeErr(Cl.uint(103));

    const badRank = simnet.callReadOnlyFn(
      contract,
      "get-top10-entry",
      [Cl.stringAscii("snakebyte"), Cl.uint(0), Cl.uint(0)],
      deployer
    ).result;
    expect(badRank).toBeErr(Cl.uint(106));
  });

  it("allows owner transfer by current owner only", () => {
    const unauthorized = simnet.callPublicFn(
      contract,
      "transfer-contract-ownership",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    ).result;
    expect(unauthorized).toBeErr(Cl.uint(104));

    unwrapOk(
      simnet.callPublicFn(
        contract,
        "transfer-contract-ownership",
        [Cl.standardPrincipal(wallet1)],
        deployer
      ).result
    );

    const owner = simnet.callReadOnlyFn(contract, "get-owner", [], deployer).result;
    expect(owner).toBeOk(Cl.standardPrincipal(wallet1));
  });
});
