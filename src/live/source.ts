import { BinanceRwaClient, BSC_CHAIN_ID } from "../binance/client.js";
import { FAMILY_NAME, type MarketRegime, type UniverseEntry } from "../binance/types.js";
import { mapPool } from "../collector/pool.js";
import { assay } from "../reference/engine.js";
import type { AssayResult, RawQuote } from "../reference/types.js";
import { regimeOf } from "../store/regime.js";

const num = (s: string | null | undefined): number | undefined => {
  if (s === null || s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** Small TTL cache; lives as long as the warm function instance does. */
class Cached<T> {
  private value: T | undefined;
  private at = 0;
  private pending: Promise<T> | undefined;
  constructor(private readonly ttlMs: number, private readonly load: () => Promise<T>) {}
  async get(now = Date.now()): Promise<T> {
    if (this.value !== undefined && now - this.at < this.ttlMs) return this.value;
    // Concurrent callers share one upstream fetch instead of stampeding Binance.
    this.pending ??= this.load().then(
      (v) => { this.value = v; this.at = Date.now(); this.pending = undefined; return v; },
      (e) => { this.pending = undefined; throw e; },
    );
    return this.pending;
  }
}

/**
 * Stateless, on-demand pricing: every request is answered from a fresh read of the
 * Binance RWA API through the same engine the collector and the tests use.
 *
 * What it cannot know is history. Staleness (`ticksSinceChange`) needs consecutive
 * observations, so live quotes are scored as fresh; a dead quote is still held down by
 * its liquidity-driven trust score and the outlier rule, just not rejected as STALE.
 */
export class LiveSource {
  private readonly universe: Cached<Map<string, UniverseEntry[]>>;
  private readonly status: Cached<MarketRegime>;
  private readonly all: Cached<{ ts: number; results: AssayResult[] }>;

  constructor(
    private readonly client: BinanceRwaClient,
    opts: { concurrency?: number; latestTtlMs?: number } = {},
  ) {
    this.universe = new Cached(60 * 60_000, async () => {
      const out = new Map<string, UniverseEntry[]>();
      for (const e of await this.client.universe()) {
        if (e.chainId !== BSC_CHAIN_ID) continue;
        const list = out.get(e.ticker);
        if (list) list.push(e); else out.set(e.ticker, [e]);
      }
      for (const [t, ws] of out) if (ws.length < 2) out.delete(t);
      return out;
    });
    this.status = new Cached(60_000, async () => {
      const s = await this.client.marketStatus().catch(() => null);
      return regimeOf(s?.marketStatus, s?.openState);
    });
    const concurrency = opts.concurrency ?? 12;
    this.all = new Cached(opts.latestTtlMs ?? 60_000, async () => {
      const [u, regime] = await Promise.all([this.universe.get(), this.status.get()]);
      const entries = [...u.entries()];
      const results = await mapPool(entries, concurrency, ([t, ws]) => this.price(t, ws, regime));
      return { ts: Date.now(), results: results.filter((r): r is AssayResult => r !== null) };
    });
  }

  async regime(): Promise<MarketRegime> {
    return this.status.get();
  }

  private async price(ticker: string, wrappers: UniverseEntry[], regime: MarketRegime): Promise<AssayResult | null> {
    const payloads = await Promise.all(
      wrappers.map((w) => this.client.dynamic(w.contractAddress).catch(() => null)),
    );
    const quotes: RawQuote[] = [];
    payloads.forEach((d, i) => {
      const w = wrappers[i]!;
      const ti = d?.tokenInfo, si = d?.stockInfo, st = d?.statusInfo;
      const price = num(ti?.price), multiplier = num(ti?.sharesMultiplier);
      if (!d || price === undefined || multiplier === undefined) return;
      quotes.push({
        symbol: d.symbol,
        ticker,
        family: FAMILY_NAME[d.type] ?? `type${d.type}`,
        price,
        multiplier,
        listMultiplier: num(w.multiplier),
        referencePrice: num(si?.price),
        statusCode: st?.reasonCode ?? undefined,
        holders: num(ti?.totalHolders),
        bnTrader: num(ti?.bnTrader),
        volume24h: num(ti?.volume24h),
      });
    });
    return quotes.length ? assay(ticker, quotes, regime) : null;
  }

  /** One ticker, fetched fresh. */
  async ticker(ticker: string): Promise<AssayResult | null> {
    const t = ticker.toUpperCase();
    const [u, regime] = await Promise.all([this.universe.get(), this.status.get()]);
    const wrappers = u.get(t);
    return wrappers ? this.price(t, wrappers, regime) : null;
  }

  /** Contract address per wrapper symbol, for routing a buy. */
  async contracts(ticker: string): Promise<Record<string, string>> {
    const ws = (await this.universe.get()).get(ticker.toUpperCase()) ?? [];
    return Object.fromEntries(ws.map((w) => [w.symbol, w.contractAddress]));
  }

  /** Every multi-wrapper ticker. Shared across callers for `latestTtlMs`. */
  async latest(): Promise<{ ts: number; results: AssayResult[] }> {
    return this.all.get();
  }
}
