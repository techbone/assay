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

export interface HistoryPoint {
  ts: number; regime: Regime; assayPrice: number; confidenceBp: number; referencePrice: number | null;
  wrappers: Array<{ symbol: string; family: string; naiveBasisBp: number; trueBasisBp: number;
                    multiplierEffectBp: number; trust: number; rejected: string | null }>;
}

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
};

export const api = {
  summary: () => get<Summary>("/api/summary"),
  tickers: () => get<TickerRow[]>("/api/tickers"),
  ticker: (t: string) => get<TickerDetail>(`/api/ticker/${t}`),
  history: (t: string, hours = 24) => get<HistoryPoint[]>(`/api/history/${t}?hours=${hours}`),
};

export const REGIME_LABEL: Record<Regime, string> = {
  rth: "Regular hours", premarket: "Pre-market", afterhours: "After hours",
  overnight: "Overnight", offhours: "Off hours", closed: "Closed", unknown: "Unknown",
};
