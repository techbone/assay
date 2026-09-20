import { readFileSync } from "node:fs";
import { assay } from "../src/reference/engine.js";
const f = JSON.parse(readFileSync("tests/fixtures/snapshot-2026-09-20-closed.json","utf8"));
const snap = f.snapshot as Record<string, any[]>;
console.log("regime:", f.regime, "| tickers:", Object.keys(snap).length);
let rej: Record<string,number> = {}, ondoAdj: number[] = [], ondoNaive: number[] = [];
let bad = 0, famTrust: Record<string, number[]> = {};
for (const [t, qs] of Object.entries(snap)) {
  const r = assay(t, qs as any, "rth");
  for (const q of r.quotes) {
    if (q.rejected) rej[q.rejected] = (rej[q.rejected]??0)+1;
    (famTrust[q.family] ??= []).push(q.trust);
    if (!Number.isFinite(q.trust) || !Number.isFinite(q.naiveBasisBp)) bad++;
    if (q.family==="Ondo" && !q.rejected && r.referencePrice) {
      ondoAdj.push(Math.abs(q.trueBasisBp)); ondoNaive.push(Math.abs(q.naiveBasisBp));
    }
  }
}
const p = (a:number[],q:number)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length*q)]!;};
console.log("rejections:", rej, "| non-finite:", bad);
console.log(`Ondo n=${ondoAdj.length}  naive |bp|: med ${p(ondoNaive,.5).toFixed(1)} p90 ${p(ondoNaive,.9).toFixed(1)} max ${Math.max(...ondoNaive).toFixed(1)}`);
console.log(`           adjusted |bp|: med ${p(ondoAdj,.5).toFixed(1)} p90 ${p(ondoAdj,.9).toFixed(1)} p95 ${p(ondoAdj,.95).toFixed(1)} max ${Math.max(...ondoAdj).toFixed(1)}`);
const improved = ondoAdj.filter((v,i)=>v < ondoNaive[i]!).length;
console.log(`adjustment improved ${improved}/${ondoAdj.length} = ${(100*improved/ondoAdj.length).toFixed(1)}%`);
for (const [fam, ts] of Object.entries(famTrust)) console.log(`trust ${fam}: n=${ts.length} med ${p(ts,.5).toFixed(3)}`);
