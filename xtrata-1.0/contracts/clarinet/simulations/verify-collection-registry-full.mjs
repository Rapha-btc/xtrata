// verify-collection-registry-full.mjs
// FULL-PATH-COVERAGE stxer harness for xtrata-collection-registry-v1.0
// (as-contract? / current-contract hardened — Clarity 4+, validated on the real
// mainnet VM against live xtrata-v3-2-3 + bitcoin-pepe).
//
// Covers every public function, both auth paths, every error code (u1/u100/
// u103/u200-u205), all charge-fee branches (free / standard / discounted /
// odd-remainder), mint-failure atomic revert, get-owner-none, all read-only
// getters, the escrow invariant across full round trips, set-payouts routing,
// and transfer-ownership effects.
//
// Run:  cd simulations && node verify-collection-registry-full.mjs
const STACKS_API = "http://77.42.3.101/stacks-api"; // box full Stacks API (dodge Hiro 429)
import { createHash } from "node:crypto";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, listCV,
  standardPrincipalCV, contractPrincipalCV, deserializeCV, cvToString,
} from "@stacks/transactions";
import fs from "node:fs";
import { SimulationBuilder, getSimulationResult } from "stxer";

// ---- principals ----
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";   // owner + payout-a (initial)
const CHAD     = "SP3WAAYXPC6WZNEC7SHGR36D32RJPZVXRR1BG0QSY";   // inscriber: owns 416 pepes incl 1110-1112
const JIM      = "SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7";   // payout-b (initial, hardcoded)
const STRANGER = "SP000000000000000000002Q6VF78";              // guard sender
const NEWA     = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";   // new payout-a (set-payouts test)
const NEWB     = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";   // new payout-b

const MASTER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3";
const PEPE   = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const NAME   = "xtrata-collection-registry-v1-0";
const CID    = `${DEPLOYER}.${NAME}`;

const A = 1110, B = 1111, C = 1112; // chadstx-owned, unlisted
const GHOST = 99999;                // never minted

const pcv = (s) => s.includes(".")
  ? contractPrincipalCV(s.split(".")[0], s.split(".")[1]) : standardPrincipalCV(s);

// xtrata single-tx hash: h0 = 32 zero bytes; h = sha256(h || chunk)
const xtrataHash = (chunks) => {
  let h = Buffer.alloc(32, 0);
  for (const c of chunks) h = createHash("sha256").update(Buffer.concat([h, c])).digest();
  return h;
};
const chunkOf = (fill) => Buffer.alloc(64, fill);
const args = (id, fill, uri) => {
  const ch = chunkOf(fill);
  return [uintCV(id), bufferCV(xtrataHash([ch])), stringAsciiCV("image/png"),
    uintCV(ch.length), listCV([bufferCV(ch)]), stringAsciiCV(uri)];
};
// correct chunk bytes but a deliberately wrong expected-hash -> xtrata ERR-HASH-MISMATCH
const argsBadHash = (id, fill, uri) => {
  const ch = chunkOf(fill);
  return [uintCV(id), bufferCV(Buffer.alloc(32, 0xff)), stringAsciiCV("image/png"),
    uintCV(ch.length), listCV([bufferCV(ch)]), stringAsciiCV(uri)];
};

// ---- builder + parallel plan ----
const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_API });
const src = fs.readFileSync(
  "/home/raphastacks/projects/xtrata/xtrata-1.0/contracts/clarinet/contracts/fakfun-idea/xtrata-collection-registry-v1.0.clar", "utf8");

function deploy() {
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: NAME, source_code: src, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label: `deploy ${NAME}` });
}
function call(label, sender, fn, a, expect) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: a });
  plan.push({ kind: "tx", label, expect });
}
function evalc(label, code, expect, capture) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, expect, capture });
}
const sections = {};
function section(t) { sections[plan.length] = t; } // keyed by step index, NOT a plan entry
const owner = (c, id) => `(contract-call? '${c} get-owner u${id})`;
const twin = (id) => `(let ((bn (unwrap-panic (get-binding u${id})))) (contract-call? '${MASTER} get-owner (get xtrata-id bn)))`;
const SOME = (p) => `(ok (some ${p}))`;
const ERR = /^\(err u\d+\)$/;

