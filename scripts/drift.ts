import { readFileSync } from "node:fs";
import { assay } from "../src/reference/engine.js";
const f = JSON.parse(readFileSync("tests/fixtures/snapshot-2026-09-20-closed.json","utf8"));
const rows: Array<[string,string,number,number,string]> = [];
for (const [t, qs] of Object.entries(f.snapshot as Record<string, any[]>)) {
  for (const q of assay(t, qs as any, "rth").quotes) {
    rows.push([q.symbol, q.family, q.multiplier, Math.abs(q.multiplierEffectBp), q.multiplierKind]);
  }
}
rows.sort((a,b)=>b[3]-a[3]);
console.log("top multiplier effects:");
for (const [s,f2,m,bp,k] of rows.slice(0,12))
  console.log(`  ${s.padEnd(9)} ${f2.padEnd(7)} mult=${m.toFixed(6).padStart(11)} effect=${bp.toFixed(0).padStart(6)}bp  ${k}`);
console.log("\ndrift-classified, largest first:");
for (const [s,f2,m,bp,k] of rows.filter(r=>r[4]==="drift").slice(0,8))
  console.log(`  ${s.padEnd(9)} ${f2.padEnd(7)} mult=${m.toFixed(6).padStart(11)} effect=${bp.toFixed(0).padStart(6)}bp`);
