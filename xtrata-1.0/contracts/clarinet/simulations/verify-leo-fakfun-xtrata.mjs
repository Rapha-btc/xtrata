// verify-leo-fakfun-xtrata.mjs
// stxer mainnet-fork harness for `leo-fakfun-xtrata` (as-contract escrow mint),
// with BOTH inscribe AND swaps ROUTED THROUGH the `fakfun-xtrata-core` wrapper.
//
// This is the leo-cats sibling of verify-pepe-4ever-fakfun.mjs. Same low-level
// stxer session API (createSimulationSession + submitSimulationSteps) so we set
// per-tx postConditions + postConditionMode and PROVE the minimal PC sets still hold
// when the calls go THROUGH the core.
//
// WHAT'S DIFFERENT vs the pepe harness:
//   1. SOURCE NFT = SP2N959SER36FZ5QT1CX9BR63W3E8X35WQCMBYYWC.leo-cats (asset "leo-cats").
//   2. Registry fee = 4 STX (u4000000), split payout-a/payout-b 2 + 2.
//   3. free-threshold = u87; a fresh deploy has inscribed-count 0, so the FIRST
//      inscribes are FREE (fee-for -> 0 until inscribed-count >= 87). To exercise
//      the 4 STX split we first lower free-threshold to u0 via set-free-threshold.
//   4. Swap fns RENAMED generically: swap-nft-for-xtrata / swap-xtrata-for-nft, and
//      leo conforms to the core's <swap-trait>. Swaps route THROUGH the core too:
//        core.swap-nft-for-xtrata(leoCID, token-id) / core.swap-xtrata-for-nft(leoCID, id).
//      tx-sender (the owner) is preserved through contract-call?, so ownership/escrow
//      still bind to the real user; the core just forwards and emits ONE unified swap
//      print tagged with the registry principal (so a single chainhook on the core
//      indexes swaps for every registry).
//   5. INSCRIBE is called THROUGH the core: core.inscribe(leoCID, ...args). Same
//      tx-sender preservation. No image backend: chunk bytes are generated locally and
//      expected-hash = sha256(0x00*32 || data) (the master's single-chunk running-hash
//      rule), then seeded as the canonical hash.
//   6. MASTER ALLOWLIST TARGET = the LEO CID (NOT the core): inside leo.inscribe the
//      master MINT runs under as-contract?, so the master sees contract-caller = the
//      leo registry. The core is never the master's caller, so we do NOT allowlist it
//      (asserted: is-allowed-caller(CORE) == false). Swaps need NO master allowlist:
//      swap-xtrata-for-nft pulls the twin via the master's owner-gated SIP-009 transfer
//      (not caller-allowlisted), and release-nft-to is a plain leo-cats transfer.
//
// SWAP POST-CONDITIONS (minimal, originated by tx-sender, unchanged by the core layer):
//   swap-nft-for-xtrata: owner sends 1 leo-cats NFT (token-id) -> attach
//     Pc.principal(owner).willSendAsset().nft("<LEO>::leo-cats", token-id), Allow mode.
//   swap-xtrata-for-nft: owner sends 1 xtrata twin (xtrata-id) -> the FE builds
//     Pc.principal(owner).willSendAsset().nft("<MASTER>::xtrata-inscription", binding.xtrata-id)
//     from get-binding (always available to the FE; the twin id is captured + shown here).
//   Allow mode keeps the PC enforced for the user's OUTGOING asset while waiving coverage
//   for the registry's INTERNAL as-contract? release leg (its own logic). On Leather this
//   is exactly the 'originator' post-condition mode (see project_jingswap_originator_pcs).
//
// leo-cats GOTCHA discovered on-chain: leo-cats.transfer asserts the token is NOT
//   listed on its internal marketplace (ERR-LISTING u106). All swap/scenario tokens
//   below were verified UNLISTED (get-listing-in-ustx == none) at the pinned tip.
//
// Run: cd simulations && node verify-leo-fakfun-xtrata.mjs
const STACKS_API = "http://77.42.3.101/stacks-api";
const STXER_API = "https://api.stxer.xyz";
import { createHash } from "node:crypto";
import {
  ClarityVersion, PostConditionMode, Pc,
  uintCV, bufferCV, stringAsciiCV, listCV, trueCV,
  standardPrincipalCV, contractPrincipalCV, tupleCV,
  makeUnsignedContractCall, makeUnsignedContractDeploy,
  deserializeCV, cvToString,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import fs from "node:fs";
import {
  createSimulationSession, submitSimulationSteps, getSimulationResult,
  setSender, bytesToHex,
} from "stxer";

// ---- principals ----
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // registry owner + payout-a (gas-free deployer)
const STRANGER = "SP000000000000000000002Q6VF78";
const PAYOUT_B = "SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7";

const MASTER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3";
const MASTER_OWNER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X"; // master contract-owner + royalty-recipient
const SOURCE = "SP2N959SER36FZ5QT1CX9BR63W3E8X35WQCMBYYWC.leo-cats"; // the NFT collection

const CORE_NAME = "fakfun-xtrata-core";
const REG_NAME = "leo-fakfun-xtrata";
const CORE = `${DEPLOYER}.${CORE_NAME}`;
const CID = `${DEPLOYER}.${REG_NAME}`; // the leo registry CID (= master allowlist target)

// ---- scenario tokens (real mainnet leo-cats owners, UNLISTED, verified at tip) ----
const T         = 200;
const A_OWNER   = "SPYHP3JCPMSPXXRAXW3GKHPZ215YX6N87HXGTD0V"; // owns #200, unlisted (~287 STX)

const T2        = 100;
const B_OWNER   = "SP1710ZN87BPVKPJ54VX9ZPV0D8RDG7VC3KFV078N"; // owns #100, unlisted (~11.7 STX)
const B2_OWNER  = B_OWNER;

const T3        = 10;
const O3_OWNER  = "SP2D8RP8J0EYMZPFTT0SS0YE4HR0JV6CBBAB9508F"; // owns #10, unlisted (~5.4 STX)

const NO_SEED = 99999;            // > last-token-id (10000) -> get-owner none -> u200
const UNSEEDED_AFTER_FREEZE = 7;  // exists on leo-cats, deliberately never seeded -> u206

const FEE_STD   = 4000000;        // registry inscribe-fee = 4 STX
const DISCOUNT  = 1000000;

// master fee for a single-chunk inscribe = single-tx-fee-unit + 1*upload-chunk-fee-unit
const MASTER_FEE_1CHUNK = 100000 + 1 * 2000; // 102000

// ---- Point B (Jim raises the master fee) ----
const NEW_SINGLE_TX_FEE_UNIT = 150000;
const MASTER_FEE_1CHUNK_NEW = NEW_SINGLE_TX_FEE_UNIT + 1 * 2000; // 152000
const T_JIM   = 777;             // a DIFFERENT unlisted leo, inscribed AFTER the fee change
const JIM_INSCRIBER = A_OWNER;   // any funded principal; inscriber need not own the token

// ---- canonical data: synthetic single-chunk content, hash = master's running-hash rule ----
// The master folds chunks: run-hash starts 0x00*32; next = sha256(concat(run, data));
// for ONE chunk final-hash = sha256(0x00*32 || data) and must equal expected-hash.
// valid-total-shape? for 1 chunk: 0 < total-size <= 16384 and len(data) == total-size.
const sha256 = (b) => createHash("sha256").update(b).digest();
const ZERO32 = Buffer.alloc(32, 0);
const contentFor = (id) => Buffer.from(`leo-fakfun-xtrata twin #${id} forever`, "ascii"); // single chunk, 0 < len <= 16384
const hashFor = (id) => sha256(Buffer.concat([ZERO32, contentFor(id)]));
const HASH_HEX = (id) => "0x" + hashFor(id).toString("hex");

function inscribeArgs(id, { tamper = false } = {}) {
  const data = contentFor(id);
  const h = hashFor(id);
  const expected = tamper ? Buffer.from(h) : h;
  if (tamper) expected[0] ^= 0xff;
  const uri = `ipfs://leo/${id}.json`;
  // args WITHOUT the registry trait (direct registry shape, reused for revert paths)
  const regArgs = [
    uintCV(id), bufferCV(expected), stringAsciiCV("image/png"),
    uintCV(data.length), listCV([bufferCV(data)]), stringAsciiCV(uri),
  ];
  // args WITH the registry trait prepended (routing THROUGH the core)
  const coreArgs = [pcv(CID), ...regArgs];
  return { regArgs, coreArgs, nChunks: 1, masterFee: MASTER_FEE_1CHUNK };
}

const hexToBuf = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const entryCV = (id) => tupleCV({ id: uintCV(id), hash: bufferCV(hexToBuf(HASH_HEX(id))) });
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

// a contract-call to ANY contract id (direct registry, the core, or the master)
async function callTxTo(label, sender, contractId, fn, args, expect, opts = {}) {
  const nonce = await nextNonce(sender);
  const tx = await makeUnsignedContractCall({
    contractAddress: contractId.split(".")[0], contractName: contractId.split(".")[1],
    functionName: fn, functionArgs: args, nonce, network: NET, publicKey: "00".repeat(33),
    postConditionMode: opts.pcMode ?? PostConditionMode.Allow,
    postConditions: opts.pcs ?? [], fee: opts.fee ?? 3000,
  });
  setSender(tx, sender);
  steps.push({ Transaction: bytesToHex(tx.serializeBytes()) });
  plan.push({ kind: "tx", label, expect, ...opts });
}
// direct call to the LEO registry (CID) -- used for admin only
const callTx = (label, sender, fn, args, expect, opts = {}) =>
  callTxTo(label, sender, CID, fn, args, expect, opts);
// inscribe THROUGH the core (core.inscribe(leoCID, ...))
const coreInscribe = (label, sender, coreArgs, expect, opts = {}) =>
  callTxTo(label, sender, CORE, "inscribe", coreArgs, expect, opts);
// swaps THROUGH the core (core.swap-*(leoCID, token-id)). The leo CID is the
// <swap-trait> arg; tx-sender (the owner) is preserved through contract-call?, so
// ownership/escrow still bind to the real user. The core moves nothing -- it only
// forwards and emits one unified swap print tagged with the registry principal.
const coreSwapNft = (label, sender, id, expect, opts = {}) =>
  callTxTo(label, sender, CORE, "swap-nft-for-xtrata", [pcv(CID), uintCV(id)], expect, { coreEvent: "swap-nft-for-xtrata", ...opts });
const coreSwapXtrata = (label, sender, id, expect, opts = {}) =>
  callTxTo(label, sender, CORE, "swap-xtrata-for-nft", [pcv(CID), uintCV(id)], expect, { coreEvent: "swap-xtrata-for-nft", ...opts });

// ---- minimal swap post-conditions (the owner's OUTGOING asset, originated by
// tx-sender and UNCHANGED by routing through the core) ----
//   swap-nft-for-xtrata: owner sends 1 leo-cats NFT (token-id); receives the twin.
//   swap-xtrata-for-nft: owner sends 1 xtrata twin (xtrata-id); receives the leo.
// We attach the owner's outgoing-asset PC and run in ALLOW mode: Allow does NOT
// disable attached PCs (they are still enforced exactly) -- it only waives coverage
// for the registry's INTERNAL release leg (the as-contract? twin/leo send), which is
// the contract's own logic, not the user's asset. This is precisely the wallet-level
// minimal PC the FE attaches. (A strict deny-mode tx would additionally need a PC for
// the registry's outgoing release leg; that internal leg is excluded by Leather's
// 'originator' post-condition mode in production -- see project_jingswap_originator_pcs.)
const leoOutEq1 = (owner, id) => Pc.principal(owner).willSendAsset().nft(`${SOURCE}::leo-cats`, uintCV(id));
const twinOutEq1 = (owner, xid) => Pc.principal(owner).willSendAsset().nft(`${MASTER}::xtrata-inscription`, uintCV(xid));

async function deployTx(name, relpath) {
  const sender = DEPLOYER;
  const nonce = await nextNonce(sender);
  const src = fs.readFileSync(relpath, "utf8");
  const tx = await makeUnsignedContractDeploy({
    contractName: name, codeBody: src, clarityVersion: ClarityVersion.Clarity5,
    nonce, network: NET, publicKey: "00".repeat(33), fee: 200000,
  });
  setSender(tx, sender);
  steps.push({ Transaction: bytesToHex(tx.serializeBytes()) });
  plan.push({ kind: "deploy", label: `deploy ${name}`, cover: `deploy:${name}` });
}
function evalc(label, code, expect, opts = {}) {
  steps.push({ Eval: [DEPLOYER, "", CID, code] });
  plan.push({ kind: "eval", label, expect, ...opts });
}

const C = "/home/raphastacks/projects/xtrata/xtrata-1.0/contracts/clarinet/contracts/fakfun-idea";
const ownerNft = (id) => `(contract-call? '${SOURCE} get-owner u${id})`;
const twinOwner = (id) => `(let ((bn (unwrap-panic (get-binding u${id})))) (contract-call? '${MASTER} get-owner (get xtrata-id bn)))`;
const SOME = (p) => `(ok (some ${p}))`;
const stxBal = (p) => `(stx-get-balance '${p})`;

// =====================================================================
async function build() {
  // ---- 0. deploy BOTH contracts (core first, then leo registry), then allowlist LEO on master ----
  section("Point 2: deploy core + leo registry; Point 4: master allowlist the LEO CID (not the core)");
  await deployTx(CORE_NAME, `${C}/fakfun-xtrata-core.clar`);
  await deployTx(REG_NAME, `${C}/leo-fakfun-xtrata.clar`);
  evalc("get-owner == deployer", "(get-owner)", `(ok ${DEPLOYER})`, { cover: "get-owner" });
  evalc("get-free-threshold == 87 (first 87 inscriptions free)", "(get-free-threshold)", "(ok u87)", { cover: "get-free-threshold" });
  evalc("get-fee == 4 STX", "(get-fee)", "(ok u4000000)", { cover: "get-fee" });
  evalc("get-payouts == {a: deployer, b: PAYOUT_B}", "(get-payouts)",
    `(ok (tuple (a ${DEPLOYER}) (b ${PAYOUT_B})))`, { cover: "get-payouts" });
  evalc("is-finalized == false", "(is-finalized)", "(ok false)", { cover: "is-finalized" });
  evalc("get-inscribed-count == 0", "(get-inscribed-count)", "(ok u0)", { cover: "get-inscribed-count" });
  // Allowlist the LEO CID (the master's contract-caller under as-contract?). NOT the core.
  await callTxTo("master set-allowed-caller(LEO CID, true) by master-owner -> (ok true)",
    MASTER_OWNER, MASTER, "set-allowed-caller", [pcv(CID), trueCV()], "(ok true)",
    { cover: "master:allowlist-leo" });
  evalc("master is-allowed-caller(LEO CID) == true",
    `(contract-call? '${MASTER} is-allowed-caller '${CID})`, "(ok true)", { cover: "master:allowlist-leo" });
  evalc("master is-allowed-caller(CORE) == false (core never calls master)",
    `(contract-call? '${MASTER} is-allowed-caller '${CORE})`, "(ok false)", { cover: "master:core-not-allowed" });

  // ---- 1. seed canonical hashes for the synthetic content (minus #7), + readers ----
  section("Point 1: seed canonical (synthetic single-chunk hashes; #7 deliberately unseeded)");
  const ids = [T, T2, T3, T_JIM, 1, 2, 3, 300, 500, 1000, 1500]
    .filter((x, i, a) => a.indexOf(x) === i && x !== UNSEEDED_AFTER_FREEZE);
  await callTx(`seed-canonical (${ids.length} ids) -> (ok true)`,
    DEPLOYER, "seed-canonical", [listCV(ids.map(entryCV))], "(ok true)", { cover: "seed-canonical:ok" });
  await callTx("seed-canonical by STRANGER -> u204", STRANGER, "seed-canonical", [listCV([entryCV(1)])], "(err u204)", { cover: "seed-canonical:u204" });
  evalc(`get-canonical-hash #${T} seeded`, `(get-canonical-hash u${T})`, `(some ${HASH_HEX(T)})`, { cover: "get-canonical-hash" });
  evalc("get-canonical-hash #7 == none (unseeded)", `(get-canonical-hash u${UNSEEDED_AFTER_FREEZE})`, "none");

  // ---- Point 7 regression: pre-inscribe revert paths (through the core) ----
  section("Point 7: inscribe revert paths (routed through the core)");
  await coreInscribe(`inscribe #${NO_SEED} (nonexistent) -> u200`, B_OWNER,
    [pcv(CID), uintCV(NO_SEED), bufferCV(Buffer.alloc(32, 0)), stringAsciiCV("image/png"),
     uintCV(1), listCV([bufferCV(Buffer.from([0]))]), stringAsciiCV("ipfs://x")], "(err u200)", { cover: "inscribe:u200" });
  await coreInscribe("inscribe #7 (exists, unseeded) -> u206", B_OWNER,
    inscribeArgs(UNSEEDED_AFTER_FREEZE).coreArgs, "(err u206)", { cover: "inscribe:u206-unseeded" });
  await coreInscribe(`inscribe #${T} TAMPERED -> u206`, B_OWNER,
    inscribeArgs(T, { tamper: true }).coreArgs, "(err u206)", { cover: "inscribe:u206-tampered" });
  evalc(`binding #${T} still none`, `(get-binding u${T})`, "none");
  evalc("inscribed-count still 0", "(get-inscribed-count)", "(ok u0)");

  // swap reverts: no binding -- routed THROUGH THE CORE, u202 propagates up the wrapper
  section("Point 7: swap revert -- not-inscribed (u202) via CORE (wrapper surfaces registry err unchanged)");
  await coreSwapNft(`swap-nft-for-xtrata #${T} via CORE (no binding) -> u202`, A_OWNER, T, "(err u202)", { cover: "swap-nft-for-xtrata:u202" });
  await coreSwapXtrata(`swap-xtrata-for-nft #${T} via CORE (no binding) -> u202`, A_OWNER, T, "(err u202)", { cover: "swap-xtrata-for-nft:u202" });

  // ======================================================================
  // POINT 8 -- minimal deny-mode PC set for inscribe, ROUTED THROUGH THE CORE.
  // free-threshold is u87, inscribed-count starts 0 -> registry fee 0 (free tier),
  // only the master fee flows. STX still ORIGINATES from tx-sender (the inscriber)
  // even through the core, because contract-call? preserves tx-sender. So the proven
  // minimal PC set is unchanged from the pepe (direct) harness:
  //   (a) inscriber -> contract(LEO): registryFee(0 free) + masterFee
  //   (b) contract(LEO) -> master royalty: masterFee  (as-contract? maybe-pay)
  // The CORE never moves STX -> it needs NO post-condition.
  // ======================================================================
  section("Point 8: minimal deny-mode PC probe (THROUGH core; free tier -> registry fee 0, master-fee only)");
  await callTx("set-discount B = u0 (0 < inscribe-fee) -> (ok true)", DEPLOYER, "set-discount", [pcv(B_OWNER), uintCV(0)], "(ok true)", { cover: "set-discount:zero" });
  evalc("fee-for B == u0 (free tier: inscribed-count 0 < free-threshold 87)", `(fee-for '${B_OWNER})`, "u0", { cover: "fee-for:free-tier" });

  // PROBE 8.1: deny-mode through core, ONLY an inscriber STX cap (no LEO-contract PC).
  await coreInscribe(`[8.1] inscribe #${T} via CORE DENY, inscriber-STX-cap ONLY (no contract PC)`,
    B_OWNER, inscribeArgs(T).coreArgs, /.*/, {
      pcMode: PostConditionMode.Deny,
      pcs: [Pc.principal(B_OWNER).willSendLte(0 + MASTER_FEE_1CHUNK).ustx()],
      probe: "8.1", cover: "pc-probe:inscriber-only",
    });
  evalc(`[8.1] did #${T} bind? (true => inscriber-only PC sufficed)`, `(is-inscribed u${T})`, /.*/, { probeRead: "8.1" });

  // PROBE 8.2: deny-mode through core, inscriber STX cap + LEO-contract STX cap.
  // Full STX-only, ZERO NFT recipe. The CORE has NO PC. If 8.1 already bound #T,
  // this reverts u201 and we read 8.1's result as the answer.
  await coreInscribe(`[8.2] inscribe #${T} via CORE DENY, inscriber-cap + LEO-contract-cap (STX-only, 0 NFT PCs, no core PC)`,
    B_OWNER, inscribeArgs(T).coreArgs, /.*/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(B_OWNER).willSendLte(0 + MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      probe: "8.2", cover: "pc-probe:inscriber+contract",
    });
  evalc(`[8.2] is #${T} inscribed now?`, `(is-inscribed u${T})`, /.*/, { probeRead: "8.2" });
  evalc(`[8.2] twin #${T} owned by registry (escrowed on mint)`, twinOwner(T), SOME(CID), { probeRead: "8.2-twin" });
  evalc(`[8.2] leo #${T} did NOT move (still A)`, ownerNft(T), SOME(A_OWNER), { probeRead: "8.2-nft" });
  evalc(`[8.2] binding #${T} escrowed=true`, `(get-binding u${T})`, /xtrata-escrowed true/, { probeRead: "8.2-binding" });
  evalc(`[8.2] binding #${T} inscriber == B`, `(get-binding u${T})`, new RegExp(`inscriber ${B_OWNER}`), { probeRead: "8.2-inscriber" });
  evalc("get-inscribed-count == 1", "(get-inscribed-count)", "(ok u1)", { cover: "get-inscribed-count" });

  // double-inscribe regression (through core)
  await coreInscribe(`inscribe #${T} again via core -> u201`, B_OWNER, inscribeArgs(T).coreArgs, "(err u201)", {
    pcMode: PostConditionMode.Deny,
    pcs: [Pc.principal(B_OWNER).willSendLte(MASTER_FEE_1CHUNK).ustx(),
          Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx()],
    cover: "inscribe:u201",
  });

  // ---- Point 7: swaps round-trip on #T (twin starts escrowed), ROUTED THROUGH THE CORE ----
  // Each swap is core.swap-*(leoCID, token-id). The unified swap print must appear on the
  // CORE (verified in the print tally). PCs: the owner's outgoing asset, in Allow mode
  // (the registry's internal release leg is excluded -- see leoOutEq1/twinOutEq1 notes).
  section(`Point 7: swaps round-trip (#${T}) via CORE + non-owner cannot + wrong-state (errors propagate through wrapper)`);
  // wrong-state FIRST (twin still escrowed -> swap-xtrata-for-nft must revert u203), via core
  await coreSwapXtrata(`swap-xtrata-for-nft #${T} via CORE (twin escrowed) -> u203`, A_OWNER, T, "(err u203)", { cover: "swap-xtrata-for-nft:u203" });
  // non-owner B cannot escrow a leo they don't own: leo-cats transfer asserts tx-sender==owner
  // and reverts (err u1) -- the revert propagates up through the core wrapper. No PC attached
  // (the revert is the contract's own guard; a willSendAsset PC would just mask it as a PC-abort).
  await coreSwapNft(`swap-nft-for-xtrata #${T} by B via CORE (not owner) -> revert (u1) through wrapper`, B_OWNER, T, /^\(err/, { cover: "swap:non-owner-cant" });
  evalc(`twin #${T} STILL in registry`, twinOwner(T), SOME(CID));
  evalc(`leo #${T} STILL with A`, ownerNft(T), SOME(A_OWNER));
  // forward leg: A escrows leo, takes twin -- via core, minimal leo-cats outgoing PC
  await coreSwapNft(`swap-nft-for-xtrata #${T} by A via CORE (owner) PC leo-cats out -> (ok true)`, A_OWNER, T, "(ok true)", {
    pcMode: PostConditionMode.Allow, pcs: [leoOutEq1(A_OWNER, T)], cover: "swap-nft-for-xtrata:ok",
  });
  evalc(`leo #${T} now in registry`, ownerNft(T), SOME(CID));
  evalc(`twin #${T} now with A`, twinOwner(T), SOME(A_OWNER));
  evalc(`binding #${T} escrowed=false`, `(get-binding u${T})`, /xtrata-escrowed false/);
  await coreSwapNft(`swap-nft-for-xtrata #${T} via CORE (not escrowed) -> u203`, A_OWNER, T, "(err u203)", { cover: "swap-nft-for-xtrata:u203" });
  // return leg: A returns twin, takes leo back -- via core. The twin PC is built from
  // get-binding's xtrata-id (which the FE always has); shown in the eval below.
  evalc(`twin id for #${T} (FE reads this from get-binding to build the twin-out PC)`, `(get xtrata-id (unwrap-panic (get-binding u${T})))`, undefined, { capture: "xid_T" });
  await coreSwapXtrata(`swap-xtrata-for-nft #${T} by A via CORE -> (ok true)`, A_OWNER, T, "(ok true)", { cover: "swap-xtrata-for-nft:ok" });
  evalc(`leo #${T} back to A`, ownerNft(T), SOME(A_OWNER));
  evalc(`twin #${T} back to registry`, twinOwner(T), SOME(CID));
  evalc(`binding #${T} escrowed=true`, `(get-binding u${T})`, /xtrata-escrowed true/);

  // ---- Point 6: discount admin path + FREE-tier inscribe master-fee funding exactness ----
  section(`Point 6: set/remove-discount admin path; FREE-tier master-fee funding exact (#${T3} via core)`);
  await callTx("set-discount O3 = 1 STX -> (ok true)", DEPLOYER, "set-discount", [pcv(O3_OWNER), uintCV(DISCOUNT)], "(ok true)", { cover: "set-discount:ok" });
  await callTx("set-discount fee==inscribe-fee -> u205", DEPLOYER, "set-discount", [pcv(O3_OWNER), uintCV(FEE_STD)], "(err u205)", { cover: "set-discount:u205" });
  await callTx("remove-discount O3 -> (ok true)", DEPLOYER, "remove-discount", [pcv(O3_OWNER)], "(ok true)", { cover: "remove-discount:ok" });
  evalc("fee-for O3 == u0 (free tier: inscribed-count 1 < free-threshold 87)", `(fee-for '${O3_OWNER})`, "u0", { cover: "fee-for:free-tier" });

  evalc(`payout-a BEFORE (free #${T3})`, stxBal(DEPLOYER), undefined, { capture: "pA_before" });
  evalc(`payout-b BEFORE (free #${T3})`, stxBal(PAYOUT_B), undefined, { capture: "pB_before" });
  evalc(`O3 holder BEFORE (free #${T3})`, stxBal(O3_OWNER), undefined, { capture: "o3_before" });
  evalc(`contract BEFORE (free #${T3})`, stxBal(CID), undefined, { capture: "k_before" });
  evalc(`master-royalty BEFORE (free #${T3})`, stxBal(MASTER_OWNER), undefined, { capture: "roy_before" });
  await coreInscribe(`inscribe #${T3} by O3 via CORE (FREE tier, registry fee 0) DENY inscriber+contract caps -> (ok uXID)`,
    O3_OWNER, inscribeArgs(T3).coreArgs, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(O3_OWNER).willSendLte(MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      cover: "inscribe:free-ok",
    });
  evalc(`payout-a AFTER (free #${T3})`, stxBal(DEPLOYER), undefined, { capture: "pA_after" });
  evalc(`payout-b AFTER (free #${T3})`, stxBal(PAYOUT_B), undefined, { capture: "pB_after" });
  evalc(`O3 holder AFTER (free #${T3})`, stxBal(O3_OWNER), undefined, { capture: "o3_after" });
  evalc(`contract AFTER (free #${T3})`, stxBal(CID), undefined, { capture: "k_after" });
  evalc(`master-royalty AFTER (free #${T3})`, stxBal(MASTER_OWNER), undefined, { capture: "roy_after" });
  evalc("get-inscribed-count == 2", "(get-inscribed-count)", "(ok u2)", { cover: "get-inscribed-count" });
  evalc(`twin #${T3} escrowed in registry`, twinOwner(T3), SOME(CID));
  evalc(`binding #${T3} escrowed=true`, `(get-binding u${T3})`, /xtrata-escrowed true/);

  // ---- Point 6 continued: free-tier holder pays NO registry fee (still master fee) #T2 by B ----
  section(`Point 6: free-tier holder pays NO registry fee, still pays master fee (#${T2} by B, via core)`);
  evalc(`payout-a BEFORE (free-tier #${T2})`, stxBal(DEPLOYER), undefined, { capture: "fpA_before" });
  evalc(`payout-b BEFORE (free-tier #${T2})`, stxBal(PAYOUT_B), undefined, { capture: "fpB_before" });
  evalc(`B holder BEFORE (free-tier #${T2})`, stxBal(B_OWNER), undefined, { capture: "b_before" });
  await coreInscribe(`inscribe #${T2} by B via CORE (free tier) DENY inscriber+contract -> (ok uXID)`,
    B2_OWNER, inscribeArgs(T2).coreArgs, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(B_OWNER).willSendLte(0 + MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      cover: "inscribe:free-tier-ok",
    });
  evalc(`payout-a AFTER (free-tier #${T2})`, stxBal(DEPLOYER), undefined, { capture: "fpA_after" });
  evalc(`payout-b AFTER (free-tier #${T2})`, stxBal(PAYOUT_B), undefined, { capture: "fpB_after" });
  evalc(`B holder AFTER (free-tier #${T2})`, stxBal(B_OWNER), undefined, { capture: "b_after" });
  evalc("get-inscribed-count == 3", "(get-inscribed-count)", "(ok u3)", { cover: "get-inscribed-count" });
  evalc(`twin #${T2} escrowed in registry`, twinOwner(T2), SOME(CID));

  // #T2 swaps both ways (B is owner), ROUTED THROUGH THE CORE
  section(`Point 7: #${T2} swaps both ways via CORE (B owner)`);
  await coreSwapNft(`swap-nft-for-xtrata #${T2} by B via CORE PC leo-cats out -> (ok true)`, B2_OWNER, T2, "(ok true)", {
    pcMode: PostConditionMode.Allow, pcs: [leoOutEq1(B2_OWNER, T2)], cover: "swap-nft-for-xtrata:ok",
  });
  evalc(`leo #${T2} in registry`, ownerNft(T2), SOME(CID));
  evalc(`twin #${T2} with B`, twinOwner(T2), SOME(B2_OWNER));
  await coreSwapXtrata(`swap-xtrata-for-nft #${T2} by B via CORE -> (ok true)`, B2_OWNER, T2, "(ok true)", { cover: "swap-xtrata-for-nft:ok" });
  evalc(`leo #${T2} back to B`, ownerNft(T2), SOME(B2_OWNER));
  evalc(`twin #${T2} back to registry`, twinOwner(T2), SOME(CID));

  // ======================================================================
  // POINT 6 (PAID TIER): lower free-threshold to 0, then prove the 4 STX
  // registry fee split (2 STX payout-a, 2 STX payout-b) on a fresh inscribe.
  // ======================================================================
  section("Point 6 PAID: set-free-threshold(u0); inscribe #500 via core -> 4 STX split (2 to A, 2 to B) + master fee");
  await callTx("set-free-threshold(u0) by owner -> (ok true)", DEPLOYER, "set-free-threshold", [uintCV(0)], "(ok true)", { cover: "set-free-threshold:ok" });
  evalc("get-free-threshold == 0 now", "(get-free-threshold)", "(ok u0)", { cover: "get-free-threshold:0" });
  const TP = 500;                 // #500 exists+unlisted; inscriber = A (well-funded, can pay 4 STX).
  const PAID_INSCRIBER = A_OWNER; // inscribe needs existence+canonical hash, NOT ownership.
  evalc("fee-for inscriber == 4 STX now (paid tier: count 3 >= threshold 0)", `(fee-for '${PAID_INSCRIBER})`, "u4000000", { cover: "fee-for:paid-tier" });
  evalc(`payout-a BEFORE (paid #${TP})`, stxBal(DEPLOYER), undefined, { capture: "ppA_before" });
  evalc(`payout-b BEFORE (paid #${TP})`, stxBal(PAYOUT_B), undefined, { capture: "ppB_before" });
  evalc(`inscriber BEFORE (paid #${TP})`, stxBal(PAID_INSCRIBER), undefined, { capture: "pin_before" });
  evalc(`contract BEFORE (paid #${TP})`, stxBal(CID), undefined, { capture: "pk_before" });
  evalc(`master-royalty BEFORE (paid #${TP})`, stxBal(MASTER_OWNER), undefined, { capture: "proy_before" });
  // PAID-tier PC recipe: inscriber willSendLte(registryFee 4 STX + masterFee), contract willSendLte(masterFee).
  await coreInscribe(`inscribe #${TP} via CORE (PAID 4 STX) DENY inscriber=Lte(4 STX+master) + contract=Lte(master) -> (ok uXID)`,
    PAID_INSCRIBER, inscribeArgs(TP).coreArgs, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(PAID_INSCRIBER).willSendLte(FEE_STD + MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      cover: "inscribe:paid-ok",
    });
  evalc(`payout-a AFTER (paid #${TP})`, stxBal(DEPLOYER), undefined, { capture: "ppA_after" });
  evalc(`payout-b AFTER (paid #${TP})`, stxBal(PAYOUT_B), undefined, { capture: "ppB_after" });
  evalc(`inscriber AFTER (paid #${TP})`, stxBal(PAID_INSCRIBER), undefined, { capture: "pin_after" });
  evalc(`contract AFTER (paid #${TP})`, stxBal(CID), undefined, { capture: "pk_after" });
  evalc(`master-royalty AFTER (paid #${TP})`, stxBal(MASTER_OWNER), undefined, { capture: "proy_after" });
  evalc("get-inscribed-count == 4", "(get-inscribed-count)", "(ok u4)", { cover: "get-inscribed-count" });
  evalc(`twin #${TP} escrowed in registry`, twinOwner(TP), SOME(CID), { cover: "paid:twin-escrowed" });
  // restore free tier so downstream master-fee-only scenarios stay clean
  await callTx("set-free-threshold(u87) restore -> (ok true)", DEPLOYER, "set-free-threshold", [uintCV(87)], "(ok true)", { cover: "set-free-threshold:restore" });

  // ---- Point 7: admin-only reverts + finalize freeze ----
  section("Point 7: admin-only u204 + finalize freeze (u207) + post-finalize inscribe");
  await callTx("set-fee by STRANGER -> u204", STRANGER, "set-fee", [uintCV(1)], "(err u204)", { cover: "set-fee:u204" });
  await callTx("finalize-canonical by STRANGER -> u204", STRANGER, "finalize-canonical", [], "(err u204)", { cover: "finalize:u204" });
  await callTx("finalize-canonical by owner -> (ok true)", DEPLOYER, "finalize-canonical", [], "(ok true)", { cover: "finalize:ok" });
  evalc("is-finalized == true", "(is-finalized)", "(ok true)", { cover: "is-finalized" });
  await callTx("seed-canonical post-finalize -> u207", DEPLOYER, "seed-canonical", [listCV([entryCV(1)])], "(err u207)", { cover: "seed-canonical:u207" });
  await coreInscribe("inscribe #7 (unseeded) post-finalize -> u206", B_OWNER,
    inscribeArgs(UNSEEDED_AFTER_FREEZE).coreArgs, "(err u206)", { cover: "inscribe:u206-postfreeze" });

  // ---- post-finalize inscribe still works (seeded #1000 via core) ----
  section("Point: post-finalize inscribe of a seeded id still succeeds (#1000 via core)");
  const TF = 1000;
  await coreInscribe(`inscribe #${TF} post-finalize (seeded) via CORE DENY inscriber+contract -> (ok uXID)`,
    A_OWNER, inscribeArgs(TF).coreArgs, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(A_OWNER).willSendLte(MASTER_FEE_1CHUNK).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK).ustx(),
      ],
      cover: "inscribe:after-finalize",
    });
  evalc(`#${TF} inscribed after finalize`, `(is-inscribed u${TF})`, "(ok true)", { cover: "is-inscribed" });
  evalc("get-inscribed-count == 5", "(get-inscribed-count)", "(ok u5)", { cover: "get-inscribed-count" });
  evalc(`twin #${TF} escrowed in registry`, twinOwner(TF), SOME(CID));

  // ======================================================================
  // POINT B -- JIM CHANGES THE MASTER FEE; the contract's LIVE-READ must adapt
  // (same as pepe; here the inscribe still routes through the core).
  // ======================================================================
  const jimSize = inscribeArgs(T_JIM).regArgs[3]; // uintCV(total-size) for #T_JIM
  const sizeStr = cvToString(jimSize).replace(/^u/, "");
  const quoteFee = (n) => `(get total-fee (unwrap-panic (contract-call? '${MASTER} quote-single-tx-fee u${sizeStr} u${n})))`;

  section("Point B.1: baseline master quote == 102000 (single-tx-fee-unit u100000)");
  evalc("quote-single-tx-fee total-fee == u102000 (1 chunk, BEFORE Jim)", quoteFee(1), `u${MASTER_FEE_1CHUNK}`, { cover: "jim:quote-before" });

  section("Point B.2: master owner set-single-tx-fee-unit 100000 -> 150000; quote now 152000");
  await callTxTo("master set-single-tx-fee-unit(u150000) by master-owner -> (ok ...)",
    MASTER_OWNER, MASTER, "set-single-tx-fee-unit", [uintCV(NEW_SINGLE_TX_FEE_UNIT)], /^\(ok/,
    { cover: "jim:set-fee-unit" });
  evalc("quote-single-tx-fee total-fee == u152000 (1 chunk, AFTER Jim)", quoteFee(1), `u${MASTER_FEE_1CHUNK_NEW}`, { cover: "jim:quote-after" });

  section(`Point B.3: inscribe #${T_JIM} via core AFTER fee change -- live-read funds+caps 152000, SUCCEEDS`);
  evalc(`payout-a BEFORE (jim #${T_JIM})`, stxBal(DEPLOYER), undefined, { capture: "jA_before" });
  evalc(`payout-b BEFORE (jim #${T_JIM})`, stxBal(PAYOUT_B), undefined, { capture: "jB_before" });
  evalc(`inscriber BEFORE (jim #${T_JIM})`, stxBal(JIM_INSCRIBER), undefined, { capture: "j_before" });
  evalc(`contract BEFORE (jim #${T_JIM})`, stxBal(CID), undefined, { capture: "jk_before" });
  evalc(`master-royalty BEFORE (jim #${T_JIM})`, stxBal(MASTER_OWNER), undefined, { capture: "jroy_before" });
  await coreInscribe(`inscribe #${T_JIM} via CORE (free tier) DENY inscriber=Lte(152000) + contract=Lte(152000) -> (ok uXID)`,
    JIM_INSCRIBER, inscribeArgs(T_JIM).coreArgs, /^\(ok u\d+\)$/, {
      pcMode: PostConditionMode.Deny,
      pcs: [
        Pc.principal(JIM_INSCRIBER).willSendLte(MASTER_FEE_1CHUNK_NEW).ustx(),
        Pc.principal(CID).willSendLte(MASTER_FEE_1CHUNK_NEW).ustx(),
      ],
      cover: "jim:inscribe-newfee-ok",
    });
  evalc(`payout-a AFTER (jim #${T_JIM})`, stxBal(DEPLOYER), undefined, { capture: "jA_after" });
  evalc(`payout-b AFTER (jim #${T_JIM})`, stxBal(PAYOUT_B), undefined, { capture: "jB_after" });
  evalc(`inscriber AFTER (jim #${T_JIM})`, stxBal(JIM_INSCRIBER), undefined, { capture: "j_after" });
  evalc(`contract AFTER (jim #${T_JIM})`, stxBal(CID), undefined, { capture: "jk_after" });
  evalc(`master-royalty AFTER (jim #${T_JIM})`, stxBal(MASTER_OWNER), undefined, { capture: "jroy_after" });
  evalc(`#${T_JIM} inscribed (jim)`, `(is-inscribed u${T_JIM})`, "(ok true)", { cover: "jim:inscribed" });
  evalc("get-inscribed-count == 6", "(get-inscribed-count)", "(ok u6)", { cover: "jim:count" });
  evalc(`twin #${T_JIM} escrowed in registry`, twinOwner(T_JIM), SOME(CID), { cover: "jim:twin-escrowed" });
  evalc(`binding #${T_JIM} escrowed=true`, `(get-binding u${T_JIM})`, /xtrata-escrowed true/, { cover: "jim:binding" });
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
function txAborted(s) { return s?.Result?.Transaction?.Ok?.post_condition_aborted === true; }
const match = (g, e) => e instanceof RegExp ? e.test(g) : g === e;
const uintOf = (s) => BigInt(String(s).replace(/^u/, ""));

async function main() {
  console.log("=== leo-fakfun-xtrata stxer harness (as-contract escrow mint; INSCRIBE through fakfun-xtrata-core, swaps DIRECT) ===\n");
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
  const probe = {};
  const coverage = [];
  const corePrints = { "swap-nft-for-xtrata": 0, "swap-xtrata-for-nft": 0 };
  res.steps.forEach((s, i) => {
    if (sections[i]) console.log(`\n-- ${sections[i]} --`);
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label} -> ${decTx(s)}`); ok ? pass++ : fail++;
      if (p.cover) coverage.push({ cover: p.cover, ok });
    } else if (p.kind === "tx") {
      const g = decTx(s);
      const aborted = txAborted(s);
      if (p.probe) { probe[p.probe] = g; console.log(`PROBE[${p.probe}] [${i}] ${p.label}  got ${g}${aborted ? " [PC-ABORTED]" : ""}`); if (p.cover) coverage.push({ cover: p.cover, ok: true }); return; }
      const ok = match(g, p.expect) && !aborted;
      // A through-core swap is (begin (try! (contract-call? registry swap-*)) (print {event,registry,...}) (ok true)).
      // The wrapper can ONLY reach (ok true) by executing the unconditional (print ...) after the
      // forwarded call succeeds -- so a coreEvent step that returns (ok true) DEFINITIONALLY emitted
      // the unified, registry-tagged print. stxer's getSimulationResult omits contract-event payloads
      // from the API result (Ok.events is always []), so we count the print via this return-path
      // determinism rather than scanning events. (The print is visible in the website trace.)
      if (p.coreEvent && ok && g === "(ok true)") corePrints[p.coreEvent] += 1;
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}  got ${g}${aborted ? " [PC-ABORTED]" : ""}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
      if (p.cover) coverage.push({ cover: p.cover, ok });
    } else if (p.kind === "eval") {
      const g = decEval(s);
      if (p.capture) { cap[p.capture] = uintOf(g); console.log(`capt [${i}] ${p.label}: ${g}`); }
      else if (p.probeRead) { console.log(`PROBE-READ[${p.probeRead}] [${i}] ${p.label}: ${g}`); }
      else if (p.expect === undefined) console.log(`info [${i}] ${p.label}: ${g}`);
      else { const ok = match(g, p.expect); console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}  got ${g}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++; if (p.cover) coverage.push({ cover: p.cover, ok }); }
    }
  });

  // ---- POINT 8 verdict ----
  console.log("\n== POINT 8 VERDICT: minimal deny-mode PC set for inscribe THROUGH THE CORE ==");
  console.log(`  [8.1] inscriber-STX-cap ONLY (no contract PC): ${probe["8.1"]}`);
  console.log(`  [8.2] inscriber-cap + LEO-contract-cap (no core PC): ${probe["8.2"]}`);

  function d(label, before, after, expected, push = true) {
    if (before === undefined || after === undefined) { console.log(`FAIL ${label}: missing capture`); fail++; return; }
    const delta = after - before; const ok = delta === expected;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: delta=${delta} (expected ${expected})`);
    if (push) (ok ? pass++ : fail++);
  }

  console.log("\n== FREE-tier (free-threshold 87) master-fee funding deltas (#10, O3, via core) ==");
  d("payout-a unchanged (free tier: registry fee 0)", cap.pA_before, cap.pA_after, 0n);
  d("payout-b unchanged (free tier: registry fee 0)", cap.pB_before, cap.pB_after, 0n);
  d("master-royalty += masterFee (102000)", cap.roy_before, cap.roy_after, BigInt(MASTER_FEE_1CHUNK));
  d("contract net == 0 (no dust retained)", cap.k_before, cap.k_after, 0n);
  if (cap.o3_before !== undefined && cap.o3_after !== undefined) {
    const out = cap.o3_before - cap.o3_after;
    console.log(`info O3 total out=${out} (masterFee=${MASTER_FEE_1CHUNK} + gas; NO registry fee in free tier)`);
    const ok = out >= BigInt(MASTER_FEE_1CHUNK) && out < BigInt(MASTER_FEE_1CHUNK) + 1000000n;
    console.log(`${ok ? "PASS" : "FAIL"} O3 out is ~masterFee+gas (no registry fee)`); ok ? pass++ : fail++;
  }

  console.log("\n== FREE-tier: holder pays NO registry fee, still pays master fee (#100, B, via core) ==");
  d("payout-a unchanged (free tier)", cap.fpA_before, cap.fpA_after, 0n);
  d("payout-b unchanged (free tier)", cap.fpB_before, cap.fpB_after, 0n);
  if (cap.b_before !== undefined && cap.b_after !== undefined) {
    const out = cap.b_before - cap.b_after;
    console.log(`info B total out=${out} (expect masterFee 102000 + gas; NO registry fee)`);
    const ok = out >= BigInt(MASTER_FEE_1CHUNK) && out < BigInt(MASTER_FEE_1CHUNK) + 1000000n;
    console.log(`${ok ? "PASS" : "FAIL"} B out is ~masterFee+gas (no registry fee)`); ok ? pass++ : fail++;
  }

  // ---- PAID-tier 4 STX split verdict ----
  console.log("\n== PAID-tier 4 STX registry fee split (free-threshold 0, #500, via core) ==");
  d("payout-a += 2 STX (half of 4 STX)", cap.ppA_before, cap.ppA_after, 2000000n);
  d("payout-b += 2 STX (4 STX - half)", cap.ppB_before, cap.ppB_after, 2000000n);
  d("master-royalty += masterFee (102000)", cap.proy_before, cap.proy_after, BigInt(MASTER_FEE_1CHUNK));
  d("contract net == 0 (no dust; registry fee passes through, master fee funded exactly)", cap.pk_before, cap.pk_after, 0n);
  if (cap.pin_before !== undefined && cap.pin_after !== undefined) {
    const out = cap.pin_before - cap.pin_after;
    const expectMin = BigInt(FEE_STD) + BigInt(MASTER_FEE_1CHUNK);
    console.log(`info paid inscriber total out=${out} (expect 4 STX registry + masterFee ${MASTER_FEE_1CHUNK} + gas = >= ${expectMin})`);
    const ok = out >= expectMin && out < expectMin + 1000000n;
    console.log(`${ok ? "PASS" : "FAIL"} paid inscriber out is ~4 STX + masterFee + gas`); ok ? pass++ : fail++;
  }

  // ---- POINT B verdict ----
  console.log("\n== POINT B VERDICT: Jim raises master fee; contract LIVE-READ funds+caps+succeeds (via core) ==");
  console.log(`  baseline masterFee=${MASTER_FEE_1CHUNK} -> NEW masterFee=${MASTER_FEE_1CHUNK_NEW} (unit u${NEW_SINGLE_TX_FEE_UNIT})`);
  d(`master-royalty += NEW masterFee (${MASTER_FEE_1CHUNK_NEW})`, cap.jroy_before, cap.jroy_after, BigInt(MASTER_FEE_1CHUNK_NEW));
  d("contract net == 0 (no dust; live-read funded exactly)", cap.jk_before, cap.jk_after, 0n);
  d("payout-a unchanged (free tier: 0 registry fee)", cap.jA_before, cap.jA_after, 0n);
  d("payout-b unchanged (free tier: 0 registry fee)", cap.jB_before, cap.jB_after, 0n);
  if (cap.j_before !== undefined && cap.j_after !== undefined) {
    const out = cap.j_before - cap.j_after;
    console.log(`info inscriber total out=${out} (expect NEW masterFee ${MASTER_FEE_1CHUNK_NEW} + gas)`);
    const okNew = out >= BigInt(MASTER_FEE_1CHUNK_NEW) && out < BigInt(MASTER_FEE_1CHUNK_NEW) + 1000000n;
    console.log(`${okNew ? "PASS" : "FAIL"} inscriber out is ~NEW masterFee(${MASTER_FEE_1CHUNK_NEW})+gas (scaled with Jim's bump)`); okNew ? pass++ : fail++;
    const okScaled = out > BigInt(MASTER_FEE_1CHUNK);
    console.log(`${okScaled ? "PASS" : "FAIL"} inscriber paid > OLD fee ${MASTER_FEE_1CHUNK} (live-read scaled up; a stale 102000 PC would be VIOLATED -> mainnet abort)`); okScaled ? pass++ : fail++;
  }

  // ---- unified swap prints on the CORE (single chainhook indexes every registry) ----
  // Each through-core swap returns (ok true) ONLY by executing the wrapper's unconditional
  // (print {event, registry:(contract-of registry), token-id, holder}) -- so these counts are
  // the number of unified, registry-tagged swap prints the core emitted (one chainhook on the
  // core would index all of them, for every registry, with no per-registry watcher).
  console.log("\n== UNIFIED CORE SWAP PRINTS (registry-tagged; one chainhook on the core indexes all) ==");
  console.log("  (stxer's result API omits contract-event payloads; counted via the wrapper's");
  console.log("   return-path determinism -- (ok true) is reachable only after the print fires.)");
  for (const ev of ["swap-nft-for-xtrata", "swap-xtrata-for-nft"]) {
    const n = corePrints[ev]; const ok = n >= 1;
    console.log(`${ok ? "PASS" : "FAIL"} core emitted >=1 unified '${ev}' print tagged (registry ${CID}): count=${n}`); ok ? pass++ : fail++;
  }

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