// =====================================================================
deploy();

section("Initial read-only state (every getter)");
evalc("get-owner == deployer", "(get-owner)", `(ok ${DEPLOYER})`);
evalc("get-fee == 3 STX", "(get-fee)", "(ok u3000000)");
evalc("get-free-threshold == 69", "(get-free-threshold)", "(ok u69)");
evalc("get-payouts == {a: deployer, b: jim}", "(get-payouts)", `(ok (tuple (a ${DEPLOYER}) (b ${JIM})))`);
evalc("get-inscribed-count == 0", "(get-inscribed-count)", "(ok u0)");
evalc("is-inscribed #1110 == false", `(is-inscribed u${A})`, "(ok false)");
evalc("get-discount(chad) == none", `(get-discount '${CHAD})`, "none");
evalc("fee-for(chad) == 0 (free tier, count<threshold)", `(fee-for '${CHAD})`, "u0");

section("inscribe guards + free-tier happy path (#1110)");
call("inscribe #1110 by stranger (not owner) -> ERR-NOT-OWNER", STRANGER, "inscribe", args(A, 0xab, "ipfs://a"), "(err u200)");
call("inscribe GHOST #99999 (get-owner none) -> ERR-NOT-OWNER", CHAD, "inscribe", args(GHOST, 0xab, "ipfs://x"), "(err u200)");
call("inscribe #1110 bad hash -> xtrata ERR-HASH-MISMATCH (u103), reverts", CHAD, "inscribe", argsBadHash(A, 0xab, "ipfs://a"), "(err u103)");
evalc("...is-inscribed #1110 still false after revert", `(is-inscribed u${A})`, "(ok false)");
call("inscribe #1110 by chadstx (free) -> (ok uXID)", CHAD, "inscribe", args(A, 0xab, "ipfs://a"), /^\(ok u\d+\)$/);
evalc("inscribed-count == 1", "(get-inscribed-count)", "(ok u1)");
evalc("is-inscribed #1110 == true", `(is-inscribed u${A})`, "(ok true)");
evalc("binding #1110 escrowed=true", `(get-binding u${A})`, /xtrata-escrowed true/);
evalc("pepe #1110 still chadstx (kept)", owner(PEPE, A), SOME(CHAD));
evalc("xtrata twin escrowed in registry", twin(A), SOME(CID));
call("inscribe #1110 again -> ERR-ALREADY-INSCRIBED", CHAD, "inscribe", args(A, 0xab, "ipfs://a"), "(err u201)");

section("swap pepe<->xtrata round trip + guards (#1110)");
call("swap-xtrata-for-pepe #1110 (wrong state) -> ERR-WRONG-STATE", CHAD, "swap-xtrata-for-pepe", [uintCV(A)], "(err u203)");
call("swap-pepe-for-xtrata #1110 by stranger (non-holder) -> pepe (err u1)", STRANGER, "swap-pepe-for-xtrata", [uintCV(A)], "(err u1)");
call("swap-pepe-for-xtrata #1110 by chadstx -> (ok true)", CHAD, "swap-pepe-for-xtrata", [uintCV(A)], "(ok true)");
evalc("pepe #1110 now custodied by registry", owner(PEPE, A), SOME(CID));
evalc("xtrata twin now held by chadstx", twin(A), SOME(CHAD));
evalc("binding #1110 escrowed=false", `(get-binding u${A})`, /xtrata-escrowed false/);
call("swap-pepe-for-xtrata #2089 (no binding) -> ERR-NOT-INSCRIBED", CHAD, "swap-pepe-for-xtrata", [uintCV(2089)], "(err u202)");
call("swap-xtrata-for-pepe GHOST (no binding) -> ERR-NOT-INSCRIBED", CHAD, "swap-xtrata-for-pepe", [uintCV(GHOST)], "(err u202)");
call("swap-pepe-for-xtrata #1110 (wrong state) -> ERR-WRONG-STATE", CHAD, "swap-pepe-for-xtrata", [uintCV(A)], "(err u203)");
call("swap-xtrata-for-pepe #1110 by stranger (non-holder of twin) -> xtrata (err u100)", STRANGER, "swap-xtrata-for-pepe", [uintCV(A)], "(err u100)");
call("swap-xtrata-for-pepe #1110 by chadstx -> (ok true)", CHAD, "swap-xtrata-for-pepe", [uintCV(A)], "(ok true)");
evalc("pepe #1110 back to chadstx", owner(PEPE, A), SOME(CHAD));
evalc("xtrata twin back to registry", twin(A), SOME(CID));
evalc("binding #1110 escrowed=true", `(get-binding u${A})`, /xtrata-escrowed true/);

