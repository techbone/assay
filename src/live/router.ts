import { EMPTY_COVERAGE, summaryOf, tickerRows, type Coverage } from "../api/present.js";
import type { LiveSource } from "./source.js";
import type { Recorded } from "./recorded.js";

export interface RouteResult {
  status: number;
  body: unknown;
  /** Seconds the CDN may serve this before revalidating. 0 means never cache. */
  maxAge: number;
}

interface Meta { lastCycleTs: number | null; coverage: Coverage }

const TICKER = /^[A-Za-z0-9.\-]{1,15}$/;

/**
 * The serverless API. Same paths and shapes as the local SQLite-backed server, so the
 * site runs unchanged against either - live prices here, recorded history relayed.
 */
export async function route(path: string, live: LiveSource, recorded: Recorded): Promise<RouteResult> {
  const p = path.replace(/^\/+/, "").replace(/\/+$/, "");

  if (p === "summary") {
    const [{ ts, results }, regime, meta] = await Promise.all([
      live.latest(), live.regime(), recorded.get<Meta>("/meta.json"),
    ]);
    return { status: 200, body: summaryOf(results, regime, ts, meta?.coverage ?? EMPTY_COVERAGE), maxAge: 60 };
  }

  if (p === "tickers") {
    const { results } = await live.latest();
    return { status: 200, body: tickerRows(results), maxAge: 60 };
  }

  const t = /^ticker\/(.+)$/.exec(p)?.[1];
  if (t !== undefined) {
    if (!TICKER.test(t)) return { status: 400, body: { error: "bad ticker" }, maxAge: 0 };
    const r = await live.ticker(t);
    return r
      ? { status: 200, body: r, maxAge: 30 }
      : { status: 404, body: { error: "unknown ticker" }, maxAge: 300 };
  }

  const h = /^history\/(.+)$/.exec(p)?.[1];
  if (h !== undefined) {
    if (!TICKER.test(h)) return { status: 400, body: { error: "bad ticker" }, maxAge: 0 };
    const series = await recorded.get(`/history/${h.toUpperCase()}.json`);
    return series
      ? { status: 200, body: series, maxAge: 120 }
      : { status: 404, body: { error: "no recorded history for this ticker" }, maxAge: 300 };
  }

  if (p === "scorecard") {
    const sc = await recorded.get<Record<string, unknown>>("/scorecard.json");
    return {
      status: 200,
      body: sc ?? { overall: { events: 0, tickers: 0, summary: [] }, events: [], recordedThrough: null },
      maxAge: 120,
    };
  }

  if (p === "sessions") {
    return { status: 200, body: (await recorded.get("/sessions.json")) ?? [], maxAge: 120 };
  }

  if (p === "health") {
    const [regime, meta] = await Promise.all([live.regime(), recorded.get<Meta>("/meta.json")]);
    const lastCycle = meta?.lastCycleTs ?? null;
    return {
      status: regime === "unknown" ? 503 : 200,
      body: {
        ok: regime !== "unknown",
        live: { reachable: regime !== "unknown", regime },
        recorded: {
          lastCycleTs: lastCycle,
          ageMin: lastCycle ? (Date.now() - lastCycle) / 60_000 : null,
          coverage: meta?.coverage ?? EMPTY_COVERAGE,
        },
      },
      maxAge: 0,
    };
  }

  return { status: 404, body: { error: "not found" }, maxAge: 0 };
}
