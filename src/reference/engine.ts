import type { AssayResult, AssayedQuote, RawQuote, RejectReason } from "./types.js";

export const BP = 10_000;

/** Deviation beyond which an adjusted price cannot be real basis on a listed equity. */
const CORRUPT_MULTIPLIER_THRESHOLD = 0.05;
/** How much closer the raw price must be than the adjusted price to indict the multiplier. */
const CORRUPT_MULTIPLIER_MARGIN = 3;
/**
 * Cross-endpoint multiplier disagreement tolerated before trust is penalised.
 * Set at 1bp deliberately: the effects this product measures are 10-95bp, so a 9bp
 * metadata disagreement is material, not noise. (Caught by regression test.)
 */
const MULTIPLIER_AGREEMENT_TOL = 0.0001;
/** Liquidity proxy saturation point: holders + traders at which liquidity scores 1.0. */
const LIQUIDITY_SATURATION = 100_000;

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median where each sample carries a weight; falls back to plain median if weights vanish. */
export function weightedMedian(xs: number[], ws: number[]): number {
  if (xs.length === 0) return NaN;
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return median(xs);
  const pairs = xs.map((x, i) => ({ x, w: ws[i]! })).sort((a, b) => a.x - b.x);
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= total / 2) return p.x;
  }
  return pairs[pairs.length - 1]!.x;
}

/** price / multiplier — the one operation that makes wrappers comparable. */
export function normalize(q: RawQuote): number {
  return q.price / q.multiplier;
}

/**
 * Decides whether a wrapper's `sharesMultiplier` can be trusted.
 *
 * The rule generalises without hardcoding ratios: if dividing by the multiplier moves the
 * price *away* from the benchmark rather than toward it, the multiplier is the problem.
 * Catches NFLXx (10x) and TQQQx (2x) while leaving every correct Ondo wrapper untouched.
 */
export function multiplierIsCorrupt(q: RawQuote, benchmark: number): boolean {
  if (!Number.isFinite(benchmark) || benchmark <= 0) return false;
  if (q.multiplier === 1) return false;
  const adjErr = Math.abs(normalize(q) / benchmark - 1);
  const rawErr = Math.abs(q.price / benchmark - 1);
  return adjErr > CORRUPT_MULTIPLIER_THRESHOLD && adjErr > rawErr * CORRUPT_MULTIPLIER_MARGIN;
}

/**
 * Liquidity, freshness and metadata agreement, multiplied into [0,1].
 *
 * Liquidity is the dominant term by design: it is what separates a live quote from a
 * days-old last-trade print, and the API exposes no depth or lastTradeTime (DEVEX.md #5).
 */
export function trustScore(q: RawQuote): number {
  const participants = (q.holders ?? 0) + (q.bnTrader ?? 0);
  const liquidity = Math.min(
    1,
    Math.log10(1 + participants) / Math.log10(1 + LIQUIDITY_SATURATION),
  );

  // Unknown staleness is treated as fresh; the collector fills this in once history exists.
  const ticks = q.ticksSinceChange ?? 0;
  const freshness = 1 / (1 + ticks / 10);

  let meta = 1;
  if (q.listMultiplier !== undefined && q.listMultiplier > 0) {
    const disagreement = Math.abs(q.multiplier / q.listMultiplier - 1);
    if (disagreement > MULTIPLIER_AGREEMENT_TOL) {
      meta = 1 / (1 + disagreement * 100);
    }
  }

  return Math.max(0, Math.min(1, liquidity * freshness * meta));
}

function rejectionOf(q: RawQuote, benchmark: number): RejectReason | null {
  if (!Number.isFinite(q.price) || q.price <= 0) return "NO_PRICE";
  if (!Number.isFinite(q.multiplier) || q.multiplier <= 0) return "NO_PRICE";
  if (q.statusCode && q.statusCode !== "TRADING") return "NOT_TRADING";
  if (multiplierIsCorrupt(q, benchmark)) return "CORRUPT_MULTIPLIER";
  return null;
}

/**
 * Produces one reference price per ticker from a set of wrapper quotes.
 *
 * Invariant (regime-dependent, and the distinction matters): outside RTH the price is a
 * weighted median of surviving quotes and therefore always lies within their range. During
 * RTH it is the venue's own reference price, which is authoritative and may legitimately sit
 * outside the wrapper range when every wrapper is rich or every wrapper is cheap. Clamping it
 * to the wrappers would discard the one price we actually trust.
 *
 * Benchmarking is two-pass: a provisional benchmark (the venue's own reference price when it
 * has one, else the median of adjusted quotes) is needed to judge multipliers, and only the
 * surviving quotes then set the published price.
 */
export function assay(
  ticker: string,
  quotes: RawQuote[],
  regime: "rth" | "offhours" | "closed" = "rth",
): AssayResult {
  const referencePrice = quotes.find((q) => q.referencePrice && q.referencePrice > 0)
    ?.referencePrice ?? null;

  // Pass 1 — provisional benchmark for multiplier adjudication.
  const benchmark = referencePrice ?? median(quotes.map(normalize).filter(Number.isFinite));

  // Pass 2 — validate and score.
  const scored: AssayedQuote[] = quotes.map((q) => ({
    ...q,
    adjusted: normalize(q),
    trust: trustScore(q),
    rejected: rejectionOf(q, benchmark),
    naiveBasisBp: 0,
    trueBasisBp: 0,
    multiplierEffectBp: 0,
  }));

  const accepted = scored.filter((q) => q.rejected === null);
  const pool = accepted.length > 0 ? accepted : scored.filter((q) => q.rejected !== "NO_PRICE");

  // Outside RTH the tape is frozen, so on-chain quotes lead. During RTH the venue's own
  // reference is authoritative and the wrappers are measured against it.
  const onChain = weightedMedian(pool.map((q) => q.adjusted), pool.map((q) => q.trust));
  const assayPrice = regime === "rth" && referencePrice ? referencePrice : onChain;

  for (const q of scored) {
    q.naiveBasisBp = (q.price / assayPrice - 1) * BP;
    q.trueBasisBp = (q.adjusted / assayPrice - 1) * BP;
    q.multiplierEffectBp = q.naiveBasisBp - q.trueBasisBp;
  }

  // The band reflects both how far the surviving quotes disagree and how much trust
  // stands behind them: two thin quotes that agree are not the same as two deep ones.
  const spread =
    pool.length > 1
      ? (Math.max(...pool.map((q) => q.adjusted)) / Math.min(...pool.map((q) => q.adjusted)) - 1) * BP
      : 0;
  const trustMass = pool.reduce((a, q) => a + q.trust, 0);
  const confidenceBp = spread / 2 + 25 / (1 + trustMass);

  return { ticker, assayPrice, confidenceBp, referencePrice, regime, quotes: scored, accepted };
}
