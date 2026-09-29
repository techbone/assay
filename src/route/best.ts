import type { AssayResult } from "../reference/types.js";

/**
 * Best execution across wrappers.
 *
 * The question a buyer actually has is not "which token is cheapest" but "which token
 * buys me the most of the real stock for this money". Those differ, because each wrapper
 * represents a different number of underlying shares (its `sharesMultiplier`) and each
 * trades against a different pool. The honest answer comes from an executable quote -
 * tokens received for the spend, route and slippage included - converted to shares.
 */

export interface Quote {
  /** Tokens received for `spend`, as quoted. */
  tokensOut: number;
  /** `executable` came from a live swap quote; `indicative` from the last traded price. */
  kind: "executable" | "indicative";
}

export interface QuoteProvider {
  readonly kind: Quote["kind"];
  quote(args: { toToken: string; spend: number; indicativePrice: number }): Promise<Quote | null>;
}

export interface Candidate {
  symbol: string;
  family: string;
  contract: string;
  multiplier: number;
  quotedPrice: number;
  trust: number;
  rejected: string | null;
}

export interface Leg extends Candidate {
  quote: Quote | null;
  /** Underlying shares this spend actually buys. */
  shares: number | null;
  /** Effective cost per underlying share. */
  costPerShare: number | null;
  /** Premium paid over the assay price, in basis points. */
  premiumBp: number | null;
  /** Why this wrapper was not eligible, when it was not. */
  excluded: string | null;
}

export interface BestExecution {
  ticker: string;
  spend: number;
  assayPrice: number;
  quoteKind: Quote["kind"];
  legs: Leg[];
  /** Cheapest eligible wrapper per real share. */
  best: Leg | null;
  /** What a router comparing raw token prices would buy: the lowest quoted token price. */
  naivePick: Leg | null;
  /**
   * How the naive pick compares: `agrees`, `excluded` (it picked something Assay would
   * not trade), or `worse` with `naiveShortfallShares` fewer shares for the same spend.
   */
  naiveVerdict: "agrees" | "excluded" | "worse" | "none";
  naiveShortfallShares: number | null;
  /**
   * A router that screens out bad wrappers but still compares token prices - i.e. knows
   * about trust and not about `sharesMultiplier`. Isolates the multiplier's cost: on
   * 2026-09-29 it bought SPYB, $5.33 cheaper per token, and got fewer SPY shares than
   * SPYon for the same spend.
   */
  multiplierBlindPick: Leg | null;
  multiplierBlindShortfallShares: number | null;
}

/**
 * Minimum trust to recommend a wrapper on an indicative quote alone - roughly 300
 * holders and traders. Deliberately stricter than the outlier rule's 0.25: that rule
 * decides what counts toward a reference price, this one decides what to tell someone
 * to buy, and an indicative quote carries no liquidity information at all.
 *
 * On 2026-09-29 the unguarded router recommended NVDAx and SPYx as 33bp and 60bp
 * "cheaper", and at a 0.25 floor still picked TSLAx (trust 0.25, ~17 participants) as
 * 34bp cheaper - stale prints on pools too thin to fill at those prices.
 */
export const MIN_TRUST_INDICATIVE = 0.5;

/**
 * Wrappers the engine rejected - halted, corrupt multiplier, stale, outlier - are shown
 * but never recommended: a price that fails sanity is not a price you should trade at.
 * On indicative quotes, thin wrappers are held back too; an executable quote from the
 * wallet already prices in their liquidity, so it lifts that restriction.
 */
export function eligibility(c: Candidate, kind: Quote["kind"]): string | null {
  if (c.rejected) return c.rejected.toLowerCase().replace(/_/g, " ");
  if (!(c.multiplier > 0)) return "no multiplier";
  if (kind === "indicative" && c.trust < MIN_TRUST_INDICATIVE) {
    return "too thin to trust its last trade - needs an executable quote";
  }
  return null;
}

export async function bestExecution(
  r: AssayResult,
  contracts: Record<string, string>,
  spend: number,
  provider: QuoteProvider,
): Promise<BestExecution> {
  if (!(spend > 0)) throw new Error("spend must be positive");

  const candidates: Candidate[] = r.quotes
    .filter((q) => contracts[q.symbol])
    .map((q) => ({
      symbol: q.symbol, family: q.family, contract: contracts[q.symbol]!,
      multiplier: q.multiplier, quotedPrice: q.price, trust: q.trust, rejected: q.rejected,
    }));

  const legs: Leg[] = await Promise.all(candidates.map(async (c): Promise<Leg> => {
    const excluded = eligibility(c, provider.kind);
    const quote = excluded
      ? null
      : await provider.quote({ toToken: c.contract, spend, indicativePrice: c.quotedPrice }).catch(() => null);
    if (!quote || !(quote.tokensOut > 0)) {
      return { ...c, quote, shares: null, costPerShare: null, premiumBp: null, excluded: excluded ?? "no quote" };
    }
    const shares = quote.tokensOut * c.multiplier;
    const costPerShare = spend / shares;
    return {
      ...c, quote, shares, costPerShare,
      premiumBp: (costPerShare / r.assayPrice - 1) * 10_000,
      excluded: null,
    };
  }));

  const eligible = legs.filter((l) => l.costPerShare !== null);
  eligible.sort((a, b) => a.costPerShare! - b.costPerShare!);
  const best = eligible[0] ?? null;

  // A naive router compares raw token prices across every listed wrapper. It knows
  // nothing about multipliers, trust or rejection - that is what makes it naive.
  const naivePick = legs
    .filter((l) => l.quotedPrice > 0)
    .sort((a, b) => a.quotedPrice - b.quotedPrice)[0] ?? null;

  let naiveVerdict: BestExecution["naiveVerdict"] = "none";
  let naiveShortfallShares: number | null = null;
  if (naivePick && best) {
    if (naivePick === best) naiveVerdict = "agrees";
    else if (naivePick.excluded) naiveVerdict = "excluded";
    else { naiveVerdict = "worse"; naiveShortfallShares = best.shares! - naivePick.shares!; }
  }

  const multiplierBlindPick = [...eligible].sort((a, b) => a.quotedPrice - b.quotedPrice)[0] ?? null;
  const multiplierBlindShortfallShares =
    best && multiplierBlindPick && multiplierBlindPick !== best
      ? best.shares! - multiplierBlindPick.shares!
      : null;

  legs.sort((a, b) => (a.costPerShare ?? Infinity) - (b.costPerShare ?? Infinity));
  return {
    ticker: r.ticker, spend, assayPrice: r.assayPrice, quoteKind: provider.kind,
    legs, best, naivePick, naiveVerdict, naiveShortfallShares,
    multiplierBlindPick: multiplierBlindShortfallShares === null ? null : multiplierBlindPick,
    multiplierBlindShortfallShares,
  };
}

/** Quotes from the last traded price. No slippage, no route - labelled as such. */
export const indicativeProvider: QuoteProvider = {
  kind: "indicative",
  async quote({ spend, indicativePrice }) {
    return indicativePrice > 0 ? { tokensOut: spend / indicativePrice, kind: "indicative" } : null;
  },
};
