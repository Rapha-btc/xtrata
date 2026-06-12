import { deserializeCV, cvToString } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const PEPE = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const IDS = [1, 2, 3, 7, 42, 100, 1110, 1111, 1112, 500];

const b = SimulationBuilder.new().withSender("SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51");
const plan = [];
for (const id of IDS) {
  b.addEvalCode(PEPE, `(get-owner u${id})`);     plan.push({ id, kind: "owner" });
  b.addEvalCode(PEPE, `(get-listing-in-ustx u${id})`); plan.push({ id, kind: "list" });
}

const decodeEval = (s) => {
  const r = s?.Result?.Eval;
  if (!r || !("Ok" in r)) return `ERR:${r?.Err ?? "?"}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
};

const sessionId = await b.run();
console.log("session:", `https://stxer.xyz/simulations/mainnet/${sessionId}`);
const res = await getSimulationResult(sessionId);
res.steps.forEach((s, i) => {
  const p = plan[i]; if (!p) return;
  console.log(`#${p.id} ${p.kind}: ${decodeEval(s)}`);
});
