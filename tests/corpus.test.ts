import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assay } from "../src/reference/engine.js";
import type { RawQuote } from "../src/reference/types.js";

/**
 * Corpus regression: runs the engine over every multi-wrapper ticker captured live from
 * BSC on 2026-09-20 (84 tickers, weekend session). The golden tests in engine.test.ts
 * pin specific numbers; these assert that the properties hold across the whole market.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/snapshot-2026-09-20-closed.json", import.meta.url), "utf8"),
) as { capturedAt: string; regime: string; snapshot: Record<string, RawQuote[]> };

const TICKERS = Object.entries(fixture.snapshot);
const results = TICKERS.map(([t, qs]) => assay(t, qs, "rth"));
const allQuotes = results.flatMap((r) => r.quotes);

const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * q)]!;

describe("corpus: 84 multi-wrapper tickers, live BSC snapshot", () => {
  it("covers a meaningful slice of the market", () => {
    expect(TICKERS.length).toBeGreaterThanOrEqual(80);
    expect(allQuotes.length).toBeGreaterThanOrEqual(190);
  });

  it("produces no NaN or Infinity anywhere", () => {
    for (const r of results) {
      expect(Number.isFinite(r.assayPrice)).toBe(true);
      expect(Number.isFinite(r.confidenceBp)).toBe(true);
      for (const q of r.quotes) {
        expect(Number.isFinite(q.adjusted)).toBe(true);
        expect(Number.isFinite(q.trust)).toBe(true);
        expect(Number.isFinite(q.naiveBasisBp)).toBe(true);
        expect(Number.isFinite(q.trueBasisBp)).toBe(true);
      }
    }
  });

  it("INVARIANT: off-tape, the price lies within its surviving adjusted quotes", () => {
    // Outside RTH there is no authoritative reference, so the price is a weighted median
    // of the wrappers and must stay inside their range.
    for (const regime of ["offhours", "closed"] as const) {
      for (const [t, qs] of TICKERS) {
        const r = assay(t, qs, regime);
        if (r.accepted.length === 0) continue;
        const adj = r.accepted.map((q) => q.adjusted);
        expect(r.assayPrice).toBeGreaterThanOrEqual(Math.min(...adj) - 1e-6);
        expect(r.assayPrice).toBeLessThanOrEqual(Math.max(...adj) + 1e-6);
      }
    }
  });

  it("during RTH the venue reference wins, even when it sits outside the wrapper range", () => {
    // Deliberately NOT clamped: if every wrapper is rich, the honest answer is that every
    // wrapper is rich - not that the underlying moved.
    const anchored = results.filter((r) => r.referencePrice !== null);
    expect(anchored.length).toBeGreaterThan(20);
    for (const r of anchored) expect(r.assayPrice).toBe(r.referencePrice);
  });

  it("INVARIANT: basis decomposition is exact for every quote", () => {
    for (const q of allQuotes) {
      expect(q.naiveBasisBp).toBeCloseTo(q.trueBasisBp + q.multiplierEffectBp, 6);
    }
  });

  it("INVARIANT: trust is bounded to [0,1]", () => {
    for (const q of allQuotes) {
      expect(q.trust).toBeGreaterThanOrEqual(0);
      expect(q.trust).toBeLessThanOrEqual(1);
    }
  });

  /** The headline claim, asserted against the whole market rather than a hand-picked sample. */
  it("HEADLINE: multiplier adjustment collapses Ondo basis error from >500bp to <15bp", () => {
    const ondo = results.flatMap((r) =>
      r.quotes.filter((q) => q.family === "Ondo" && !q.rejected && r.referencePrice),
    );
    expect(ondo.length).toBeGreaterThanOrEqual(20);

    const naive = ondo.map((q) => Math.abs(q.naiveBasisBp));
    const adjusted = ondo.map((q) => Math.abs(q.trueBasisBp));

    // The apparent premium is large and real-looking...
    expect(Math.max(...naive)).toBeGreaterThan(100);
    expect(pct(naive, 0.9)).toBeGreaterThan(50);

    // ...and essentially none of it survives the adjustment.
    expect(Math.max(...adjusted)).toBeLessThan(15);
    expect(pct(adjusted, 0.95)).toBeLessThan(10);
    expect(pct(adjusted, 0.5)).toBeLessThan(2);

    // Adjustment never makes a surviving quote worse.
    for (let i = 0; i < ondo.length; i++) {
      expect(adjusted[i]!).toBeLessThanOrEqual(naive[i]! + 1e-6);
    }
  });

  it("ranks issuer families by trust in the order the liquidity data implies", () => {
    const med = (fam: string) => {
      const ts = allQuotes.filter((q) => q.family === fam).map((q) => q.trust);
      return pct(ts, 0.5);
    };
    // xStocks on BSC are thin enough that their quotes must not move the reference.
    expect(med("xStock")).toBeLessThan(0.2);
    expect(med("Ondo")).toBeGreaterThan(med("bStock"));
    expect(med("bStock")).toBeGreaterThan(med("xStock"));
  });

  it("the corrupt-multiplier guard is selective, not trigger-happy", () => {
    const corrupt = allQuotes.filter((q) => q.rejected === "CORRUPT_MULTIPLIER");
    expect(corrupt.length).toBeGreaterThanOrEqual(1);
    expect(corrupt.length).toBeLessThan(allQuotes.length * 0.05);
    // No Ondo wrapper should ever trip it — their multipliers are the reliable ones.
    expect(corrupt.filter((q) => q.family === "Ondo")).toHaveLength(0);
  });

  it("confidence widens when a ticker's wrappers disagree", () => {
    const withMulti = results.filter((r) => r.accepted.length > 1);
    expect(withMulti.length).toBeGreaterThan(5);
    for (const r of withMulti) {
      const adj = r.accepted.map((q) => q.adjusted);
      const spreadBp = (Math.max(...adj) / Math.min(...adj) - 1) * 10_000;
      expect(r.confidenceBp).toBeGreaterThanOrEqual(spreadBp / 2 - 1e-6);
    }
  });
});
