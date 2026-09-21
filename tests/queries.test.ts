import { describe, expect, it } from "vitest";
import { Queries } from "../src/api/queries.js";
import { Collector } from "../src/collector/collector.js";
import { AssayStore } from "../src/store/db.js";
import type { BinanceRwaClient } from "../src/binance/client.js";
import type { DynamicPayload, UniverseEntry } from "../src/binance/types.js";

const UNIVERSE: UniverseEntry[] = [
  { chainId: "56", contractAddress: "0xon", symbol: "NVDAon", ticker: "NVDA", type: 1, multiplier: "1.0017152", d: 18 },
  { chainId: "56", contractAddress: "0xb",  symbol: "NVDAB",  ticker: "NVDA", type: 3, multiplier: "1.0007782", d: 18 },
  { chainId: "56", contractAddress: "0xson", symbol: "SPYon", ticker: "SPY", type: 1, multiplier: "1.009473", d: 18 },
  { chainId: "56", contractAddress: "0xsb",  symbol: "SPYB",  ticker: "SPY", type: 3, multiplier: "1.00173",  d: 18 },
];

const META: Record<string, [number, string, string, string]> = {
  "0xon": [1, "1.0017152", "221.264", "220.865"],
  "0xb":  [3, "1.0007782", "220.792", "220.865"],
  "0xson": [1, "1.009473", "769.516", "762.29"],
  "0xsb":  [3, "1.00173",  "762.076", "762.29"],
};

class MockClient {
  status: string = "closed";
  prices = new Map(Object.entries(META).map(([k, v]) => [k, v[2]]));
  async universe() { return UNIVERSE; }
  async marketStatus() { return { marketStatus: this.status, openState: this.status !== "closed", reasonCode: null, reasonMsg: null } as never; }
  async dynamic(addr: string): Promise<DynamicPayload | null> {
    const m = META[addr]; if (!m) return null;
    const [type, mult, , ref] = m;
    return {
      symbol: UNIVERSE.find((u) => u.contractAddress === addr)!.symbol,
      ticker: UNIVERSE.find((u) => u.contractAddress === addr)!.ticker,
      type,
      tokenInfo: { price: this.prices.get(addr)!, sharesMultiplier: mult, totalHolders: "5000",
                   bnTrader: "5000", volume24h: "1000", circulatingSupply: null,
                   priceChange24h: null, priceChangePct24h: null, bnHolder: null },
      stockInfo: { price: ref, dividendYield: null, lastCashAmount: null },
      statusInfo: { openState: true, marketStatus: null, reasonCode: "TRADING", reasonMsg: null },
    };
  }
}

async function seed(cycles = 3) {
  const store = new AssayStore(":memory:");
  const client = new MockClient();
  const c = new Collector(client as unknown as BinanceRwaClient, store);
  for (let i = 1; i <= cycles; i++) await c.runCycle(Date.now() - (cycles - i) * 120_000);
  return { store, client, q: new Queries(store) };
}

describe("Queries", () => {
  it("returns every collected ticker at the latest cycle", async () => {
    const { q } = await seed();
    const rows = q.latest();
    expect(rows.map((r) => r.ticker).sort()).toEqual(["NVDA", "SPY"]);
    for (const r of rows) expect(r.quotes).toHaveLength(2);
  });

  /**
   * The collector writes each ticker as it finishes, so MAX(ts) on observations is a
   * cycle still in flight. Reading it drops every ticker not yet polled - which showed
   * up live as the API reporting 74 of 117 tickers.
   */
  it("ignores a cycle still in flight", async () => {
    const { store, q } = await seed();
    const complete = q.latestTs()!;
    // Simulate a partial cycle: one ticker written, no heartbeat yet.
    store.writeObservations([{
      ts: complete + 120_000, ticker: "NVDA", symbol: "NVDAon", contract: "0xon",
      family: "Ondo", price: 221.3, multiplier: 1.0017152, regime: "closed",
    } as never]);

    expect(q.latestTs()).toBe(complete);
    expect(q.latest().map((r) => r.ticker).sort()).toEqual(["NVDA", "SPY"]);
  });

  it("falls back to observations when no cycle has completed", async () => {
    const store = new AssayStore(":memory:");
    store.writeObservations([{
      ts: 5000, ticker: "NVDA", symbol: "NVDAon", contract: "0xon",
      family: "Ondo", price: 221.3, multiplier: 1.0017152, regime: "closed",
    } as never]);
    expect(new Queries(store).latestTs()).toBe(5000);
  });

  it("returns null for an unknown ticker and is case-insensitive", async () => {
    const { q } = await seed();
    expect(q.ticker("NOPE")).toBeNull();
    expect(q.ticker("nvda")?.ticker).toBe("NVDA");
  });

  it("builds a basis history with the decomposition intact", async () => {
    const { q } = await seed(4);
    const h = q.history("NVDA", 24);
    expect(h.length).toBeGreaterThanOrEqual(4);
    for (const point of h) {
      expect(point.wrappers).toHaveLength(2);
      for (const w of point.wrappers) {
        expect(w.naiveBasisBp).toBeCloseTo(w.trueBasisBp + w.multiplierEffectBp, 6);
      }
    }
  });

  it("downsamples by dropping cycles, never by averaging", async () => {
    const { q } = await seed(40);
    const h = q.history("NVDA", 24, 10);
    expect(h.length).toBeLessThanOrEqual(11);
    // Every retained point is a real cycle, so its decomposition still holds exactly.
    for (const p of h) {
      for (const w of p.wrappers) expect(w.naiveBasisBp).toBeCloseTo(w.trueBasisBp + w.multiplierEffectBp, 6);
    }
  });

  it("summarises drift apart from fractionalisation", async () => {
    const { q } = await seed();
    const s = q.summary();
    expect(s.tickers).toBe(2);
    expect(s.wrappers).toBe(4);
    expect(s.families).toMatchObject({ Ondo: 2, bStock: 2 });
    // SPYon carries ~95bp of accrued distribution; it must show up as drift.
    expect(s.phantomBp.max).toBeGreaterThan(50);
    expect(s.fractional).toBe(0);
  });

  it("collapses the session timeline into contiguous regimes", async () => {
    const store = new AssayStore(":memory:");
    const q = new Queries(store);
    const base = Date.now() - 3_600_000;
    for (const [i, r] of (["closed", "closed", "premarket", "premarket", "rth"] as const).entries()) {
      store.writeSession({ ts: base + i * 60_000, marketStatus: r, openState: true,
                           reasonCode: null, reasonMsg: null, regime: r });
    }
    const s = q.sessions(48);
    expect(s.map((x) => x.regime)).toEqual(["closed", "premarket", "rth"]);
  });

  it("reports unknown regime when no session has been recorded", async () => {
    const store = new AssayStore(":memory:");
    expect(new Queries(store).regimeAt(Date.now())).toBe("unknown");
  });

  it("handles an empty store without throwing", async () => {
    const q = new Queries(new AssayStore(":memory:"));
    expect(q.latestTs()).toBeNull();
    expect(q.latest()).toEqual([]);
    expect(q.history("NVDA")).toEqual([]);
    expect(q.summary().tickers).toBe(0);
  });
});
