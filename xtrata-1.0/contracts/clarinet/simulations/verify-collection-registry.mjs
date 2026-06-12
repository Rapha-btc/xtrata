// verify-collection-registry.mjs
// SELF-VERIFYING stxer mainnet-fork harness for xtrata-collection-registry-v1.0
// (the as-contract? / with-nft HARDENED version — validated on the real Clarity
// VM, which clarinet 3.19 cannot compile).
//
// Deploys the registry against the REAL mainnet xtrata-v3-2-3 + bitcoin-pepe,
// then drives the full lifecycle with assertions on every step:
//   inscribe (guards + free tier) -> escrow invariant -> swap pepe<->xtrata
//   round trip -> admin/fee guards -> paid inscribe + 50/50 split deltas ->
//   discount mechanics.
//
// Run:  cd simulations && node verify-collection-registry.mjs
// stxer routes tip-fetch through stacksNodeAPI (set on SimulationBuilder.new below)
const STACKS_API = "http://77.42.3.101/stacks-api"; // box full Stacks API (dodge Hiro 429)
import { createHash } from "node:crypto";
import {
  ClarityVersion,
  uintCV, bufferCV, stringAsciiCV, listCV,
  standardPrincipalCV, contractPrincipalCV,
  deserializeCV, cvToString,
} from "@stacks/transactions";
import fs from "node:fs";
import { SimulationBuilder, getSimulationResult } from "stxer";

// ---- principals ----
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";        // owner + payout-a
const CHAD     = "SP3WAAYXPC6WZNEC7SHGR36D32RJPZVXRR1BG0QSY";        // chadstx: owns #1110/#1111, ~534 STX free
const JIM      = "SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7";        // payout-b (hardcoded in contract)
const STRANGER = "SP000000000000000000002Q6VF78";                    // guard sender (0 balance)

const MASTER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3";
const PEPE   = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const NAME   = "xtrata-collection-registry-v1-0";
const CID    = `${DEPLOYER}.${NAME}`;          // registry principal (escrow vault)

const PEPE_A = 1110;   // chadstx-owned, unlisted
const PEPE_B = 1111;   // chadstx-owned, unlisted
const NOT_INSCRIBED = 2089;

const pcv = (s) => s.includes(".")
  ? contractPrincipalCV(s.split(".")[0], s.split(".")[1])
  : standardPrincipalCV(s);

// ---- xtrata single-tx hash chain: h0 = 32 zero bytes; h = sha256(h || chunk) ----
function xtrataHash(chunks) {
  let h = Buffer.alloc(32, 0);
  for (const c of chunks) h = createHash("sha256").update(Buffer.concat([h, c])).digest();
  return h;
}
// inscribe args for a synthetic 64-byte file (1 chunk, well under 512 KiB)
function inscribeArgs(tokenId, fill, uri) {
  const chunk = Buffer.alloc(64, fill);
  const hash = xtrataHash([chunk]);
  return [
    uintCV(tokenId),
    bufferCV(hash),
    stringAsciiCV("image/png"),
    uintCV(chunk.length),
    listCV([bufferCV(chunk)]),
    stringAsciiCV(uri),
  ];
}

// ---- builder + parallel assertion plan ----
const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_API });
const src = fs.readFileSync(
  "/home/raphastacks/projects/xtrata/xtrata-1.0/contracts/clarinet/contracts/fakfun-idea/xtrata-collection-registry-v1.0.clar",
  "utf8",
);

function deploy() {
  b.withSender(DEPLOYER).addContractDeploy({
    contract_name: NAME, source_code: src, clarity_version: ClarityVersion.Clarity5,
  });
  plan.push({ kind: "deploy", label: `deploy ${NAME} (Clarity5, as-contract? hardened)` });
}
function call(label, sender, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
// eval in the REGISTRY context (so local reads like get-binding/fee-for resolve)
function evalc(label, code, expect, capture) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, expect, capture });
}
const ownerOf = (c, id) => `(contract-call? '${c} get-owner u${id})`;
// owner of the xtrata twin bound to a pepe id (reads xtrata-id from the binding)
const twinOwner = (id) =>
  `(let ((bnd (unwrap-panic (get-binding u${id})))) (contract-call? '${MASTER} get-owner (get xtrata-id bnd)))`;

// =====================================================================
// Scenario
// =====================================================================
deploy();

// --- setup sanity ---
evalc("pepe #1110 owner == chadstx", ownerOf(PEPE, PEPE_A), `(ok (some ${CHAD}))`);

// --- inscribe: guard + free-tier happy path ---
call("inscribe #1110 by stranger (not owner) -> ERR-NOT-OWNER", STRANGER, "inscribe",
  inscribeArgs(PEPE_A, 0xab, "ipfs://pepe-1110"), "(err u200)");
call("inscribe #1110 by chadstx (free tier) -> (ok uXID)", CHAD, "inscribe",
  inscribeArgs(PEPE_A, 0xab, "ipfs://pepe-1110"), /^\(ok u\d+\)$/);
evalc("binding #1110: xtrata-escrowed = true", `(get-binding u${PEPE_A})`, /xtrata-escrowed true/);
evalc("inscribed-count == 1", "(get-inscribed-count)", "(ok u1)");
evalc("pepe #1110 still held by chadstx (not custodied)", ownerOf(PEPE, PEPE_A), `(ok (some ${CHAD}))`);
evalc("xtrata twin escrowed in registry", twinOwner(PEPE_A), `(ok (some ${CID}))`);
call("inscribe #1110 again -> ERR-ALREADY-INSCRIBED", CHAD, "inscribe",
  inscribeArgs(PEPE_A, 0xab, "ipfs://pepe-1110"), "(err u201)");

