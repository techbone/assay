/**
 * The 24/7 collector.
 *
 *   npx tsx src/collector/run.ts [--interval 60] [--db data/assay.db] [--once]
 *
 * Resilience over throughput: a failed cycle is logged and the loop continues, because a
 * crash that stops collection costs evidence that cannot be recovered afterwards.
 */
import { BinanceRwaClient } from "../binance/client.js";
import { AssayStore } from "../store/db.js";
import { Collector } from "./collector.js";

const arg = (flag: string, fallback?: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const intervalMs = Number(arg("--interval", "60")) * 1000;
const dbPath = arg("--db", "data/assay.db")!;
const once = process.argv.includes("--once");

const store = new AssayStore(dbPath);
const collector = new Collector(new BinanceRwaClient({ throttleMs: 80 }), store);

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`\n${sig} — finishing current cycle, then closing.`);
  });
}

async function main() {
  console.log(`assay collector · db=${dbPath} · interval=${intervalMs / 1000}s`);
  do {
    const startedAt = Date.now();
    try {
      const r = await collector.runCycle(startedAt);
      const cov = store.coverage();
      console.log(
        `${new Date(r.ts).toISOString()} regime=${r.regime} tickers=${r.tickers} ` +
          `obs=${r.observations} errors=${r.errors} cycle=${(r.cycleMs / 1000).toFixed(1)}s ` +
          `| total obs=${cov.observations} cycles=${cov.cycles}`,
      );
    } catch (err) {
      // Never let one bad cycle end the run.
      console.error(`${new Date().toISOString()} cycle failed:`, err instanceof Error ? err.message : err);
    }
    if (once || stopping) break;
    const wait = Math.max(0, intervalMs - (Date.now() - startedAt));
    await new Promise((r) => setTimeout(r, wait));
  } while (!stopping);

  const cov = store.coverage();
  const gaps = store.gaps(intervalMs * 3);
  console.log(
    `closing · observations=${cov.observations} tickers=${cov.tickers} cycles=${cov.cycles} gaps=${gaps.length}`,
  );
  store.close();
}

main().catch((e) => { console.error(e); store.close(); process.exit(1); });
