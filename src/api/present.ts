import type { MarketRegime } from "../binance/types.js";
import type { AssayResult } from "../reference/types.js";
import { MIN_TRUST_INDICATIVE } from "../route/best.js";

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
  regime: MarketRegime; wrappers: number; accepted: number;
  /**
   * Tokens trustworthy enough to act on: not rejected, and trust at or above the bar the
   * buy router uses. `accepted` alone also counts thin tokens the engine keeps at near-zero
   * weight - calling those "trusted" contradicted the site's own buy panel.
   */
  trusted: number;
  /**
   * The largest phantom premium among trusted wrappers: the part of an apparent premium that
   * is only reinvested dividends in the multiplier. Drift only - a 1:10 unit token is not a
   * premium, and ranking it as +90000bp buried the real signal at the top of the table.
   */
  phantomBp: number;
  /** Wrappers whose multiplier is a unit conversion (1:10, 1:4...) rather than drift. */
  fractional: Array<{ symbol: string; multiplier: number }>;
  /** How far the trusted wrappers disagree once normalized, in basis points. */
  realSpreadBp: number;
  families: string[];
}

export function tickerRows(results: AssayResult[]): TickerRow[] {
  return results
    .map((r) => {
      const kept = r.quotes.filter((x) => !x.rejected);
      const trusted = kept.filter((x) => x.trust >= MIN_TRUST_INDICATIVE);
      const phantom = kept
        .filter((x) => x.multiplierKind === "drift")
        .reduce((a, x) => (Math.abs(x.multiplierEffectBp) > Math.abs(a) ? x.multiplierEffectBp : a), 0);
      const adj = trusted.map((x) => x.adjusted).filter((v) => v > 0);
      const realSpreadBp = adj.length > 1 ? (Math.max(...adj) / Math.min(...adj) - 1) * 10_000 : 0;
      return {
        ticker: r.ticker, assayPrice: r.assayPrice, confidenceBp: r.confidenceBp,
        referencePrice: r.referencePrice, regime: r.regime,
        wrappers: r.quotes.length, accepted: r.accepted.length, trusted: trusted.length,
        phantomBp: phantom,
        fractional: r.quotes
          .filter((x) => x.multiplierKind === "fractional")
          .map((x) => ({ symbol: x.symbol, multiplier: x.multiplier })),
        realSpreadBp,
        families: [...new Set(r.quotes.map((x) => x.family))],
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
  /** The wrapper with the largest phantom premium, and how much of it is real. */
  phantomLeader: { ticker: string; symbol: string; phantomBp: number; trueBasisBp: number } | null;
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
  const leader = quotes
    .filter((q) => !q.rejected && q.multiplierKind === "drift")
    .sort((a, b) => Math.abs(b.multiplierEffectBp) - Math.abs(a.multiplierEffectBp))[0];
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
    phantomLeader: leader
      ? { ticker: leader.ticker, symbol: leader.symbol, phantomBp: leader.multiplierEffectBp, trueBasisBp: leader.trueBasisBp }
      : null,
  };
}
