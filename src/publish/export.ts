/**
 * Renders the live store into static JSON the public site can read.
 *
 * The judge-facing site must stay up through 23 Oct regardless of where (or whether) the
 * collector is running, so the site is static and the data is a published artifact rather
 * than a live query. Everything here goes through the same engine as the API, so the
 * static site and the tests cannot disagree.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Queries } from "../api/queries.js";
import { Scorecard } from "../scorecard/detect.js";
import { AssayStore } from "../store/db.js";

/** Full basis history is only published for tickers carrying three or more wrappers. */
const HISTORY_MIN_WRAPPERS = 3;
const HISTORY_HOURS = 48;
const HISTORY_POINTS = 240;

/** Trims float noise so snapshots diff and compress well. */
const round = (v: unknown, dp = 6): unknown =>
  typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(dp)) : v;

const deepRound = (o: unknown): unknown => {
  if (Array.isArray(o)) return o.map(deepRound);
  if (o && typeof o === "object") {
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deepRound(v)]));
  }
  return round(o);
};

function write(dir: string, name: string, data: unknown): number {
  const body = JSON.stringify(deepRound(data));
  writeFileSync(join(dir, name), body);
  return body.length;
}

export function exportSnapshot(dbPath: string, outDir: string): { files: number; bytes: number } {
  const store = new AssayStore(dbPath);
  const q = new Queries(store);
  const sc = new Scorecard(store);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "ticker"), { recursive: true });
  mkdirSync(join(outDir, "history"), { recursive: true });

  let files = 0, bytes = 0;
  const add = (n: number) => { files++; bytes += n; };

  const summary = q.summary();
  const latest = q.latest();

  add(write(outDir, "summary.json", summary));
  add(write(outDir, "sessions.json", q.sessions(72)));
  add(write(outDir, "scorecard.json", {
    overall: sc.overall(),
    events: sc.all().slice(0, 20),
  }));

  const rows = latest
    .map((r) => {
      const worst = r.quotes
        .filter((x) => !x.rejected)
        .reduce((a, x) => (Math.abs(x.multiplierEffectBp) > Math.abs(a) ? x.multiplierEffectBp : a), 0);
      return {
        ticker: r.ticker, assayPrice: r.assayPrice, confidenceBp: r.confidenceBp,
        referencePrice: r.referencePrice, regime: r.regime,
        wrappers: r.quotes.length, accepted: r.accepted.length,
        phantomBp: worst, families: r.quotes.map((x) => x.family),
      };
    })
    .sort((a, b) => Math.abs(b.phantomBp) - Math.abs(a.phantomBp));
  add(write(outDir, "tickers.json", rows));

  for (const r of latest) {
    add(write(join(outDir, "ticker"), `${r.ticker}.json`, r));
    if (r.quotes.length >= HISTORY_MIN_WRAPPERS) {
      add(write(join(outDir, "history"), `${r.ticker}.json`,
                q.history(r.ticker, HISTORY_HOURS, HISTORY_POINTS)));
    }
  }

  // Freshness is stated by the data itself: a stale site must be able to say so.
  add(write(outDir, "meta.json", {
    generatedAt: Date.now(),
    lastCycleTs: summary.ts,
    coverage: summary.coverage,
    historyTickers: latest.filter((r) => r.quotes.length >= HISTORY_MIN_WRAPPERS).map((r) => r.ticker),
  }));

  store.close();
  return { files, bytes };
}
