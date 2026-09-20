import { describe, expect, it } from "vitest";
import { assay, median, multiplierIsCorrupt, normalize, trustScore, weightedMedian } from "../src/reference/engine.js";
import type { RawQuote } from "../src/reference/types.js";

/**
 * Golden cases pinned from live BSC data on 2026-09-20 (weekend, tape closed).
 * These numbers are the evidence the product is built on; if the engine ever stops
 * reproducing them, the core claim has regressed.
 */
const q = (p: Partial<RawQuote> & Pick<RawQuote, "symbol" | "family" | "price" | "multiplier">): RawQuote =>
  ({ ticker: "T", ...p }) as RawQuote;

const NVDA_REF = 220.865;
const NVDA: RawQuote[] = [
  q({ symbol: "NVDAon", family: "Ondo",   price: 221.264, multiplier: 1.0017152, referencePrice: NVDA_REF, statusCode: "TRADING", holders: 57105, bnTrader: 22540 }),
  q({ symbol: "NVDAx",  family: "xStock", price: 221.740, multiplier: 1.0009181, referencePrice: NVDA_REF, statusCode: "TRADING", holders: 0,     bnTrader: 12 }),
  q({ symbol: "NVDAB",  family: "bStock", price: 220.792, multiplier: 1.0007782, referencePrice: NVDA_REF, statusCode: "TRADING", holders: 9678,  bnTrader: 12651 }),
];

/** Ondo wrappers whose apparent premium is entirely accrued distribution. */
const PHANTOM_PREMIUM: Array<[string, number, number, number]> = [
  // ticker, ondo price, multiplier, reference
  ["SPY",  769.516, 1.009473, 762.29],
  ["MSFT", 496.836, 1.005731, 494.01],
  ["TSM",  436.647, 1.009321, 432.57],
  ["ORCL", 147.576, 1.007933, 146.38],
  ["PYPL",  52.943, 1.007790,  52.53],
  ["QQQ",  722.439, 1.003353, 720.29],
  ["NVDA", 221.264, 1.0017152, NVDA_REF],
  ["MU",  1007.303, 1.001121, 1006.13],
];

/** Wrappers whose multiplier metadata is corrupt. Both confirmed against live data. */
const CORRUPT: Array<[string, RawQuote, number]> = [
  ["NFLXx", q({ symbol: "NFLXx", family: "xStock", price: 77.190, multiplier: 10.0 }), 71.93],
  ["TQQQx", q({ symbol: "TQQQx", family: "xStock", price: 72.414, multiplier: 2.008976 }), 72.14],
];

describe("statistics", () => {
  it("median handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it("weightedMedian follows the weight mass, not the count", () => {
    // Two near-worthless quotes must not outvote one deep one.
    expect(weightedMedian([100, 200, 201], [10, 0.01, 0.01])).toBe(100);
  });

  it("weightedMedian falls back to plain median when all weights are zero", () => {
    expect(weightedMedian([1, 2, 3], [0, 0, 0])).toBe(2);
  });
});

describe("normalize — the phantom premium", () => {
  it.each(PHANTOM_PREMIUM)(
    "%s: apparent premium collapses to ~0 once the multiplier is removed",
    (_t, price, multiplier, ref) => {
      const quote = q({ symbol: "x", family: "Ondo", price, multiplier });
      const naiveBp = (price / ref - 1) * 10_000;
      const adjBp = (normalize(quote) / ref - 1) * 10_000;

      expect(Math.abs(naiveBp)).toBeGreaterThan(10); // a premium is visibly there
      expect(Math.abs(adjBp)).toBeLessThan(25);      // and it is not real
      expect(Math.abs(adjBp)).toBeLessThan(Math.abs(naiveBp));
    },
  );
});

describe("validate — corrupt multipliers", () => {
  it.each(CORRUPT)("%s is detected as corrupt", (_n, quote, benchmark) => {
    expect(multiplierIsCorrupt(quote, benchmark)).toBe(true);
  });

  it("never indicts a correct multiplier (no false positives)", () => {
    for (const [, price, multiplier, ref] of PHANTOM_PREMIUM) {
      expect(multiplierIsCorrupt(q({ symbol: "x", family: "Ondo", price, multiplier }), ref)).toBe(false);
    }
  });

  it("ignores multiplier=1 wrappers, which cannot be distorted by it", () => {
    expect(multiplierIsCorrupt(q({ symbol: "x", family: "xStock", price: 138.856, multiplier: 1 }), 153.59)).toBe(false);
  });

  it("corrupt wrappers are excluded from the assay price", () => {
    const result = assay("NFLX", [
      q({ symbol: "NFLXon", family: "Ondo",   price: 719.267, multiplier: 10, referencePrice: 71.93, holders: 5000 }),
      q({ symbol: "NFLXx",  family: "xStock", price: 77.190,  multiplier: 10, referencePrice: 71.93, holders: 10 }),
      q({ symbol: "NFLXB",  family: "bStock", price: 72.320,  multiplier: 1,  referencePrice: 71.93, holders: 4000 }),
    ], "closed");

    const rejected = result.quotes.filter((x) => x.rejected === "CORRUPT_MULTIPLIER");
    expect(rejected.map((x) => x.symbol)).toEqual(["NFLXx"]);
    // Without the guard the assay price would be dragged toward 7.72.
    expect(result.assayPrice).toBeGreaterThan(70);
    expect(result.assayPrice).toBeLessThan(75);
  });
});

