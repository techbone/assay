export type Regime = "rth" | "premarket" | "afterhours" | "overnight" | "offhours" | "closed" | "unknown";

export interface Quote {
  symbol: string; family: string; price: number; multiplier: number;
  adjusted: number; trust: number; rejected: string | null;
  naiveBasisBp: number; trueBasisBp: number; multiplierEffectBp: number;
  multiplierKind: "unit" | "drift" | "fractional";
  holders?: number; bnTrader?: number; ticksSinceChange?: number;
}

export interface TickerDetail {
  ticker: string; assayPrice: number; confidenceBp: number;
  referencePrice: number | null; regime: Regime;
  quotes: Quote[]; accepted: Quote[];
}

export interface TickerRow {
  ticker: string; assayPrice: number; confidenceBp: number; referencePrice: number | null;
  regime: Regime; wrappers: number; accepted: number; phantomBp: number; families: string[];
}

export interface Summary {
  tickers: number; wrappers: number;
  families: Record<string, number>; rejected: Record<string, number>;
  phantomBp: { median: number; p90: number; max: number; n: number };
  fractional: number; regime: Regime; ts: number | null;
  coverage: { observations: number; tickers: number; firstTs: number | null; lastTs: number | null; cycles: number };
}

export interface TickerScore {
  ticker: string; openTs: number; markTs: number; actualOpen: number;
  estimates: Record<string, number>; errorsBp: Record<string, number>;
}

export interface EstimatorSummary {
  estimator: string; maeBp: number; medianBp: number; p90Bp: number; n: number;
}

export interface ScorecardPayload {
  overall: { events: number; tickers: number; summary: EstimatorSummary[] };
  events: Array<{ openTs: number; markTs: number; previousRegime: Regime;
                  scores: TickerScore[]; summary: EstimatorSummary[] }>;
}

/** Columnar: every series is aligned to `ts` by position. */
export interface HistorySeries {
  ts: number[];
  regime: Regime[];
  assay: number[];
  conf: number[];
  ref: (number | null)[];
  wrappers: Array<{
    symbol: string; family: string;
    naive: (number | null)[]; adj: (number | null)[]; mult: (number | null)[];
    trust: (number | null)[]; rej: (string | null)[];
  }>;
}

/**
 * Two data sources, same shapes.
 *
 * In production the site is static and reads JSON snapshots published by the collector, so
 * the judge-facing URL stays up regardless of where (or whether) the collector is running.
 * In local development it talks to the live API instead. `VITE_DATA_BASE` selects.
 */
const DATA_BASE: string = (import.meta.env?.VITE_DATA_BASE as string | undefined) ?? "";
const STATIC = DATA_BASE.length > 0;

const get = async <T>(path: string): Promise<T> => {
  // Cache-bust so a CDN never pins judges to a stale snapshot.
  const url = STATIC ? `${DATA_BASE}${path}?v=${Math.floor(Date.now() / 60_000)}` : path;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
};

export interface Meta {
  generatedAt: number;
  lastCycleTs: number | null;
  coverage: { observations: number; tickers: number; firstTs: number | null; lastTs: number | null; cycles: number };
  historyTickers: string[];
}

export const isStatic = STATIC;

export const api = {
  summary: () => get<Summary>(STATIC ? "/summary.json" : "/api/summary"),
  tickers: () => get<TickerRow[]>(STATIC ? "/tickers.json" : "/api/tickers"),
  ticker: (t: string) =>
    get<TickerDetail>(STATIC ? `/ticker/${t.toUpperCase()}.json` : `/api/ticker/${t}`),
  history: (t: string, hours = 24) =>
    get<HistorySeries>(STATIC ? `/history/${t.toUpperCase()}.json` : `/api/history/${t}?hours=${hours}`),
  scorecard: () => get<ScorecardPayload>(STATIC ? "/scorecard.json" : "/api/scorecard"),
  meta: () => get<Meta>(STATIC ? "/meta.json" : "/api/health"),
};

export const REGIME_LABEL: Record<Regime, string> = {
  rth: "Regular hours", premarket: "Pre-market", afterhours: "After hours",
  overnight: "Overnight", offhours: "Off hours", closed: "Closed", unknown: "Unknown",
};
