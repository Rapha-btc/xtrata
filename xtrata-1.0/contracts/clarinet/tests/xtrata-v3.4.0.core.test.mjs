import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { createHash } from "node:crypto";

const simnet = await initSimnet("./v3.4.0/Clarinet.toml");
const a = simnet.getAccounts();
const deployer = a.get("deployer"), w1 = a.get("wallet_1"), w2 = a.get("wallet_2"), w3 = a.get("deployer");
const C = "xtrata-v3-4-0";

// ---- helpers ----
let pass=0, fail=0; const fails=[];
const ok = r => r.result.type === "ok" || r.result.type === 7;
const pp = r => Cl.prettyPrint(r.result);
function check(name, cond, extra=""){ if(cond){pass++;} else {fail++; fails.push(name+(extra?"  >> "+extra:""));} }
function expectOk(name, r){ check(name, ok(r), pp(r)); return r; }
function expectErr(name, r, code){ check(name, !ok(r) && pp(r).includes("u"+code), pp(r)); return r; }

const CHUNK=16384;
const buf=(n,fill)=>Buffer.alloc(n, fill & 0xff);
const sha=b=>createHash("sha256").update(b).digest();
const roll=cs=>{let h=Buffer.alloc(32,0); for(const c of cs) h=sha(Buffer.concat([h,c])); return h;};
const clBuffs=cs=>Cl.list(cs.map(c=>Cl.buffer(c)));
const idOf=r=>Number(r.result.value.value);
const ro=(fn,args=[],who=deployer)=>simnet.callReadOnlyFn(C,fn,args,who);
const pub=(fn,args,who)=>simnet.callPublicFn(C,fn,args,who);
const stxBal=who=>{const m=simnet.getAssetsMap().get("STX"); return m?BigInt(m.get(who)??0n):0n;};

// build a deterministic set of `n` chunks; non-final full 16384, final = lastLen
function makeChunks(n, lastLen=CHUNK){
  const cs=[];
  for(let i=0;i<n;i++) cs.push(buf(i===n-1?lastLen:CHUNK, i+1));
  return cs;
}
function totalSize(cs){ return cs.reduce((s,c)=>s+c.length,0); }

// staged upload helper (begin -> add in <=32 batches -> seal)
function stagedMint(who, cs, uri, deps=[], parents=[]){
  const h=roll(cs); const size=totalSize(cs);
  let r=pub("begin-or-get",[Cl.buffer(h),Cl.stringAscii("application/octet-stream"),Cl.uint(size),Cl.uint(cs.length)],who);
  if(!ok(r)) return r;
  for(let i=0;i<cs.length;i+=32){
    const batch=cs.slice(i,i+32);
    r=pub("add-chunk-batch",[Cl.buffer(h),clBuffs(batch)],who);
    if(!ok(r)) return r;
  }
  if(deps.length||parents.length)
    return pub("seal-with-relationships",[Cl.buffer(h),Cl.stringAscii(uri),Cl.list(deps.map(Cl.uint)),Cl.list(parents.map(Cl.uint))],who);
  return pub("seal-inscription",[Cl.buffer(h),Cl.stringAscii(uri)],who);
}

// ============ TESTS ============

// 1. contract-info + version (dependency-free core)
{
  const i=pp(ro("get-contract-info"));
  check("contract-info: version xtrata-v3.4.0", i.includes('version: "xtrata-v3.4.0"'), i.slice(0,60));
  check("contract-info: chunk-size 16384", i.includes("chunk-size: u16384"));
  check("contract-info: upload-batch-limit 32", i.includes("upload-batch-limit: u32"));
  check("contract-info: single-tx-chunk-limit 32", i.includes("single-tx-chunk-limit: u32"));
  check("get-chunk-size = 16384", pp(ro("get-chunk-size")).includes("u16384"));
}

// 2. pause semantics
{
  check("starts paused", pp(ro("is-paused")).includes("true"));
  const cs=makeChunks(1,10); const h=roll(cs);
  expectErr("mint blocked while paused for non-owner (u109)",
    pub("mint-single-tx",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(10),clBuffs(cs),Cl.stringAscii("p")],w1), 109);
  // owner can mint while paused
  expectOk("owner can mint while paused",
    pub("mint-single-tx",[Cl.buffer(roll(makeChunks(1,11))),Cl.stringAscii("t"),Cl.uint(11),clBuffs(makeChunks(1,11)),Cl.stringAscii("po")],deployer));
  // allowed caller bypasses pause -- but contract-caller must be in AllowedCallers; direct tx wallet_2 won't be unless set
  expectOk("owner unpause", pub("set-paused",[Cl.bool(false)],deployer));
  check("now unpaused", pp(ro("is-paused")).includes("false"));
  expectErr("non-owner cannot unpause (u100)", pub("set-paused",[Cl.bool(true)],w1), 100);
}

