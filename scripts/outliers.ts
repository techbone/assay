import { readFileSync } from "node:fs";
import { assay } from "../src/reference/engine.js";
const f = JSON.parse(readFileSync("tests/fixtures/snapshot-2026-09-20-closed.json","utf8"));
const out: string[] = [];
for (const [t, qs] of Object.entries(f.snapshot as Record<string, any[]>)) {
  const r = assay(t, qs as any, "rth");
  for (const q of r.quotes) {
    if (q.rejected === "OUTLIER" || q.rejected === "CORRUPT_MULTIPLIER") {
      const dev = ((q.adjusted / r.assayPrice - 1) * 100).toFixed(1);
      out.push(`${q.rejected.padEnd(19)} ${q.symbol.padEnd(9)} ${q.family.padEnd(7)} trust=${q.trust.toFixed(3)} dev=${dev}%`);
    }
  }
}
console.log(out.sort().join("\n"));
console.log(`\ntotal rejected by price sanity: ${out.length}`);
