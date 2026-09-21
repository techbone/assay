/**
 * What a wrapper's multiplier actually encodes. These are different failure modes and
 * must not be reported as one number: drift is tens of basis points of accrued
 * distribution, whereas a fractional token is a different unit entirely and a naive
 * price comparison against it is wrong by an order of magnitude.
 */
export type MultiplierKind = "unit" | "drift" | "fractional";

export type RejectReason =
  | "NOT_TRADING"
  | "CORRUPT_MULTIPLIER"
  | "NO_PRICE"
  | "STALE_QUOTE"
  | "OUTLIER";

/** A wrapper quote as it arrives, before any Assay processing. */
export interface RawQuote {
  symbol: string;
  ticker: string;
  family: string;
  /** Quoted on-chain price, as served. */
  price: number;
  /** Underlying shares per token, from the dynamic endpoint. */
  multiplier: number;
  /** Cached multiplier from the list endpoint, if known. Advisory only. */
  listMultiplier?: number | undefined;
  /** Underlying equity reference price. Frozen outside RTH. */
  referencePrice?: number | undefined;
  statusCode?: string | undefined;
  holders?: number | undefined;
  bnTrader?: number | undefined;
  volume24h?: number | undefined;
  /** Set by the collector once history exists: ticks since the price last moved. */
  ticksSinceChange?: number | undefined;
}

export interface AssayedQuote extends RawQuote {
  /** price / multiplier — comparable across wrappers. */
  adjusted: number;
  /** [0,1]: liquidity x freshness x metadata agreement. */
  trust: number;
  /** Non-null means excluded from the assay price. */
  rejected: RejectReason | null;
  /** Basis vs the assay price, in basis points. */
  naiveBasisBp: number;
  trueBasisBp: number;
  /** naiveBasisBp - trueBasisBp: the phantom premium created by the multiplier. */
  multiplierEffectBp: number;
  /** Which kind of distortion the multiplier represents. */
  multiplierKind: MultiplierKind;
}

export interface AssayResult {
  ticker: string;
  /** The trust-weighted reference price, per underlying share. */
  assayPrice: number;
  /** +/- basis points. Widens with dispersion and thins-out trust. */
  confidenceBp: number;
  /** Underlying equity price, if the venue published one. */
  referencePrice: number | null;
  regime: import("../binance/types.js").MarketRegime;
  quotes: AssayedQuote[];
  /** Quotes that survived validation and contributed to the price. */
  accepted: AssayedQuote[];
}
