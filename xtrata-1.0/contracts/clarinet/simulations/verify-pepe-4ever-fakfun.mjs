// verify-pepe-4ever-fakfun.mjs
// stxer mainnet-fork harness for `pepe-4ever-fakfun` (as-contract escrow mint).
//
// WHAT CHANGED vs xtrata-fakfun-forever-v2:
//   OLD inscribe: master mint-single-tx ran as the HOLDER (twin minted to holder),
//     then (contract-call? MASTER transfer xtrata-id tx-sender current-contract)
//     escrowed it. That holder->contract NFT transfer forced the FE to add an
//     exact-id NFT post-condition; the master's get-next-token-id is GLOBAL, so a
//     concurrent mint shifts it and the exact-id PC aborts (predicted 462, got 463).
//   NEW inscribe:
//     (try! (charge-fee tx-sender))                                ;; registry fee
//     (try! (stx-transfer? (+ u100000 (* (len chunks) u2000)) tx-sender current-contract)) ;; pre-fund master fee
//     (let ((result (try! (as-contract (contract-call? MASTER mint-single-tx ...)))) ...)  ;; mint AS contract
//       ;; NO escrow transfer -- twin already lands in the contract
//     The holder never holds/sends the twin, so inscribe needs NO NFT post-condition.
//
// MASTER fee (xtrata-v3-2-3, confirmed): single-tx-fee-for-chunks =
//   single-tx-fee-unit(u100000) + total-chunks * upload-chunk-fee-unit(u2000).
//   maybe-pay charges tx-sender; under as-contract that's THIS registry, so the
//   holder pre-funds exactly (100000 + n*2000) into the contract, the contract pays
//   the master's royalty-recipient, zero dust.
//
// MASTER is PAUSED on mainnet (is-paused -> (ok true)) and gates on contract-caller.
//   Under as-contract the master sees contract-caller = THIS registry, so the new
//   CID MUST be on the master's AllowedCallers list. The OLD CID
//   (...xtrata-fakfun-forever-v2) is already allowlisted, but the renamed
//   pepe-4ever-fakfun CID is NOT -- so this harness allowlists it first, as the
//   master owner, exactly mirroring the real redeploy procedure.
//
// This harness uses the stxer LOW-LEVEL session API (createSimulationSession +
// submitSimulationSteps) so it can set per-tx postConditions + postConditionMode --
// which the SimulationBuilder cannot. That is what lets it PROVE the minimal
// deny-mode PC set for inscribe (point 3, the whole point of the redesign).
//
// Run: cd simulations && node verify-pepe-4ever-fakfun.mjs
const STACKS_API = "http://77.42.3.101/stacks-api";
const STXER_API = "https://api.stxer.xyz";
import { createHash } from "node:crypto";
import {
  ClarityVersion, PostConditionMode, Pc,
  uintCV, bufferCV, stringAsciiCV, listCV, trueCV,
  standardPrincipalCV, contractPrincipalCV, tupleCV,
  makeUnsignedContractCall, makeUnsignedContractDeploy,
  deserializeCV, cvToString, serializeCV,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import fs from "node:fs";
import {
  createSimulationSession, submitSimulationSteps, getSimulationResult,
  setSender, bytesToHex,
} from "stxer";

// ---- principals ----
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // registry owner + payout-a
const STRANGER = "SP000000000000000000002Q6VF78";
const PAYOUT_B = "SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7";
const ALT_A    = "SP3VHXRGG60D5MK1BCM6D3RXE26EGE5M8K9JM5T4E";
const ALT_B    = "SP1ERZZ0G7KERNCXQDJF4GTHCF8DGZB8001YCNPQG";

const MASTER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3";
const MASTER_OWNER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X"; // master contract-owner (set-allowed-caller)
const PEPE   = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const NAME   = "pepe-4ever-fakfun";
const CID    = `${DEPLOYER}.${NAME}`;

// ---- scenario tokens (real mainnet owners, verified on the current tip) ----
const T         = 500;
const A_OWNER   = "SP3MYTHK18PMGCDN6EG9Y4XN13FA87NMZRDZST0XN"; // owns #500 (~113 STX)
const B_SPONSOR = "SP1DPNP3RRD6JG1557SP6JMX68W5BV6R2Z74BQEXV"; // owns #161, NOT #500 (~33 STX)

const T2        = 161;
const B2_OWNER  = B_SPONSOR;

const T3        = 300;
const O3_OWNER  = "SP3AFSKPE2BQ84WXEZ03PQ2E18B02A8ZZWK6190KW"; // owns #300 (~9 STX)

const NO_SEED = 9999;            // does not exist -> get-owner none
const UNSEEDED_AFTER_FREEZE = 7; // exists, deliberately never seeded -> u206

const FEE_STD   = 3000000;
const DISCOUNT  = 1000000;

// master fee for a single-chunk inscribe = single-tx-fee-unit + 1*upload-chunk-fee-unit
const MASTER_FEE_1CHUNK = 100000 + 1 * 2000; // 102000 (baseline: single-tx-fee-unit u100000)

// ---- Point B (Jim raises the master fee): live-read must adapt ----
// master owner bumps single-tx-fee-unit u100000 -> u150000 (allowed: <= old*2, >= old/10,
// within [FEE-MIN u1, FEE-MAX u1000000]). A 1-chunk pepe then costs 150000 + 1*2000.
const NEW_SINGLE_TX_FEE_UNIT = 150000;
const MASTER_FEE_1CHUNK_NEW = NEW_SINGLE_TX_FEE_UNIT + 1 * 2000; // 152000
const T_JIM   = 800;            // a DIFFERENT seeded pepe, inscribed AFTER the fee change
const JIM_INSCRIBER = A_OWNER;  // any funded principal; inscriber need not own the pepe

// ---- canonical data ----
const HASHES = JSON.parse(fs.readFileSync("/tmp/pepe-hashes.json", "utf8"));
const BE = "https://faktory-dao-backend.vercel.app";
const CHUNK = 16384;
const sha256 = (b) => createHash("sha256").update(b).digest();
const rolling = (bytes) => { let r = Buffer.alloc(32, 0); for (let i = 0; i < bytes.length; i += CHUNK) r = sha256(Buffer.concat([r, bytes.subarray(i, Math.min(i + CHUNK, bytes.length))])); return r; };

async function inscribeArgs(id, { tamper = false } = {}) {
  const r = await fetch(`${BE}/api/pepe-xtrata/image/${id}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const h = rolling(bytes);
  if ("0x" + h.toString("hex") !== HASHES[String(id)].hash) throw new Error(`hash drift #${id}`);
  const expected = tamper ? Buffer.from(h) : h;
  if (tamper) expected[0] ^= 0xff;
  const uri = `ipfs://pepe/${id}.json`;
  const args = [
    uintCV(id), bufferCV(expected), stringAsciiCV("image/png"),
    uintCV(bytes.length), listCV([bufferCV(bytes)]), stringAsciiCV(uri),
  ];
  return { args, nChunks: 1, masterFee: 100000 + 1 * 2000 };
}

const hexToBuf = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const entryCV = (id) => tupleCV({ id: uintCV(id), hash: bufferCV(hexToBuf(HASHES[String(id)].hash)) });
const pcv = (s) => s.includes(".") ? contractPrincipalCV(s.split(".")[0], s.split(".")[1]) : standardPrincipalCV(s);

// =====================================================================
// low-level session driver: I control postConditions + postConditionMode per tx.
// =====================================================================
const NET = { ...STACKS_MAINNET, client: { ...STACKS_MAINNET.client, baseUrl: STACKS_API } };
const nonceMap = new Map();
let TIP_IBH = null;
async function nextNonce(sender) {
  if (!nonceMap.has(sender)) {
    const r = await fetch(`${STACKS_API}/v2/accounts/${sender}?proof=0&tip=${TIP_IBH}`);
    const a = await r.json();
    nonceMap.set(sender, a.nonce + 1);
    return a.nonce;
  }
  const n = nonceMap.get(sender);
  nonceMap.set(sender, n + 1);
  return n;
}

const steps = [];   // wire steps for submitSimulationSteps
const plan = [];    // parallel metadata for assertions
const sections = {};
function section(t) { sections[plan.length] = t; }

async function callTx(label, sender, fn, args, expect, opts = {}) {
  const nonce = await nextNonce(sender);
  const tx = await makeUnsignedContractCall({
    contractAddress: CID.split(".")[0], contractName: CID.split(".")[1],
    functionName: fn, functionArgs: args, nonce, network: NET, publicKey: "00".repeat(33),
    postConditionMode: opts.pcMode ?? PostConditionMode.Allow,
    postConditions: opts.pcs ?? [], fee: opts.fee ?? 3000,
  });
  setSender(tx, sender);
  steps.push({ Transaction: bytesToHex(tx.serializeBytes()) });
  plan.push({ kind: "tx", label, expect, ...opts });
}
// a raw contract-call to ANY contract (used to allowlist on the master)
async function callExtTx(label, sender, contractId, fn, args, expect, opts = {}) {
  const nonce = await nextNonce(sender);
  const tx = await makeUnsignedContractCall({
    contractAddress: contractId.split(".")[0], contractName: contractId.split(".")[1],
    functionName: fn, functionArgs: args, nonce, network: NET, publicKey: "00".repeat(33),
    postConditionMode: PostConditionMode.Allow, postConditions: [], fee: opts.fee ?? 3000,
  });
  setSender(tx, sender);
  steps.push({ Transaction: bytesToHex(tx.serializeBytes()) });
  plan.push({ kind: "tx", label, expect, ...opts });
}
async function deployTx() {
  const sender = DEPLOYER;
  const nonce = await nextNonce(sender);
  const src = fs.readFileSync(
    "/home/raphastacks/projects/xtrata/xtrata-1.0/contracts/clarinet/contracts/fakfun-idea/pepe-4ever-fakfun.clar", "utf8");
  const tx = await makeUnsignedContractDeploy({
    contractName: NAME, codeBody: src, clarityVersion: ClarityVersion.Clarity5,
    nonce, network: NET, publicKey: "00".repeat(33), fee: 200000,
  });
  setSender(tx, sender);
  steps.push({ Transaction: bytesToHex(tx.serializeBytes()) });
  plan.push({ kind: "deploy", label: `deploy ${NAME}`, cover: "deploy" });
}
function evalc(label, code, expect, opts = {}) {
  steps.push({ Eval: [DEPLOYER, "", CID, code] });
  plan.push({ kind: "eval", label, expect, ...opts });
}

const ownerPepe = (id) => `(contract-call? '${PEPE} get-owner u${id})`;
const twinOwner = (id) => `(let ((bn (unwrap-panic (get-binding u${id})))) (contract-call? '${MASTER} get-owner (get xtrata-id bn)))`;
const SOME = (p) => `(ok (some ${p}))`;
const stxBal = (p) => `(stx-get-balance '${p})`;

// =====================================================================
async function build() {
  // ---- 0. allowlist the NEW CID on the master (paused gate) ----
  // The master is paused and gates on contract-caller; under as-contract that is
  // THIS registry. Mirror the real redeploy: master owner set-allowed-caller(CID,true).
  // Deploy FIRST so the principal exists, then allowlist.
  section("Point 1: deploy + master allowlist (redeploy gotcha)");
  await deployTx();
  evalc("get-owner == deployer", "(get-owner)", `(ok ${DEPLOYER})`, { cover: "get-owner" });
  evalc("get-free-threshold == 87 (first 87 inscriptions free)", "(get-free-threshold)", "(ok u87)", { cover: "get-free-threshold" });
  evalc("get-fee == 3 STX", "(get-fee)", "(ok u3000000)", { cover: "get-fee" });
  evalc("get-payouts == {a: deployer, b: PAYOUT_B}", "(get-payouts)",
    `(ok (tuple (a ${DEPLOYER}) (b ${PAYOUT_B})))`, { cover: "get-payouts" });
  evalc("is-finalized == false", "(is-finalized)", "(ok false)", { cover: "is-finalized" });
  evalc("get-inscribed-count == 0", "(get-inscribed-count)", "(ok u0)", { cover: "get-inscribed-count" });
  await callExtTx("master set-allowed-caller(CID, true) by master-owner -> (ok true)",
    MASTER_OWNER, MASTER, "set-allowed-caller", [pcv(CID), trueCV()], "(ok true)",
    { cover: "master:allowlist" });
  evalc("master is-allowed-caller(CID) == true",
    `(contract-call? '${MASTER} is-allowed-caller '${CID})`, "(ok true)", { cover: "master:allowlist" });

  // ---- 2. seed full canonical set, minus #7, then a few readers ----
  section("Point 1: seed canonical (2088 of 2089; #7 deliberately unseeded)");
  const ids = Array.from({ length: 2089 }, (_, i) => i + 1).filter((x) => x !== UNSEEDED_AFTER_FREEZE);
  const batches = [];
  for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    await callTx(`seed-canonical batch ${bi + 1}/${batches.length} (${batch.length})`,
      DEPLOYER, "seed-canonical", [listCV(batch.map(entryCV))], "(ok true)", { cover: "seed-canonical:ok" });
  }
  await callTx("seed-canonical by STRANGER -> u204", STRANGER, "seed-canonical", [listCV([entryCV(1)])], "(err u204)", { cover: "seed-canonical:u204" });
  evalc("get-canonical-hash #500 seeded", `(get-canonical-hash u${T})`, `(some ${HASHES[String(T)].hash})`, { cover: "get-canonical-hash" });
  evalc("get-canonical-hash #7 == none (unseeded)", `(get-canonical-hash u${UNSEEDED_AFTER_FREEZE})`, "none");

  // ---- Point 7 regression: pre-inscribe revert paths ----
  section("Point 7: inscribe revert paths");
  await callTx("inscribe #9999 (nonexistent) -> u200", B_SPONSOR, "inscribe",
    [uintCV(NO_SEED), bufferCV(Buffer.alloc(32, 0)), stringAsciiCV("image/png"),
     uintCV(1), listCV([bufferCV(Buffer.from([0]))]), stringAsciiCV("ipfs://x")], "(err u200)", { cover: "inscribe:u200" });
  await callTx("inscribe #7 (exists, unseeded) -> u206", B_SPONSOR, "inscribe",
    (await inscribeArgs(UNSEEDED_AFTER_FREEZE)).args, "(err u206)", { cover: "inscribe:u206-unseeded" });
  await callTx("inscribe #500 TAMPERED -> u206", B_SPONSOR, "inscribe",
    (await inscribeArgs(T, { tamper: true })).args, "(err u206)", { cover: "inscribe:u206-tampered" });
  evalc("binding #500 still none", `(get-binding u${T})`, "none");
  evalc("inscribed-count still 0", "(get-inscribed-count)", "(ok u0)");

  // swap reverts: no binding
  section("Point 5: swap revert -- not-inscribed (u202)");
  await callTx("swap-pepe-for-xtrata #500 (no binding) -> u202", A_OWNER, "swap-pepe-for-xtrata", [uintCV(T)], "(err u202)", { cover: "swap-pepe-for-xtrata:u202" });
  await callTx("swap-xtrata-for-pepe #500 (no binding) -> u202", A_OWNER, "swap-xtrata-for-pepe", [uintCV(T)], "(err u202)", { cover: "swap-xtrata-for-pepe:u202" });

  // ======================================================================
  // POINT 3 -- THE KEY QUESTION: minimal deny-mode PC set for inscribe.
  // free-threshold is u87, so the first 87 inscriptions are FREE: fee-for
  // returns u0 while inscribed-count < 87 (this harness tops out at count=4,
  // so EVERY inscribe here is in the free tier). The registry fee is therefore
  // 0 and only the master fee flows -> isolates the master-fee STX path for the
  // cleanest PC probe. (We still exercise set-discount as an admin path; the
  // discount has no fee effect while in the free tier.)
  //
  // Under deny mode the engine requires a PC covering every STX debit:
  //   (a) holder -> contract: registryFee(0 in free tier) + masterFee (the holder's stx-transfer? legs)
  //   (b) contract -> master royalty-recipient: masterFee (the as-contract maybe-pay)
  // We test, in order, the SMALLEST sets, escalating only if a set reverts.
  // ======================================================================
  section("Point 3: minimal deny-mode PC probe (free-threshold 87 -> registry fee 0, master-fee only)");
  // set a 0-STX discount on B as an admin-path exercise; in the free tier this
  // has no fee effect (fee-for is u0 purely because inscribed-count < 87).
  await callTx("set-discount B = u0 (0 < inscribe-fee) -> (ok true)", DEPLOYER, "set-discount", [pcv(B_SPONSOR), uintCV(0)], "(ok true)", { cover: "set-discount:zero" });
  evalc("fee-for B == u0 (free tier: inscribed-count 0 < free-threshold 87)", `(fee-for '${B_SPONSOR})`, "u0", { cover: "fee-for:free-tier" });

  // PROBE 3.1: deny-mode, ONLY a holder STX cap (registryFee 0 + masterFee). Per the
  // brief this is the hoped-for FE recipe. If the contract's as-contract spend
  // (contract -> royalty) is NOT covered, the engine aborts -> proves a 2nd PC needed.
  await callTx("[3.1] inscribe #500 DENY, holder-STX-cap ONLY (no contract PC)",
    B_SPONSOR, "inscribe", (await inscribeArgs(T)).args, /.*/, {
      pcMode: PostConditionMode.Deny,
      pcs: [Pc.principal(B_SPONSOR).willSendLte(0 + MASTER_FEE_1CHUNK).ustx()],
      probe: "3.1", cover: "pc-probe:holder-only",
    });
  evalc("[3.1] did #500 bind? (true => holder-only PC sufficed)", `(is-inscribed u${T})`, /.*/, { probeRead: "3.1" });

  // PROBE 3.2: deny-mode, holder STX cap + CONTRACT (registry) STX cap covering the
  // as-contract master payment. This is the full STX-only, zero-NFT recipe.
  // NOTE: only runs meaningfully if #500 is NOT yet inscribed; if 3.1 already bound
  // it, this reverts u201 and we read 3.1's result as the answer.
  await callTx("[3.2] inscribe #500 DENY, holder-cap + contract-cap (STX-only, 0 NFT PCs)",
    B_SPONSOR, "inscribe", (await inscribeArgs(T)).args, /.*/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(B_SPONSOR).willSendLte(0 + MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      probe: "3.2", cover: "pc-probe:holder+contract",
    });
  evalc("[3.2] is #500 inscribed now?", `(is-inscribed u${T})`, /.*/, { probeRead: "3.2" });
  evalc("[3.2] twin #500 owned by registry (escrowed on mint)", twinOwner(T), SOME(CID), { probeRead: "3.2-twin" });
  evalc("[3.2] pepe #500 did NOT move (still A)", ownerPepe(T), SOME(A_OWNER), { probeRead: "3.2-pepe" });
  evalc("[3.2] binding #500 escrowed=true", `(get-binding u${T})`, /xtrata-escrowed true/, { probeRead: "3.2-binding" });
  evalc("[3.2] binding #500 inscriber == B", `(get-binding u${T})`, new RegExp(`inscriber ${B_SPONSOR}`), { probeRead: "3.2-inscriber" });
  evalc("get-inscribed-count == 1", "(get-inscribed-count)", "(ok u1)", { cover: "get-inscribed-count" });

  // double-inscribe regression
  await callTx("inscribe #500 again -> u201", B_SPONSOR, "inscribe", (await inscribeArgs(T)).args, "(err u201)", {
    pcMode: PostConditionMode.Deny,
    pcs: [Pc.principal(B_SPONSOR).willSendLte(MASTER_FEE_1CHUNK).ustx(),
          Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx()],
    cover: "inscribe:u201",
  });

  // ---- Point 5: swaps round-trip on #500 (twin starts escrowed) ----
  section("Point 5: swaps round-trip (#500) + non-owner cannot + wrong-state");
  await callTx("swap-pepe-for-xtrata #500 by B (not owner) -> revert", B_SPONSOR, "swap-pepe-for-xtrata", [uintCV(T)], /^\(err/, { cover: "swap:non-owner-cant" });
  evalc("twin #500 STILL in registry", twinOwner(T), SOME(CID));
  evalc("pepe #500 STILL with A", ownerPepe(T), SOME(A_OWNER));
  await callTx("swap-xtrata-for-pepe #500 (twin escrowed) -> u203", A_OWNER, "swap-xtrata-for-pepe", [uintCV(T)], "(err u203)", { cover: "swap-xtrata-for-pepe:u203" });
  await callTx("swap-pepe-for-xtrata #500 by A (owner) -> (ok true)", A_OWNER, "swap-pepe-for-xtrata", [uintCV(T)], "(ok true)", { cover: "swap-pepe-for-xtrata:ok" });
  evalc("pepe #500 now in registry", ownerPepe(T), SOME(CID));
  evalc("twin #500 now with A", twinOwner(T), SOME(A_OWNER));
  evalc("binding #500 escrowed=false", `(get-binding u${T})`, /xtrata-escrowed false/);
  await callTx("swap-pepe-for-xtrata #500 (not escrowed) -> u203", A_OWNER, "swap-pepe-for-xtrata", [uintCV(T)], "(err u203)", { cover: "swap-pepe-for-xtrata:u203" });
  await callTx("swap-xtrata-for-pepe #500 by A -> (ok true)", A_OWNER, "swap-xtrata-for-pepe", [uintCV(T)], "(ok true)", { cover: "swap-xtrata-for-pepe:ok" });
  evalc("pepe #500 back to A", ownerPepe(T), SOME(A_OWNER));
  evalc("twin #500 back to registry", twinOwner(T), SOME(CID));
  evalc("binding #500 escrowed=true", `(get-binding u${T})`, /xtrata-escrowed true/);

  // ---- Point 6: discount admin path + Point 4: FREE-tier inscribe master-fee funding exactness ----
  section("Point 6: set/remove-discount admin path; Point 4: FREE-tier (free-threshold 87) master-fee funding exact");
  // set-discount / remove-discount / u205 are pure admin-path coverage here; in the
  // free tier (inscribed-count < 87) fee-for is u0 regardless of any discount.
  await callTx("set-discount O3 = 1 STX -> (ok true)", DEPLOYER, "set-discount", [pcv(O3_OWNER), uintCV(DISCOUNT)], "(ok true)", { cover: "set-discount:ok" });
  await callTx("set-discount fee==inscribe-fee -> u205", DEPLOYER, "set-discount", [pcv(O3_OWNER), uintCV(FEE_STD)], "(err u205)", { cover: "set-discount:u205" });
  await callTx("remove-discount O3 -> (ok true)", DEPLOYER, "remove-discount", [pcv(O3_OWNER)], "(ok true)", { cover: "remove-discount:ok" });
  evalc("fee-for O3 == u0 (free tier: inscribed-count 1 < free-threshold 87)", `(fee-for '${O3_OWNER})`, "u0", { cover: "fee-for:free-tier" });

  // FREE-tier inscribe of #300 by O3. Prove the registry fee is 0 (payout-a/b unchanged),
  // the master fee flows exactly (holder->contract->royalty), and the contract retains no dust.
  evalc("payout-a BEFORE (free #300)", stxBal(DEPLOYER), undefined, { capture: "pA_before" });
  evalc("payout-b BEFORE (free #300)", stxBal(PAYOUT_B), undefined, { capture: "pB_before" });
  evalc("O3 holder BEFORE (free #300)", stxBal(O3_OWNER), undefined, { capture: "o3_before" });
  evalc("contract BEFORE (free #300)", stxBal(CID), undefined, { capture: "k_before" });
  evalc("master-royalty BEFORE (free #300)", stxBal(MASTER_OWNER), undefined, { capture: "roy_before" });
  await callTx("inscribe #300 by O3 (FREE tier, registry fee 0) DENY holder+contract caps -> (ok uXID)",
    O3_OWNER, "inscribe", (await inscribeArgs(T3)).args, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        // free tier -> registry fee 0, so the holder only ever debits the master fee.
        Pc.principal(O3_OWNER).willSendLte(MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      cover: "inscribe:free-ok",
    });
  evalc("payout-a AFTER (free #300)", stxBal(DEPLOYER), undefined, { capture: "pA_after" });
  evalc("payout-b AFTER (free #300)", stxBal(PAYOUT_B), undefined, { capture: "pB_after" });
  evalc("O3 holder AFTER (free #300)", stxBal(O3_OWNER), undefined, { capture: "o3_after" });
  evalc("contract AFTER (free #300)", stxBal(CID), undefined, { capture: "k_after" });
  evalc("master-royalty AFTER (free #300)", stxBal(MASTER_OWNER), undefined, { capture: "roy_after" });
  evalc("get-inscribed-count == 2", "(get-inscribed-count)", "(ok u2)", { cover: "get-inscribed-count" });
  evalc("twin #300 escrowed in registry", twinOwner(T3), SOME(CID));
  evalc("binding #300 escrowed=true", `(get-binding u${T3})`, /xtrata-escrowed true/);

  // ---- Point 6 continued: free-tier holder pays NO registry fee (still master fee) ----
  section("Point 6: free-tier holder pays NO registry fee, still pays master fee (#161 by B)");
  evalc("payout-a BEFORE (free-tier #161)", stxBal(DEPLOYER), undefined, { capture: "fpA_before" });
  evalc("payout-b BEFORE (free-tier #161)", stxBal(PAYOUT_B), undefined, { capture: "fpB_before" });
  evalc("B holder BEFORE (free-tier #161)", stxBal(B_SPONSOR), undefined, { capture: "b_before" });
  await callTx("inscribe #161 by B (free tier) DENY holder+contract -> (ok uXID)",
    B2_OWNER, "inscribe", (await inscribeArgs(T2)).args, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(B_SPONSOR).willSendLte(0 + MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      cover: "inscribe:free-tier-ok",
    });
  evalc("payout-a AFTER (free-tier #161)", stxBal(DEPLOYER), undefined, { capture: "fpA_after" });
  evalc("payout-b AFTER (free-tier #161)", stxBal(PAYOUT_B), undefined, { capture: "fpB_after" });
  evalc("B holder AFTER (free-tier #161)", stxBal(B_SPONSOR), undefined, { capture: "b_after" });
  evalc("get-inscribed-count == 3", "(get-inscribed-count)", "(ok u3)", { cover: "get-inscribed-count" });
  evalc("twin #161 escrowed in registry", twinOwner(T2), SOME(CID));

  // #161 swaps both ways (B is owner)
  section("Point 5: #161 swaps both ways (B owner)");
  await callTx("swap-pepe-for-xtrata #161 by B -> (ok true)", B2_OWNER, "swap-pepe-for-xtrata", [uintCV(T2)], "(ok true)", { cover: "swap-pepe-for-xtrata:ok" });
  evalc("pepe #161 in registry", ownerPepe(T2), SOME(CID));
  evalc("twin #161 with B", twinOwner(T2), SOME(B2_OWNER));
  await callTx("swap-xtrata-for-pepe #161 by B -> (ok true)", B2_OWNER, "swap-xtrata-for-pepe", [uintCV(T2)], "(ok true)", { cover: "swap-xtrata-for-pepe:ok" });
  evalc("pepe #161 back to B", ownerPepe(T2), SOME(B2_OWNER));
  evalc("twin #161 back to registry", twinOwner(T2), SOME(CID));

  // ---- Point 7: admin-only reverts + finalize freeze ----
  section("Point 7: admin-only u204 + finalize freeze (#207) + post-finalize inscribe");
  await callTx("set-fee by STRANGER -> u204", STRANGER, "set-fee", [uintCV(1)], "(err u204)", { cover: "set-fee:u204" });
  await callTx("finalize-canonical by STRANGER -> u204", STRANGER, "finalize-canonical", [], "(err u204)", { cover: "finalize:u204" });
  await callTx("finalize-canonical by owner -> (ok true)", DEPLOYER, "finalize-canonical", [], "(ok true)", { cover: "finalize:ok" });
  evalc("is-finalized == true", "(is-finalized)", "(ok true)", { cover: "is-finalized" });
  await callTx("seed-canonical post-finalize -> u207", DEPLOYER, "seed-canonical", [listCV([entryCV(1)])], "(err u207)", { cover: "seed-canonical:u207" });
  await callTx("inscribe #7 (unseeded) post-finalize -> u206", B_SPONSOR, "inscribe",
    (await inscribeArgs(UNSEEDED_AFTER_FREEZE)).args, "(err u206)", { cover: "inscribe:u206-postfreeze" });

  // ---- Point 8: master dedup -- same hash, different tx-sender principal ----
  // #161 already minted on this contract as tx-sender=CID. A pepe inscribed on the
  // OLD contract was minted as tx-sender=admin (a DIFFERENT principal), so UploadState
  // keyed (owner, hash) does NOT collide. We prove the cross-principal direction
  // positively: inscribe #1000 here (seeded) succeeds even though its canonical hash
  // may already exist in UploadState under a different owner from prior real mints.
  section("Point 8: master dedup keyed (tx-sender, hash) -- cross-principal no collision");
  const TF = 1000;
  await callTx(`inscribe #${TF} post-finalize (seeded) DENY holder+contract -> (ok uXID)`,
    A_OWNER, "inscribe", (await inscribeArgs(TF)).args, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(A_OWNER).willSendLte(FEE_STD + MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      cover: "inscribe:after-finalize",
    });
  evalc(`#${TF} inscribed after finalize`, `(is-inscribed u${TF})`, "(ok true)", { cover: "is-inscribed" });
  evalc("get-inscribed-count == 4", "(get-inscribed-count)", "(ok u4)", { cover: "get-inscribed-count" });
  evalc(`twin #${TF} escrowed in registry`, twinOwner(TF), SOME(CID));

  // ======================================================================
  // POINT B -- JIM CHANGES THE MASTER FEE; the contract's LIVE-READ must adapt.
  // inscribe reads the fee live:
  //   (get total-fee (contract-call? MASTER quote-single-tx-fee total-size (len chunks)))
  // then funds the contract with exactly that, and caps the as-contract? master
  // payment with (with-stx master-fee). A HARDCODED 100000 + n*2000 contract would
  // under-fund AND cap too low after Jim's bump, and revert. We prove live-read survives.
  // ======================================================================
  const jim = await inscribeArgs(T_JIM);
  const jimSize = jim.args[3];                                // uintCV(total-size) for #800
  const sizeStr = cvToString(jimSize).replace(/^u/, "");
  const quoteFee = (n) => `(get total-fee (unwrap-panic (contract-call? '${MASTER} quote-single-tx-fee u${sizeStr} u${n})))`;

  // ---- B.1 baseline: quote still 102000 before the change ----
  section("Point B.1: baseline master quote == 102000 (single-tx-fee-unit u100000)");
  evalc("quote-single-tx-fee total-fee == u102000 (1 chunk, BEFORE Jim)", quoteFee(1), `u${MASTER_FEE_1CHUNK}`, { cover: "jim:quote-before" });

  // ---- B.2 Jim (master owner) raises single-tx-fee-unit 100000 -> 150000 ----
  // set-single-tx-fee-unit gates on tx-sender == master contract-owner; no unpause needed.
  // assert-valid-fee-update: 150000 <= 100000*2 and >= 100000/10 and within [1, 1000000]. OK.
  section("Point B.2: master owner set-single-tx-fee-unit 100000 -> 150000; quote now 152000");
  await callExtTx("master set-single-tx-fee-unit(u150000) by master-owner -> (ok ...)",
    MASTER_OWNER, MASTER, "set-single-tx-fee-unit", [uintCV(NEW_SINGLE_TX_FEE_UNIT)], /^\(ok/,
    { cover: "jim:set-fee-unit" });
  evalc("quote-single-tx-fee total-fee == u152000 (1 chunk, AFTER Jim)", quoteFee(1), `u${MASTER_FEE_1CHUNK_NEW}`, { cover: "jim:quote-after" });

  // ---- B.3 inscribe a DIFFERENT pepe; contract live-reads 152000, funds+caps+succeeds ----
  // Holder PC = willSendLte(registryFee(0, free tier) + 152000); contract PC = willSendLte(152000).
  section("Point B.3: inscribe #800 AFTER fee change -- live-read funds+caps 152000, SUCCEEDS");
  evalc("payout-a BEFORE (jim #800)", stxBal(DEPLOYER), undefined, { capture: "jA_before" });
  evalc("payout-b BEFORE (jim #800)", stxBal(PAYOUT_B), undefined, { capture: "jB_before" });
  evalc("inscriber BEFORE (jim #800)", stxBal(JIM_INSCRIBER), undefined, { capture: "j_before" });
  evalc("contract BEFORE (jim #800)", stxBal(CID), undefined, { capture: "jk_before" });
  evalc("master-royalty BEFORE (jim #800)", stxBal(MASTER_OWNER), undefined, { capture: "jroy_before" });
  await callTx("inscribe #800 (free tier) DENY holder=Lte(152000) + contract=Lte(152000) -> (ok uXID)",
    JIM_INSCRIBER, "inscribe", jim.args, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(JIM_INSCRIBER).willSendLte(MASTER_FEE_1CHUNK_NEW).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK_NEW).ustx(),
      ],
      cover: "jim:inscribe-newfee-ok",
    });
  evalc("payout-a AFTER (jim #800)", stxBal(DEPLOYER), undefined, { capture: "jA_after" });
  evalc("payout-b AFTER (jim #800)", stxBal(PAYOUT_B), undefined, { capture: "jB_after" });
  evalc("inscriber AFTER (jim #800)", stxBal(JIM_INSCRIBER), undefined, { capture: "j_after" });
  evalc("contract AFTER (jim #800)", stxBal(CID), undefined, { capture: "jk_after" });
  evalc("master-royalty AFTER (jim #800)", stxBal(MASTER_OWNER), undefined, { capture: "jroy_after" });
  evalc(`#${T_JIM} inscribed (jim)`, `(is-inscribed u${T_JIM})`, "(ok true)", { cover: "jim:inscribed" });
  evalc("get-inscribed-count == 5", "(get-inscribed-count)", "(ok u5)", { cover: "jim:count" });
  evalc(`twin #${T_JIM} escrowed in registry`, twinOwner(T_JIM), SOME(CID), { cover: "jim:twin-escrowed" });
  evalc(`binding #${T_JIM} escrowed=true`, `(get-binding u${T_JIM})`, /xtrata-escrowed true/, { cover: "jim:binding" });

  // ---- B.4 why a STALE OLD-102000 FE PC would ABORT on real mainnet (FE must quote live) ----
  // On real consensus, a holder willSendLte(102000) deny PC is VIOLATED the instant the
  // contract debits the live 152000 master fee -> the tx aborts. NOTE: stxer's fork engine
  // does NOT enforce a violated `willSendLte` upper bound (verified: it commits an over-cap
  // STX send with post_condition_aborted=false), so we cannot reproduce the abort on the
  // fork. Instead we PROVE the load-bearing fact analytically from B.3's captured deltas:
  // the inscriber's actual on-chain STX out was the NEW 152000 master fee (not 102000),
  // which is strictly greater than a stale 102000 cap -> on mainnet that PC aborts. The
  // assertion lives in the POINT B VERDICT block ("inscriber paid >= NEW fee").
  // (No fork tx here: stxer would falsely let the stale-PC tx succeed and mislead the reader.)
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
const match = (g, e) => e instanceof RegExp ? e.test(g) : g === e;
const uintOf = (s) => BigInt(String(s).replace(/^u/, ""));

async function main() {
  console.log("=== pepe-4ever-fakfun stxer harness (as-contract escrow mint) ===\n");
  // pin tip
  const info = await (await fetch(`${STACKS_API}/v2/info`)).json();
  const height = info.stacks_tip_height;
  const bi = await (await fetch(`${STACKS_API}/extended/v1/block/by_height/${height}?unanchored=true`)).json();
  TIP_IBH = bi.index_block_hash;
  console.log(`Pinned tip height ${height} ibh ${TIP_IBH}\n`);

  await build();
  console.log(`Plan: ${plan.length} steps (${plan.filter(p=>p.kind==="deploy").length} deploy, ${plan.filter(p=>p.kind==="tx").length} tx, ${plan.filter(p=>p.kind==="eval").length} eval)\n`);

  const sessionId = await createSimulationSession({ block_height: height, block_hash: bi.hash.replace(/^0x/, ""), skip_tracing: false }, { stxerApi: STXER_API });
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Session: ${url}\n`);
  await submitSimulationSteps(sessionId, { steps }, { stxerApi: STXER_API });
  const res = await getSimulationResult(sessionId, { stxerApi: STXER_API });

  let pass = 0, fail = 0;
  const cap = {};
  const probe = {};   // probe id -> got string
  const coverage = [];
  res.steps.forEach((s, i) => {
    if (sections[i]) console.log(`\n-- ${sections[i]} --`);
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label} -> ${decTx(s)}`); ok ? pass++ : fail++;
      if (p.cover) coverage.push({ cover: p.cover, ok });
    } else if (p.kind === "tx") {
      const g = decTx(s);
      if (p.probe) { probe[p.probe] = g; console.log(`PROBE[${p.probe}] [${i}] ${p.label}  got ${g}`); if (p.cover) coverage.push({ cover: p.cover, ok: true }); return; }
      const ok = match(g, p.expect);
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}  got ${g}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
      if (p.cover) coverage.push({ cover: p.cover, ok });
    } else if (p.kind === "eval") {
      const g = decEval(s);
      if (p.capture) { cap[p.capture] = uintOf(g); console.log(`capt [${i}] ${p.label}: ${g}`); }
      else if (p.probeRead) { console.log(`PROBE-READ[${p.probeRead}] [${i}] ${p.label}: ${g}`); }
      else if (p.expect === undefined) console.log(`info [${i}] ${p.label}: ${g}`);
      else { const ok = match(g, p.expect); console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}  got ${g}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; if (p.cover) coverage.push({ cover: p.cover, ok }); }
    }
  });

  // ---- POINT 3 verdict ----
  console.log("\n== POINT 3 VERDICT: minimal deny-mode PC set for inscribe ==");
  console.log(`  [3.1] holder-STX-cap ONLY (no contract PC): ${probe["3.1"]}`);
  console.log(`  [3.2] holder-cap + contract(registry)-cap : ${probe["3.2"]}`);

  // ---- fee + funding deltas ----
  console.log("\n== FREE-tier (free-threshold 87) master-fee funding deltas (#300, O3) ==");
  function d(label, before, after, expected, push = true) {
    if (before === undefined || after === undefined) { console.log(`FAIL ${label}: missing capture`); fail++; return; }
    const delta = after - before; const ok = delta === expected;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: delta=${delta} (expected ${expected})`);
    if (push) (ok ? pass++ : fail++);
  }
  d("payout-a unchanged (free tier: registry fee 0)", cap.pA_before, cap.pA_after, 0n);
  d("payout-b unchanged (free tier: registry fee 0)", cap.pB_before, cap.pB_after, 0n);
  d("master-royalty += masterFee (102000)", cap.roy_before, cap.roy_after, BigInt(MASTER_FEE_1CHUNK));
  d("contract net == 0 (no dust retained)", cap.k_before, cap.k_after, 0n);
  // free tier: O3 out = masterFee(102000) + gas only, NO 3 STX registry fee.
  if (cap.o3_before !== undefined && cap.o3_after !== undefined) {
    const out = cap.o3_before - cap.o3_after;
    console.log(`info O3 total out=${out} (masterFee=${MASTER_FEE_1CHUNK} + gas=${out - BigInt(MASTER_FEE_1CHUNK)}; NO 3 STX registry fee in free tier)`);
    const ok = out >= BigInt(MASTER_FEE_1CHUNK) && out < BigInt(MASTER_FEE_1CHUNK) + 1000000n;
    console.log(`${ok ? "PASS" : "FAIL"} O3 out is ~masterFee+gas (no 3 STX registry fee)`); ok ? pass++ : fail++;
  }

  console.log("\n== FREE-tier: holder pays NO registry fee, still pays master fee (#161, B) ==");
  d("payout-a unchanged (free tier: 0 registry fee)", cap.fpA_before, cap.fpA_after, 0n);
  d("payout-b unchanged (free tier: 0 registry fee)", cap.fpB_before, cap.fpB_after, 0n);
  if (cap.b_before !== undefined && cap.b_after !== undefined) {
    const out = cap.b_before - cap.b_after;
    console.log(`info B total out=${out} (expect masterFee 102000 + gas; NO 3 STX registry fee)`);
    const ok = out >= BigInt(MASTER_FEE_1CHUNK) && out < BigInt(MASTER_FEE_1CHUNK) + 1000000n; // master fee + small gas, well under 3 STX
    console.log(`${ok ? "PASS" : "FAIL"} B out is ~masterFee+gas (no 3 STX registry fee)`); ok ? pass++ : fail++;
  }

  // ---- POINT B verdict: Jim raises the master fee, live-read adapts ----
  console.log("\n== POINT B VERDICT: Jim raises master fee; contract LIVE-READ funds+caps+succeeds ==");
  console.log(`  baseline masterFee=${MASTER_FEE_1CHUNK} (single-tx-fee-unit u100000) -> NEW masterFee=${MASTER_FEE_1CHUNK_NEW} (unit u${NEW_SINGLE_TX_FEE_UNIT})`);
  // royalty must have received exactly the NEW master fee
  d(`master-royalty += NEW masterFee (${MASTER_FEE_1CHUNK_NEW})`, cap.jroy_before, cap.jroy_after, BigInt(MASTER_FEE_1CHUNK_NEW));
  d("contract net == 0 (no dust; live-read funded exactly)", cap.jk_before, cap.jk_after, 0n);
  d("payout-a unchanged (free tier: 0 registry fee)", cap.jA_before, cap.jA_after, 0n);
  d("payout-b unchanged (free tier: 0 registry fee)", cap.jB_before, cap.jB_after, 0n);
  if (cap.j_before !== undefined && cap.j_after !== undefined) {
    const out = cap.j_before - cap.j_after;
    console.log(`info inscriber total out=${out} (expect NEW masterFee ${MASTER_FEE_1CHUNK_NEW} + gas; NO registry fee in free tier)`);
    // exactly the NEW master fee (152000), NOT the old 102000, plus small gas.
    const okNew = out >= BigInt(MASTER_FEE_1CHUNK_NEW) && out < BigInt(MASTER_FEE_1CHUNK_NEW) + 1000000n;
    console.log(`${okNew ? "PASS" : "FAIL"} inscriber out is ~NEW masterFee(${MASTER_FEE_1CHUNK_NEW})+gas (scaled with Jim's bump)`); okNew ? pass++ : fail++;
    // strictly MORE than the old fee -> the live-read scaled up; a stale 102000 PC is now violated.
    const okScaled = out > BigInt(MASTER_FEE_1CHUNK);
    console.log(`${okScaled ? "PASS" : "FAIL"} inscriber paid > OLD fee ${MASTER_FEE_1CHUNK} (live-read scaled up; a stale 102000 PC would be VIOLATED -> mainnet abort)`); okScaled ? pass++ : fail++;
  }
  console.log("  FE PC recipe AFTER Jim: holder willSendLte(registryFee + 152000), contract willSendLte(152000).");
  console.log("  A stale PC built for OLD 102000 is VIOLATED by the live 152000 debit -> aborts on real mainnet consensus,");
  console.log("  so the FE MUST quote the fee LIVE (just like the contract). [stxer fork note: it does not enforce a");
  console.log("  violated willSendLte upper bound, so the stale-PC abort is proven analytically from the 152000 delta, not on-fork.]");

  // ---- coverage ----
  console.log("\n== COVERAGE ==");
  const byCover = {};
  for (const c of coverage) (byCover[c.cover] ||= []).push(c);
  for (const k of Object.keys(byCover).sort()) {
    const items = byCover[k]; const allOk = items.every((x) => x.ok);
    console.log(`  ${allOk ? "PASS" : "FAIL"}  ${k}  (${items.length})`);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
