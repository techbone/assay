import type { MarketRegime } from "../binance/types.js";
import { assay, median } from "../reference/engine.js";
import type { RawQuote } from "../reference/types.js";

/**
 * The scorecard answers one falsifiable question: at the moment the US tape opens, whose
 * estimate of the opening price was closest?
 *
 * An earlier design framed this as "the tape is frozen, we extend it". That premise was
 * wrong - the venue's `stockInfo.price` moves continuously through overnight and premarket
 * (78 changes across 89 premarket samples on NVDA). So the interesting comparison is not
 * against a frozen number, it is against the other estimates a user could actually have
 * formed from the same data:
 *
 *   raw_median    - median of quoted prices, ignoring sharesMultiplier entirely.
 *                   This is what a naive cross-wrapper dashboard shows.
 *   adj_median    - median of multiplier-adjusted prices, no trust weighting, no rejection.
 *                   Isolates the value of normalization alone.
 *   assay         - trust-weighted, validated. The full engine.
 *   venue_ref     - the venue's own pre-open reference price.
 *   <wrapper>     - each individual wrapper, adjusted. Tests "just pick one venue".
 *
 * Scoring `assay` against `adj_median` isolates what trust weighting is worth; against
 * `raw_median`, what normalization is worth.
 */
export const ESTIMATORS = ["raw_median", "adj_median", "assay", "venue_ref"] as const;
export type Estimator = string;

export interface OpenEvent {
  /** First observation timestamp inside the new regular session. */
  openTs: number;
  /** Last cycle before the open, whose quotes form every estimate. */
  markTs: number;
  previousRegime: MarketRegime;
}

export interface TickerScore {
  ticker: string;
  openTs: number;
  markTs: number;
  /** Reference price at the first regular-hours tick. */
  actualOpen: number;
  estimates: Record<Estimator, number>;
  errorsBp: Record<Estimator, number>;
}

export interface ScorecardSummary {
  estimator: Estimator;
  /** Mean absolute error in basis points. */
  maeBp: number;
  medianBp: number;
  p90Bp: number;
  n: number;
}

/** Every estimate derivable from one pre-open snapshot of a ticker's wrappers. */
export function estimatesFrom(
  ticker: string,
  quotes: RawQuote[],
  regime: MarketRegime,
): Record<Estimator, number> {
  const out: Record<Estimator, number> = {};

  const raw = quotes.map((q) => q.price).filter(Number.isFinite);
  if (raw.length) out["raw_median"] = median(raw);

  const adj = quotes.map((q) => q.price / q.multiplier).filter(Number.isFinite);
  if (adj.length) out["adj_median"] = median(adj);

  const r = assay(ticker, quotes, regime);
  if (Number.isFinite(r.assayPrice)) out["assay"] = r.assayPrice;

  const ref = quotes.find((q) => q.referencePrice && q.referencePrice > 0)?.referencePrice;
  if (ref) out["venue_ref"] = ref;

  // Each wrapper on its own, so "just use Ondo" is a measurable alternative rather
  // than an argument.
  for (const q of quotes) {
    const a = q.price / q.multiplier;
    if (Number.isFinite(a)) out[`only_${q.family}`] = a;
  }

  return out;
}

export function scoreOne(
  ticker: string,
  quotes: RawQuote[],
  regime: MarketRegime,
  actualOpen: number,
  openTs: number,
  markTs: number,
): TickerScore | null {
  if (!Number.isFinite(actualOpen) || actualOpen <= 0) return null;
  const estimates = estimatesFrom(ticker, quotes, regime);
  const errorsBp: Record<Estimator, number> = {};
  for (const [k, v] of Object.entries(estimates)) {
    errorsBp[k] = (v / actualOpen - 1) * 10_000;
  }
  return { ticker, openTs, markTs, actualOpen, estimates, errorsBp };
}

/** Aggregates per-ticker errors into a leaderboard, best first. */
export function summarize(scores: TickerScore[]): ScorecardSummary[] {
  const byEstimator = new Map<Estimator, number[]>();
  for (const s of scores) {
    for (const [k, v] of Object.entries(s.errorsBp)) {
      if (!Number.isFinite(v)) continue;
      const list = byEstimator.get(k);
      if (list) list.push(Math.abs(v));
      else byEstimator.set(k, [Math.abs(v)]);
    }
  }
  const pct = (xs: number[], p: number) =>
    xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]! : NaN;

  return [...byEstimator.entries()]
    .map(([estimator, errs]) => ({
      estimator,
      maeBp: errs.reduce((a, b) => a + b, 0) / errs.length,
      medianBp: pct(errs, 0.5),
      p90Bp: pct(errs, 0.9),
      n: errs.length,
    }))
    .sort((a, b) => a.maeBp - b.maeBp);
}