section("admin auth guards (every owner-only fn rejects stranger)");
call("set-fee by stranger -> ERR-NOT-AUTHORIZED", STRANGER, "set-fee", [uintCV(1)], "(err u204)");
call("set-free-threshold by stranger -> ERR-NOT-AUTHORIZED", STRANGER, "set-free-threshold", [uintCV(1)], "(err u204)");
call("set-discount by stranger -> ERR-NOT-AUTHORIZED", STRANGER, "set-discount", [pcv(CHAD), uintCV(1)], "(err u204)");
call("remove-discount by stranger -> ERR-NOT-AUTHORIZED", STRANGER, "remove-discount", [pcv(CHAD)], "(err u204)");
call("set-payouts by stranger -> ERR-NOT-AUTHORIZED", STRANGER, "set-payouts", [pcv(NEWA), pcv(NEWB)], "(err u204)");
call("transfer-ownership by stranger -> ERR-NOT-AUTHORIZED", STRANGER, "transfer-ownership", [pcv(CHAD)], "(err u204)");

section("admin success paths + discount mechanics");
call("set-fee(3000001) owner -> ok", DEPLOYER, "set-fee", [uintCV(3000001)], "(ok true)");
evalc("get-fee == 3000001", "(get-fee)", "(ok u3000001)");
call("set-free-threshold(0) owner -> ok", DEPLOYER, "set-free-threshold", [uintCV(0)], "(ok true)");
evalc("get-free-threshold == 0", "(get-free-threshold)", "(ok u0)");
call("set-discount(chad, =fee) not < -> ERR-BAD-DISCOUNT", DEPLOYER, "set-discount", [pcv(CHAD), uintCV(3000001)], "(err u205)");
call("set-discount(chad, 1 STX) -> ok", DEPLOYER, "set-discount", [pcv(CHAD), uintCV(1000000)], "(ok true)");
evalc("get-discount(chad) == (some u1000000)", `(get-discount '${CHAD})`, "(some u1000000)");
evalc("fee-for(chad) == 1 STX (discount)", `(fee-for '${CHAD})`, "u1000000");
evalc("fee-for(stranger) == 3000001 (standard)", `(fee-for '${STRANGER})`, "u3000001");
call("remove-discount(chad) -> ok", DEPLOYER, "remove-discount", [pcv(CHAD)], "(ok true)");
evalc("get-discount(chad) == none", `(get-discount '${CHAD})`, "none");
evalc("fee-for(chad) == 3000001 after removal", `(fee-for '${CHAD})`, "u3000001");

section("paid inscribe (#1111): mint-fail atomic fee revert + odd-remainder split");
evalc("payout-a before", `(stx-get-balance '${DEPLOYER})`, undefined, "A0");
evalc("payout-b before", `(stx-get-balance '${JIM})`, undefined, "B0");
call("inscribe #1111 bad hash (fee should NOT be charged) -> u103", CHAD, "inscribe", argsBadHash(B, 0xcd, "ipfs://b"), "(err u103)");
evalc("payout-a mid (== before, fee reverted)", `(stx-get-balance '${DEPLOYER})`, undefined, "Amid");
evalc("payout-b mid (== before, fee reverted)", `(stx-get-balance '${JIM})`, undefined, "Bmid");
call("inscribe #1111 correct (paid 3000001) -> (ok uXID)", CHAD, "inscribe", args(B, 0xcd, "ipfs://b"), /^\(ok u\d+\)$/);
evalc("payout-a after", `(stx-get-balance '${DEPLOYER})`, undefined, "A1");
evalc("payout-b after", `(stx-get-balance '${JIM})`, undefined, "B1");
evalc("inscribed-count == 2", "(get-inscribed-count)", "(ok u2)");

