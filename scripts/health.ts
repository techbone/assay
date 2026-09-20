/** Collection health. The scorecard's credibility rests on this being boring. */
import { AssayStore } from "../src/store/db.js";

const db = process.argv[2] ?? "data/assay.db";
const store = new AssayStore(db);
const c = store.coverage();

if (c.observations === 0) {
  console.log("no observations yet");
  process.exit(1);
}

const spanMs = (c.lastTs ?? 0) - (c.firstTs ?? 0);
const hours = spanMs / 3_600_000;
const ageMin = (Date.now() - (c.lastTs ?? 0)) / 60_000;
const gaps = store.gaps(5 * 60_000);
const lostMs = gaps.reduce((a, g) => a + g.ms, 0);

console.log(`window      ${new Date(c.firstTs!).toISOString()} -> ${new Date(c.lastTs!).toISOString()}`);
console.log(`span        ${hours.toFixed(1)}h across ${c.cycles} cycles`);
console.log(`observations ${c.observations.toLocaleString()} over ${c.tickers} tickers`);
console.log(`last cycle  ${ageMin.toFixed(1)} min ago`);
console.log(`gaps >5min  ${gaps.length}${gaps.length ? ` (${(lostMs / 3_600_000).toFixed(1)}h lost)` : ""}`);
console.log(`uptime      ${spanMs > 0 ? (100 * (1 - lostMs / spanMs)).toFixed(2) : "100.00"}%`);

for (const g of gaps.slice(-5)) {
  console.log(`  gap ${new Date(g.from).toISOString()} +${(g.ms / 60_000).toFixed(0)}min`);
}

// Stale beyond ~3 cycles at a 2-minute interval means the collector is not running.
process.exit(ageMin > 6 ? 1 : 0);
