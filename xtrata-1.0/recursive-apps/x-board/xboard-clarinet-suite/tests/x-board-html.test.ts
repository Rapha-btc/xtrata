import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  listCV,
  responseOkCV,
  serializeCV,
  someCV,
  standardPrincipalCV,
  stringAsciiCV,
  tupleCV,
  uintCV
} from "@stacks/transactions";
import { describe, it } from "vitest";

const html = readFileSync(new URL("../../x-board.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
const helperSource = script.slice(
  script.indexOf("const CONFIG ="),
  script.indexOf("function contentRoute()")
);
const wallet = "SP2MF04VAGYHGAZWGTEDW5VYCPDWWSY08Z1QFNDSN";

const runHelpers = async (body: string) => {
  const context = {
    console,
    crypto: webcrypto,
    TextDecoder,
    TextEncoder,
    URLSearchParams,
    clearTimeout,
    localStorage: {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => undefined
    },
    setTimeout,
    window: {}
  };

  vm.runInNewContext(
    `${helperSource}\nglobalThis.__result = (async () => { ${body} })();`,
    context
  );

  await (context as { __result: Promise<void> }).__result;
};

describe("x-board standalone wallet helpers", () => {
  it("serializes contract arguments and deny-mode STX caps", async () => {
    await runHelpers(`
      const decoded = await decodeStacksAddress(${JSON.stringify(wallet)});
      if (await encodeStacksAddress(decoded.version, decoded.hash160) !== ${JSON.stringify(wallet)}) throw new Error("c32 round trip failed");
      if (clarityUint(42) !== "010000000000000000000000000000002a") throw new Error("uint serialization failed");
      if (clarityAscii("B100T1324GM") !== "0d0000000b423130305431333234474d") throw new Error("ascii serialization failed");
      if (await serializeStxSpendCap(${JSON.stringify(wallet)}, 1000000n) !== "000216a8f0136a87a3057f90d39bc2efccb379ccf808f80500000000000f4240") throw new Error("wallet cap serialization failed");
      if (await serializeContractStxSpendCap(${JSON.stringify(wallet)}, "xboard-v1", 990000n) !== "000316a8f0136a87a3057f90d39bc2efccb379ccf808f80978626f6172642d76310500000000000f1b30") throw new Error("contract cap serialization failed");

      const longDraft = compileBoardMemo("00", "T", "X".repeat(80), DEFAULT_STYLE);
      if (!longDraft.ok || longDraft.bytes !== 89) throw new Error("96-character contract programme rejected");
      if (!decodeBoardProgram(longDraft.memo) || decodeBoardMemo(longDraft.memo)) throw new Error("legacy memo limit is not isolated");
      if (decodeBoardProgram("B100X1324")) throw new Error("noncanonical clear accepted");
    `);
  });

  it("parses complete contract pages and rejects incomplete snapshots", async () => {
    const tile = tupleCV({
      owner: someCV(standardPrincipalCV(wallet)),
      "gross-bid": uintCV(1_000_000),
      locked: uintCV(990_000),
      program: stringAsciiCV("B100T1324GM"),
      "updated-at": uintCV(12),
      "claimed-at": uintCV(10)
    });
    const fixture = serializeCV(
      responseOkCV(listCV([tupleCV({ "tile-id": uintCV(0), tile: someCV(tile) })]))
    );

    await runHelpers(`
      const state = await contractStateFromEntry(clarityOk(parseClarityHex(${JSON.stringify(fixture)})).value[0]);
      if (state.sender !== ${JSON.stringify(wallet)} || state.locked !== 990000n || state.slotCode !== "00" || state.value !== "GM") throw new Error("contract page parser failed");

      callReadOnly = async () => ({ type: "ok", value: { type: "list", value: [] } });
      let rejected = false;
      try { await fetchContractStates(); } catch { rejected = true; }
      if (!rejected) throw new Error("short contract page accepted");
    `);
  });
});