section("set-payouts routes the split to NEW recipients (#1112)");
call("set-payouts(newA,newB) owner -> ok", DEPLOYER, "set-payouts", [pcv(NEWA), pcv(NEWB)], "(ok true)");
evalc("get-payouts == {a:newA, b:newB}", "(get-payouts)", `(ok (tuple (a ${NEWA}) (b ${NEWB})))`);
evalc("newA before", `(stx-get-balance '${NEWA})`, undefined, "NA0");
evalc("newB before", `(stx-get-balance '${NEWB})`, undefined, "NB0");
call("inscribe #1112 (paid 3000001) -> (ok uXID)", CHAD, "inscribe", args(C, 0xef, "ipfs://c"), /^\(ok u\d+\)$/);
evalc("newA after", `(stx-get-balance '${NEWA})`, undefined, "NA1");
evalc("newB after", `(stx-get-balance '${NEWB})`, undefined, "NB1");
evalc("inscribed-count == 3", "(get-inscribed-count)", "(ok u3)");

section("transfer-ownership flips admin authority");
call("transfer-ownership(chad) owner -> ok", DEPLOYER, "transfer-ownership", [pcv(CHAD)], "(ok true)");
evalc("get-owner == chad", "(get-owner)", `(ok ${CHAD})`);
call("set-fee by old owner (deployer) -> ERR-NOT-AUTHORIZED", DEPLOYER, "set-fee", [uintCV(0)], "(err u204)");
call("set-fee(0) by new owner (chad) -> ok", CHAD, "set-fee", [uintCV(0)], "(ok true)");
evalc("get-fee == 0", "(get-fee)", "(ok u0)");

// =====================================================================
function decTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-fail(${r.Ok?.result})`; }
}
function decEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); }
}
const match = (g, e) => e instanceof RegExp ? e.test(g) : g === e;
const u = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

async function main() {
  console.log("=== xtrata-collection-registry FULL-COVERAGE stxer harness ===\n");
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {}; let pass = 0, fail = 0;
  res.steps.forEach((s, i) => {
    if (sections[i]) console.log(`\n— ${sections[i]} —`);
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const g = decTx(s), ok = match(g, p.expect);
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}  got ${g}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const g = decEval(s); if (p.capture) cap[p.capture] = g;
      if (p.expect === undefined) { console.log(`ℹ️  [${i}] ${p.label}: ${g}`); }
      else { const ok = match(g, p.expect); console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}  got ${g}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
    }
  });

  console.log("\n— delta assertions —");
  const checks = [
    ["#1111 mint-fail: payout-a UNCHANGED", u(cap.Amid) - u(cap.A0), 0n],
    ["#1111 mint-fail: payout-b UNCHANGED", u(cap.Bmid) - u(cap.B0), 0n],
    ["#1111 split: payout-a += half (1500000)", u(cap.A1) - u(cap.A0), 1500000n],
    ["#1111 split: payout-b += remainder (1500001, odd)", u(cap.B1) - u(cap.B0), 1500001n],
    ["#1112 split routes to newA (+1500000)", u(cap.NA1) - u(cap.NA0), 1500000n],
    ["#1112 split routes to newB (+1500001)", u(cap.NB1) - u(cap.NB0), 1500001n],
  ];
  for (const [l, got, want] of checks) {
    const ok = got === want; console.log(`${ok ? "✅" : "❌"} ${l}: got ${got} (want ${want})`); ok ? pass++ : fail++;
  }
  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
