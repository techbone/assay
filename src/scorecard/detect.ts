import type { MarketRegime } from "../binance/types.js";
import type { RawQuote } from "../reference/types.js";
import type { AssayStore } from "../store/db.js";
import { scoreOne, summarize, type ScorecardSummary, type TickerScore } from "./score.js";

interface ObsRow {
  ts: number; ticker: string; symbol: string; family: string;
  price: number; multiplier: number; list_multiplier: number | null;
  reference_price: number | null; status_code: string | null;
  holders: number | null; bn_trader: number | null; volume24h: number | null;
  regime: MarketRegime; ticks_since_change: number;
}

const toQuote = (r: ObsRow): RawQuote => ({
  symbol: r.symbol, ticker: r.ticker, family: r.family,
  price: r.price, multiplier: r.multiplier,
  listMultiplier: r.list_multiplier ?? undefined,
  referencePrice: r.reference_price ?? undefined,
  statusCode: r.status_code ?? undefined,
  holders: r.holders ?? undefined,
  bnTrader: r.bn_trader ?? undefined,
  volume24h: r.volume24h ?? undefined,
  ticksSinceChange: r.ticks_since_change,
});

export interface OpenEventScores {
  openTs: number;
  markTs: number;
  previousRegime: MarketRegime;
  scores: TickerScore[];
  summary: ScorecardSummary[];
}

export class Scorecard {
  constructor(private readonly store: AssayStore) {}
  private get db() { return this.store.db; }

  /**
   * Cycles where the regular session begins: the first collected cycle in `rth` whose
   * predecessor was any other regime. A gap in collection that straddles an open makes
   * that open unscoreable, and it is simply absent rather than approximated.
   */
  openEvents(): Array<{ openTs: number; markTs: number; previousRegime: MarketRegime }> {
    const cycles = this.db
      .prepare(`SELECT DISTINCT ts, regime FROM observation ORDER BY ts`)
      .all() as Array<{ ts: number; regime: MarketRegime }>;

    const out: Array<{ openTs: number; markTs: number; previousRegime: MarketRegime }> = [];
    for (let i = 1; i < cycles.length; i++) {
      const cur = cycles[i]!, prev = cycles[i - 1]!;
      if (cur.regime === "rth" && prev.regime !== "rth") {
        out.push({ openTs: cur.ts, markTs: prev.ts, previousRegime: prev.regime });
      }
    }
    return out;
  }

  /** Scores one open event across every ticker that has both a mark and an opening price. */
  scoreEvent(openTs: number, markTs: number, previousRegime: MarketRegime): OpenEventScores {
    const markRows = this.db.prepare(`SELECT * FROM observation WHERE ts = ?`).all(markTs) as ObsRow[];
    const openRows = this.db.prepare(`SELECT * FROM observation WHERE ts = ?`).all(openTs) as ObsRow[];

    const opening = new Map<string, number>();
    for (const r of openRows) {
      if (r.reference_price && r.reference_price > 0 && !opening.has(r.ticker)) {
        opening.set(r.ticker, r.reference_price);
      }
    }

    const byTicker = new Map<string, ObsRow[]>();
    for (const r of markRows) {
      const list = byTicker.get(r.ticker);
      if (list) list.push(r); else byTicker.set(r.ticker, [r]);
    }

    const scores: TickerScore[] = [];
    for (const [ticker, rows] of byTicker) {
      const actualOpen = opening.get(ticker);
      if (actualOpen === undefined) continue;
      const s = scoreOne(ticker, rows.map(toQuote), previousRegime, actualOpen, openTs, markTs);
      if (s) scores.push(s);
    }

    return { openTs, markTs, previousRegime, scores, summary: summarize(scores) };
  }

  /** Every scoreable open, newest first. */
  all(): OpenEventScores[] {
    return this.openEvents()
      .map((e) => this.scoreEvent(e.openTs, e.markTs, e.previousRegime))
      .filter((e) => e.scores.length > 0)
      .reverse();
  }

  /** Leaderboard pooled across every scored open. */
  overall(): { events: number; tickers: number; summary: ScorecardSummary[] } {
    const events = this.all();
    const pooled = events.flatMap((e) => e.scores);
    return {
      events: events.length,
      tickers: new Set(pooled.map((s) => s.ticker)).size,
      summary: summarize(pooled),
    };
  }
}
