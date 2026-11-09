// stxer mainnet-fork harness: bitcoin-monkeys-fakfun-xtrata (registry with bind-staged).
// Real Monkey art for #1 (87 chunks, staged) and #2/#3 (26 chunks, inscribe).
// Synthetic single-chunk art for failure + fee paths.
const STACKS_API = "http://77.42.3.101/stacks-api";
const STXER_API = "https://api.stxer.xyz";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  ClarityVersion, PostConditionMode, Pc, uintCV, bufferCV, stringAsciiCV, listCV, noneCV, trueCV, falseCV,
  standardPrincipalCV, contractPrincipalCV, tupleCV, makeUnsignedContractCall, makeUnsignedContractDeploy,
  makeUnsignedSTXTokenTransfer, deserializeCV, cvToString, hexToCV, cvToHex,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import { createSimulationSession, submitSimulationSteps, getSimulationResult, setSender, bytesToHex } from "stxer";
import { installChunkedSubmit } from "/home/raphastacks/projects/jing-contracts-v3/simulations/_chunked-submit.js";

const SCRATCH = process.env.SIM_WORKDIR || new URL("./.sim-cache", import.meta.url).pathname;
fs.mkdirSync(`${SCRATCH}/sim`, { recursive: true });
const SRC = new URL("../contracts/fakfun-idea/bitcoin-monkeys-fakfun-xtrata.clar", import.meta.url).pathname;
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const PAYOUT_B = "SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7";
const KEEPER = "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7";
const STRANGER = "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE";
const MASTER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3";
const MASTER_OWNER = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X";
const SOURCE = "SP2KAF9RF86PVX3NEE27DFV1CQX0T4WGR41X3S45C.bitcoin-monkeys";
const REG = "bitcoin-monkeys-fakfun-xtrata";
const CID = `${DEPLOYER}.${REG}`;
const CORE = `${DEPLOYER}.fakfun-xtrata-core`;
const FEE_STD = 4000000n;
const CHUNK = 16384;
const LIMITS = { runtime: 5_000_000_000, read_count: 15000, read_length: 100_000_000, write_count: 15000, write_length: 15_000_000 };

const sha256 = (b) => createHash("sha256").update(b).digest();
const chunkBuf = (b) => { const o = []; for (let i = 0; i < b.length; i += CHUNK) o.push(b.subarray(i, i + CHUNK)); return o; };
const rolling = (chunks) => { let r = Buffer.alloc(32, 0); for (const c of chunks) r = sha256(Buffer.concat([r, c])); return r; };
const hx = (b) => "0x" + b.toString("hex");
const uri = (id) => `ipfs://QmXPHzFbdFuoyw7AY7BVgr9nbimyjuzyerQyD6uJaoUgdz/bitcoin_monkeys_${id}.json`;
const real = (id) => { const buf = fs.readFileSync(`${SCRATCH}/monkeys/${id}.png`); const chunks = chunkBuf(buf); return { buf, chunks, hash: rolling(chunks) }; };
const syn = (tag) => { const buf = Buffer.from(`monkey-sim-art:${tag}`, "ascii"); return { buf, chunks: [buf], hash: rolling([buf]) }; };
const pcv = (s) => s.includes(".") ? contractPrincipalCV(...s.split(".")) : standardPrincipalCV(s);

const NET = { ...STACKS_MAINNET, client: { ...STACKS_MAINNET.client, baseUrl: STACKS_API } };
let TIP = null;
const nonces = new Map();
async function nonce(s) {
  if (nonces.has(s)) { const n = nonces.get(s); nonces.set(s, n + 1); return n; }
  const a = await (await fetch(`${STACKS_API}/v2/accounts/${s}?proof=0&tip=${TIP}`)).json();
  nonces.set(s, a.nonce + 1); return a.nonce;
}
const steps = [], plan = [], sections = {};
const section = (t) => { sections[plan.length] = t; };
const push = (tx, sender, p) => { setSender(tx, sender); const bytes = tx.serializeBytes(); steps.push({ Transaction: bytesToHex(bytes) }); plan.push({ ...p, size: bytes.length }); };

async function call(label, sender, contract, fn, args, expect, o = {}) {
  const tx = await makeUnsignedContractCall({
    contractAddress: contract.split(".")[0], contractName: contract.split(".")[1], functionName: fn, functionArgs: args,
    nonce: await nonce(sender), network: NET, publicKey: "00".repeat(33),
    postConditionMode: o.pcMode ?? PostConditionMode.Allow, postConditions: o.pcs ?? [], fee: o.fee ?? 3000,
  });
  push(tx, sender, { kind: "tx", label, expect, ...o });
}
const reg = (l, s, f, a, e, o) => call(l, s, CID, f, a, e, o);
async function fund(to, amt) {
  const tx = await makeUnsignedSTXTokenTransfer({ recipient: to, amount: BigInt(amt), nonce: await nonce(DEPLOYER), network: NET, publicKey: "00".repeat(33), fee: 3000 });
  push(tx, DEPLOYER, { kind: "tx", label: `fund ${to.slice(0, 8)} ${amt}`, expect: "(ok true)" });
}
function ev(label, code, expect, o = {}) { steps.push({ Eval: [DEPLOYER, "", CID, code] }); plan.push({ kind: "eval", label, expect, ...o }); }
const bal = (p, cap) => ev(`bal ${cap}`, `(stx-get-balance '${p})`, /^u\d+$/, { cap });
const bind = (l, s, tok, x, e, o = {}) => reg(l, s, "bind-staged", [uintCV(tok), uintCV(x)], e, o);
const inscArgs = (tok, art, u) => [uintCV(tok), bufferCV(art.hash), stringAsciiCV("image/png"), uintCV(art.buf.length), listCV(art.chunks.map((c) => bufferCV(c))), stringAsciiCV(u)];
const insc = (l, s, tok, art, e, o = {}) => reg(l, s, "inscribe", inscArgs(tok, art, uri(tok)), e, o);
const inscCore = (l, s, tok, art, e, o = {}) => call(l, s, CORE, "inscribe", [pcv(CID), ...inscArgs(tok, art, uri(tok))], e, o);
const masterMintArgs = (art, u) => [bufferCV(art.hash), stringAsciiCV("image/png"), uintCV(art.buf.length), listCV(art.chunks.map((c) => bufferCV(c))), stringAsciiCV(u)];
let nextTwin = 0;
const expectMint = (id) => new RegExp(`^\\(ok \\(tuple \\(existed false\\) \\(token-id u${id}\\)\\)\\)$`);
async function keeperMint(label, art) { const id = nextTwin++; await call(`mint ${label} -> twin ${id}`, KEEPER, MASTER, "mint-single-tx", masterMintArgs(art, "ipfs://sim"), expectMint(id)); return id; }
const entry = (id, art) => tupleCV({ id: uintCV(id), hash: bufferCV(art.hash) });
const seedAll = (list) => listCV(list.map(([i, a]) => entry(i, a)));
const twinOwner = (x) => `(contract-call? '${MASTER} get-owner u${x})`;
const nftOwner = (t) => `(contract-call? '${SOURCE} get-owner u${t})`;
const someP = (p) => `(ok (some ${p}))`;
const bindRe = (tok, x, esc, inscriber) => new RegExp(`^\\(some \\(tuple \\(at u\\d+\\) \\(content-hash 0x[0-9a-f]{64}\\) \\(inscriber ${inscriber}\\) \\(xtrata-escrowed ${esc}\\) \\(xtrata-id u${x}\\)\\)\\)$`);
let expectedCount = 0;

