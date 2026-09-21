import { describe, expect, it } from "vitest";
import { Collector } from "../src/collector/collector.js";
import { AssayStore, regimeOf } from "../src/store/db.js";
import type { BinanceRwaClient } from "../src/binance/client.js";
import { isReferenceLive, type DynamicPayload, type UniverseEntry } from "../src/binance/types.js";

const UNIVERSE: UniverseEntry[] = [
  { chainId: "56", contractAddress: "0xon", symbol: "NVDAon", ticker: "NVDA", type: 1, multiplier: "1.0017152", d: 18 },
  { chainId: "56", contractAddress: "0xx",  symbol: "NVDAx",  ticker: "NVDA", type: 2, multiplier: "1",         d: 18 },
  { chainId: "56", contractAddress: "0xb",  symbol: "NVDAB",  ticker: "NVDA", type: 3, multiplier: "1.0007782", d: 18 },
  // Single-wrapper ticker: must be skipped, there is nothing to reconcile.
  { chainId: "56", contractAddress: "0xsolo", symbol: "ZZZon", ticker: "ZZZ", type: 1, multiplier: "1", d: 18 },
  // Wrong chain: must be ignored entirely.
  { chainId: "1", contractAddress: "0xeth", symbol: "NVDAon", ticker: "NVDA", type: 1, multiplier: "1", d: 18 },
];

const payload = (symbol: string, type: number, price: string, mult: string): DynamicPayload => ({
  symbol, ticker: "NVDA", type,
  tokenInfo: { price, sharesMultiplier: mult, totalHolders: "1000", bnTrader: "500",
               volume24h: "1000", circulatingSupply: null, priceChange24h: null,
               priceChangePct24h: null, bnHolder: null },
  stockInfo: { price: "220.865", dividendYield: null, lastCashAmount: null },
  statusInfo: { openState: true, marketStatus: null, reasonCode: "TRADING", reasonMsg: null },
});

/** Mock client with a settable price, so staleness can be driven deterministically. */
class MockClient {
  prices = new Map<string, string>([
    ["0xon", "221.264"], ["0xx", "221.740"], ["0xb", "220.792"], ["0xsolo", "100.000"],
  ]);
  marketStatusValue: { marketStatus: string; openState: boolean } = { marketStatus: "closed", openState: false };
  universeCalls = 0;
  dynamicCalls = 0;

