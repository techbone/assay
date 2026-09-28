import type { MarketRegime } from "../binance/types.js";
import type { AssayResult } from "../reference/types.js";

/**
 * How engine results are shaped for the site. Shared by the local API (SQLite-backed)
 * and the live serverless API (Binance-backed) so the two can never present the same
 * numbers differently.
 */

export interface Coverage {
  observations: number;
  tickers: number;
  firstTs: number | null;
  lastTs: number | null;
  cycles: number;
}

export interface TickerRow {
  ticker: string; assayPrice: number; confidenceBp: number; referencePrice: number | null;
  regime: MarketRegime; wrappers: number; accepted: number; phantomBp: number; families: string[];
}

export function tickerRows(results: AssayResult[]): TickerRow[] {
  return results
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
}

export interface Summary {
  tickers: number;
  wrappers: number;
  families: Record<string, number>;
  rejected: Record<string, number>;
  phantomBp: { median: number; p90: number; max: number; n: number };
  fractional: number;
  regime: MarketRegime;
  /** When these prices were observed. */
  ts: number | null;
  /** The collector's recorded history, which the scorecard and charts are built from. */
  coverage: Coverage;
}

export const EMPTY_COVERAGE: Coverage = { observations: 0, tickers: 0, firstTs: null, lastTs: null, cycles: 0 };

export function summaryOf(
  results: AssayResult[],
  regime: MarketRegime,
  ts: number | null,
  coverage: Coverage,
): Summary {
  const quotes = results.flatMap((r) => r.quotes);
  const families: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  for (const q of quotes) {
    families[q.family] = (families[q.family] ?? 0) + 1;
    if (q.rejected) rejected[q.rejected] = (rejected[q.rejected] ?? 0) + 1;
  }
  // The phantom premium, restricted to distribution drift. Fractional wrappers are
  // reported separately: mixing a 1:10 unit conversion into this statistic would turn a
  // precise claim about accrued dividends into a meaningless average.
  const effects = quotes
    .filter((q) => !q.rejected && q.multiplierKind === "drift" && Math.abs(q.multiplierEffectBp) > 0)
    .map((q) => Math.abs(q.multiplierEffectBp))
    .sort((a, b) => a - b);
  const at = (p: number) =>
    effects.length ? effects[Math.min(effects.length - 1, Math.floor(effects.length * p))]! : 0;
  return {
    tickers: results.length,
    wrappers: quotes.length,
    families,
    rejected,
    phantomBp: { median: at(0.5), p90: at(0.9), max: effects.at(-1) ?? 0, n: effects.length },
    fractional: quotes.filter((q) => q.multiplierKind === "fractional").length,
    regime,
    ts,
    coverage,
  };
}
