import { describe, expect, it } from "vitest";
import { LiveSource } from "../src/live/source.js";
import { Recorded } from "../src/live/recorded.js";
import { route } from "../src/live/router.js";
import type { BinanceRwaClient } from "../src/binance/client.js";
import type { DynamicPayload, UniverseEntry } from "../src/binance/types.js";

const UNIVERSE: UniverseEntry[] = [
  { chainId: "56", contractAddress: "0xon",  symbol: "NVDAon", ticker: "NVDA", type: 1, multiplier: "1.0017152", d: 18 },
  { chainId: "56", contractAddress: "0xb",   symbol: "NVDAB",  ticker: "NVDA", type: 3, multiplier: "1.0007782", d: 18 },
  { chainId: "56", contractAddress: "0xson", symbol: "SPYon",  ticker: "SPY",  type: 1, multiplier: "1.009473",  d: 18 },
  { chainId: "56", contractAddress: "0xsb",  symbol: "SPYB",   ticker: "SPY",  type: 3, multiplier: "1.00173",   d: 18 },
  // Single wrapper and wrong chain: neither belongs in a cross-wrapper reference.
  { chainId: "56", contractAddress: "0xsolo", symbol: "ZZZon", ticker: "ZZZ", type: 1, multiplier: "1", d: 18 },
  { chainId: "1",  contractAddress: "0xeth",  symbol: "NVDAon", ticker: "NVDA", type: 1, multiplier: "1", d: 18 },
];

const QUOTES: Record<string, [string, number, string, string, string]> = {
  // addr: [symbol, type, price, multiplier, reference]
  "0xon":  ["NVDAon", 1, "221.264", "1.0017152", "220.865"],
  "0xb":   ["NVDAB",  3, "220.792", "1.0007782", "220.865"],
  "0xson": ["SPYon",  1, "769.516", "1.009473",  "762.29"],
  "0xsb":  ["SPYB",   3, "762.076", "1.00173",   "762.29"],
  "0xsolo":["ZZZon",  1, "10",      "1",         "10"],
};

class FakeClient {
  calls = { universe: 0, status: 0, dynamic: 0 };
  status: string | null = "premarket";
  async universe() { this.calls.universe++; return UNIVERSE; }
  async marketStatus() {
    this.calls.status++;
    return this.status === null ? null : ({ marketStatus: this.status, openState: true } as never);
  }
  async dynamic(addr: string): Promise<DynamicPayload | null> {
    this.calls.dynamic++;
    const q = QUOTES[addr];
    if (!q) return null;
    const [symbol, type, price, mult, ref] = q;
    return {
      symbol, ticker: "", type,
      tokenInfo: { price, sharesMultiplier: mult, totalHolders: "5000", bnTrader: "5000", volume24h: "1",
                   circulatingSupply: null, priceChange24h: null, priceChangePct24h: null, bnHolder: null },
      stockInfo: { price: ref, dividendYield: null, lastCashAmount: null },
      statusInfo: { openState: true, marketStatus: null, reasonCode: "TRADING", reasonMsg: null },
    };
  }
}

/** A fetch that serves a fixed map of recorded files and 404s everything else. */
const recordedFetch = (files: Record<string, unknown>) =>
  (async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/[^/]+/, "");
    return path in files
      ? new Response(JSON.stringify(files[path]), { status: 200 })
      : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

const META = {
  lastCycleTs: 1790000000000,
  coverage: { observations: 500000, tickers: 118, firstTs: 1789900000000, lastTs: 1790000000000, cycles: 2200 },
};

function setup(files: Record<string, unknown> = { "/meta.json": META }) {
  const client = new FakeClient();
  const live = new LiveSource(client as unknown as BinanceRwaClient);
  const recorded = new Recorded("https://raw.githubusercontent.com/x/y/data", recordedFetch(files));
  return { client, live, recorded };
}