// 3. single-tx happy paths: 1 byte, 1 full chunk, 30 chunks, exact 512 KiB (32)
{
  const cases=[["1 byte",makeChunks(1,1)],["1 full 16KiB chunk",makeChunks(1,CHUNK)],
               ["30 chunks",makeChunks(30,CHUNK)],["exact 512 KiB (32x16384)",makeChunks(32,CHUNK)]];
  for(const [label,cs] of cases){
    const h=roll(cs);
    expectOk("single-tx mint "+label,
      pub("mint-single-tx",[Cl.buffer(h),Cl.stringAscii("application/zip"),Cl.uint(totalSize(cs)),clBuffs(cs),Cl.stringAscii("u-"+label)],w1));
  }
}

// 4. grid enforcement
{
  // non-final chunk not 16384 -> u102
  const cs=[buf(CHUNK-1,1),buf(50,2)]; const h=roll(cs);
  expectErr("reject non-final chunk != 16384 (u102)",
    pub("mint-single-tx",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(CHUNK-1+50),clBuffs(cs),Cl.stringAscii("g1")],w1),102);
  // total-size shape mismatch: claim size that violates (tc-1)*16384 < size <= tc*16384
  const cs2=makeChunks(2,CHUNK); // size = 32768, valid range (16384, 32768]; claim 16384 -> invalid
  expectErr("reject bad total-size shape (u102)",
    pub("mint-single-tx",[Cl.buffer(roll(cs2)),Cl.stringAscii("t"),Cl.uint(16384),clBuffs(cs2),Cl.stringAscii("g2")],w1),102);
}

// 5. hash mismatch -> u103
{
  const cs=makeChunks(2,100);
  expectErr("hash mismatch (u103)",
    pub("mint-single-tx",[Cl.buffer(buf(32,0xff)),Cl.stringAscii("t"),Cl.uint(totalSize(cs)),clBuffs(cs),Cl.stringAscii("h")],w1),103);
}

// 6. advisory dedupe: duplicate content -> distinct ids; get-id-by-hash = first
{
  const cs=makeChunks(1,200); const h=roll(cs);
  const r1=pub("mint-single-tx",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(200),clBuffs(cs),Cl.stringAscii("d1")],w1);
  const r2=pub("mint-single-tx",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(200),clBuffs(cs),Cl.stringAscii("d2")],w2);
  check("dup mint #1 ok", ok(r1));
  check("dup mint #2 ok (new id allowed)", ok(r2));
  const a1=Number(r1.result.value.value["token-id"].value), a2=Number(r2.result.value.value["token-id"].value);
  check("duplicate content mints DISTINCT ids", a1!==a2, `${a1} vs ${a2}`);
  const first=pp(ro("get-id-by-hash",[Cl.buffer(h)]));
  check("get-id-by-hash returns first-seen id", first.includes("u"+a1), first);
}

// 7. staged multi-batch: 33 (32+1) and 64 (32+32)
{
  const r33=stagedMint(w1, makeChunks(33,CHUNK), "staged-33");
  expectOk("staged 33 chunks (32+1)", r33);
  const r64=stagedMint(w1, makeChunks(64,CHUNK), "staged-64");
  expectOk("staged 64 chunks (32+32)", r64);
  // reconstruct the 33-chunk token: read chunks back, verify CONTENT + rolling hash == stored final-hash
  const id=Number(r33.result.value.value);
  const hexOf=r=>{const m=pp(r).match(/0x[0-9a-fA-F]+/); return m?m[0].slice(2).toLowerCase():null;};
  const cs=makeChunks(33,CHUNK);
  let contentOk=true;
  for(let i=0;i<33;i++){
    const h=hexOf(ro("get-chunk",[Cl.uint(id),Cl.uint(i)]));
    if(h!==cs[i].toString("hex")){ contentOk=false; break; }
  }
  check("reconstruct 33-chunk: every chunk content matches via get-chunk", contentOk);
  // batched read of first 30 indexes returns 30 chunks
  const batch=ro("get-chunk-batch",[Cl.uint(id),Cl.list(Array.from({length:30},(_,i)=>Cl.uint(i)))]);
  check("get-chunk-batch returns a list", pp(batch).startsWith("(list"));
  const storedHash=hexOf(ro("get-inscription-hash",[Cl.uint(id)]));
  check("reconstruct 33-chunk: rolling hash matches stored final-hash",
    storedHash===roll(cs).toString("hex"), storedHash);
}

