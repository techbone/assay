import { describe, expect, it } from "vitest";
import { Collector } from "../src/collector/collector.js";
import { Scorecard } from "../src/scorecard/detect.js";
import { estimatesFrom, scoreOne, summarize } from "../src/scorecard/score.js";
import { AssayStore } from "../src/store/db.js";
import type { BinanceRwaClient } from "../src/binance/client.js";
import type { DynamicPayload, UniverseEntry } from "../src/binance/types.js";
import type { RawQuote } from "../src/reference/types.js";

const q = (p: Partial<RawQuote> & Pick<RawQuote, "symbol" | "family" | "price" | "multiplier">): RawQuote =>
  ({ ticker: "NVDA", ...p }) as RawQuote;

/** Pinned from live BSC data, 2026-09-20. */
const NVDA: RawQuote[] = [
  q({ symbol: "NVDAon", family: "Ondo",   price: 221.264, multiplier: 1.0017152, referencePrice: 220.865, statusCode: "TRADING", holders: 57105, bnTrader: 22540 }),
  q({ symbol: "NVDAx",  family: "xStock", price: 221.740, multiplier: 1.0009181, referencePrice: 220.865, statusCode: "TRADING", holders: 0,     bnTrader: 12 }),
  q({ symbol: "NVDAB",  family: "bStock", price: 220.792, multiplier: 1.0007782, referencePrice: 220.865, statusCode: "TRADING", holders: 9678,  bnTrader: 12651 }),
];

describe("estimatesFrom", () => {
  it("produces every competing estimate from one snapshot", () => {
    const e = estimatesFrom("NVDA", NVDA, "premarket");
    expect(Object.keys(e)).toEqual(expect.arrayContaining([
      "raw_median", "adj_median", "assay", "venue_ref", "only_Ondo", "only_xStock", "only_bStock",
    ]));
  });

  it("raw_median ignores the multiplier and adj_median does not", () => {
    const e = estimatesFrom("NVDA", NVDA, "premarket");
    expect(e["raw_median"]).not.toBeCloseTo(e["adj_median"]!, 6);
    expect(e["adj_median"]).toBeLessThan(e["raw_median"]!);
  });

  /** With a fractional wrapper present, ignoring the multiplier is catastrophic, not marginal. */
  it("raw_median is wrong by orders of magnitude on a fractionalised ticker", () => {
    const nflx = [
      q({ ticker: "NFLX", symbol: "NFLXon", family: "Ondo",   price: 719.267, multiplier: 10, referencePrice: 71.93, statusCode: "TRADING", holders: 5000 }),
      q({ ticker: "NFLX", symbol: "NFLXB",  family: "bStock", price: 72.320,  multiplier: 1,  referencePrice: 71.93, statusCode: "TRADING", holders: 4000 }),
    ];
    const e = estimatesFrom("NFLX", nflx, "premarket");
    expect(Math.abs(e["raw_median"]! / 71.93 - 1)).toBeGreaterThan(1);   // >100% off
    expect(Math.abs(e["adj_median"]! / 71.93 - 1)).toBeLessThan(0.01);   // <1% off
  });
});

describe("scoreOne", () => {
  it("converts every estimate into signed basis-point error", () => {
    const s = scoreOne("NVDA", NVDA, "premarket", 221.0, 2000, 1000)!;
    expect(s.actualOpen).toBe(221.0);
    for (const k of Object.keys(s.estimates)) {
      expect(s.errorsBp[k]).toBeCloseTo((s.estimates[k]! / 221.0 - 1) * 10_000, 6);
    }
  });

  it("rejects a non-positive opening price rather than scoring against it", () => {
    expect(scoreOne("NVDA", NVDA, "premarket", 0, 2000, 1000)).toBeNull();
    expect(scoreOne("NVDA", NVDA, "premarket", NaN, 2000, 1000)).toBeNull();
  });
});

