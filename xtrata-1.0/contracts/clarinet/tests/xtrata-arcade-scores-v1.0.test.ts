import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const contract = `${deployer}.xtrata-arcade-scores-v1-0`;

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

describe("xtrata-arcade-scores-v1.0", () => {
  it("stores first score submission", () => {
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
    unwrapOk(submit);

    const best = simnet.callReadOnlyFn(
      contract,
      "get-player-best",
      [
        Cl.stringAscii("astro_blaster"),
        Cl.uint(0),
        Cl.standardPrincipal(wallet1),
      ],
      deployer
    ).result;

    expect(best.type).toBe(ClarityType.OptionalSome);
    const tuple = (best as any).value;
    expect(tuple.type).toBe(ClarityType.Tuple);
    const value = tuple.value;
    expect(value.score).toEqual(Cl.uint(1000));
    expect(value.name).toEqual(Cl.stringAscii("AAA"));
  });

  it("rejects score-mode submissions that are not improvements", () => {
    unwrapOk(
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
    );

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

    unwrapOk(
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
    );
  });

  it("requires lower times for time mode", () => {
    unwrapOk(
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
    );

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

    unwrapOk(
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
    );
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
