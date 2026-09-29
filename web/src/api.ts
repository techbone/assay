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
  regime: Regime; wrappers: number; accepted: number;
  /** Not rejected, and trust >= 0.5 - the same bar the buy router uses. */
  trusted: number;
  /** Largest dividend-drift phantom premium among trusted wrappers. */
  phantomBp: number;
  /** Wrappers whose multiplier is a unit conversion, e.g. 1 token = 10 shares. */
  fractional: Array<{ symbol: string; multiplier: number }>;
  realSpreadBp: number;
  families: string[];
}

export interface Summary {
  tickers: number; wrappers: number;
  families: Record<string, number>; rejected: Record<string, number>;
  phantomBp: { median: number; p90: number; max: number; n: number };
  fractional: number; regime: Regime; ts: number | null;
  coverage: { observations: number; tickers: number; firstTs: number | null; lastTs: number | null; cycles: number };
  phantomLeader: { ticker: string; symbol: string; phantomBp: number; trueBasisBp: number } | null;
}

export interface TickerScore {
  ticker: string; openTs: number; markTs: number; actualOpen: number;
  estimates: Record<string, number>; errorsBp: Record<string, number>;
}

export interface EstimatorSummary {
  estimator: string; maeBp: number; medianBp: number; p90Bp: number; n: number;
}

export interface ScorecardPayload {
  /** Last collector cycle behind these scores; the scorecard is recorded, not live. */
  recordedThrough: number | null;
  overall: { events: number; tickers: number; summary: EstimatorSummary[] };
  events: Array<{ openTs: number; markTs: number; previousRegime: Regime;
                  scores: TickerScore[]; summary: EstimatorSummary[] }>;
}

export interface Leg {
  symbol: string; family: string; contract: string; multiplier: number; quotedPrice: number;
  trust: number; rejected: string | null;
  shares: number | null; costPerShare: number | null; premiumBp: number | null; excluded: string | null;
}

export interface BestExecution {
  ticker: string; spend: number; assayPrice: number; quoteKind: "executable" | "indicative";
  legs: Leg[]; best: Leg | null;
  naivePick: Leg | null; naiveVerdict: "agrees" | "excluded" | "worse" | "none";
  naiveShortfallShares: number | null;
  multiplierBlindPick: Leg | null; multiplierBlindShortfallShares: number | null;
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
 * One API, two backends with identical shapes: in production a serverless function that
 * prices every request live from Binance and relays the collector's recorded history; in
 * local development the SQLite-backed server. The site cannot tell them apart.
 */
const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
};

export const api = {
  summary: () => get<Summary>("/api/summary"),
  tickers: () => get<TickerRow[]>("/api/tickers"),
  ticker: (t: string) => get<TickerDetail>(`/api/ticker/${encodeURIComponent(t)}`),
  history: (t: string, hours = 48) => get<HistorySeries>(`/api/history/${encodeURIComponent(t)}?hours=${hours}`),
  scorecard: () => get<ScorecardPayload>("/api/scorecard"),
  buy: (t: string, spend: number) =>
    get<BestExecution>(`/api/buy/${encodeURIComponent(t)}?spend=${encodeURIComponent(spend)}`),
};

export const REGIME_LABEL: Record<Regime, string> = {
  rth: "Regular hours", premarket: "Pre-market", afterhours: "After hours",
  overnight: "Overnight", offhours: "Off hours", closed: "Closed", unknown: "Unknown",
};