describe("summarize", () => {
  it("ranks estimators by mean absolute error, best first", () => {
    const scores = [
      scoreOne("A", NVDA, "premarket", 221.0, 2, 1)!,
      scoreOne("B", NVDA, "premarket", 220.9, 2, 1)!,
    ];
    const s = summarize(scores);
    expect(s.length).toBeGreaterThan(3);
    for (let i = 1; i < s.length; i++) expect(s[i]!.maeBp).toBeGreaterThanOrEqual(s[i - 1]!.maeBp);
    expect(s.every((x) => x.n === 2)).toBe(true);
  });

  it("uses absolute error, so opposite-signed misses do not cancel", () => {
    const hi = scoreOne("A", [q({ symbol: "S", family: "Ondo", price: 110, multiplier: 1 })], "premarket", 100, 2, 1)!;
    const lo = scoreOne("B", [q({ symbol: "S", family: "Ondo", price: 90, multiplier: 1 })], "premarket", 100, 2, 1)!;
    const only = summarize([hi, lo]).find((x) => x.estimator === "only_Ondo")!;
    expect(only.maeBp).toBeCloseTo(1000, 0);
  });

  it("returns nothing for no scores", () => {
    expect(summarize([])).toEqual([]);
  });
});

// ── open-event detection ────────────────────────────────────────────────

const UNIVERSE: UniverseEntry[] = [
  { chainId: "56", contractAddress: "0xon", symbol: "NVDAon", ticker: "NVDA", type: 1, multiplier: "1.0017152", d: 18 },
  { chainId: "56", contractAddress: "0xb",  symbol: "NVDAB",  ticker: "NVDA", type: 3, multiplier: "1.0007782", d: 18 },
];

class MockClient {
  status = "premarket";
  reference = "220.865";
  prices = new Map([["0xon", "221.264"], ["0xb", "220.792"]]);
  async universe() { return UNIVERSE; }
  async marketStatus() {
    return { marketStatus: this.status, openState: true, reasonCode: null, reasonMsg: null } as never;
  }
  async dynamic(addr: string): Promise<DynamicPayload | null> {
    const meta: Record<string, [number, string, string]> = {
      "0xon": [1, "1.0017152", "NVDAon"], "0xb": [3, "1.0007782", "NVDAB"],
    };
    const m = meta[addr]; if (!m) return null;
    return {
      symbol: m[2], ticker: "NVDA", type: m[0],
      tokenInfo: { price: this.prices.get(addr)!, sharesMultiplier: m[1], totalHolders: "5000",
                   bnTrader: "5000", volume24h: "1", circulatingSupply: null,
                   priceChange24h: null, priceChangePct24h: null, bnHolder: null },
      stockInfo: { price: this.reference, dividendYield: null, lastCashAmount: null },
      statusInfo: { openState: true, marketStatus: null, reasonCode: "TRADING", reasonMsg: null },
    };
  }
}

describe("Scorecard open-event detection", () => {
  it("finds the cycle where the regular session begins", async () => {
    const store = new AssayStore(":memory:");
    const client = new MockClient();
    const c = new Collector(client as unknown as BinanceRwaClient, store);

    await c.runCycle(1000);                      // premarket
    await c.runCycle(2000);                      // premarket - this is the mark
    client.status = "open"; client.reference = "222.500";
    await c.runCycle(3000);                      // rth - the open
    await c.runCycle(4000);                      // still rth, must not count

    const sc = new Scorecard(store);
    const events = sc.openEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ openTs: 3000, markTs: 2000, previousRegime: "premarket" });
  });

  it("scores the open against the pre-open mark", async () => {
    const store = new AssayStore(":memory:");
    const client = new MockClient();
    const c = new Collector(client as unknown as BinanceRwaClient, store);
    await c.runCycle(1000);
    await c.runCycle(2000);
    client.status = "open"; client.reference = "222.500";
    await c.runCycle(3000);

    const ev = new Scorecard(store).all();
    expect(ev).toHaveLength(1);
    const nvda = ev[0]!.scores.find((s) => s.ticker === "NVDA")!;
    expect(nvda.actualOpen).toBe(222.5);
    // The pre-open venue reference was 220.865, so it under-predicts the open.
    expect(nvda.errorsBp["venue_ref"]).toBeLessThan(0);
    expect(ev[0]!.summary.length).toBeGreaterThan(2);
  });

  it("ignores an open that a collection gap straddles", async () => {
    const store = new AssayStore(":memory:");
    const client = new MockClient();
    const c = new Collector(client as unknown as BinanceRwaClient, store);
    // Only regular-hours cycles exist; there is no pre-open mark to score.
    client.status = "open";
    await c.runCycle(1000);
    await c.runCycle(2000);
    expect(new Scorecard(store).openEvents()).toHaveLength(0);
  });

  it("reports an empty leaderboard before any open has been observed", async () => {
    const store = new AssayStore(":memory:");
    const o = new Scorecard(store).overall();
    expect(o).toMatchObject({ events: 0, tickers: 0, summary: [] });
  });
});
