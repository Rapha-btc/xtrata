// verify-forever-v2.mjs
// stxer mainnet-fork harness for xtrata-fakfun-forever-v2 (canonical-gated).
//
// FINAL design under test (permissionless / no-v1 variant):
//   - Inscribe is PERMISSIONLESS: anyone may inscribe any EXISTING token's
//     canonical twin. The only "owner" gate is a token-EXISTS check
//     (get-owner is-some); a missing token reverts ERR-NO-SUCH-TOKEN (u200).
//   - Canonical-hash gate: expected-hash must equal the token's seeded
//     CanonicalHash or the call reverts ERR-NOT-CANONICAL (u206).
//   - One twin per token: a second inscribe reverts ERR-ALREADY-INSCRIBED (u201).
//   - Seed/finalize freeze: seed-canonical is owner-only and only while open;
//     after finalize-canonical it reverts ERR-FINALIZED (u207). Finalize freezes
//     SEEDING, not inscribe -- inscribe still works after finalize.
//   - Escrow swaps: swap-pepe-for-xtrata / swap-xtrata-for-pepe flip custody;
//     wrong direction -> ERR-WRONG-STATE (u203), no binding -> ERR-NOT-INSCRIBED (u202).
//   - Fees: first `free-threshold` (u87) inscriptions are free, then `inscribe-fee`
//     (3 STX) split 50/50 to payout-a / payout-b, unless a pinned per-address
//     discount applies (clamped to the standard fee). All knobs owner-settable.
//   - Admin auth: every owner-gated fn reverts ERR-NOT-AUTHORIZED (u204) for a
//     stranger; transfer-ownership moves the owner and the OLD owner loses access.
//
// NOTE on contract rename: ERR-NOT-OWNER was renamed to ERR-NO-SUCH-TOKEN but is
// still (err u200), so every numeric assertion below is unaffected.
//
// THIS HARNESS COVERS EVERY PUBLIC + PRIVATE FUNCTION AND EVERY BRANCH/ERROR.
// See the coverage table printed at the end of the run and README-forever-v2.md.
//
// Run: cd simulations && node verify-forever-v2.mjs
const STACKS_API = "http://77.42.3.101/stacks-api"; // box full Stacks API (dodge Hiro 429)
import { createHash } from "node:crypto";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, listCV,
  standardPrincipalCV, contractPrincipalCV, tupleCV,
  deserializeCV, cvToString,
} from "@stacks/transactions";
import fs from "node:fs";
import { SimulationBuilder, getSimulationResult } from "stxer";

// ---- principals ----
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // owner + payout-a; yields CID
const STRANGER = "SP000000000000000000002Q6VF78";           // guard sender (admin-gate tests)
const PAYOUT_B = "SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7"; // default payout-b (Jim / xtrata)
const ALT_A    = "SP3VHXRGG60D5MK1BCM6D3RXE26EGE5M8K9JM5T4E"; // set-payouts target a
const ALT_B    = "SP1ERZZ0G7KERNCXQDJF4GTHCF8DGZB8001YCNPQG"; // set-payouts target b

const MASTER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3";
const PEPE   = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const NAME   = "xtrata-fakfun-forever-v2";
const CID    = `${DEPLOYER}.${NAME}`;

// ---- token scenarios (real mainnet owners, verified via box get-owner) ----
// Token T = #500, free-tier scenario. Real owner A. Sponsor B (a DIFFERENT funded
// holder who owns #161, not #500, and is not the contract owner) gifts the
// canonical twin into escrow; only A can ever swap it out.
const T         = 500;
const A_OWNER   = "SP3MYTHK18PMGCDN6EG9Y4XN13FA87NMZRDZST0XN"; // real owner of #500 (~113 STX)
const B_SPONSOR = "SP1DPNP3RRD6JG1557SP6JMX68W5BV6R2Z74BQEXV"; // funded (~33 STX); owns #161, NOT #500

// Token T2 = #161, PAID-tier scenario. B owns #161, so after we drop
// free-threshold to 0, B does a full PAID inscribe of its OWN token (fee split
// asserted via payout balance deltas) and then swaps it both ways.
const T2        = 161;
const B2_OWNER  = B_SPONSOR; // owner of #161 == B_SPONSOR

// Token T3 = #300, used for the discount-tier scenario. Owner O3 inscribes its
// own token while pinned to a 1-STX discount (clamped path also exercised).
const T3        = 300;
const O3_OWNER  = "SP3AFSKPE2BQ84WXEZ03PQ2E18B02A8ZZWK6190KW"; // owner of #300 (~9 STX)