async function readOnly(contract, fn, args) {
  const [a, n] = contract.split(".");
  const r = await (await fetch(`${STACKS_API}/v2/contracts/call-read/${a}/${n}/${fn}?tip=${TIP}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sender: a, arguments: args.map(cvToHex) }) })).json();
  if (!r.okay) throw new Error(`${fn}: ${JSON.stringify(r)}`);
  return cvToString(deserializeCV(r.result));
}
const ownerOf = async (t) => { const s = await readOnly(SOURCE, "get-owner", [uintCV(t)]); const m = s.match(/\(some ([A-Z0-9.a-z-]+)\)/); return m?.[1]; };
const isStd = (p) => p && !p.includes(".");

const OWN = {};
const REPORT = {};
async function build() {
  const b1 = real(1), b2 = real(2), b3 = real(3);
  console.log(`art: #1 ${b1.buf.length}B/${b1.chunks.length}ch, #2 ${b2.buf.length}B/${b2.chunks.length}ch, #3 ${b3.buf.length}B/${b3.chunks.length}ch`);
  for (const t of [1, 2, 3, 10, 12]) { OWN[t] = await ownerOf(t); if (!isStd(OWN[t])) throw new Error(`#${t} owner not standard: ${OWN[t]}`); console.log(`owner #${t} ${OWN[t]}`); }
  for (const p of new Set([KEEPER, STRANGER, ...Object.values(OWN)])) {}
  const nextStr = await readOnly(MASTER, "get-next-token-id", []);
  nextTwin = Number(nextStr.match(/u(\d+)/)[1]);
  console.log(`master next twin id ${nextTwin}`);
  const A = (t) => syn(`t${t}`), dupA = syn("dup-a"), dupB = syn("dup-b"), wrong = syn("wrong-art"), art30 = syn("t30"), art32 = syn("t32");

  section("Setup: fund actors, deploy (exact file bytes, Clarity 5), initial state, pause/allowlist");
  await fund(KEEPER, 200_000_000); await fund(STRANGER, 5_000_000);
  for (const p of new Set(Object.values(OWN))) await fund(p, 5_000_000);
  const code = fs.readFileSync(SRC, "utf8");
  const dep = await makeUnsignedContractDeploy({ contractName: REG, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await nonce(DEPLOYER), network: NET, publicKey: "00".repeat(33), fee: 300000 });
  push(dep, DEPLOYER, { kind: "deploy", label: `deploy ${REG}`, cost: "deploy registry" });
  ev("get-owner == deployer", "(get-owner)", `(ok ${DEPLOYER})`);
  ev("free threshold 69", "(get-free-threshold)", "(ok u69)");
  ev("fee 4 STX", "(get-fee)", "(ok u4000000)");
  ev("payouts deployer + Jim", "(get-payouts)", `(ok (tuple (a ${DEPLOYER}) (b ${PAYOUT_B})))`);
  ev("not finalized", "(is-finalized)", "(ok false)");
  ev("count 0", "(get-inscribed-count)", "(ok u0)");
  ev("master unpaused", `(contract-call? '${MASTER} is-paused)`, "(ok false)");
  ev("registry NOT allowlisted", `(contract-call? '${MASTER} is-allowed-caller '${CID})`, "(ok false)");
  ev("core NOT allowlisted", `(contract-call? '${MASTER} is-allowed-caller '${CORE})`, "(ok false)");
  ev("quote 87 chunks staged", `(contract-call? '${MASTER} quote-inscription-fee u${b1.buf.length} u${b1.chunks.length} u1)`, /total-fee u\d+/, { show: true });

  section("Seed + finalize (u204 / u207)");
  const seed = [[1, b1], [2, b2], [3, b3], [9999, A(9999)], [10, dupA], [11, dupA], [12, dupB], [13, dupB], [20, A(20)], [21, A(21)], [22, A(22)], [23, A(23)], [24, A(24)], [25, A(25)], [26, A(26)], [27, A(27)], [28, A(28)], [30, art30], [32, art32]];
  await reg("seed by stranger -> u204", STRANGER, "seed-canonical", [seedAll(seed.slice(0, 1))], "(err u204)");
  await reg(`seed ${seed.length} -> ok`, DEPLOYER, "seed-canonical", [seedAll(seed)], "(ok true)");
  ev("canonical #1 == rolling hash of real art", "(get-canonical-hash u1)", `(some ${hx(b1.hash)})`);
  ev("#7 unseeded", "(get-canonical-hash u7)", "none");
  await reg("finalize by stranger -> u204", STRANGER, "finalize-canonical", [], "(err u204)");
  await reg("finalize by owner -> ok", DEPLOYER, "finalize-canonical", [], "(ok true)");
  ev("finalized", "(is-finalized)", "(ok true)");
  await reg("seed after finalize -> u207", DEPLOYER, "seed-canonical", [seedAll(seed.slice(0, 1))], "(err u207)");
  await reg("seed after finalize by stranger -> u204", STRANGER, "seed-canonical", [seedAll(seed.slice(0, 1))], "(err u204)");

  section("Staged upload of real Monkey #1 (87 chunks) by keeper, directly on master");
  await call("begin-or-get #1", KEEPER, MASTER, "begin-or-get", [bufferCV(b1.hash), stringAsciiCV("image/png"), uintCV(b1.buf.length), uintCV(b1.chunks.length)], "(ok none)", { cost: "staged begin (87ch)", staged: 1 });
  for (let i = 0, n = 1; i < b1.chunks.length; i += 32, n++) {
    const part = b1.chunks.slice(i, i + 32);
    await call(`add-chunk-batch ${n} (${part.length} chunks)`, KEEPER, MASTER, "add-chunk-batch", [bufferCV(b1.hash), listCV(part.map((c) => bufferCV(c)))], "(ok true)", { cost: `staged add-chunk-batch ${n} (${part.length}ch)`, staged: 1, fee: 700000 });
  }
  const X1 = nextTwin++;
  await call(`seal #1 -> twin ${X1}`, KEEPER, MASTER, "seal-inscription", [bufferCV(b1.hash), stringAsciiCV(uri(1))], `(ok u${X1})`, { cost: "staged seal (87ch)", staged: 1 });
  ev("twin owned by keeper", twinOwner(X1), someP(KEEPER));
  ev("twin hash == canonical", `(contract-call? '${MASTER} get-inscription-hash u${X1})`, `(some ${hx(b1.hash)})`);

  section("bind-staged failures (none may change state)");
  const W = await keeperMint("wrong art", wrong);
  await bind("unseeded #7 -> u206", KEEPER, 7, X1, "(err u206)");
  await bind("nonexistent twin -> u206", KEEPER, 1, 999999999, "(err u206)");
  await bind("wrong-art twin -> u206", KEEPER, 1, W, "(err u206)");
  await bind("right twin for a different Monkey (#2) -> u206", KEEPER, 2, X1, "(err u206)");
  await bind("nonexistent Monkey #9999 (seeded) -> u200", KEEPER, 9999, X1, "(err u200)");
  await bind("caller not holding twin -> master u100", STRANGER, 1, X1, "(err u100)");
  ev("after failures: #1 unbound", "(get-binding u1)", "none");
  ev("after failures: count 0", "(get-inscribed-count)", "(ok u0)");
  ev("after failures: twin still keeper", twinOwner(X1), someP(KEEPER));

  section("bind-staged success, free tier, deny-mode post-condition on twin");
  bal(DEPLOYER, "free-bind-a0"); bal(PAYOUT_B, "free-bind-b0");
  await bind("bind #1 (87-chunk real art) -> ok", KEEPER, 1, X1, `(ok u${X1})`, {
    cost: "bind-staged", staged: 1, pcMode: PostConditionMode.Deny,
    pcs: [Pc.principal(KEEPER).willSendAsset().nft(`${MASTER}::xtrata-inscription`, uintCV(X1))], wantPrint: { token: 1, x: X1 },
  });
  expectedCount++;
  bal(DEPLOYER, "free-bind-a1"); bal(PAYOUT_B, "free-bind-b1");
  ev("binding recorded, escrowed", "(get-binding u1)", bindRe(1, X1, true, KEEPER));
  ev("binding content-hash == canonical", "(get (content-hash) (unwrap-panic (get-binding u1)))".replace("(get (content-hash)", "(get content-hash"), hx(b1.hash));
  ev("count 1", "(get-inscribed-count)", `(ok u${expectedCount})`);
  ev("twin in registry escrow", twinOwner(X1), someP(CID));
  ev("Monkey #1 owner unchanged", nftOwner(1), someP(OWN[1]));
  await bind("bind #1 again -> u201", KEEPER, 1, X1, "(err u201)");

  section("u201 with a second matching twin; bind then swaps on #1");
  const A30 = await keeperMint("t30", art30);
  await bind("bind #30 -> ok", KEEPER, 30, A30, `(ok u${A30})`); expectedCount++;
  const A302 = await keeperMint("t30 again", art30);
  await bind("bind #30 again with fresh matching twin -> u201", KEEPER, 30, A302, "(err u201)");

  section("Swaps on staged-bound #1 (real owner), via core and direct");
  await call("swap-nft-for-xtrata #1 via core -> ok", OWN[1], CORE, "swap-nft-for-xtrata", [pcv(CID), uintCV(1)], "(ok true)", { cost: "swap-nft-for-xtrata via core" });
  ev("Monkey in escrow", nftOwner(1), someP(CID)); ev("twin to owner", twinOwner(X1), someP(OWN[1]));
  ev("escrowed false", "(get-binding u1)", bindRe(1, X1, false, KEEPER));
  await reg("swap-nft again -> u203", OWN[1], "swap-nft-for-xtrata", [uintCV(1)], "(err u203)");
  await call("swap-xtrata-for-nft #1 via core -> ok", OWN[1], CORE, "swap-xtrata-for-nft", [pcv(CID), uintCV(1)], "(ok true)", { cost: "swap-xtrata-for-nft via core" });
  ev("Monkey back", nftOwner(1), someP(OWN[1])); ev("twin in escrow", twinOwner(X1), someP(CID));
  await reg("swap-xtrata while escrowed -> u203", OWN[1], "swap-xtrata-for-nft", [uintCV(1)], "(err u203)");
  await reg("swap-nft #1 direct -> ok", OWN[1], "swap-nft-for-xtrata", [uintCV(1)], "(ok true)");
  await reg("swap-xtrata #1 direct -> ok", OWN[1], "swap-xtrata-for-nft", [uintCV(1)], "(ok true)");
  ev("final: Monkey with owner", nftOwner(1), someP(OWN[1])); ev("final: twin escrow", twinOwner(X1), someP(CID));
  await reg("swap-nft unbound #7 -> u202", OWN[1], "swap-nft-for-xtrata", [uintCV(7)], "(err u202)");

  section("Inscribe regression: real 26-chunk art, direct + through core, free tier");
  bal(DEPLOYER, "free-ins-a0"); bal(PAYOUT_B, "free-ins-b0");
  const X2 = nextTwin++;
  await insc("inscribe #2 direct -> ok", KEEPER, 2, b2, `(ok u${X2})`, { cost: "inscribe direct (26ch)", fee: 700000 }); expectedCount++;
  bal(DEPLOYER, "free-ins-a1"); bal(PAYOUT_B, "free-ins-b1");
  ev("#2 escrowed", "(get-binding u2)", bindRe(2, X2, true, KEEPER)); ev("#2 twin in escrow", twinOwner(X2), someP(CID));
  const X3 = nextTwin++;
  await inscCore("inscribe #3 via core -> ok", KEEPER, 3, b3, `(ok u${X3})`, { cost: "inscribe via core (26ch)", fee: 700000 }); expectedCount++;
  ev("#3 escrowed", "(get-binding u3)", bindRe(3, X3, true, KEEPER)); ev("#3 twin in escrow", twinOwner(X3), someP(CID));
  await call("#3 swap via core -> ok", OWN[3], CORE, "swap-nft-for-xtrata", [pcv(CID), uintCV(3)], "(ok true)");
  await call("#3 swap back via core -> ok", OWN[3], CORE, "swap-xtrata-for-nft", [pcv(CID), uintCV(3)], "(ok true)");
  await insc("inscribe #2 again -> u201", KEEPER, 2, b2, "(err u201)", { fee: 700000 });
  await insc("inscribe unseeded #7 -> u206", KEEPER, 7, A(7), "(err u206)");
  await insc("inscribe nonexistent #9999 -> u200", KEEPER, 9999, A(9999), "(err u200)");
  await insc("inscribe right hash, wrong bytes -> master err", KEEPER, 32, { ...art32, buf: Buffer.from(art32.buf).fill(65), chunks: [Buffer.from(art32.buf).fill(65)] }, /^\(err u10[23]\)$/);

  section("u208 twin reuse: inscribe -> swap out -> bind same twin to identical-art token");
  const D1 = nextTwin++;
  await insc("inscribe #10 dup art -> ok", KEEPER, 10, dupA, `(ok u${D1})`); expectedCount++;
  await reg("#10 swap-nft -> ok", OWN[10], "swap-nft-for-xtrata", [uintCV(10)], "(ok true)");
  ev("#10 twin with holder", twinOwner(D1), someP(OWN[10]));
  await bind("bind #11 (same hash) with #10's twin -> u208", OWN[10], 11, D1, "(err u208)");
  ev("#11 still unbound", "(get-binding u11)", "none");
  ev("#10's twin still with holder", twinOwner(D1), someP(OWN[10]));
  await reg("#10 swap back still works -> ok", OWN[10], "swap-xtrata-for-nft", [uintCV(10)], "(ok true)");
  ev("#10 Monkey returned", nftOwner(10), someP(OWN[10]));

  section("u208 twin reuse: bind -> swap out -> bind same twin to identical-art token");
  const D2 = await keeperMint("dup-b", dupB);
  await bind("bind #12 -> ok", KEEPER, 12, D2, `(ok u${D2})`); expectedCount++;
  await reg("#12 swap-nft -> ok", OWN[12], "swap-nft-for-xtrata", [uintCV(12)], "(ok true)");
  await bind("bind #13 (same hash) with #12's twin -> u208", OWN[12], 13, D2, "(err u208)");
  ev("#13 still unbound", "(get-binding u13)", "none");
  await reg("#12 swap back still works -> ok", OWN[12], "swap-xtrata-for-nft", [uintCV(12)], "(ok true)");

  section("Paid tier: set-free-threshold 0, 4 STX split, both paths");
  await reg("set-free-threshold by stranger -> u204", STRANGER, "set-free-threshold", [uintCV(0)], "(err u204)");
  await reg("set-free-threshold 0 -> ok", DEPLOYER, "set-free-threshold", [uintCV(0)], "(ok true)");
  ev("fee-for keeper 4 STX", `(fee-for '${KEEPER})`, "u4000000");
  const P20 = await keeperMint("t20", A(20));
  const cap = (n) => { bal(DEPLOYER, `${n}-a`); bal(PAYOUT_B, `${n}-b`); bal(KEEPER, `${n}-k`); bal(CID, `${n}-r`); bal(MASTER_OWNER, `${n}-m`); };
  cap("pb0"); await bind("paid bind #20 -> ok", KEEPER, 20, P20, `(ok u${P20})`, { fee: 3000 }); expectedCount++; cap("pb1");
  const P21 = nextTwin++;
  cap("pi0"); await insc("paid inscribe #21 -> ok", KEEPER, 21, A(21), `(ok u${P21})`, { fee: 3000 }); expectedCount++; cap("pi1");

  section("0 discount: set-discount charges nothing on either path");
  await reg("set-discount by stranger -> u204", STRANGER, "set-discount", [pcv(KEEPER), uintCV(0)], "(err u204)");
  await reg("set-discount == fee -> u205", DEPLOYER, "set-discount", [pcv(KEEPER), uintCV(4000000)], "(err u205)");
  await reg("set-discount keeper 0 -> ok", DEPLOYER, "set-discount", [pcv(KEEPER), uintCV(0)], "(ok true)");
  ev("fee-for keeper 0", `(fee-for '${KEEPER})`, "u0");
  ev("fee-for stranger still 4 STX", `(fee-for '${STRANGER})`, "u4000000");
  const P22 = await keeperMint("t22", A(22));
  cap("db0"); await bind("0-discount bind #22 -> ok", KEEPER, 22, P22, `(ok u${P22})`, { fee: 3000 }); expectedCount++; cap("db1");
  const P23 = nextTwin++;
  cap("di0"); await insc("0-discount inscribe #23 -> ok", KEEPER, 23, A(23), `(ok u${P23})`, { fee: 3000 }); expectedCount++; cap("di1");
  const P24 = nextTwin++;
  cap("dc0"); await inscCore("0-discount inscribe #24 via core -> ok", KEEPER, 24, A(24), `(ok u${P24})`, { fee: 3000 }); expectedCount++; cap("dc1");

  section("Owner pays 0 at the paid tier, both paths");
  ev("fee-for owner still reads 4 STX", `(fee-for '${DEPLOYER})`, "u4000000");
  const O27 = nextTwin++;
  cap("oi0"); await insc("owner inscribe #27 -> ok", DEPLOYER, 27, A(27), `(ok u${O27})`, { fee: 3000 }); expectedCount++; cap("oi1");
  const O28 = nextTwin++;
  await call(`owner mint t28 -> twin ${O28}`, DEPLOYER, MASTER, "mint-single-tx", masterMintArgs(A(28), "ipfs://sim"), expectMint(O28));
  cap("ob0"); await bind("owner bind #28 -> ok", DEPLOYER, 28, O28, `(ok u${O28})`, { fee: 3000 }); expectedCount++; cap("ob1");

  section("Lump sum: one payment, price set by owner");
  ev("lump initial", "(get-lump-sum)", "(ok (tuple (payer none) (price u0)))");
  await reg("pay before price -> u209", STRANGER, "pay-lump-sum", [], "(err u209)");
  await reg("set price by stranger -> u204", STRANGER, "set-lump-price", [uintCV(3000000), uintCV(0)], "(err u204)");
  await reg("set price above stranger balance -> ok", DEPLOYER, "set-lump-price", [uintCV(1000000000), uintCV(0)], "(ok true)");
  await reg("pay without funds -> u1", STRANGER, "pay-lump-sum", [], "(err u1)");
  ev("still unpaid after failed pay", "(get-lump-sum)", "(ok (tuple (payer none) (price u1000000000)))");
  await reg("set price 3 STX -> ok", DEPLOYER, "set-lump-price", [uintCV(3000000), uintCV(0)], "(ok true)");
  cap("lp0"); bal(STRANGER, "lp0-s");
  await reg("pay lump sum -> ok", STRANGER, "pay-lump-sum", [], "(ok true)", { fee: 3000, wantEvent: new RegExp(`^\\(tuple \\(event "lump-sum-paid"\\) \\(payer ${STRANGER}\\) \\(price u3000000\\)\\)$`) });
  cap("lp1"); bal(STRANGER, "lp1-s");
  ev("lump records payer", "(get-lump-sum)", `(ok (tuple (payer (some ${STRANGER})) (price u3000000)))`);
  await reg("second pay -> u210", KEEPER, "pay-lump-sum", [], "(err u210)");
  await reg("reprice after paid -> u210", DEPLOYER, "set-lump-price", [uintCV(1), uintCV(0)], "(err u210)");
  await reg("reprice after paid by stranger -> u204", STRANGER, "set-lump-price", [uintCV(1), uintCV(0)], "(err u204)");

  section("Jim's half: accept terms and claim; early sweep blocked");
  const TERMS = code.match(/define-constant TERMS "([^"]*)"/)[1];
  ev("get-terms", "(get-terms)", `"${TERMS}"`);
  ev("pot holds half", "(get-lump-pot)", /^\(ok \(tuple \(accepted false\) \(pot u1500000\) \(sweep-at u\d+\)\)\)$/);
  await fund(PAYOUT_B, 1_000_000);
  await reg("accept by stranger -> u204", STRANGER, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(err u204)");
  await reg("accept by owner -> u204", DEPLOYER, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(err u204)");
  await reg("Jim wrong terms -> u211", PAYOUT_B, "accept-terms-and-claim", [stringAsciiCV("I agree to nothing")], "(err u211)");
  await reg("sweep by stranger -> u204", STRANGER, "sweep-lump", [], "(err u204)");
  await reg("sweep before 90 days -> u213", DEPLOYER, "sweep-lump", [], "(err u213)");
  bal(PAYOUT_B, "jc0-b"); bal(CID, "jc0-r");
  await reg("Jim accepts and claims -> ok", PAYOUT_B, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(ok u1500000)", { fee: 3000, wantEvent: new RegExp(`^\\(tuple \\(amount u1500000\\) \\(claimer ${PAYOUT_B}\\) \\(event "terms-accepted"\\)\\)$`) });
  bal(PAYOUT_B, "jc1-b"); bal(CID, "jc1-r");
  ev("accepted, pot empty", "(get-lump-pot)", /^\(ok \(tuple \(accepted true\) \(pot u0\) \(sweep-at u\d+\)\)\)$/);
  await reg("second claim -> u212", PAYOUT_B, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(err u212)");
  await reg("sweep after claim -> u212", DEPLOYER, "sweep-lump", [], "(err u212)");

  section("Sweep path, second copy: Jim never claims (odd price)");
  const REG2 = `${REG}-sw`, CID2 = `${DEPLOYER}.${REG2}`;
  const dep2 = await makeUnsignedContractDeploy({ contractName: REG2, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await nonce(DEPLOYER), network: NET, publicKey: "00".repeat(33), fee: 300000 });
  push(dep2, DEPLOYER, { kind: "deploy", label: `deploy ${REG2}` });
  await call("copy set price 2000001 -> ok", DEPLOYER, CID2, "set-lump-price", [uintCV(2000001), uintCV(0)], "(ok true)");
  bal(DEPLOYER, "ao0");
  await call("copy pay lump -> ok", KEEPER, CID2, "pay-lump-sum", [], "(ok true)");
  bal(DEPLOYER, "ao1");
  ev("copy holds floor half", `(stx-get-balance '${CID2})`, "u1000000");
  await call("copy sweep early -> u213", DEPLOYER, CID2, "sweep-lump", [], "(err u213)");
  await call("rescue with nothing extra -> u212", DEPLOYER, CID2, "rescue-stx", [], "(err u212)");
  await fund(CID2, 500000);
  await call("rescue by stranger -> u204", STRANGER, CID2, "rescue-stx", [], "(err u204)");
  bal(DEPLOYER, "rs0-a"); bal(CID2, "rs0-r");
  await call("rescue stray STX -> ok", DEPLOYER, CID2, "rescue-stx", [], "(ok u500000)", { fee: 3000 });
  bal(DEPLOYER, "rs1-a"); bal(CID2, "rs1-r");
  ev("rescue leaves the pot", `(stx-get-balance '${CID2})`, "u1000000");
  await call("second rescue -> u212", DEPLOYER, CID2, "rescue-stx", [], "(err u212)");

  section("Third copy: payout-b claims after 90 days with no sweep");
  const REG3 = `${REG}-lc`, CID3 = `${DEPLOYER}.${REG3}`;
  const dep3 = await makeUnsignedContractDeploy({ contractName: REG3, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await nonce(DEPLOYER), network: NET, publicKey: "00".repeat(33), fee: 300000 });
  push(dep3, DEPLOYER, { kind: "deploy", label: `deploy ${REG3}` });
  await call("late copy set price -> ok", DEPLOYER, CID3, "set-lump-price", [uintCV(2000000), uintCV(0)], "(ok true)");
  await call("late copy pay -> ok", KEEPER, CID3, "pay-lump-sum", [], "(ok true)");

  section("Fourth copy: claim follows set-payouts");
  const REG4 = `${REG}-pb`, CID4 = `${DEPLOYER}.${REG4}`;
  const dep4 = await makeUnsignedContractDeploy({ contractName: REG4, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await nonce(DEPLOYER), network: NET, publicKey: "00".repeat(33), fee: 300000 });
  push(dep4, DEPLOYER, { kind: "deploy", label: `deploy ${REG4}` });
  await call("pb copy set price -> ok", DEPLOYER, CID4, "set-lump-price", [uintCV(2000000), uintCV(0)], "(ok true)");
  await call("pb copy pay -> ok", KEEPER, CID4, "pay-lump-sum", [], "(ok true)");
  await call("pb copy set-payouts new b -> ok", DEPLOYER, CID4, "set-payouts", [pcv(DEPLOYER), pcv(STRANGER)], "(ok true)");
  await call("pb copy old payout-b -> u204", PAYOUT_B, CID4, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(err u204)");
  bal(STRANGER, "nb0-s"); bal(CID4, "nb0-r");
  await call("pb copy new payout-b claims -> ok", STRANGER, CID4, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(ok u1000000)", { fee: 3000 });
  bal(STRANGER, "nb1-s"); bal(CID4, "nb1-r");

  section("Lump splits: hold is half of price minus cost");
  const copy = async (sfx) => {
    const name = `${REG}-${sfx}`;
    const dep = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await nonce(DEPLOYER), network: NET, publicKey: "00".repeat(33), fee: 300000 });
    push(dep, DEPLOYER, { kind: "deploy", label: `deploy ${name}` });
    return `${DEPLOYER}.${name}`;
  };
  const splitCaps = (n, cid) => { bal(DEPLOYER, `${n}-a`); bal(KEEPER, `${n}-k`); bal(cid, `${n}-r`); };
  const S1 = await copy("h1");
  ev("cost defaults to 0", `(contract-call? '${S1} get-lump-cost)`, "(ok u0)");
  ev("hold defaults to 0", `(contract-call? '${S1} get-lump-hold)`, "(ok u0)");
  await call("zero price -> u214", DEPLOYER, S1, "set-lump-price", [uintCV(0), uintCV(0)], "(err u214)");
  await call("cost above price -> u214", DEPLOYER, S1, "set-lump-price", [uintCV(100), uintCV(101)], "(err u214)");
  await call("cost above price by stranger -> u204", STRANGER, S1, "set-lump-price", [uintCV(100), uintCV(101)], "(err u204)");
  await call("Monkeys-like price -> ok", DEPLOYER, S1, "set-lump-price", [uintCV(22764761), uintCV(14227975)], "(ok true)");
  ev("cost stored", `(contract-call? '${S1} get-lump-cost)`, "(ok u14227975)");
  ev("hold derived", `(contract-call? '${S1} get-lump-hold)`, "(ok u4268393)");
  ev("price stored", `(contract-call? '${S1} get-lump-sum)`, "(ok (tuple (payer none) (price u22764761)))");
  splitCaps("s10", S1);
  await call("Monkeys-like pay -> ok", KEEPER, S1, "pay-lump-sum", [], "(ok true)", { fee: 3000 });
  splitCaps("s11", S1);
  ev("pot is the hold", `(contract-call? '${S1} get-lump-pot)`, /^\(ok \(tuple \(accepted false\) \(pot u4268393\) \(sweep-at u\d+\)\)\)$/);
  await call("repricing a paid split -> u210", DEPLOYER, S1, "set-lump-price", [uintCV(1), uintCV(1)], "(err u210)");
  await call("payout-b claims the hold -> ok", PAYOUT_B, S1, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(ok u4268393)");
  ev("split contract is empty", `(stx-get-balance '${S1})`, "u0");
  const S2 = await copy("h0");
  await call("zero margin set -> ok", DEPLOYER, S2, "set-lump-price", [uintCV(1000000), uintCV(1000000)], "(ok true)");
  ev("zero margin hold", `(contract-call? '${S2} get-lump-hold)`, "(ok u0)");
  splitCaps("s20", S2);
  await call("zero margin pay -> ok", KEEPER, S2, "pay-lump-sum", [], "(ok true)", { fee: 3000 });
  splitCaps("s21", S2);
  ev("zero margin pot", `(contract-call? '${S2} get-lump-pot)`, /^\(ok \(tuple \(accepted false\) \(pot u0\) \(sweep-at u\d+\)\)\)$/);
  await call("zero margin claim -> u212", PAYOUT_B, S2, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(err u212)");
  await call("zero margin sweep -> u212", DEPLOYER, S2, "sweep-lump", [], "(err u212)");
  const S3 = await copy("hc");
  await call("zero cost set -> ok", DEPLOYER, S3, "set-lump-price", [uintCV(1000001), uintCV(0)], "(ok true)");
  ev("zero cost hold is half", `(contract-call? '${S3} get-lump-hold)`, "(ok u500000)");
  splitCaps("s30", S3);
  await call("zero cost pay -> ok", KEEPER, S3, "pay-lump-sum", [], "(ok true)", { fee: 3000 });
  splitCaps("s31", S3);
  await call("zero cost claim -> ok", PAYOUT_B, S3, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(ok u500000)");
  ev("zero cost contract is empty", `(stx-get-balance '${S3})`, "u0");
  const S4 = await copy("ho");
  await call("odd difference set -> ok", DEPLOYER, S4, "set-lump-price", [uintCV(3000001), uintCV(1000000)], "(ok true)");
  ev("odd difference hold floors", `(contract-call? '${S4} get-lump-hold)`, "(ok u1000000)");
  splitCaps("s40", S4);
  await call("odd difference pay -> ok", KEEPER, S4, "pay-lump-sum", [], "(ok true)", { fee: 3000 });
  splitCaps("s41", S4);
  await call("odd difference claim -> ok", PAYOUT_B, S4, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(ok u1000000)");
  ev("odd difference contract is empty", `(stx-get-balance '${S4})`, "u0");

  section("Pause probe (what a re-pause does to a live run)");
  const P26 = await keeperMint("t26", A(26));
  await call("master set-paused true -> ok", MASTER_OWNER, MASTER, "set-paused", [trueCV()], "(ok true)");
  await call("keeper begin-or-get while paused -> u109", KEEPER, MASTER, "begin-or-get", [bufferCV(A(25).hash), stringAsciiCV("image/png"), uintCV(A(25).buf.length), uintCV(1)], "(err u109)");
  await insc("inscribe #25 while paused -> u109", KEEPER, 25, A(25), "(err u109)", { fee: 3000 });
  await bind("bind #26 of already-minted twin while paused -> ok", KEEPER, 26, P26, `(ok u${P26})`, { fee: 3000 }); expectedCount++;
  await call("master set-paused false -> ok", MASTER_OWNER, MASTER, "set-paused", [falseCV()], "(ok true)");
  ev("final count", "(get-inscribed-count)", `(ok u${expectedCount})`);
  ev("registry holds no STX dust", `(stx-get-balance '${CID})`, "u0");

  section("90 Bitcoin days later: sweep the unclaimed half");
  steps.push({ AdvanceBlocks: { bitcoin_blocks: 12959, stacks_blocks_per_bitcoin: 1 } }); plan.push({ kind: "advance", label: "advance 12959 burn blocks" });
  ev("sweep-at", `(get sweep-at (unwrap-panic (contract-call? '${CID2} get-lump-pot)))`, /^u\d+$/, { cap: "sweepat" });
  ev("burn height one before", "burn-block-height", /^u\d+$/, { cap: "bh1" });
  await call("copy sweep one block early -> u213", DEPLOYER, CID2, "sweep-lump", [], "(err u213)");
  steps.push({ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1 } }); plan.push({ kind: "advance", label: "advance to exact sweep-at" });
  ev("burn height at boundary", "burn-block-height", /^u\d+$/, { cap: "bh2" });
  await call("copy sweep by stranger -> u204", STRANGER, CID2, "sweep-lump", [], "(err u204)");
  bal(DEPLOYER, "sw0-a"); bal(CID2, "sw0-r");
  await call("copy sweep exactly at sweep-at -> ok", DEPLOYER, CID2, "sweep-lump", [], "(ok u1000000)", { fee: 3000, wantEvent: new RegExp(`^\\(tuple \\(amount u1000000\\) \\(event "lump-swept"\\) \\(recipient ${DEPLOYER}\\)\\)$`) });
  bal(DEPLOYER, "sw1-a"); bal(CID2, "sw1-r");
  await call("copy Jim late claim -> u212", PAYOUT_B, CID2, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(err u212)");
  await call("copy second sweep -> u212", DEPLOYER, CID2, "sweep-lump", [], "(err u212)");
  bal(PAYOUT_B, "lc0-b"); bal(CID3, "lc0-r");
  await call("late copy payout-b claims after 90 days -> ok", PAYOUT_B, CID3, "accept-terms-and-claim", [stringAsciiCV(TERMS)], "(ok u1000000)", { fee: 3000, wantEvent: /event "terms-accepted"/ });
  bal(PAYOUT_B, "lc1-b"); bal(CID3, "lc1-r");
  await call("late copy sweep after claim -> u212", DEPLOYER, CID3, "sweep-lump", [], "(err u212)");
}

const decTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch { return `decode-fail`; } };
const decEv = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); } };
const match = (g, e) => e instanceof RegExp ? e.test(g) : g === e;

async function main() {
  const info = await (await fetch(`${STACKS_API}/v2/info`)).json();
  const height = info.stacks_tip_height;
  const bi = await (await fetch(`${STACKS_API}/extended/v1/block/by_height/${height}?unanchored=true`)).json();
  TIP = bi.index_block_hash;
  console.log(`tip ${height} ${TIP}`);
  await build();
  console.log(`plan ${plan.length} steps, ${(steps.reduce((a, s) => a + JSON.stringify(s).length, 0) / 1e6).toFixed(1)} MB`);
  installChunkedSubmit(15);
  const id = await createSimulationSession({ block_height: height, block_hash: bi.hash.replace(/^0x/, ""), skip_tracing: false }, { stxerApi: STXER_API });
  const url = `https://stxer.xyz/simulations/mainnet/${id}`;
  console.log(`session ${url}`);
  await submitSimulationSteps(id, { steps }, { stxerApi: STXER_API });
  const res = await getSimulationResult(id, { stxerApi: STXER_API });
  let pass = 0, fail = 0;
  const fails = [], caps = {}, costs = [];
  const chk = (ok, label, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra}`); if (ok) pass++; else { fail++; fails.push(label + extra); } };
  res.steps.forEach((s, i) => {
    if (sections[i]) console.log(`\n-- ${sections[i]} --`);
    const p = plan[i]; if (!p) return;
    if (p.kind === "eval") {
      const g = decEv(s); if (p.cap) caps[p.cap] = BigInt(g.replace(/^u/, ""));
      chk(match(g, p.expect), `[${i}] ${p.label}`, ` got ${g.slice(0, 180)}${p.show ? "" : ""}${match(g, p.expect) ? "" : ` EXPECTED ${p.expect}`}`);
      return;
    }
    if (p.kind === "advance") { chk(!!s?.Result?.AdvanceBlocks?.Ok, `[${i}] ${p.label}`, s?.Result?.AdvanceBlocks?.Ok ? "" : ` ${JSON.stringify(s?.Result).slice(0, 200)}`); return; }
    const ok = s?.Result?.Transaction?.Ok;
    const aborted = ok?.post_condition_aborted, vm = ok?.vm_error;
    if (p.kind === "deploy") { chk(!!ok && !vm && !aborted, `[${i}] ${p.label}`, vm ? ` vm_error ${vm}` : (ok ? "" : ` ${JSON.stringify(s?.Result).slice(0, 300)}`)); }
    else { const g = decTx(s); chk(match(g, p.expect) && !aborted && !vm, `[${i}] ${p.label}`, ` got ${g.slice(0, 160)}${aborted ? " [PC-ABORTED]" : ""}${vm ? ` VM ${vm.slice(0, 300)}` : ""}${match(g, p.expect) ? "" : ` EXPECTED ${p.expect}`}`); }
    if (p.cost && ok) costs.push({ name: p.cost, size: p.size, ...ok.execution_cost, staged: !!p.staged });
    if (p.wantEvent && ok) {
      const evs = (ok.events || []).map((e) => { try { return JSON.parse(e); } catch { return e; } });
      const txt = [];
      for (const e of evs) { const raw = e?.contract_event?.raw_value ?? e?.contract_log?.value?.hex ?? e?.contract_log?.value; if (typeof raw === "string") { try { txt.push(cvToString(hexToCV(raw))); } catch {} } }
      const found = txt.some((t) => p.wantEvent.test(t));
      chk(found, `[${i}] print ${p.wantEvent}`, found ? ` ${txt.find((t) => p.wantEvent.test(t))}` : ` events: ${JSON.stringify(evs).slice(0, 400)}`);
    }
    if (p.wantPrint && ok) {
      const evs = (ok.events || []).map((e) => { try { return JSON.parse(e); } catch { return e; } });
      const dumps = JSON.stringify(evs);
      fs.writeFileSync(`${SCRATCH}/sim/bind-events.json`, JSON.stringify(evs, null, 1).slice(0, 20000));
      console.log(`info bind events: ${evs.length}`);
      if (evs.length) {
        const prints = evs.filter((e) => /print/.test(JSON.stringify(e?.contract_event?.topic ?? e?.type ?? "")) || e?.contract_event);
        let found = false;
        for (const e of prints) { const raw = e?.contract_event?.raw_value ?? e?.contract_log?.value?.hex ?? e?.contract_log?.value; if (typeof raw === "string") { try { const t = cvToString(hexToCV(raw)); if (/event "inscribed"/.test(t) && t.includes(`token-id u${p.wantPrint.token}`) && t.includes(`xtrata-id u${p.wantPrint.x}`)) { found = true; console.log(`info print: ${t}`); } } catch {} } }
        chk(found, `[${i}] bind-staged emitted "inscribed" print with token + twin id`, found ? "" : ` events: ${dumps.slice(0, 400)}`);
      } else { console.log("info: stxer returned no events for this tx; print asserted only by reaching (ok ...) after the unconditional print"); }
    }
  });
  const d = (l, a, b, want) => { const got = caps[b] - caps[a]; chk(got === want, `delta ${l}`, ` got ${got} want ${want}`); };
  console.log("\n-- Fee assertions --");
  d("free bind payout-a", "free-bind-a0", "free-bind-a1", 0n); d("free bind payout-b", "free-bind-b0", "free-bind-b1", 0n);
  d("free inscribe payout-a", "free-ins-a0", "free-ins-a1", 0n); d("free inscribe payout-b", "free-ins-b0", "free-ins-b1", 0n);
  const G = 3000n, MF = 11000n;
  const trio = (n, lab, a, b, k, r, m) => { d(`${lab} payout-a`, `${n}0-a`, `${n}1-a`, a); d(`${lab} payout-b`, `${n}0-b`, `${n}1-b`, b); d(`${lab} keeper`, `${n}0-k`, `${n}1-k`, k); d(`${lab} registry net`, `${n}0-r`, `${n}1-r`, r); d(`${lab} master royalty`, `${n}0-m`, `${n}1-m`, m); };
  trio("pb", "paid bind", 2000000n, 2000000n, -(FEE_STD + G), 0n, 0n);
  trio("pi", "paid inscribe", 2000000n, 2000000n, -(FEE_STD + MF + G), 0n, MF);
  trio("db", "0-discount bind", 0n, 0n, -G, 0n, 0n);
  trio("di", "0-discount inscribe", 0n, 0n, -(MF + G), 0n, MF);
  trio("dc", "0-discount inscribe via core", 0n, 0n, -(MF + G), 0n, MF);
  trio("oi", "owner inscribe", -(MF + G), 0n, 0n, 0n, MF);
  trio("ob", "owner bind", -G, 0n, 0n, 0n, 0n);
  trio("lp", "lump sum half held", 1500000n, 0n, 0n, 1500000n, 0n);
  d("Jim claim payout-b", "jc0-b", "jc1-b", 1500000n - G);
  d("Jim claim registry", "jc0-r", "jc1-r", -1500000n);
  d("sweep owner", "sw0-a", "sw1-a", 1000000n - G);
  d("odd price payout-a gets extra", "ao0", "ao1", 1000001n);
  d("boundary: sweep-at minus height before", "bh1", "sweepat", 1n);
  d("boundary: height reached sweep-at", "bh2", "sweepat", 0n);
  d("late claim payout-b", "lc0-b", "lc1-b", 1000000n - G);
  d("late claim registry", "lc0-r", "lc1-r", -1000000n);
  d("new payout-b claim", "nb0-s", "nb1-s", 1000000n - G);
  d("new payout-b registry", "nb0-r", "nb1-r", -1000000n);
  d("sweep registry", "sw0-r", "sw1-r", -1000000n);
  d("rescue owner", "rs0-a", "rs1-a", 500000n - G);
  d("rescue registry", "rs0-r", "rs1-r", -500000n);
  d("lump payer", "lp0-s", "lp1-s", -(3000000n + G));
  for (const [n, lab, a, k, r] of [["s1", "Monkeys-like", 18496368n, -(22764761n + G), 4268393n], ["s2", "zero margin", 1000000n, -(1000000n + G), 0n], ["s3", "zero cost", 500001n, -(1000001n + G), 500000n], ["s4", "odd difference", 2000001n, -(3000001n + G), 1000000n]]) {
    d(`${lab} payout-a`, `${n}0-a`, `${n}1-a`, a); d(`${lab} payer`, `${n}0-k`, `${n}1-k`, k); d(`${lab} held`, `${n}0-r`, `${n}1-r`, r);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed of ${pass + fail} ===\n${url}`);
  if (fails.length) console.log("FAILED:\n" + fails.join("\n"));
  console.log("\nCOST TABLE (% of tenure limit; runtime/read_len/read_ct/write_len/write_ct; tx bytes)");
  const pct = (v, l) => ((Number(v) / l) * 100).toFixed(2).padStart(6);
  const row = (c) => `${c.name.padEnd(34)} ${pct(c.runtime, LIMITS.runtime)} ${pct(c.read_length, LIMITS.read_length)} ${pct(c.read_count, LIMITS.read_count)} ${pct(c.write_length, LIMITS.write_length)} ${pct(c.write_count, LIMITS.write_count)}  ${String(c.size).padStart(7)}B`;
  costs.forEach((c) => console.log(row(c)));
  const st = costs.filter((c) => c.staged);
  const sum = st.reduce((a, c) => { for (const k of ["runtime", "read_length", "read_count", "write_length", "write_count", "size"]) a[k] = (a[k] || 0) + Number(c[k]); return a; }, { name: "SUM staged+bind 87ch" });
  console.log(row(sum));
  fs.writeFileSync(`${SCRATCH}/sim/costs.json`, JSON.stringify(costs, null, 1));
  fs.writeFileSync(`${SCRATCH}/sim/result-session.txt`, url + "\n");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