describe("live router", () => {
  it("prices every multi-wrapper BSC ticker live, and nothing else", async () => {
    const { live, recorded } = setup();
    const r = await route("tickers", live, recorded);
    expect(r.status).toBe(200);
    const rows = r.body as Array<{ ticker: string }>;
    expect(rows.map((x) => x.ticker).sort()).toEqual(["NVDA", "SPY"]);
  });

  it("uses the same engine: the phantom premium survives the trip", async () => {
    const { live, recorded } = setup();
    const r = await route("ticker/NVDA", live, recorded);
    const q = (r.body as { quotes: Array<{ symbol: string; multiplierEffectBp: number; trueBasisBp: number }> })
      .quotes.find((x) => x.symbol === "NVDAon")!;
    expect(q.multiplierEffectBp).toBeGreaterThan(15);
    expect(Math.abs(q.trueBasisBp)).toBeLessThan(25);
  });

  it("combines live prices with the collector's recorded coverage in the summary", async () => {
    const { live, recorded } = setup();
    const r = await route("summary", live, recorded);
    const s = r.body as { tickers: number; regime: string; ts: number; coverage: { observations: number } };
    expect(s.tickers).toBe(2);
    expect(s.regime).toBe("premarket");
    expect(Date.now() - s.ts).toBeLessThan(5_000);          // prices are fresh...
    expect(s.coverage.observations).toBe(500000);           // ...history is recorded
    expect(r.maxAge).toBeGreaterThan(0);
  });

  it("still answers when nothing has been recorded yet", async () => {
    const { live, recorded } = setup({});
    const s = (await route("summary", live, recorded)).body as { coverage: { observations: number } };
    expect(s.coverage.observations).toBe(0);
    const sc = (await route("scorecard", live, recorded)).body as { overall: { events: number } };
    expect(sc.overall.events).toBe(0);
  });

  it("is case-insensitive about tickers and 404s unknown ones", async () => {
    const { live, recorded } = setup();
    expect((await route("ticker/nvda", live, recorded)).status).toBe(200);
    expect((await route("ticker/NOPE", live, recorded)).status).toBe(404);
  });

  it("rejects malformed tickers before touching upstream", async () => {
    const { client, live, recorded } = setup();
    expect((await route("ticker/..%2f..%2fetc", live, recorded)).status).toBe(400);
    expect((await route("history/a b", live, recorded)).status).toBe(400);
    expect(client.calls.dynamic).toBe(0);
  });

  it("relays recorded history, and 404s where none was recorded", async () => {
    const series = { ts: [1, 2], wrappers: [] };
    const { live, recorded } = setup({ "/history/NVDA.json": series });
    const ok = await route("history/nvda", live, recorded);
    expect(ok).toMatchObject({ status: 200, body: series });
    expect((await route("history/SPY", live, recorded)).status).toBe(404);
  });

  it("reports unhealthy when Binance is unreachable, rather than serving silence", async () => {
    const { client, live, recorded } = setup();
    client.status = null;
    const r = await route("health", live, recorded);
    expect(r.status).toBe(503);
    expect(r.maxAge).toBe(0);
    expect((r.body as { recorded: { lastCycleTs: number } }).recorded.lastCycleTs).toBe(META.lastCycleTs);
  });

  it("404s unknown routes", async () => {
    const { live, recorded } = setup();
    expect((await route("nope", live, recorded)).status).toBe(404);
  });
});

describe("live caching", () => {
  it("concurrent requests share one upstream sweep instead of stampeding Binance", async () => {
    const { client, live, recorded } = setup();
    await Promise.all([
      route("tickers", live, recorded),
      route("summary", live, recorded),
      route("tickers", live, recorded),
    ]);
    expect(client.calls.universe).toBe(1);
    expect(client.calls.dynamic).toBe(4); // 2 tickers x 2 wrappers, once
  });

  it("serves repeat requests from cache within the TTL", async () => {
    const { client, live, recorded } = setup();
    await route("tickers", live, recorded);
    await route("tickers", live, recorded);
    expect(client.calls.dynamic).toBe(4);
  });

  it("refreshes once the TTL lapses", async () => {
    const client = new FakeClient();
    const live = new LiveSource(client as unknown as BinanceRwaClient, { latestTtlMs: 0 });
    const recorded = new Recorded("https://x/y/z/data", recordedFetch({}));
    await route("tickers", live, recorded);
    await route("tickers", live, recorded);
    expect(client.calls.dynamic).toBe(8);
  });
});

describe("live router — buy", () => {
  it("prices a buy across wrappers and names the best", async () => {
    const { live, recorded } = setup();
    const r = await route("buy/SPY", live, recorded, new URLSearchParams({ spend: "1000" }));
    expect(r.status).toBe(200);
    const plan = r.body as { best: { symbol: string }; quoteKind: string; spend: number };
    expect(plan.quoteKind).toBe("indicative");
    expect(plan.spend).toBe(1000);
    expect(["SPYon", "SPYB"]).toContain(plan.best.symbol);
  });

  it("validates spend and ticker", async () => {
    const { live, recorded } = setup();
    for (const spend of ["0", "-5", "abc", "1000000"]) {
      expect((await route("buy/SPY", live, recorded, new URLSearchParams({ spend }))).status).toBe(400);
    }
    expect((await route("buy/NOPE", live, recorded)).status).toBe(404);
    expect((await route("buy/a b", live, recorded)).status).toBe(400);
  });
});