const NO_SEED = 9999; // does not exist in the collection -> get-owner = none, no canonical seed
const UNSEEDED_AFTER_FREEZE = 7; // exists, but we deliberately never seed it -> u206 even though real

const FEE_STD   = 3000000; // default inscribe-fee (3 STX)
const DISCOUNT  = 1000000; // pinned discount (1 STX) for O3

// ---- canonical data ----
const HASHES = JSON.parse(fs.readFileSync("/tmp/pepe-hashes.json", "utf8")); // id(str) -> {hash, size}
const BE = "https://faktory-dao-backend.vercel.app";
const CHUNK = 16384;
const sha256 = (b) => createHash("sha256").update(b).digest();
const rolling = (bytes) => { let r = Buffer.alloc(32, 0); for (let i = 0; i < bytes.length; i += CHUNK) r = sha256(Buffer.concat([r, bytes.subarray(i, Math.min(i + CHUNK, bytes.length))])); return r; };

// fetch real bytes for a pepe (single chunk) and build inscribe args
async function inscribeArgs(id, { tamper = false } = {}) {
  const r = await fetch(`${BE}/api/pepe-xtrata/image/${id}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const h = rolling(bytes);
  if ("0x" + h.toString("hex") !== HASHES[String(id)].hash) throw new Error(`hash drift #${id}`);
  const expected = tamper ? Buffer.from(h) : h;
  if (tamper) expected[0] ^= 0xff; // flip one byte -> != canonical
  const uri = `ipfs://pepe/${id}.json`;
  return [
    uintCV(id), bufferCV(expected), stringAsciiCV("image/png"),
    uintCV(bytes.length), listCV([bufferCV(bytes)]), stringAsciiCV(uri),
  ];
}

const hexToBuf = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const entryCV = (id) => tupleCV({ id: uintCV(id), hash: bufferCV(hexToBuf(HASHES[String(id)].hash)) });

// ---- builder + parallel plan ----
const plan = [];
const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_API });
const src = fs.readFileSync(
  "/home/raphastacks/projects/xtrata/xtrata-1.0/contracts/clarinet/contracts/fakfun-idea/xtrata-fakfun-forever-v2.clar", "utf8");

const pcv = (s) => s.includes(".") ? contractPrincipalCV(s.split(".")[0], s.split(".")[1]) : standardPrincipalCV(s);
function deploy() {
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: NAME, source_code: src, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label: `deploy ${NAME}`, cover: "deploy" });
}
function call(label, sender, fn, a, expect, opts = {}) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: a });
  plan.push({ kind: "tx", label, expect, ...opts });
}
function evalc(label, code, expect, opts = {}) {
  b.addEvalCode(CID, code);
  plan.push({ kind: "eval", label, expect, ...opts });
}
const sections = {};
function section(t) { sections[plan.length] = t; }

const ownerPepe = (id) => `(contract-call? '${PEPE} get-owner u${id})`;
const twinOwner = (id) => `(let ((bn (unwrap-panic (get-binding u${id})))) (contract-call? '${MASTER} get-owner (get xtrata-id bn)))`;
const SOME = (p) => `(ok (some ${p}))`;
const stxBal = (p) => `(stx-get-balance '${p})`;

