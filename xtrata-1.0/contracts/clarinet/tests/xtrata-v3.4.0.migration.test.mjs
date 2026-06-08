import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { createHash } from "node:crypto";

const simnet = await initSimnet("./v3.4.0/Clarinet.toml");
const a=simnet.getAccounts();
const deployer=a.get("deployer"), w1=a.get("wallet_1"), w2=a.get("wallet_2");
const C="xtrata-v3-4-0", L="mock-legacy";
const legacyPrincipal = `${deployer}.${L}`;

let pass=0,fail=0; const fails=[];
const ok=r=>r.result.type==="ok"||r.result.type===7;
const pp=r=>Cl.prettyPrint(r.result);
const check=(n,c,x="")=>{ c?pass++:(fail++,fails.push(n+(x?"  >> "+x:""))); };
const okc=(n,r)=>{check(n,ok(r),pp(r));return r;};
const errc=(n,r,code)=>{check(n,!ok(r)&&pp(r).includes("u"+code),pp(r));return r;};
const pub=(c,fn,args,who)=>simnet.callPublicFn(c,fn,args,who);
const ro=(fn,args=[],who=deployer)=>simnet.callReadOnlyFn(C,fn,args,who);
const CHUNK=16384, buf=(n,f)=>Buffer.alloc(n,f&0xff), sha=b=>createHash("sha256").update(b).digest();
const roll=cs=>{let h=Buffer.alloc(32,0);for(const c of cs)h=sha(Buffer.concat([h,c]));return h;};
const clBuffs=cs=>Cl.list(cs.map(c=>Cl.buffer(c)));
const mk=(n,last=CHUNK)=>{const cs=[];for(let i=0;i<n;i++)cs.push(buf(i===n-1?last:CHUNK,i+1));return cs;};
const size=cs=>cs.reduce((s,c)=>s+c.length,0);
const legacyTrait=Cl.contractPrincipal(deployer, L);
const stxBal=who=>{const m=simnet.getAssetsMap().get("STX");return m?BigInt(m.get(who)??0n):0n;};

// ---- setup: approve the real legacy source, unpause v3, set offset 1000 ----
okc("approve mock legacy migration source",
  pub(C,"set-migration-source",[legacyTrait,Cl.bool(true)],deployer));
check("approved source is readable",
  pp(ro("is-migration-source",[legacyTrait])).includes("true"));
errc("non-owner cannot approve migration source (u100)",
  pub(C,"set-migration-source",[Cl.contractPrincipal(deployer,"mock-legacy-b"),Cl.bool(true)],w1),100);
okc("unpause v3", pub(C,"set-paused",[Cl.bool(false)],deployer));
okc("set-next-id offset 1000 (native mints start >= 1000)", pub(C,"set-next-id",[Cl.uint(1000)],deployer));
errc("set-next-id is one-shot (u115 on 2nd)", pub(C,"set-next-id",[Cl.uint(2000)],deployer),115);

// legacy token #5 owned by w1 with content cs5
const cs5=mk(2,500); const h5=roll(cs5);
okc("legacy mint #5 to w1", pub(L,"test-mint",[Cl.uint(5),Cl.buffer(h5)],w1));
// legacy token #7 owned by w2
const cs7=mk(1,80); const h7=roll(cs7);
okc("legacy mint #7 to w2", pub(L,"test-mint",[Cl.uint(7),Cl.buffer(h7)],w2));
// legacy big token #9 owned by w1 (33 chunks) for staged migration
const cs9=mk(33,CHUNK); const h9=roll(cs9);
okc("legacy mint #9 to w1 (big)", pub(L,"test-mint",[Cl.uint(9),Cl.buffer(h9)],w1));

