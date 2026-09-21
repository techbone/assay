import type { MarketRegime } from "../binance/types.js";
import { assay } from "../reference/engine.js";
import type { AssayResult, RawQuote } from "../reference/types.js";
import type { AssayStore } from "../store/db.js";

interface ObsRow {
  ts: number; ticker: string; symbol: string; contract: string; family: string;
  price: number; multiplier: number; list_multiplier: number | null;
  reference_price: number | null; status_code: string | null;
  holders: number | null; bn_trader: number | null; volume24h: number | null;
  regime: string; ticks_since_change: number;
}

const toQuote = (r: ObsRow): RawQuote => ({
  symbol: r.symbol,
  ticker: r.ticker,
  family: r.family,
  price: r.price,
  multiplier: r.multiplier,
  listMultiplier: r.list_multiplier ?? undefined,
  referencePrice: r.reference_price ?? undefined,
  statusCode: r.status_code ?? undefined,
  holders: r.holders ?? undefined,
  bnTrader: r.bn_trader ?? undefined,
  volume24h: r.volume24h ?? undefined,
  ticksSinceChange: r.ticks_since_change,
});

/**
 * Read layer. Every figure the UI shows is recomputed through the engine rather than
 * read from a derived column, so the site can never disagree with the tests.
 */
export class Queries {
  constructor(private readonly store: AssayStore) {}

  private get db() { return this.store.db; }

  /**
   * Most recent *complete* cycle.
   *
   * The collector writes each ticker as it finishes, so MAX(ts) on observations is a
   * cycle still in flight and covers only the tickers polled so far. The heartbeat row
   * is written once the cycle ends, which makes it the reliable completion marker.
   */
  latestTs(): number | null {
    const r = this.db.prepare(`SELECT MAX(ts) AS ts FROM heartbeat`).get() as { ts: number | null };
    if (r.ts !== null) return r.ts;
    const o = this.db.prepare(`SELECT MAX(ts) AS ts FROM observation`).get() as { ts: number | null };
    return o.ts;
  }

  regimeAt(ts: number): MarketRegime {
    const r = this.db
      .prepare(`SELECT regime FROM session_status WHERE ts <= ? ORDER BY ts DESC LIMIT 1`)
      .get(ts) as { regime: MarketRegime } | undefined;
    return r?.regime ?? "unknown";
  }

  /** Every ticker's current state, engine-computed. */
  latest(): AssayResult[] {
    const ts = this.latestTs();
    if (ts === null) return [];
    const rows = this.db.prepare(`SELECT * FROM observation WHERE ts = ?`).all(ts) as ObsRow[];
    const regime = this.regimeAt(ts);
    const byTicker = new Map<string, ObsRow[]>();
    for (const r of rows) {
      const list = byTicker.get(r.ticker);
      if (list) list.push(r); else byTicker.set(r.ticker, [r]);
    }
    return [...byTicker.entries()].map(([t, rs]) => assay(t, rs.map(toQuote), regime));
  }

  /** One ticker's current state. */
  ticker(ticker: string): AssayResult | null {
    const ts = this.latestTs();
    if (ts === null) return null;
    const rows = this.db
      .prepare(`SELECT * FROM observation WHERE ts = ? AND ticker = ?`)
      .all(ts, ticker.toUpperCase()) as ObsRow[];
    if (rows.length === 0) return null;
    return assay(ticker.toUpperCase(), rows.map(toQuote), this.regimeAt(ts));
  }

  /**
   * Basis history for one ticker: for each cycle, the assay price plus each wrapper's
   * naive and adjusted basis. This is the series behind the hero chart - the gap between
   * the two lines is the phantom premium.
   */
  history(ticker: string, hours = 24, maxPoints = 600): Array<{
    ts: number; regime: MarketRegime; assayPrice: number; confidenceBp: number;
    referencePrice: number | null;
    wrappers: Array<{ symbol: string; family: string; naiveBasisBp: number; trueBasisBp: number;
                      multiplierEffectBp: number; trust: number; rejected: string | null }>;
  }> {
    const since = Date.now() - hours * 3_600_000;
    const rows = this.db
      .prepare(`SELECT * FROM observation WHERE ticker = ? AND ts >= ? ORDER BY ts`)
      .all(ticker.toUpperCase(), since) as ObsRow[];
    if (rows.length === 0) return [];

    const byTs = new Map<number, ObsRow[]>();
    for (const r of rows) {
      const list = byTs.get(r.ts);
      if (list) list.push(r); else byTs.set(r.ts, [r]);
    }

    // Downsample by dropping whole cycles, never by averaging: an averaged basis would
    // smooth away exactly the dislocations this chart exists to show.
    const stamps = [...byTs.keys()].sort((a, b) => a - b);
    const step = Math.max(1, Math.ceil(stamps.length / maxPoints));
    const picked = stamps.filter((_, i) => i % step === 0 || i === stamps.length - 1);

    const regimes = this.db
      .prepare(`SELECT ts, regime FROM session_status WHERE ts >= ? ORDER BY ts`)
      .all(since) as Array<{ ts: number; regime: MarketRegime }>;
    const regimeAt = (ts: number): MarketRegime => {
      let out: MarketRegime = "unknown";
      for (const r of regimes) { if (r.ts <= ts) out = r.regime; else break; }
      return out;
    };

    return picked.map((ts) => {
      const regime = regimeAt(ts);
      const r = assay(ticker.toUpperCase(), byTs.get(ts)!.map(toQuote), regime);
      return {
        ts, regime,
        assayPrice: r.assayPrice,
        confidenceBp: r.confidenceBp,
        referencePrice: r.referencePrice,
        wrappers: r.quotes.map((q) => ({
          symbol: q.symbol, family: q.family,
          naiveBasisBp: q.naiveBasisBp, trueBasisBp: q.trueBasisBp,
          multiplierEffectBp: q.multiplierEffectBp, trust: q.trust, rejected: q.rejected,
        })),
      };
    });
  }

  /** Headline figures for the landing page. */
  summary(): {
    tickers: number; wrappers: number; families: Record<string, number>;
    rejected: Record<string, number>;
    phantomBp: { median: number; p90: number; max: number; n: number };
    fractional: number;
    regime: MarketRegime; ts: number | null; coverage: ReturnType<AssayStore["coverage"]>;
  } {
    const results = this.latest();
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
    const at = (p: number) => (effects.length ? effects[Math.min(effects.length - 1, Math.floor(effects.length * p))]! : 0);
    const ts = this.latestTs();
    return {
      tickers: results.length,
      wrappers: quotes.length,
      families,
      rejected,
      phantomBp: { median: at(0.5), p90: at(0.9), max: effects.at(-1) ?? 0, n: effects.length },
      fractional: quotes.filter((q) => q.multiplierKind === "fractional").length,
      regime: ts === null ? "unknown" : this.regimeAt(ts),
      ts,
      coverage: this.store.coverage(),
    };
  }

  /** Regime transitions, for the session ribbon. */
  sessions(hours = 48): Array<{ from: number; to: number; regime: MarketRegime }> {
    const since = Date.now() - hours * 3_600_000;
    const rows = this.db
      .prepare(`SELECT ts, regime FROM session_status WHERE ts >= ? ORDER BY ts`)
      .all(since) as Array<{ ts: number; regime: MarketRegime }>;
    const out: Array<{ from: number; to: number; regime: MarketRegime }> = [];
    for (const r of rows) {
      const last = out.at(-1);
      if (last && last.regime === r.regime) last.to = r.ts;
      else out.push({ from: r.ts, to: r.ts, regime: r.regime });
    }
    return out;
  }
}