// 8. seal-inscription-batch (two staged uploads sealed in one call)
{
  const csA=makeChunks(1,40), csB=makeChunks(1,41);
  const hA=roll(csA), hB=roll(csB);
  pub("begin-or-get",[Cl.buffer(hA),Cl.stringAscii("t"),Cl.uint(40),Cl.uint(1)],w1);
  pub("add-chunk-batch",[Cl.buffer(hA),clBuffs(csA)],w1);
  pub("begin-or-get",[Cl.buffer(hB),Cl.stringAscii("t"),Cl.uint(41),Cl.uint(1)],w1);
  pub("add-chunk-batch",[Cl.buffer(hB),clBuffs(csB)],w1);
  const items=Cl.list([
    Cl.tuple({hash:Cl.buffer(hA), "token-uri":Cl.stringAscii("batchA")}),
    Cl.tuple({hash:Cl.buffer(hB), "token-uri":Cl.stringAscii("batchB")}),
  ]);
  expectOk("seal-inscription-batch seals two", pub("seal-inscription-batch",[items],w1));
}

// 9. parents + dependencies
{
  // mint a base token owned by w1
  const base=makeChunks(1,12); const bh=roll(base);
  const rb=pub("mint-single-tx",[Cl.buffer(bh),Cl.stringAscii("t"),Cl.uint(12),clBuffs(base),Cl.stringAscii("base")],w1);
  const baseId=Number(rb.result.value.value["token-id"].value);
  // dependency on existing token: ok
  const cd=makeChunks(1,13);
  expectOk("mint with valid dependency",
    pub("mint-single-tx-recursive",[Cl.buffer(roll(cd)),Cl.stringAscii("t"),Cl.uint(13),clBuffs(cd),Cl.stringAscii("dep"),Cl.list([Cl.uint(baseId)])],w1));
  // dependency on missing token -> u111
  const cd2=makeChunks(1,14);
  expectErr("mint with MISSING dependency (u111)",
    pub("mint-single-tx-recursive",[Cl.buffer(roll(cd2)),Cl.stringAscii("t"),Cl.uint(14),clBuffs(cd2),Cl.stringAscii("dep2"),Cl.list([Cl.uint(999999)])],w1),111);
  // parent owned by w1: ok ; parent owned by someone else: fail ; duplicate parent: u114
  const cp=makeChunks(1,15);
  expectOk("mint with owned parent",
    pub("mint-single-tx-with-relationships",[Cl.buffer(roll(cp)),Cl.stringAscii("t"),Cl.uint(15),clBuffs(cp),Cl.stringAscii("par"),Cl.list([]),Cl.list([Cl.uint(baseId)])],w1));
  const cp2=makeChunks(1,16);
  // base is owned by w1; w2 trying to use it as parent -> not owned by tx-sender -> fail (u102 from validate-parent unowned/missing)
  const rbad=pub("mint-single-tx-with-relationships",[Cl.buffer(roll(cp2)),Cl.stringAscii("t"),Cl.uint(16),clBuffs(cp2),Cl.stringAscii("par2"),Cl.list([]),Cl.list([Cl.uint(baseId)])],w2);
  check("parent not owned by minter is rejected", !ok(rbad), pp(rbad));
  const cp3=makeChunks(1,17);
  expectErr("duplicate parent rejected (u114)",
    pub("mint-single-tx-with-relationships",[Cl.buffer(roll(cp3)),Cl.stringAscii("t"),Cl.uint(17),clBuffs(cp3),Cl.stringAscii("par3"),Cl.list([]),Cl.list([Cl.uint(baseId),Cl.uint(baseId)])],w1),114);
}

