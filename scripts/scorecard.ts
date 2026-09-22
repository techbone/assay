import { Scorecard } from "../src/scorecard/detect.js";
import { AssayStore } from "../src/store/db.js";

const store = new AssayStore(process.argv[2] ?? "data/assay.db");
const sc = new Scorecard(store);

const regimes = store.db.prepare(
  `SELECT regime, COUNT(DISTINCT ts) cycles FROM observation GROUP BY regime ORDER BY cycles DESC`,
).all() as Array<{ regime: string; cycles: number }>;
console.log("cycles by regime:", regimes.map((r) => `${r.regime}=${r.cycles}`).join(" "));

const o = sc.overall();
console.log(`\nscored opens: ${o.events} · tickers: ${o.tickers}`);
if (o.events === 0) {
  console.log("no regular-hours open captured yet — nothing to score.");
  process.exit(0);
}
console.log(`\n${"estimator".padEnd(16)}${"MAE bp".padStart(9)}${"median".padStart(9)}${"p90".padStart(9)}${"n".padStart(6)}`);
for (const s of o.summary) {
  console.log(`${s.estimator.padEnd(16)}${s.maeBp.toFixed(1).padStart(9)}${s.medianBp.toFixed(1).padStart(9)}${s.p90Bp.toFixed(1).padStart(9)}${String(s.n).padStart(6)}`);
}
