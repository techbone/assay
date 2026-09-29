import { describe, expect, it } from "vitest";
import { summaryOf, tickerRows, EMPTY_COVERAGE } from "../src/api/present.js";
import { assay } from "../src/reference/engine.js";
import type { RawQuote } from "../src/reference/types.js";

const q = (p: Partial<RawQuote> & Pick<RawQuote, "symbol" | "ticker" | "family" | "price" | "multiplier">): RawQuote =>
  ({ statusCode: "TRADING", holders: 5000, bnTrader: 5000, ...p }) as RawQuote;

/** NFLX: a 1:10 unit token beside a plain one. SPY: ~95bp of dividend drift. */
const NFLX = assay("NFLX", [
  q({ ticker: "NFLX", symbol: "NFLXon", family: "Ondo",   price: 719.267, multiplier: 10, referencePrice: 71.93 }),
  q({ ticker: "NFLX", symbol: "NFLXB",  family: "bStock", price: 72.32,   multiplier: 1,  referencePrice: 71.93 }),
], "rth");
const SPY = assay("SPY", [
  q({ ticker: "SPY", symbol: "SPYon", family: "Ondo",   price: 769.516, multiplier: 1.009473, referencePrice: 762.29 }),
  q({ ticker: "SPY", symbol: "SPYB",  family: "bStock", price: 762.076, multiplier: 1.00173,  referencePrice: 762.29 }),
], "rth");

describe("tickerRows", () => {
  it("never reports a unit conversion as a phantom premium", () => {
    const nflx = tickerRows([NFLX, SPY]).find((r) => r.ticker === "NFLX")!;
    // Before: +90000bp, sorted to the top of the table.
    expect(Math.abs(nflx.phantomBp)).toBeLessThan(100);
    expect(nflx.fractional).toEqual([{ symbol: "NFLXon", multiplier: 10 }]);
  });

  it("ranks by dividend drift, so the real signal leads the table", () => {
    const rows = tickerRows([NFLX, SPY]);
    expect(rows[0]!.ticker).toBe("SPY");
    expect(rows[0]!.phantomBp).toBeGreaterThan(80);
  });

  it("reports how far trusted wrappers disagree after normalization", () => {
    const spy = tickerRows([SPY])[0]!;
    expect(spy.realSpreadBp).toBeGreaterThanOrEqual(0);
    expect(spy.realSpreadBp).toBeLessThan(50);
  });

  it("lists each issuer family once", () => {
    expect(tickerRows([SPY])[0]!.families).toEqual(["Ondo", "bStock"]);
  });
});

describe("summaryOf", () => {
  it("names the largest phantom premium and how much of it is real", () => {
    const s = summaryOf([NFLX, SPY], "rth", 1, EMPTY_COVERAGE);
    expect(s.phantomLeader).toMatchObject({ ticker: "SPY", symbol: "SPYon" });
    expect(s.phantomLeader!.phantomBp).toBeGreaterThan(80);
    expect(Math.abs(s.phantomLeader!.trueBasisBp)).toBeLessThan(5);
  });
});

describe("tickerRows — trusted", () => {
  it("does not call a thin token trusted, and keeps it out of the real spread", () => {
    // SPYx: kept by the engine at near-zero weight, but far too thin to act on.
    const r = assay("SPY", [
      q({ ticker: "SPY", symbol: "SPYon", family: "Ondo",   price: 774.10, multiplier: 1.00947, referencePrice: 766.78 }),
      q({ ticker: "SPY", symbol: "SPYB",  family: "bStock", price: 768.22, multiplier: 1.00173, referencePrice: 766.78 }),
      q({ ticker: "SPY", symbol: "SPYx",  family: "xStock", price: 765.13, multiplier: 1.00571, referencePrice: 766.78, holders: 0, bnTrader: 12 }),
    ], "premarket");
    const row = tickerRows([r])[0]!;
    expect(row.accepted).toBe(3);
    expect(row.trusted).toBe(2);
    // Before: 80bp, which was SPYx's stale print rather than real disagreement.
    expect(row.realSpreadBp).toBeLessThan(5);
  });
});
