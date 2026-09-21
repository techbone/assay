import { BinanceRwaClient, groupByTicker } from "../binance/client.js";
import { FAMILY_NAME, type MarketRegime, type UniverseEntry } from "../binance/types.js";
import { assay } from "../reference/engine.js";
import { AssayStore, regimeOf, type ObservationRow } from "../store/db.js";
import { mapPool } from "./pool.js";
import type { RawQuote } from "../reference/types.js";

const num = (s: string | null | undefined): number | undefined => {
  if (s === null || s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export interface CycleResult {
  ts: number;
  regime: MarketRegime;
  tickers: number;
  observations: number;
  errors: number;
  cycleMs: number;
}

export interface CollectorOptions {
  /** Only collect tickers carrying at least this many wrappers. */
  minWrappers?: number;
  /** Re-fetch the universe when the cached copy is older than this. */
  universeTtlMs?: number;
  /** Tickers fetched in parallel. Issue rate is still bounded by the client's gate. */
  concurrency?: number;
}

/**
 * Holds the universe between cycles so a full collection run costs one status call
 * plus one dynamic call per wrapper, rather than re-listing 1921 tokens every minute.
 */
export class Collector {
  private universe: UniverseEntry[] = [];
  private universeAt = 0;

  constructor(
    private readonly client: BinanceRwaClient,
    private readonly store: AssayStore,
    private readonly opts: CollectorOptions = {},
  ) {}

  private async refreshUniverse(now: number): Promise<void> {
    const ttl = this.opts.universeTtlMs ?? 60 * 60 * 1000;
    if (this.universe.length > 0 && now - this.universeAt < ttl) return;
    this.universe = await this.client.universe();
    this.universeAt = now;
    const bsc = this.universe.filter((e) => e.chainId === "56");
    this.store.writeUniverse(
      now,
      bsc.map((e) => ({
        contract: e.contractAddress,
        ticker: e.ticker,
        symbol: e.symbol,
        family: FAMILY_NAME[e.type] ?? `type${e.type}`,
        multiplier: num(e.multiplier) ?? null,
      })),
    );
  }

  async runCycle(now = Date.now()): Promise<CycleResult> {
    const started = Date.now();
    let errors = 0;

    const status = await this.client.marketStatus().catch(() => { errors++; return null; });
    // A null payload is a failed read, not a quiet market. This API returns `data: null`
    // with `success: true` (DEVEX.md #4), so it never throws - it has to be counted here
    // or a degraded cycle looks identical to a healthy one.
    if (status === null) errors++;
    const regime = regimeOf(status?.marketStatus, status?.openState);
    this.store.writeSession({
      ts: now,
      marketStatus: status?.marketStatus ?? null,
      openState: status?.openState ?? null,
      reasonCode: status?.reasonCode ?? null,
      reasonMsg: status?.reasonMsg ?? null,
      nextOpenTime: status?.nextOpenTime,
      nextCloseTime: status?.nextCloseTime,
      regime,
    });

    await this.refreshUniverse(now).catch(() => { errors++; });

    const minWrappers = this.opts.minWrappers ?? 2;
    const byTicker = [...groupByTicker(this.universe).entries()]
      .filter(([, ws]) => ws.length >= minWrappers);

    // One query for every contract's previous quote: staleness must not cost N round trips.
    const previous = this.store.lastQuotes();
    let collected = 0;

    let observations = 0;

    // Written per ticker rather than batched at the end: a full market cycle takes tens of
    // seconds, and a crash partway through must not discard everything collected so far.
    await mapPool(byTicker, this.opts.concurrency ?? 4, async ([ticker, wrappers]) => {
      const quotes: RawQuote[] = [];
      const rows: ObservationRow[] = [];

      for (const w of wrappers) {
        const d = await this.client.dynamic(w.contractAddress).catch(() => { errors++; return null; });
        const ti = d?.tokenInfo, si = d?.stockInfo, st = d?.statusInfo;
        const price = num(ti?.price), multiplier = num(ti?.sharesMultiplier);
        if (price === undefined || multiplier === undefined) continue;

        const prev = previous.get(w.contractAddress);
        const ticksSinceChange = prev === undefined ? 0 : prev.price === price ? prev.ticksSinceChange + 1 : 0;

        const q: RawQuote = {
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
          ticksSinceChange,
        };
        quotes.push(q);
        rows.push({ ...q, ts: now, contract: w.contractAddress, regime });
      }

      if (rows.length === 0) return;
      this.store.writeObservations(rows);
      observations += rows.length;

      const r = assay(ticker, quotes, regime);
      this.store.writeAssaySnapshots([{
        ts: now,
        ticker,
        assayPrice: r.assayPrice,
        confidenceBp: r.confidenceBp,
        referencePrice: r.referencePrice,
        regime,
        acceptedCount: r.accepted.length,
        quoteCount: r.quotes.length,
      }]);
      collected++;
    });

    const cycleMs = Date.now() - started;
    this.store.writeHeartbeat({ ts: now, cycleMs, tickers: collected, observations, errors, regime });

    return { ts: now, regime, tickers: collected, observations, errors, cycleMs };
  }
}