// 10. SIP-009 surface + transfer (not pause-gated)
{
  const cs=makeChunks(1,18); const h=roll(cs);
  const r=pub("mint-single-tx",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(18),clBuffs(cs),Cl.stringAscii("sip")],w1);
  const id=Number(r.result.value.value["token-id"].value);
  check("get-owner returns minter", pp(ro("get-owner",[Cl.uint(id)])).includes(w1));
  check("get-token-uri returns uri", pp(ro("get-token-uri",[Cl.uint(id)])).includes("sip"));
  check("get-last-token-id is ok-uint", ok(ro("get-last-token-id")));
  // non-owner cannot transfer
  expectErr("non-owner transfer rejected (u100)", pub("transfer",[Cl.uint(id),Cl.principal(w2),Cl.principal(w3)],w2),100);
  // owner transfer ok
  expectOk("owner transfer ok", pub("transfer",[Cl.uint(id),Cl.principal(w1),Cl.principal(w2)],w1));
  check("ownership moved to w2", pp(ro("get-owner",[Cl.uint(id)])).includes(w2));
  // transfer works even when paused
  pub("set-paused",[Cl.bool(true)],deployer);
  expectOk("transfer not pause-gated", pub("transfer",[Cl.uint(id),Cl.principal(w2),Cl.principal(w3)],w2));
  pub("set-paused",[Cl.bool(false)],deployer);
}

// 11. fee accounting: single-tx fee charged once == quote, paid to royalty recipient
{
  const cs=makeChunks(3,CHUNK); const h=roll(cs); const size=totalSize(cs);
  const quote=ro("quote-single-tx-fee",[Cl.uint(size),Cl.uint(3)]);
  const qfee=BigInt(quote.result.value.value["total-fee"].value);
  const before=stxBal(w1), beforeDep=stxBal(deployer);
  const r=pub("mint-single-tx",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(size),clBuffs(cs),Cl.stringAscii("fee")],w1);
  check("fee mint ok", ok(r));
  const spent=before-stxBal(w1);
  check("single-tx fee charged == quote", spent===qfee, `spent ${spent} vs quote ${qfee}`);
  check("fee paid to royalty recipient (deployer)", stxBal(deployer)-beforeDep===qfee, `${stxBal(deployer)-beforeDep}`);
  // staged quote = begin + seal
  const sq=ro("quote-staged-fee",[Cl.uint(size),Cl.uint(3)]);
  const begin=BigInt(ro("get-begin-fee-unit").result.value.value);
  check("staged quote total = begin + seal", BigInt(sq.result.value.value["total-fee"].value) === begin + BigInt(sq.result.value.value["seal-fee"].value));
}

// 12. fee bounds admin
{
  expectErr("fee above max rejected (u110)", pub("set-single-tx-fee-unit",[Cl.uint(2000000)],deployer),110);
  expectOk("fee within bounds ok", pub("set-single-tx-fee-unit",[Cl.uint(150000)],deployer));
  expectErr("non-owner fee change rejected (u100)", pub("set-single-tx-fee-unit",[Cl.uint(120000)],w1),100);
}

// 13. expiry + purge + abandon
{
  const cs=makeChunks(2,CHUNK); const h=roll(cs);
  pub("begin-or-get",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(totalSize(cs)),Cl.uint(2)],w1);
  pub("add-chunk-batch",[Cl.buffer(h),clBuffs(cs)],w1);
  simnet.mineEmptyBlocks(4321); // past UPLOAD-EXPIRY-BLOCKS (4320)
  expectErr("seal after expiry rejected (u112)", pub("seal-inscription",[Cl.buffer(h),Cl.stringAscii("exp")],w1),112);
  expectOk("purge expired chunk batch", pub("purge-expired-chunk-batch",[Cl.buffer(h),Cl.principal(w1),Cl.list([Cl.uint(0),Cl.uint(1)])],deployer));
  // abandon a fresh upload
  const cs2=makeChunks(1,9); const h2=roll(cs2);
  pub("begin-or-get",[Cl.buffer(h2),Cl.stringAscii("t"),Cl.uint(9),Cl.uint(1)],w1);
  expectOk("abandon-upload ok", pub("abandon-upload",[Cl.buffer(h2)],w1));
}

// 14. dependency-free guarantees
{
  check("get-inscription-summary includes migration-source field",
    pp(ro("get-inscription-summary",[Cl.uint(0)])).includes("migration-source"));
  // migrate-from-* / get-migration-source / set-next-id should not exist on the interface
  const iface=simnet.getContractsInterfaces().get(`${deployer}.${C}`);
  const fnNames=(iface?.functions||[]).map(f=>f.name);
  for(const gone of ["migrate-from-v1","migrate-from-v2-1-0","migrate-from-v2-1-1"])
    check("removed function absent: "+gone, !fnNames.includes(gone));
  check("migration source admin function exists", fnNames.includes("set-migration-source"));
  check("migration source reader exists", fnNames.includes("is-migration-source"));
}

// ---- report ----
console.log("\n================ RESULTS ================");
if(fails.length){ console.log("FAILURES:"); for(const f of fails) console.log("  ✗ "+f); }
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