// --- swap pepe -> xtrata ---
call("swap-xtrata-for-pepe #1110 (wrong state) -> ERR-WRONG-STATE", CHAD, "swap-xtrata-for-pepe",
  [uintCV(PEPE_A)], "(err u203)");
call("swap-pepe-for-xtrata #1110 -> (ok true)", CHAD, "swap-pepe-for-xtrata",
  [uintCV(PEPE_A)], "(ok true)");
evalc("pepe #1110 now custodied by registry", ownerOf(PEPE, PEPE_A), `(ok (some ${CID}))`);
evalc("xtrata twin now held by chadstx", twinOwner(PEPE_A), `(ok (some ${CHAD}))`);
evalc("binding #1110: xtrata-escrowed = false", `(get-binding u${PEPE_A})`, /xtrata-escrowed false/);
call("swap-pepe-for-xtrata #2089 (no binding) -> ERR-NOT-INSCRIBED", CHAD, "swap-pepe-for-xtrata",
  [uintCV(NOT_INSCRIBED)], "(err u202)");

// --- swap xtrata -> pepe (round trip back) ---
call("swap-pepe-for-xtrata #1110 (wrong state) -> ERR-WRONG-STATE", CHAD, "swap-pepe-for-xtrata",
  [uintCV(PEPE_A)], "(err u203)");
call("swap-xtrata-for-pepe #1110 -> (ok true)", CHAD, "swap-xtrata-for-pepe",
  [uintCV(PEPE_A)], "(ok true)");
evalc("pepe #1110 back to chadstx", ownerOf(PEPE, PEPE_A), `(ok (some ${CHAD}))`);
evalc("xtrata twin back to registry", twinOwner(PEPE_A), `(ok (some ${CID}))`);
evalc("binding #1110: xtrata-escrowed = true", `(get-binding u${PEPE_A})`, /xtrata-escrowed true/);

// --- admin / fee guards ---
call("set-fee by stranger -> ERR-NOT-AUTHORIZED", STRANGER, "set-fee", [uintCV(5000000)], "(err u204)");
call("set-discount fee == inscribe-fee (not < ) -> ERR-BAD-DISCOUNT", DEPLOYER, "set-discount",
  [pcv(CHAD), uintCV(3000000)], "(err u205)");
call("set-free-threshold 0 (owner) -> (ok true)", DEPLOYER, "set-free-threshold", [uintCV(0)], "(ok true)");

// --- paid inscribe (#1111, standard 3 STX) + 50/50 split deltas ---
evalc("payout-a (deployer) STX before", `(stx-get-balance '${DEPLOYER})`, undefined, "A_before");
evalc("payout-b (jim) STX before", `(stx-get-balance '${JIM})`, undefined, "B_before");
call("inscribe #1111 (paid, threshold now 0) -> (ok uXID)", CHAD, "inscribe",
  inscribeArgs(PEPE_B, 0xcd, "ipfs://pepe-1111"), /^\(ok u\d+\)$/);
evalc("payout-a (deployer) STX after", `(stx-get-balance '${DEPLOYER})`, undefined, "A_after");
evalc("payout-b (jim) STX after", `(stx-get-balance '${JIM})`, undefined, "B_after");
evalc("inscribed-count == 2", "(get-inscribed-count)", "(ok u2)");

// --- discount mechanics ---
call("set-discount(chadstx, 1 STX) (< fee) -> (ok true)", DEPLOYER, "set-discount",
  [pcv(CHAD), uintCV(1000000)], "(ok true)");
evalc("fee-for(chadstx) == 1 STX (discount)", `(fee-for '${CHAD})`, "u1000000");
evalc("fee-for(stranger) == 3 STX (standard)", `(fee-for '${STRANGER})`, "u3000000");
call("remove-discount(chadstx) -> (ok true)", DEPLOYER, "remove-discount", [pcv(CHAD)], "(ok true)");
evalc("fee-for(chadstx) == 3 STX after removal", `(fee-for '${CHAD})`, "u3000000");

// =====================================================================
// Run + verify
// =====================================================================
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx result>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); }
  catch (e) { return `decode-failed(${r.Ok?.result}): ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval result>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); }
}
const match = (got, expect) =>
  expect instanceof RegExp ? expect.test(got) : got === expect;
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  console.log("=== xtrata-collection-registry SELF-VERIFYING stxer harness ===\n");
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);

  const res = await getSimulationResult(sessionId);
  const steps = res.steps;
  const cap = {};
  let pass = 0, fail = 0;

  steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`);
      ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      const ok = match(got, p.expect);
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`);
      ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const got = decodeEval(s);
      if (p.capture) cap[p.capture] = got;
      if (p.expect === undefined) {
        console.log(`ℹ️  [${i}] ${p.label}: ${got}`);
      } else {
        const ok = match(got, p.expect);
        console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`);
        ok ? pass++ : fail++;
      }
    }
  });

  // --- 50/50 split delta assertions (registry fee = 3 STX) ---
  console.log("\n--- fee split deltas (STX, 6-dec) ---");
  const aDelta = uintOf(cap.A_after) - uintOf(cap.A_before);
  const bDelta = uintOf(cap.B_after) - uintOf(cap.B_before);
  for (const [label, got, want] of [
    ["payout-a (deployer) delta == 1.5 STX", aDelta, 1500000n],
    ["payout-b (jim) delta == 1.5 STX", bDelta, 1500000n],
  ]) {
    const ok = got === want;
    console.log(`${ok ? "✅" : "❌"} ${label}: got ${got} (want ${want})`);
    ok ? pass++ : fail++;
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  console.log(`View: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