describe("trust", () => {
  it("ranks a 22k-trader wrapper far above a 12-trader one", () => {
    const [ondo, xs, bst] = NVDA.map(trustScore) as [number, number, number];
    expect(ondo).toBeGreaterThan(0.9);
    expect(bst).toBeGreaterThan(0.8);
    expect(xs).toBeLessThan(0.3);
    expect(ondo).toBeGreaterThan(xs * 3);
  });

  it("is bounded to [0,1]", () => {
    for (const x of NVDA) {
      const t = trustScore(x);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  it("penalises cross-endpoint multiplier disagreement", () => {
    const base = q({ symbol: "NVDAx", family: "xStock", price: 221.74, multiplier: 1.0009181, holders: 5000 });
    const disagreeing = { ...base, listMultiplier: 1 }; // what the list endpoint actually served
    expect(trustScore(disagreeing)).toBeLessThan(trustScore(base));
  });

  it("penalises stale quotes", () => {
    const fresh = q({ symbol: "A", family: "Ondo", price: 100, multiplier: 1, holders: 5000, ticksSinceChange: 0 });
    expect(trustScore({ ...fresh, ticksSinceChange: 200 })).toBeLessThan(trustScore(fresh) / 5);
  });
});

describe("assay", () => {
  it("decomposes naive basis into multiplier effect plus true basis", () => {
    const r = assay("NVDA", NVDA, "rth");
    for (const x of r.quotes) {
      expect(x.naiveBasisBp).toBeCloseTo(x.trueBasisBp + x.multiplierEffectBp, 9);
    }
  });

  it("attributes almost all of NVDAon's apparent premium to the multiplier", () => {
    const r = assay("NVDA", NVDA, "rth");
    const ondo = r.quotes.find((x) => x.symbol === "NVDAon")!;
    expect(ondo.naiveBasisBp).toBeGreaterThan(15);
    expect(Math.abs(ondo.trueBasisBp)).toBeLessThan(3);
    expect(ondo.multiplierEffectBp).toBeGreaterThan(15);
  });

  it("anchors to the venue reference during RTH", () => {
    expect(assay("NVDA", NVDA, "rth").assayPrice).toBe(NVDA_REF);
  });

  it("lets on-chain quotes lead once the tape is frozen", () => {
    const r = assay("NVDA", NVDA, "closed");
    expect(r.assayPrice).not.toBe(NVDA_REF);
    expect(r.regime).toBe("closed");
  });

  it("INVARIANT: the price always lies within the surviving adjusted quotes", () => {
    for (const regime of ["rth", "offhours", "closed"] as const) {
      const r = assay("NVDA", NVDA, regime);
      const adj = r.accepted.map((x) => x.adjusted);
      expect(r.assayPrice).toBeGreaterThanOrEqual(Math.min(...adj) - 1e-9);
      expect(r.assayPrice).toBeLessThanOrEqual(Math.max(...adj) + 1e-9);
    }
  });

  it("excludes halted wrappers", () => {
    const halted = NVDA.map((x, i) => (i === 0 ? { ...x, statusCode: "DIVIDEND" } : x));
    const r = assay("NVDA", halted, "closed");
    expect(r.quotes.find((x) => x.symbol === "NVDAon")!.rejected).toBe("NOT_TRADING");
    expect(r.accepted.map((x) => x.symbol)).not.toContain("NVDAon");
  });

  it("widens the confidence band when a TRUSTED quote disagrees", () => {
    const tight = assay("NVDA", NVDA, "closed").confidenceBp;
    // NVDAB carries ~12.6k traders, so its disagreement is information and must be priced in.
    const moved = NVDA.map((x) => (x.symbol === "NVDAB" ? { ...x, price: x.price * 1.02 } : x));
    const wide = assay("NVDA", moved, "closed");
    expect(wide.quotes.find((x) => x.symbol === "NVDAB")!.rejected).toBeNull();
    expect(wide.confidenceBp).toBeGreaterThan(tight * 2);
  });

  it("rejects an UNTRUSTED quote that disagrees, rather than widening the band", () => {
    // NVDAx has 12 traders. A 10% disagreement from a wrapper that thin is a stale
    // print, not price discovery - excluding it is the whole point of the trust score.
    const moved = NVDA.map((x) => (x.symbol === "NVDAx" ? { ...x, price: x.price * 1.1 } : x));
    const r = assay("NVDA", moved, "closed");
    expect(r.quotes.find((x) => x.symbol === "NVDAx")!.rejected).toBe("OUTLIER");
    expect(r.accepted.map((x) => x.symbol)).not.toContain("NVDAx");
    expect(r.assayPrice).toBeLessThan(230);
  });

  it("rejects a quote frozen for many consecutive polls", () => {
    const frozen = NVDA.map((x) => (x.symbol === "NVDAon" ? { ...x, ticksSinceChange: 120 } : x));
    const r = assay("NVDA", frozen, "closed");
    expect(r.quotes.find((x) => x.symbol === "NVDAon")!.rejected).toBe("STALE_QUOTE");
  });

  it("tolerates a quote that is merely quiet", () => {
    const quiet = NVDA.map((x) => (x.symbol === "NVDAon" ? { ...x, ticksSinceChange: 5 } : x));
    expect(assay("NVDA", quiet, "closed").quotes.find((x) => x.symbol === "NVDAon")!.rejected).toBeNull();
  });

  it("survives a single-wrapper ticker", () => {
    const r = assay("SOLO", [NVDA[0]!], "closed");
    expect(r.assayPrice).toBeCloseTo(NVDA[0]!.price / NVDA[0]!.multiplier, 6);
    expect(r.confidenceBp).toBeGreaterThan(0);
  });
});
