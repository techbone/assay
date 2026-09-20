import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { MarketRegime } from "../binance/types.js";
import type { RawQuote } from "../reference/types.js";

export interface ObservationRow extends RawQuote {
  ts: number;
  contract: string;
  regime: MarketRegime;
}

export interface HeartbeatRow {
  ts: number;
  cycleMs: number;
  tickers: number;
  observations: number;
  errors: number;
  regime: MarketRegime;
}

const SCHEMA = new URL("./schema.sql", import.meta.url);

export class AssayStore {
  readonly db: Database.Database;

  constructor(path = "data/assay.db") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec(readFileSync(SCHEMA, "utf8"));
  }

  close(): void {
    this.db.close();
  }

  /**
   * Last recorded quote for a contract, used to carry staleness forward.
   * Cached per cycle by the collector rather than queried per wrapper.
   */
  lastQuote(contract: string): { price: number; ticksSinceChange: number } | undefined {
    const row = this.db
      .prepare(
        `SELECT price, ticks_since_change AS ticksSinceChange
           FROM observation WHERE contract = ? ORDER BY ts DESC LIMIT 1`,
      )
      .get(contract) as { price: number; ticksSinceChange: number } | undefined;
    return row;
  }

  /** All contracts' most recent price+staleness in one query. */
  lastQuotes(): Map<string, { price: number; ticksSinceChange: number }> {
    const rows = this.db
      .prepare(
        `SELECT o.contract, o.price, o.ticks_since_change AS ticksSinceChange
           FROM observation o
           JOIN (SELECT contract, MAX(ts) AS ts FROM observation GROUP BY contract) m
             ON m.contract = o.contract AND m.ts = o.ts`,
      )
      .all() as Array<{ contract: string; price: number; ticksSinceChange: number }>;
    return new Map(rows.map((r) => [r.contract, { price: r.price, ticksSinceChange: r.ticksSinceChange }]));
  }

  /** Prepared lazily: class fields initialise before the constructor assigns `db`. */
  private _insertObs?: Database.Statement;
  private get insertObs(): Database.Statement {
    return (this._insertObs ??= this.db.prepare(
      `INSERT INTO observation
       (ts, ticker, symbol, contract, family, price, multiplier, list_multiplier,
        reference_price, status_code, holders, bn_trader, volume24h, regime, ticks_since_change)
     VALUES (@ts, @ticker, @symbol, @contract, @family, @price, @multiplier, @listMultiplier,
             @referencePrice, @statusCode, @holders, @bnTrader, @volume24h, @regime, @ticksSinceChange)`,
    ));
  }

  writeObservations(rows: ObservationRow[]): number {
    const tx = this.db.transaction((batch: ObservationRow[]) => {
      for (const r of batch) {
        this.insertObs.run({
          ts: r.ts,
          ticker: r.ticker,
          symbol: r.symbol,
          contract: r.contract,
          family: r.family,
          price: r.price,
          multiplier: r.multiplier,
          listMultiplier: r.listMultiplier ?? null,
          referencePrice: r.referencePrice ?? null,
          statusCode: r.statusCode ?? null,
          holders: r.holders ?? null,
          bnTrader: r.bnTrader ?? null,
          volume24h: r.volume24h ?? null,
          regime: r.regime,
          ticksSinceChange: r.ticksSinceChange ?? 0,
        });
      }
    });
    tx(rows);
    return rows.length;
  }

  writeSession(s: {
    ts: number; marketStatus: string | null; openState: boolean | null;
    reasonCode: string | null; reasonMsg: string | null;
    nextOpenTime?: number | undefined; nextCloseTime?: number | undefined; regime: MarketRegime;
  }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_status
           (ts, market_status, open_state, reason_code, reason_msg, next_open_time, next_close_time, regime)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(s.ts, s.marketStatus, s.openState === null ? null : s.openState ? 1 : 0,
           s.reasonCode, s.reasonMsg, s.nextOpenTime ?? null, s.nextCloseTime ?? null, s.regime);
  }

  writeAssaySnapshots(
    rows: Array<{ ts: number; ticker: string; assayPrice: number; confidenceBp: number;
                  referencePrice: number | null; regime: MarketRegime;
                  acceptedCount: number; quoteCount: number }>,
  ): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO assay_snapshot
         (ts, ticker, assay_price, confidence_bp, reference_price, regime, accepted_count, quote_count)
       VALUES (?,?,?,?,?,?,?,?)`,
    );
    const tx = this.db.transaction((batch: typeof rows) => {
      for (const r of batch) {
        stmt.run(r.ts, r.ticker, r.assayPrice, r.confidenceBp, r.referencePrice,
                 r.regime, r.acceptedCount, r.quoteCount);
      }
    });
    tx(rows);
  }

  writeHeartbeat(h: HeartbeatRow): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO heartbeat (ts, cycle_ms, tickers, observations, errors, regime)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(h.ts, h.cycleMs, h.tickers, h.observations, h.errors, h.regime);
  }

  writeUniverse(ts: number, rows: Array<{ contract: string; ticker: string; symbol: string; family: string; multiplier: number | null }>): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO universe_snapshot (ts, contract, ticker, symbol, family, multiplier)
       VALUES (?,?,?,?,?,?)`,
    );
    const tx = this.db.transaction(() => {
      for (const r of rows) stmt.run(ts, r.contract, r.ticker, r.symbol, r.family, r.multiplier);
    });
    tx();
  }

  /** Coverage statistics — what the scorecard's credibility rests on. */
  coverage(): { observations: number; tickers: number; firstTs: number | null; lastTs: number | null; cycles: number } {
    const o = this.db.prepare(
      `SELECT COUNT(*) AS observations, COUNT(DISTINCT ticker) AS tickers,
              MIN(ts) AS firstTs, MAX(ts) AS lastTs FROM observation`,
    ).get() as { observations: number; tickers: number; firstTs: number | null; lastTs: number | null };
    const c = this.db.prepare(`SELECT COUNT(*) AS cycles FROM heartbeat`).get() as { cycles: number };
    return { ...o, cycles: c.cycles };
  }

  /** Gaps in collection longer than `thresholdMs`. The honest downtime record. */
  gaps(thresholdMs: number): Array<{ from: number; to: number; ms: number }> {
    const ts = (this.db.prepare(`SELECT ts FROM heartbeat ORDER BY ts`).all() as Array<{ ts: number }>)
      .map((r) => r.ts);
    const out: Array<{ from: number; to: number; ms: number }> = [];
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i]! - ts[i - 1]!;
      if (gap > thresholdMs) out.push({ from: ts[i - 1]!, to: ts[i]!, ms: gap });
    }
    return out;
  }
}

/** Maps the venue's status payload onto our three regimes. */
export function regimeOf(marketStatus: string | null | undefined, openState: boolean | null | undefined): MarketRegime {
  if (marketStatus === "closed") return "closed";
  if (marketStatus === "offhours") return "offhours";
  return openState ? "rth" : "offhours";
}