// =====================================================================
async function build() {
  // ---- 1. Deploy clean: deploy just publishes. No boot call, no V1Forever. ----
  deploy();

  section("Point 1: clean deploy state + ALL readers at genesis");
  evalc("get-owner == deployer", "(get-owner)", `(ok ${DEPLOYER})`, { cover: "get-owner" });
  evalc("get-free-threshold == 87", "(get-free-threshold)", "(ok u87)", { cover: "get-free-threshold" });
  evalc("get-fee == 3 STX (3000000)", "(get-fee)", "(ok u3000000)", { cover: "get-fee" });
  evalc("get-payouts == {a: deployer, b: PAYOUT_B}", "(get-payouts)",
    `(ok (tuple (a ${DEPLOYER}) (b ${PAYOUT_B})))`, { cover: "get-payouts" });
  evalc("is-finalized == false", "(is-finalized)", "(ok false)", { cover: "is-finalized" });
  evalc("get-inscribed-count == 0", "(get-inscribed-count)", "(ok u0)", { cover: "get-inscribed-count" });
  evalc("get-discount #B == none (no pins yet)", `(get-discount '${B_SPONSOR})`, "none", { cover: "get-discount" });
  evalc("get-canonical-hash #500 == none (pre-seed)", `(get-canonical-hash u${T})`, "none", { cover: "get-canonical-hash" });
  evalc("get-binding #500 == none (pre-inscribe)", `(get-binding u${T})`, "none", { cover: "get-binding" });
  evalc("is-inscribed #500 == false (pre-inscribe)", `(is-inscribed u${T})`, "(ok false)", { cover: "is-inscribed" });
  // fee-for: count(0) < threshold(87) -> free for everyone
  evalc("fee-for B == u0 (free tier, count<threshold)", `(fee-for '${B_SPONSOR})`, "u0", { cover: "fee-for:free" });

  // ---- 2. Seed full canonical set (2089 in batches of 200) ----
  section("Point 2: seed canonical (2089 in batches of 200)");
  // NOTE: we intentionally do NOT seed UNSEEDED_AFTER_FREEZE (#7) so we can prove
  // an EXISTING-but-unseeded token reverts u206 even after finalize.
  const ids = Array.from({ length: 2089 }, (_, i) => i + 1).filter((x) => x !== UNSEEDED_AFTER_FREEZE);
  const batches = [];
  for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));
  batches.forEach((batch, bi) => {
    const cv = listCV(batch.map(entryCV));
    call(`seed-canonical batch ${bi + 1}/${batches.length} (${batch.length}: ${batch[0]}..${batch[batch.length - 1]})`,
      DEPLOYER, "seed-canonical", [cv], "(ok true)", { batchSize: batch.length, cover: "seed-canonical:ok" });
  });
  call("seed-canonical by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "seed-canonical", [listCV([entryCV(1)])], "(err u204)", { cover: "seed-canonical:u204" });
  evalc("get-canonical-hash #500 (T) == seeded", `(get-canonical-hash u${T})`, `(some ${HASHES[String(T)].hash})`, { cover: "get-canonical-hash" });
  evalc("get-canonical-hash #2089 == seeded (last)", `(get-canonical-hash u2089)`, `(some ${HASHES["2089"].hash})`, { cover: "get-canonical-hash" });
  evalc("get-canonical-hash #7 == none (deliberately unseeded)", `(get-canonical-hash u${UNSEEDED_AFTER_FREEZE})`, "none");

  // ---- 5a. Pre-inscribe revert paths (token-exists + canonical gate) ----
  section("Point 5: inscribe revert paths (pre real inscribe)");
  call("inscribe #9999 (nonexistent, get-owner=none) -> ERR-NO-SUCH-TOKEN (u200)",
    B_SPONSOR, "inscribe", [uintCV(NO_SEED), bufferCV(Buffer.alloc(32, 0)), stringAsciiCV("image/png"),
      uintCV(1), listCV([bufferCV(Buffer.from([0]))]), stringAsciiCV("ipfs://x")], "(err u200)", { cover: "inscribe:u200" });
  call("inscribe #7 (EXISTS but unseeded) -> ERR-NOT-CANONICAL (u206)",
    B_SPONSOR, "inscribe", await inscribeArgs(UNSEEDED_AFTER_FREEZE), "(err u206)", { cover: "inscribe:u206-unseeded" });
  call("inscribe #500 TAMPERED hash -> ERR-NOT-CANONICAL (u206)",
    B_SPONSOR, "inscribe", await inscribeArgs(T, { tamper: true }), "(err u206)", { cover: "inscribe:u206-tampered" });
  evalc("...binding #500 still none after reverts", `(get-binding u${T})`, "none");
  evalc("...inscribed-count still 0 after reverts", "(get-inscribed-count)", "(ok u0)");

  // ---- swap revert: not-inscribed (no binding yet) ----
  section("Point 4: swap revert paths -- not-inscribed (u202)");
  call("swap-pepe-for-xtrata #500 (no binding) -> ERR-NOT-INSCRIBED (u202)",
    A_OWNER, "swap-pepe-for-xtrata", [uintCV(T)], "(err u202)", { cover: "swap-pepe-for-xtrata:u202" });
  call("swap-xtrata-for-pepe #500 (no binding) -> ERR-NOT-INSCRIBED (u202)",
    A_OWNER, "swap-xtrata-for-pepe", [uintCV(T)], "(err u202)", { cover: "swap-xtrata-for-pepe:u202" });

  // ---- 3. PERMISSIONLESS FREE inscribe: B (not owner, not contract-owner) inscribes T ----
  section("Point 3: PERMISSIONLESS FREE inscribe -- B (NOT owner of #500) inscribes its twin");
  call("inscribe #500 by B (sponsor, NOT owner, free tier) -> (ok uXID)", B_SPONSOR, "inscribe", await inscribeArgs(T), /^\(ok u\d+\)$/, { cover: "inscribe:free-ok" });
  evalc("get-inscribed-count == 1", "(get-inscribed-count)", "(ok u1)", { cover: "get-inscribed-count" });
  evalc("is-inscribed #500 == true", `(is-inscribed u${T})`, "(ok true)", { cover: "is-inscribed" });
  evalc("binding #500 inscriber == B (sponsor)", `(get-binding u${T})`, new RegExp(`inscriber ${B_SPONSOR}`), { cover: "get-binding" });
  evalc("binding #500 escrowed=true (twin in registry)", `(get-binding u${T})`, /xtrata-escrowed true/);
  evalc("binding #500 content-hash == canonical", `(get-binding u${T})`, new RegExp(HASHES[String(T)].hash));
  evalc("twin #500 escrowed in registry (CID)", twinOwner(T), SOME(CID));
  evalc("pepe #500 did NOT move -- still owned by A", ownerPepe(T), SOME(A_OWNER));
  call("inscribe #500 again -> ERR-ALREADY-INSCRIBED (u201)", B_SPONSOR, "inscribe", await inscribeArgs(T), "(err u201)", { cover: "inscribe:u201" });

  // ---- 4. Swaps owner-gated + wrong-state branches (token #500) ----
  section("Point 4: swaps owner-gated -- B cannot swap, A can; wrong-state (u203)");
  // B inscribed but does NOT own #500. swap-pepe-for-xtrata deposits the pepe,
  // so B's pepe transfer fails (B owns no #500). Sponsor cannot steal the twin.
  call("swap-pepe-for-xtrata #500 by B -> revert (B doesn't own the pepe)",
    B_SPONSOR, "swap-pepe-for-xtrata", [uintCV(T)], /^\(err/, { cover: "swap:non-owner-cant" });
  evalc("twin #500 STILL in registry (B failed to take it)", twinOwner(T), SOME(CID));
  evalc("pepe #500 STILL with A (B's swap reverted)", ownerPepe(T), SOME(A_OWNER));

  // WRONG-STATE: twin is escrowed (escrowed=true), so swap-xtrata-for-pepe is the
  // wrong direction -> u203 (you can only deposit the xtrata when YOU hold it).
  call("swap-xtrata-for-pepe #500 while twin escrowed -> ERR-WRONG-STATE (u203)",
    A_OWNER, "swap-xtrata-for-pepe", [uintCV(T)], "(err u203)", { cover: "swap-xtrata-for-pepe:u203" });

  // Real owner A can swap: deposits pepe, gets the gifted twin.
  call("swap-pepe-for-xtrata #500 by A (real owner) -> (ok true)", A_OWNER, "swap-pepe-for-xtrata", [uintCV(T)], "(ok true)", { cover: "swap-pepe-for-xtrata:ok" });
  evalc("pepe #500 now custodied by registry", ownerPepe(T), SOME(CID));
  evalc("twin #500 now held by A", twinOwner(T), SOME(A_OWNER));
  evalc("binding #500 escrowed=false", `(get-binding u${T})`, /xtrata-escrowed false/);

  // WRONG-STATE the other way: twin no longer escrowed (escrowed=false), so
  // swap-pepe-for-xtrata is the wrong direction -> u203.
  call("swap-pepe-for-xtrata #500 while twin NOT escrowed -> ERR-WRONG-STATE (u203)",
    A_OWNER, "swap-pepe-for-xtrata", [uintCV(T)], "(err u203)", { cover: "swap-pepe-for-xtrata:u203" });

  // ... and A can flip it back.
  call("swap-xtrata-for-pepe #500 by A -> (ok true)", A_OWNER, "swap-xtrata-for-pepe", [uintCV(T)], "(ok true)", { cover: "swap-xtrata-for-pepe:ok" });
  evalc("pepe #500 back to A", ownerPepe(T), SOME(A_OWNER));
  evalc("twin #500 back to registry", twinOwner(T), SOME(CID));
  evalc("binding #500 escrowed=true", `(get-binding u${T})`, /xtrata-escrowed true/);

  // ---- 6. FEE LOGIC: discount setters, clamp, paid tier, fee split ----
  section("Point 6a: discount setters + fee-for branches (no fee charged yet)");
  // set-discount auth gate
  call("set-discount by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "set-discount", [pcv(O3_OWNER), uintCV(DISCOUNT)], "(err u204)", { cover: "set-discount:u204" });
  // set-discount with fee >= inscribe-fee -> ERR-BAD-DISCOUNT (u205)
  call("set-discount fee==inscribe-fee -> ERR-BAD-DISCOUNT (u205)", DEPLOYER, "set-discount", [pcv(O3_OWNER), uintCV(FEE_STD)], "(err u205)", { cover: "set-discount:u205" });
  call("set-discount fee>inscribe-fee -> ERR-BAD-DISCOUNT (u205)", DEPLOYER, "set-discount", [pcv(O3_OWNER), uintCV(FEE_STD + 1)], "(err u205)", { cover: "set-discount:u205" });
  // valid discount
  call("set-discount O3 = 1 STX (valid) -> (ok true)", DEPLOYER, "set-discount", [pcv(O3_OWNER), uintCV(DISCOUNT)], "(ok true)", { cover: "set-discount:ok" });
  evalc("get-discount O3 == 1 STX", `(get-discount '${O3_OWNER})`, "(some u1000000)", { cover: "get-discount" });
  // While still in the FREE tier (count=1 < 87), fee-for ignores the discount and is 0.
  evalc("fee-for O3 == u0 (still free tier despite discount)", `(fee-for '${O3_OWNER})`, "u0", { cover: "fee-for:free" });

  // Drop free-threshold to 1 so the NEXT inscribe (count==1) is paid.
  section("Point 6b: set-free-threshold lowers free tier -> fee-for branches reflect paid tier");
  call("set-free-threshold by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "set-free-threshold", [uintCV(1)], "(err u204)", { cover: "set-free-threshold:u204" });
  call("set-free-threshold = 1 -> (ok true)", DEPLOYER, "set-free-threshold", [uintCV(1)], "(ok true)", { cover: "set-free-threshold:ok" });
  evalc("get-free-threshold == 1", "(get-free-threshold)", "(ok u1)", { cover: "get-free-threshold" });
  // Now count(1) is NOT < threshold(1): paid tier active.
  evalc("fee-for B (no discount) == standard 3 STX", `(fee-for '${B_SPONSOR})`, "u3000000", { cover: "fee-for:standard" });
  evalc("fee-for O3 (discount<std) == 1 STX", `(fee-for '${O3_OWNER})`, "u1000000", { cover: "fee-for:discount" });

  // Discount-clamp branch: lower inscribe-fee BELOW O3's pinned discount so the
  // clamp kicks in (discount must never become a surcharge).
  section("Point 6c: set-fee + discount CLAMP (discount > standard -> clamped to standard)");
  call("set-fee by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "set-fee", [uintCV(500000)], "(err u204)", { cover: "set-fee:u204" });
  call("set-fee = 0.5 STX (below O3's 1 STX discount) -> (ok true)", DEPLOYER, "set-fee", [uintCV(500000)], "(ok true)", { cover: "set-fee:ok" });
  evalc("get-fee == 0.5 STX", "(get-fee)", "(ok u500000)", { cover: "get-fee" });
  // O3 discount (1 STX) > standard (0.5 STX) -> clamped to 0.5 STX
  evalc("fee-for O3 CLAMPED to standard 0.5 STX", `(fee-for '${O3_OWNER})`, "u500000", { cover: "fee-for:clamp" });
  // restore standard fee for the paid-tier balance-delta test
  call("set-fee restore 3 STX -> (ok true)", DEPLOYER, "set-fee", [uintCV(FEE_STD)], "(ok true)", { cover: "set-fee:ok" });
  evalc("get-fee == 3 STX again", "(get-fee)", "(ok u3000000)");

  // ---- remove-discount ----
  section("Point 6d: remove-discount");
  call("remove-discount by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "remove-discount", [pcv(O3_OWNER)], "(err u204)", { cover: "remove-discount:u204" });
  call("remove-discount O3 -> (ok true)", DEPLOYER, "remove-discount", [pcv(O3_OWNER)], "(ok true)", { cover: "remove-discount:ok" });
  evalc("get-discount O3 == none (removed)", `(get-discount '${O3_OWNER})`, "none", { cover: "get-discount" });
  evalc("fee-for O3 == standard 3 STX (discount gone)", `(fee-for '${O3_OWNER})`, "u3000000", { cover: "fee-for:standard" });

  // ---- PAID inscribe with fee split asserted via payout balance deltas ----
  section("Point 6e: PAID inscribe (#161 by B) -> 3 STX split 50/50 to payout-a/payout-b");
  // capture payout balances immediately BEFORE the paid inscribe
  evalc("payout-a (deployer) balance BEFORE", stxBal(DEPLOYER), undefined, { capture: "payoutA_before" });
  evalc("payout-b balance BEFORE", stxBal(PAYOUT_B), undefined, { capture: "payoutB_before" });
  call("inscribe #161 by B (PAID tier, fee 3 STX) -> (ok uXID)", B2_OWNER, "inscribe", await inscribeArgs(T2), /^\(ok u\d+\)$/, { cover: "inscribe:paid-ok" });
  evalc("payout-a (deployer) balance AFTER", stxBal(DEPLOYER), undefined, { capture: "payoutA_after" });
  evalc("payout-b balance AFTER", stxBal(PAYOUT_B), undefined, { capture: "payoutB_after" });
  evalc("get-inscribed-count == 2", "(get-inscribed-count)", "(ok u2)", { cover: "get-inscribed-count" });
  evalc("binding #161 inscriber == B", `(get-binding u${T2})`, new RegExp(`inscriber ${B2_OWNER}`));
  evalc("binding #161 escrowed=true (twin in registry)", `(get-binding u${T2})`, /xtrata-escrowed true/);
  evalc("twin #161 escrowed in registry (CID)", twinOwner(T2), SOME(CID));

  // ---- second swap pair (token #161) to exercise release-pepe / release-xtrata again ----
  section("Point 6f: paid token #161 swaps both ways (B is the real owner)");
  call("swap-pepe-for-xtrata #161 by B (owner) -> (ok true)", B2_OWNER, "swap-pepe-for-xtrata", [uintCV(T2)], "(ok true)", { cover: "swap-pepe-for-xtrata:ok" });
  evalc("pepe #161 now custodied by registry", ownerPepe(T2), SOME(CID));
  evalc("twin #161 now held by B", twinOwner(T2), SOME(B2_OWNER));
  evalc("binding #161 escrowed=false", `(get-binding u${T2})`, /xtrata-escrowed false/);
  call("swap-xtrata-for-pepe #161 by B -> (ok true)", B2_OWNER, "swap-xtrata-for-pepe", [uintCV(T2)], "(ok true)", { cover: "swap-xtrata-for-pepe:ok" });
  evalc("pepe #161 back to B", ownerPepe(T2), SOME(B2_OWNER));
  evalc("twin #161 back to registry", twinOwner(T2), SOME(CID));

  // ---- set-payouts: change where fees go, then prove it ----
  section("Point 7: set-payouts redirects fees (asserted via balance deltas on a 3rd paid inscribe)");
  call("set-payouts by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "set-payouts", [pcv(ALT_A), pcv(ALT_B)], "(err u204)", { cover: "set-payouts:u204" });
  call("set-payouts (ALT_A, ALT_B) -> (ok true)", DEPLOYER, "set-payouts", [pcv(ALT_A), pcv(ALT_B)], "(ok true)", { cover: "set-payouts:ok" });
  evalc("get-payouts == {a: ALT_A, b: ALT_B}", "(get-payouts)", `(ok (tuple (a ${ALT_A}) (b ${ALT_B})))`, { cover: "get-payouts" });
  // 3rd PAID inscribe (#300 by O3) now pays the NEW payouts; assert via deltas.
  evalc("ALT_A balance BEFORE", stxBal(ALT_A), undefined, { capture: "altA_before" });
  evalc("ALT_B balance BEFORE", stxBal(ALT_B), undefined, { capture: "altB_before" });
  evalc("old payout-a (deployer) balance BEFORE 3rd inscribe", stxBal(DEPLOYER), undefined, { capture: "oldA_before" });
  call("inscribe #300 by O3 (PAID, fees -> NEW payouts) -> (ok uXID)", O3_OWNER, "inscribe", await inscribeArgs(T3), /^\(ok u\d+\)$/, { cover: "inscribe:paid-ok" });
  evalc("ALT_A balance AFTER", stxBal(ALT_A), undefined, { capture: "altA_after" });
  evalc("ALT_B balance AFTER", stxBal(ALT_B), undefined, { capture: "altB_after" });
  evalc("old payout-a (deployer) balance AFTER 3rd inscribe (should be unchanged by fee)", stxBal(DEPLOYER), undefined, { capture: "oldA_after" });
  evalc("get-inscribed-count == 3", "(get-inscribed-count)", "(ok u3)", { cover: "get-inscribed-count" });

  // ---- 8. transfer-ownership: new owner gains, old owner loses ----
  section("Point 8: transfer-ownership -- new owner gains access, OLD owner locked out (u204)");
  call("transfer-ownership by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "transfer-ownership", [pcv(A_OWNER)], "(err u204)", { cover: "transfer-ownership:u204" });
  call("transfer-ownership to A_OWNER by DEPLOYER -> (ok true)", DEPLOYER, "transfer-ownership", [pcv(A_OWNER)], "(ok true)", { cover: "transfer-ownership:ok" });
  evalc("get-owner == A_OWNER (new owner)", "(get-owner)", `(ok ${A_OWNER})`, { cover: "get-owner" });
  // OLD owner (DEPLOYER) now loses access on EVERY owner-gated fn.
  call("OLD owner set-fee -> ERR-NOT-AUTHORIZED (u204)", DEPLOYER, "set-fee", [uintCV(123)], "(err u204)", { cover: "transfer-ownership:old-locked-out" });
  // NEW owner can act.
  call("NEW owner (A) set-fee = 2 STX -> (ok true)", A_OWNER, "set-fee", [uintCV(2000000)], "(ok true)", { cover: "set-fee:ok-new-owner" });
  evalc("get-fee == 2 STX (set by new owner)", "(get-fee)", "(ok u2000000)");
  // hand ownership back so the rest of the freeze test runs under DEPLOYER
  call("transfer-ownership back to DEPLOYER by A -> (ok true)", A_OWNER, "transfer-ownership", [pcv(DEPLOYER)], "(ok true)", { cover: "transfer-ownership:ok" });
  evalc("get-owner == DEPLOYER again", "(get-owner)", `(ok ${DEPLOYER})`, { cover: "get-owner" });

  // ---- 9. finalize freeze; inscribe STILL works after finalize ----
  section("Point 9: finalize freeze (seed closes), but inscribe STILL works after finalize");
  call("finalize-canonical by STRANGER -> ERR-NOT-AUTHORIZED (u204)", STRANGER, "finalize-canonical", [], "(err u204)", { cover: "finalize-canonical:u204" });
  call("finalize-canonical by owner -> (ok true)", DEPLOYER, "finalize-canonical", [], "(ok true)", { cover: "finalize-canonical:ok" });
  evalc("is-finalized == true", "(is-finalized)", "(ok true)", { cover: "is-finalized" });
  // seed after finalize, even by owner -> u207
  call("seed-canonical post-freeze by owner -> ERR-FINALIZED (u207)", DEPLOYER, "seed-canonical", [listCV([entryCV(1)])], "(err u207)", { cover: "seed-canonical:u207" });
  // an unseeded EXISTING token still reverts u206 after finalize (gate intact, frozen)
  call("inscribe #7 (unseeded) post-finalize -> ERR-NOT-CANONICAL (u206)",
    B_SPONSOR, "inscribe", await inscribeArgs(UNSEEDED_AFTER_FREEZE), "(err u206)", { cover: "inscribe:u206-postfreeze" });
  // CRUCIAL: a seeded token can STILL be inscribed after finalize (finalize froze
  // SEEDING, not inscribe). Use #1000 (seeded, never inscribed).
  const TF = 1000;
  call(`inscribe #${TF} AFTER finalize (free? no -- paid 2 STX) -> (ok uXID)`,
    A_OWNER, "inscribe", await inscribeArgs(TF), /^\(ok u\d+\)$/, { cover: "inscribe:after-finalize" });
  evalc(`binding #${TF} exists after finalize-then-inscribe`, `(is-inscribed u${TF})`, "(ok true)", { cover: "is-inscribed" });
  evalc("get-inscribed-count == 4 (4th inscribe was post-finalize)", "(get-inscribed-count)", "(ok u4)", { cover: "get-inscribed-count" });
}

// =====================================================================
function decTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch { return `decode-fail(${r.Ok?.result})`; }
}
function decEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); }
}
function txCost(s) {
  const c = s?.Result?.Transaction?.Ok?.execution_cost || s?.Result?.Transaction?.Ok?.total_cost;
  return c || null;
}
const match = (g, e) => e instanceof RegExp ? e.test(g) : g === e;
const uintOf = (s) => BigInt(String(s).replace(/^u/, "")); // "u123" -> 123n

async function main() {
  console.log("=== xtrata-fakfun-forever-v2 stxer harness (FULL path coverage) ===\n");
  await build();
  console.log(`Plan: ${plan.length} steps (1 deploy, ${plan.filter(p=>p.kind==="tx").length} tx, ${plan.filter(p=>p.kind==="eval").length} eval)\n`);
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  let pass = 0, fail = 0, soft = 0;
  const seedFees = [];
  const cap = {};       // captured raw values (balances)
  const coverage = [];  // {cover, label, ok}
  res.steps.forEach((s, i) => {
    if (sections[i]) console.log(`\n— ${sections[i]} —`);
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label} -> ${decTx(s)}`); ok ? pass++ : fail++;
      if (p.cover) coverage.push({ cover: p.cover, label: p.label, ok });
    } else if (p.kind === "tx") {
      const g = decTx(s), ok = match(g, p.expect);
      if (p.batchSize) { const c = txCost(s); seedFees.push({ i, label: p.label, cost: c, ok }); }
      if (p.soft && !ok) { soft++; console.log(`SOFT [${i}] ${p.label}  got ${g}  (expected ${p.expect}) — see notes`); }
      else { console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}  got ${g}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; }
      if (p.cover) coverage.push({ cover: p.cover, label: p.label, ok });
    } else if (p.kind === "eval") {
      const g = decEval(s);
      if (p.capture) { cap[p.capture] = uintOf(g); console.log(`capt [${i}] ${p.label}: ${g}`); }
      else if (p.expect === undefined) console.log(`info [${i}] ${p.label}: ${g}`);
      else { const ok = match(g, p.expect); console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}  got ${g}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; if (p.cover) coverage.push({ cover: p.cover, label: p.label, ok }); }
    }
  });

  // ---- fee-split balance-delta assertions ----
  console.log("\n— fee-split balance deltas —");
  function assertDelta(label, before, after, expected) {
    if (before === undefined || after === undefined) { console.log(`FAIL ${label}: missing capture`); fail++; return; }
    const d = after - before;
    const ok = d === expected;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: delta=${d} (expected ${expected})`);
    ok ? pass++ : fail++;
    coverage.push({ cover: "charge-fee:split", label, ok });
  }
  // paid inscribe #161: 3 STX fee, half each (3000000/2 = 1500000 each)
  const half = BigInt(FEE_STD) / 2n;
  assertDelta("payout-a (deployer) +1.5 STX on paid #161", cap.payoutA_before, cap.payoutA_after, half);
  assertDelta("payout-b +1.5 STX on paid #161", cap.payoutB_before, cap.payoutB_after, BigInt(FEE_STD) - half);
  // after set-payouts, paid inscribe #300 pays ALT_A / ALT_B, NOT old payout-a
  assertDelta("ALT_A +1.5 STX on paid #300 (new payouts)", cap.altA_before, cap.altA_after, half);
  assertDelta("ALT_B +1.5 STX on paid #300 (new payouts)", cap.altB_before, cap.altB_after, BigInt(FEE_STD) - half);
  // old payout-a (deployer) must NOT receive fee from #300 (it may pay gas only if it were sender, but O3 is sender)
  assertDelta("old payout-a (deployer) gets 0 fee from #300", cap.oldA_before, cap.oldA_after, 0n);

  console.log("\n— seed batch cost report —");
  for (const f of seedFees) {
    const c = f.cost;
    const fmt = c ? `runtime=${c.runtime} read_count=${c.read_count} read_len=${c.read_length} write_count=${c.write_count} write_len=${c.write_length}` : "<no cost data>";
    console.log(`  ${f.ok ? "PASS" : "FAIL"} batch@step${f.i}: ${fmt}`);
  }

  // ---- coverage table by function/branch ----
  console.log("\n— COVERAGE TABLE (function/branch -> assertions -> PASS/FAIL) —");
  const byCover = {};
  for (const c of coverage) (byCover[c.cover] ||= []).push(c);
  const order = Object.keys(byCover).sort();
  for (const k of order) {
    const items = byCover[k];
    const allOk = items.every((x) => x.ok);
    console.log(`  ${allOk ? "PASS" : "FAIL"}  ${k}  (${items.length} assertion${items.length > 1 ? "s" : ""})`);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed, ${soft} soft ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
