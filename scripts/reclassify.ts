/**
 * Recomputes `regime` on stored rows using the current classifier.
 *
 * This is why raw observations are append-only: the classifier was wrong for the first
 * 16 hours of collection (premarket was labelled rth), and because the venue's raw
 * `market_status` string was stored alongside, the history is fully recoverable.
 */
import Database from "better-sqlite3";
import { regimeOf } from "../src/store/db.js";

const path = process.argv[2] ?? "data/assay.db";
const apply = process.argv.includes("--apply");
const db = new Database(path);

const sessions = db.prepare(
  `SELECT ts, market_status, open_state, regime FROM session_status ORDER BY ts`,
).all() as Array<{ ts: number; market_status: string | null; open_state: number | null; regime: string }>;

const changes = new Map<number, string>();
for (const s of sessions) {
  const next = regimeOf(s.market_status, s.open_state === null ? null : s.open_state === 1);
  if (next !== s.regime) changes.set(s.ts, next);
}

const summary = new Map<string, number>();
for (const s of sessions) {
  const next = changes.get(s.ts);
  if (!next) continue;
  const key = `${s.regime} -> ${next}  (market_status=${s.market_status ?? "null"})`;
  summary.set(key, (summary.get(key) ?? 0) + 1);
}
for (const [k, n] of [...summary].sort()) console.log(`${String(n).padStart(4)}  ${k}`);
console.log(`\n${changes.size} of ${sessions.length} session rows reclassified`);

if (!apply) {
  console.log("dry run - pass --apply to write");
  process.exit(0);
}

// Observations carry the regime of their cycle; realign them to the corrected sessions.
const tx = db.transaction(() => {
  const us = db.prepare(`UPDATE session_status SET regime = ? WHERE ts = ?`);
  const uo = db.prepare(`UPDATE observation SET regime = ? WHERE ts = ?`);
  const ua = db.prepare(`UPDATE assay_snapshot SET regime = ? WHERE ts = ?`);
  const uh = db.prepare(`UPDATE heartbeat SET regime = ? WHERE ts = ?`);
  for (const [ts, regime] of changes) {
    us.run(regime, ts); uo.run(regime, ts); ua.run(regime, ts); uh.run(regime, ts);
  }
});
tx();
console.log("applied");
