/**
 * Captures a full-fidelity snapshot of every multi-wrapper ticker on BSC.
 * Output doubles as a regression fixture and as the seed for the collector.
 *
 *   npx tsx scripts/snapshot.ts [outfile]
 */
import { writeFileSync } from "node:fs";
import { BinanceRwaClient, groupByTicker } from "../src/binance/client.js";
import { FAMILY_NAME } from "../src/binance/types.js";
import type { RawQuote } from "../src/reference/types.js";

const num = (s: string | null | undefined): number | undefined => {
  if (s === null || s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

async function main() {
  const out = process.argv[2] ?? `tests/fixtures/snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  const client = new BinanceRwaClient();

  const status = await client.marketStatus();
  const regime =
    status?.marketStatus === "closed" ? "closed" : status?.openState ? "rth" : "offhours";
  console.log(`market: ${status?.marketStatus} (${status?.reasonMsg ?? "-"}) -> regime=${regime}`);

  const universe = await client.universe();
  const byTicker = groupByTicker(universe);
  const multi = [...byTicker.entries()].filter(([, ws]) => ws.length > 1);
  console.log(`BSC: ${universe.filter((e) => e.chainId === "56").length} tokens, ` +
    `${byTicker.size} tickers, ${multi.length} multi-wrapper`);

  const snapshot: Record<string, RawQuote[]> = {};
  let done = 0;
  for (const [ticker, wrappers] of multi) {
    const quotes: RawQuote[] = [];
    for (const w of wrappers) {
      const d = await client.dynamic(w.contractAddress).catch(() => null);
      const ti = d?.tokenInfo, si = d?.stockInfo, st = d?.statusInfo;
      const price = num(ti?.price), multiplier = num(ti?.sharesMultiplier);
      if (price === undefined || multiplier === undefined) continue;
      quotes.push({
        symbol: d!.symbol,
        ticker,
        family: FAMILY_NAME[d!.type] ?? `type${d!.type}`,
        price,
        multiplier,
        listMultiplier: num(w.multiplier),
        referencePrice: num(si?.price),
        statusCode: st?.reasonCode ?? undefined,
        holders: num(ti?.totalHolders),
        bnTrader: num(ti?.bnTrader),
        volume24h: num(ti?.volume24h),
      });
    }
    if (quotes.length > 1) snapshot[ticker] = quotes;
    if (++done % 20 === 0) console.log(`  ${done}/${multi.length}`);
  }

  writeFileSync(out, JSON.stringify({ capturedAt: new Date().toISOString(), regime, marketStatus: status, snapshot }, null, 1));
  console.log(`wrote ${out}: ${Object.keys(snapshot).length} tickers`);
}

main().catch((e) => { console.error(e); process.exit(1); });