// ---- 1. single-tx migration (same id) ----
{
  const quoted=ro("quote-single-tx-fee",[Cl.uint(size(cs5)),Cl.uint(cs5.length)]);
  const expectedFee=BigInt(quoted.result.value.value["total-fee"].value);
  const beforeUser=stxBal(w1), beforeRoyalty=stxBal(deployer);
  const r=pub(C,"migrate-single-tx",
    [legacyTrait,Cl.uint(5),Cl.buffer(h5),Cl.stringAscii("image/svg+xml"),Cl.uint(size(cs5)),clBuffs(cs5),Cl.stringAscii("legacy-5")],w1);
  okc("migrate-single-tx legacy #5 -> v3 #5", r);
  check("single-tx migration charges the quoted fee", beforeUser-stxBal(w1)===expectedFee);
  check("single-tx migration fee reaches royalty recipient", stxBal(deployer)-beforeRoyalty===expectedFee);
  check("migrated token id preserved (== 5)", ok(r) && Number(r.result.value.value)===5, pp(r));
  check("v3 owns nothing? -> v3 #5 owned by w1", pp(ro("get-owner",[Cl.uint(5)])).includes(w1));
  check("legacy #5 escrowed into v3 contract", pp(simnet.callReadOnlyFn(L,"get-owner",[Cl.uint(5)],deployer)).includes(`${deployer}.${C}`));
  const src=pp(ro("get-migration-source",[Cl.uint(5)]));
  check("provenance recorded (source-contract + id 5)", src.includes(legacyPrincipal) && src.includes("source-id: u5"), src);
  // content present + reconstructable
  const hexOf=r=>{const m=pp(r).match(/0x[0-9a-fA-F]+/);return m?m[0].slice(2):null;};
  check("migrated content readable via get-chunk[0]", hexOf(ro("get-chunk",[Cl.uint(5),Cl.uint(0)]))===cs5[0].toString("hex"));
  check("migrated final-hash == content rolling hash", hexOf(ro("get-inscription-hash",[Cl.uint(5)]))===h5.toString("hex"));
}

// ---- 2. migrated token usable AS A PARENT ----
{
  const child=mk(1,33); const ch=roll(child);
  const r=pub(C,"mint-single-tx-with-relationships",
    [Cl.buffer(ch),Cl.stringAscii("t"),Cl.uint(33),clBuffs(child),Cl.stringAscii("child-of-5"),Cl.list([]),Cl.list([Cl.uint(5)])],w1);
  okc("mint v3 inscription using migrated #5 as PARENT", r);
  check("child references parent 5", pp(ro("get-parents",[Cl.uint(Number(r.result.value.value["token-id"].value))])).includes("u5"));
}

// ---- 3. negative cases ----
{
  // not the legacy owner: w2 tries to migrate legacy #5 (owned by... now escrowed; but pre-escrow ownership check) -> use #7 (owned by w2) migrated by w1
  errc("migrate by non-owner rejected (u100)",
    pub(C,"migrate-single-tx",[legacyTrait,Cl.uint(7),Cl.buffer(h7),Cl.stringAscii("t"),Cl.uint(size(cs7)),clBuffs(cs7),Cl.stringAscii("x")],w1),100);
  // content/hash mismatch: declared expected-hash != actual content hash
  const wrong=mk(1,80);
  errc("content not matching expected-hash rejected (u103)",
    pub(C,"migrate-single-tx",[legacyTrait,Cl.uint(7),Cl.buffer(buf(32,0xff)),Cl.stringAscii("t"),Cl.uint(size(wrong)),clBuffs(wrong),Cl.stringAscii("x")],w2),103);
  // re-migrate #5 by original owner: legacy #5 is now escrowed in v3, so w1 no longer
  // owns it -> ownership check fails first (u100). The legacy token cannot be re-ported.
  errc("re-migrate after escrow rejected (u100, original owner no longer owns legacy)",
    pub(C,"migrate-single-tx",[legacyTrait,Cl.uint(5),Cl.buffer(h5),Cl.stringAscii("t"),Cl.uint(size(cs5)),clBuffs(cs5),Cl.stringAscii("dup")],w1),100);
}