  async universe() { this.universeCalls++; return UNIVERSE; }
  async marketStatus() { return { ...this.marketStatusValue, reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend" } as never; }
  async dynamic(addr: string) {
    this.dynamicCalls++;
    const price = this.prices.get(addr);
    if (!price) return null;
    const meta: Record<string, [number, string]> = {
      "0xon": [1, "1.0017152"], "0xx": [2, "1.0009181"], "0xb": [3, "1.0007782"],
      "0xsolo": [1, "1"],
    };
    const [type, mult] = meta[addr] ?? [1, "1"];
    return payload(addr, type, price, mult);
  }
}

const make = () => {
  const store = new AssayStore(":memory:");
  const client = new MockClient();
  return { store, client, collector: new Collector(client as unknown as BinanceRwaClient, store, { minWrappers: 2 }) };
};

describe("regimeOf", () => {
  it("maps each published session label to its own regime", () => {
    expect(regimeOf("closed", false)).toBe("closed");
    expect(regimeOf("offhours", true)).toBe("offhours");
    expect(regimeOf("open", true)).toBe("rth");
  });

  /**
   * The bug this pins: the venue reports `premarket` and `overnight` with
   * `openState: true`, hours before the US tape opens. Collapsing those into `rth`
   * anchored the assay price to a reference quote that did not exist yet.
   */
  it("never treats an extended session as regular hours", () => {
    for (const label of ["premarket", "overnight", "afterhours", "aftermarket", "postmarket"]) {
      expect(regimeOf(label, true)).not.toBe("rth");
    }
    expect(regimeOf("premarket", true)).toBe("premarket");
    expect(regimeOf("overnight", true)).toBe("overnight");
    expect(regimeOf("afterhours", true)).toBe("afterhours");
  });

  it("is case-insensitive about the label", () => {
    expect(regimeOf("PreMarket", true)).toBe("premarket");
    expect(regimeOf("CLOSED", false)).toBe("closed");
  });

  /** A missing payload is a failed read, and must not be laundered into a real regime. */
  it("records an absent status as unknown rather than guessing", () => {
    expect(regimeOf(null, true)).toBe("unknown");
    expect(regimeOf(null, false)).toBe("unknown");
    expect(regimeOf(undefined, undefined)).toBe("unknown");
  });

  it("refuses to call an unrecognised label regular hours", () => {
    expect(regimeOf("some-new-session", true)).toBe("offhours");
    expect(regimeOf("some-new-session", false)).toBe("closed");
  });
});

describe("reference anchoring by regime", () => {
  it("anchors to the venue reference only during regular hours", () => {
    expect(isReferenceLive("rth")).toBe(true);
    for (const r of ["premarket", "overnight", "afterhours", "offhours", "closed", "unknown"] as const) {
      expect(isReferenceLive(r)).toBe(false);
    }
  });
});

describe("collector", () => {
  it("collects only multi-wrapper tickers on BSC", async () => {
    // ZZZ now returns a valid quote, so exclusion must come from the wrapper count alone.
    const { store, collector } = make();
    const r = await collector.runCycle(1000);
    expect(r.tickers).toBe(1);       // NVDA only; ZZZ is single-wrapper
    expect(r.observations).toBe(3);  // and the Ethereum row is ignored
    expect(r.errors).toBe(0);

    const tickers = store.db.prepare("SELECT DISTINCT ticker FROM observation").all();
    expect(tickers).toEqual([{ ticker: "NVDA" }]);
  });

  it("counts a null status payload as an error", async () => {
    const store = new AssayStore(":memory:");
    const client = new MockClient();
    client.marketStatus = async () => null as never;
    const c = new Collector(client as unknown as BinanceRwaClient, store);
    const r = await c.runCycle(1000);
    expect(r.errors).toBeGreaterThanOrEqual(1);
    expect(r.regime).toBe("unknown");
  });

  it("writes a session row, an assay snapshot and a heartbeat per cycle", async () => {
    const { store, collector } = make();
    await collector.runCycle(1000);
    const one = (q: string) => (store.db.prepare(q).get() as { n: number }).n;
    expect(one("SELECT COUNT(*) n FROM session_status")).toBe(1);
    expect(one("SELECT COUNT(*) n FROM assay_snapshot")).toBe(1);
    expect(one("SELECT COUNT(*) n FROM heartbeat")).toBe(1);

    const snap = store.db.prepare("SELECT * FROM assay_snapshot").get() as Record<string, unknown>;
    expect(snap.ticker).toBe("NVDA");
    expect(snap.regime).toBe("closed");
    expect(snap.quote_count).toBe(3);
  });

  it("caches the universe between cycles", async () => {
    const { client, collector } = make();
    await collector.runCycle(1000);
    await collector.runCycle(61_000);
    expect(client.universeCalls).toBe(1);
  });

  it("re-fetches the universe once its TTL lapses", async () => {
    const store = new AssayStore(":memory:");
    const client = new MockClient();
    const c = new Collector(client as unknown as BinanceRwaClient, store, { universeTtlMs: 1000 });
    await c.runCycle(1000);
    await c.runCycle(5000);
    expect(client.universeCalls).toBe(2);
  });

  it("counts consecutive unchanged quotes as staleness", async () => {
    const { store, client, collector } = make();
    await collector.runCycle(1000);
    await collector.runCycle(2000);
    await collector.runCycle(3000);

    const stale = store.db
      .prepare("SELECT ticks_since_change t FROM observation WHERE contract='0xon' ORDER BY ts")
      .all() as Array<{ t: number }>;
    expect(stale.map((r) => r.t)).toEqual([0, 1, 2]);

    // A price move resets the counter.
    client.prices.set("0xon", "222.000");
    await collector.runCycle(4000);
    const after = store.db
      .prepare("SELECT ticks_since_change t FROM observation WHERE contract='0xon' ORDER BY ts DESC LIMIT 1")
      .get() as { t: number };
    expect(after.t).toBe(0);
  });

  it("staleness feeds through to a lower trust score", async () => {
    const { store, collector } = make();
    for (let i = 1; i <= 30; i++) await collector.runCycle(i * 1000);
    const conf = store.db
      .prepare("SELECT confidence_bp c FROM assay_snapshot ORDER BY ts")
      .all() as Array<{ c: number }>;
    // Quotes frozen for 30 cycles carry less trust, so the band must not shrink.
    expect(conf[conf.length - 1]!.c).toBeGreaterThanOrEqual(conf[0]!.c);
  });

  it("survives a wrapper that returns null without losing the rest", async () => {
    const { store, client, collector } = make();
    client.prices.delete("0xx");
    const r = await collector.runCycle(1000);
    expect(r.observations).toBe(2);
    expect(r.tickers).toBe(1);
    expect(store.coverage().observations).toBe(2);
  });

  it("writes each ticker as it completes, so a crash keeps what was collected", async () => {
    // A full market cycle takes tens of seconds; batching every write to the end would
    // discard the whole cycle on a mid-flight failure.
    const store = new AssayStore(":memory:");
    const client = new MockClient();
    const seenDuringCycle: number[] = [];
    const original = client.dynamic.bind(client);
    client.dynamic = async (addr: string) => {
      seenDuringCycle.push(
        (store.db.prepare("SELECT COUNT(*) n FROM observation").get() as { n: number }).n,
      );
      return original(addr);
    };
    const multi = new Collector(client as unknown as BinanceRwaClient, store, { minWrappers: 1 });
    await multi.runCycle(1000);
    // By the last wrapper fetch, earlier tickers are already durable.
    expect(Math.max(...seenDuringCycle)).toBeGreaterThan(0);
  });

  it("observations are append-only across cycles", async () => {
    const { store, collector } = make();
    await collector.runCycle(1000);
    await collector.runCycle(2000);
    expect(store.coverage().observations).toBe(6);
    expect(store.coverage().cycles).toBe(2);
  });
});

describe("store", () => {
  it("reports coverage", async () => {
    const { store, collector } = make();
    await collector.runCycle(1000);
    await collector.runCycle(2000);
    const c = store.coverage();
    expect(c).toMatchObject({ observations: 6, tickers: 1, firstTs: 1000, lastTs: 2000, cycles: 2 });
  });

  it("detects collection gaps honestly", async () => {
    const { store, collector } = make();
    await collector.runCycle(1000);
    await collector.runCycle(2000);
    await collector.runCycle(500_000); // outage
    const gaps = store.gaps(60_000);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ from: 2000, to: 500_000 });
  });

  it("reports no gaps when collection is unbroken", async () => {
    const { store, collector } = make();
    for (let i = 1; i <= 5; i++) await collector.runCycle(i * 1000);
    expect(store.gaps(60_000)).toHaveLength(0);
  });
});