// ---- 3b. cross-contract same-id collision: a DIFFERENT legacy contract holding id 5 ----
{
  const legacyB=Cl.contractPrincipal(deployer,"mock-legacy-b");
  const csb=mk(1,77); const hb=roll(csb);
  okc("legacy-B mint #5 to w2", pub("mock-legacy-b","test-mint",[Cl.uint(5),Cl.buffer(hb)],w2));
  errc("unapproved migration source rejected (u116)",
    pub(C,"migrate-single-tx",[legacyB,Cl.uint(5),Cl.buffer(hb),Cl.stringAscii("t"),Cl.uint(size(csb)),clBuffs(csb),Cl.stringAscii("unapproved")],w2),116);
  okc("admin can approve a second migration source",
    pub(C,"set-migration-source",[legacyB,Cl.bool(true)],deployer));
  // w2 owns legacy-B #5, but v3 #5 already exists from the first migration -> duplicate guard (u114)
  errc("cross-contract same-id migration rejected (u114)",
    pub(C,"migrate-single-tx",[legacyB,Cl.uint(5),Cl.buffer(hb),Cl.stringAscii("t"),Cl.uint(size(csb)),clBuffs(csb),Cl.stringAscii("collide")],w2),114);
  check("legacy-B #5 NOT escrowed (clean revert, still owned by w2)",
    pp(simnet.callReadOnlyFn("mock-legacy-b","get-owner",[Cl.uint(5)],deployer)).includes(w2));
}

// ---- 4. staged migration (big legacy token #9, 33 chunks) ----
{
  // upload content via begin-or-get + add-chunk-batch (32 + 1)
  okc("begin staged upload for #9", pub(C,"begin-or-get",[Cl.buffer(h9),Cl.stringAscii("application/octet-stream"),Cl.uint(size(cs9)),Cl.uint(33)],w1));
  okc("add batch 1 (32 chunks)", pub(C,"add-chunk-batch",[Cl.buffer(h9),clBuffs(cs9.slice(0,32))],w1));
  okc("add batch 2 (1 chunk)", pub(C,"add-chunk-batch",[Cl.buffer(h9),clBuffs(cs9.slice(32))],w1));
  const quote=ro("quote-staged-fee",[Cl.uint(size(cs9)),Cl.uint(cs9.length)]);
  const expectedSealFee=BigInt(quote.result.value.value["seal-fee"].value);
  const beforeUser=stxBal(w1), beforeRoyalty=stxBal(deployer);
  const r=pub(C,"migrate-staged",[legacyTrait,Cl.uint(9),Cl.buffer(h9),Cl.stringAscii("legacy-9")],w1);
  okc("migrate-staged legacy #9 -> v3 #9", r);
  check("staged migration charges the quoted seal fee", beforeUser-stxBal(w1)===expectedSealFee);
  check("staged migration seal fee reaches royalty recipient", stxBal(deployer)-beforeRoyalty===expectedSealFee);
  check("staged migrated id preserved (== 9)", ok(r) && Number(r.result.value.value)===9, pp(r));
  check("legacy #9 escrowed", pp(simnet.callReadOnlyFn(L,"get-owner",[Cl.uint(9)],deployer)).includes(`${deployer}.${C}`));
}

// ---- 5. native mints respect the offset (no collision with migrated low ids) ----
{
  const cs=mk(1,12); const h=roll(cs);
  const r=pub(C,"mint-single-tx",[Cl.buffer(h),Cl.stringAscii("t"),Cl.uint(12),clBuffs(cs),Cl.stringAscii("native")],w1);
  okc("native mint after migrations", r);
  const id=Number(r.result.value.value["token-id"].value);
  check("native mint id >= offset 1000 (no collision with migrated 5/7/9)", id>=1000, "id="+id);
}

console.log("\n============ MIGRATION RESULTS ============");
if(fails.length){console.log("FAILURES:");for(const f of fails)console.log("  ✗ "+f);}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
