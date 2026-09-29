import { describe, expect, it } from "vitest";
import { assay } from "../src/reference/engine.js";
import type { RawQuote } from "../src/reference/types.js";
import {
  bestExecution, eligibility, indicativeProvider, MIN_TRUST_INDICATIVE, type QuoteProvider,
} from "../src/route/best.js";

const q = (p: Partial<RawQuote> & Pick<RawQuote, "symbol" | "family" | "price" | "multiplier">): RawQuote =>
  ({ ticker: "SPY", statusCode: "TRADING", ...p }) as RawQuote;

/** Pinned from live BSC data, 2026-09-29 premarket. */
const SPY: RawQuote[] = [
  q({ symbol: "SPYon", family: "Ondo",   price: 772.620, multiplier: 1.009473, referencePrice: 765.37, holders: 40000, bnTrader: 20000 }),
  q({ symbol: "SPYB",  family: "bStock", price: 767.305, multiplier: 1.001730, referencePrice: 765.37, holders: 9000,  bnTrader: 9000 }),
  q({ symbol: "SPYx",  family: "xStock", price: 765.132, multiplier: 1.005715, referencePrice: 765.37, holders: 0,     bnTrader: 12 }),
];
const CONTRACTS = { SPYon: "0xon", SPYB: "0xb", SPYx: "0xx" };
const spy = () => assay("SPY", SPY, "premarket");

/** An executable-quote provider with scripted fills per contract. */
const scripted = (fills: Record<string, number | null>): QuoteProvider => ({
  kind: "executable",
  async quote({ toToken }) {
    const out = fills[toToken];
    return out ? { tokensOut: out, kind: "executable" } : null;
  },
});

describe("bestExecution — indicative", () => {
  it("ranks by shares actually bought, not by token price", async () => {
    const plan = await bestExecution(spy(), CONTRACTS, 1000, indicativeProvider);
    expect(plan.best!.symbol).toBe("SPYon");
    // SPYon's token is the most expensive on screen, yet it buys the most SPY.
    const trusted = plan.legs.filter((l) => l.shares !== null);
    expect(Math.max(...trusted.map((l) => l.quotedPrice))).toBe(plan.best!.quotedPrice);
  });

  it("exposes the multiplier trap: the cheaper token buys fewer shares", async () => {
    const plan = await bestExecution(spy(), CONTRACTS, 1000, indicativeProvider);
    expect(plan.multiplierBlindPick!.symbol).toBe("SPYB");
    expect(plan.multiplierBlindPick!.quotedPrice).toBeLessThan(plan.best!.quotedPrice);
    expect(plan.multiplierBlindShortfallShares!).toBeGreaterThan(0);
  });

  it("refuses to recommend a thin wrapper on its last trade alone", async () => {
    const plan = await bestExecution(spy(), CONTRACTS, 1000, indicativeProvider);
    const x = plan.legs.find((l) => l.symbol === "SPYx")!;
    expect(x.excluded).toMatch(/too thin/);
    expect(x.shares).toBeNull();
    // ...which is exactly what a price-only router would have bought.
    expect(plan.naivePick!.symbol).toBe("SPYx");
    expect(plan.naiveVerdict).toBe("excluded");
  });

  it("costs per share and premiums are consistent with the spend", async () => {
    const plan = await bestExecution(spy(), CONTRACTS, 1000, indicativeProvider);
    for (const l of plan.legs.filter((x) => x.shares !== null)) {
      expect(l.costPerShare! * l.shares!).toBeCloseTo(1000, 6);
      expect(l.premiumBp!).toBeCloseTo((l.costPerShare! / plan.assayPrice - 1) * 10_000, 6);
    }
  });
});

describe("bestExecution — executable", () => {
  it("lets a thin wrapper win when a real quote proves it", async () => {
    // Executable fills: SPYx genuinely delivers the most shares.
    const plan = await bestExecution(spy(), CONTRACTS, 1000,
      scripted({ "0xon": 1.2940, "0xb": 1.3030, "0xx": 1.3040 }));
    expect(plan.quoteKind).toBe("executable");
    expect(plan.best!.symbol).toBe("SPYx");
  });

  it("never recommends a wrapper the engine rejected, however good its quote", async () => {
    const halted = assay("SPY", SPY.map((x) => (x.symbol === "SPYon" ? { ...x, statusCode: "DIVIDEND" } : x)), "premarket");
    const plan = await bestExecution(halted, CONTRACTS, 1000,
      scripted({ "0xon": 99, "0xb": 1.3030, "0xx": 1.3000 }));
    expect(plan.best!.symbol).not.toBe("SPYon");
    expect(plan.legs.find((l) => l.symbol === "SPYon")!.excluded).toBe("not trading");
  });

  it("drops a wrapper whose quote fails, rather than guessing", async () => {
    const plan = await bestExecution(spy(), CONTRACTS, 1000, scripted({ "0xon": null, "0xb": 1.3030, "0xx": null }));
    expect(plan.best!.symbol).toBe("SPYB");
    expect(plan.legs.find((l) => l.symbol === "SPYon")!.excluded).toBe("no quote");
  });

  it("survives a provider that throws", async () => {
    const boom: QuoteProvider = { kind: "executable", quote: async () => { throw new Error("baw down"); } };
    const plan = await bestExecution(spy(), CONTRACTS, 1000, boom);
    expect(plan.best).toBeNull();
    expect(plan.legs.every((l) => l.excluded !== null)).toBe(true);
  });
});

describe("eligibility", () => {
  it("applies the thin-wrapper bar only to indicative quotes", () => {
    const thin = { symbol: "S", family: "xStock", contract: "0x", multiplier: 1, quotedPrice: 1,
                   trust: MIN_TRUST_INDICATIVE - 0.01, rejected: null };
    expect(eligibility(thin, "indicative")).toMatch(/too thin/);
    expect(eligibility(thin, "executable")).toBeNull();
  });

  it("rejects non-positive spend", async () => {
    await expect(bestExecution(spy(), CONTRACTS, 0, indicativeProvider)).rejects.toThrow();
  });
});

describe("bestExecution — the wallet router prices Ondo tokens per share", () => {
  /**
   * Observed 2026-09-29 on live Binance Agentic Wallet quotes: the router values an Ondo
   * token at roughly the underlying share price, ignoring `sharesMultiplier` (PFEon: token
   * 30.574 on screen, router 28.842, share 28.820, multiplier 1.06093). Counting tokens,
   * a buyer would think the bStock leg is as good; counting shares - which is what the
   * money buys - the Ondo leg delivers ~6% more stock.
   */
  const PFE: RawQuote[] = [
    q({ ticker: "PFE", symbol: "PFEon", family: "Ondo",   price: 30.574, multiplier: 1.06093, referencePrice: 28.82, holders: 20000, bnTrader: 9000 }),
    q({ ticker: "PFE", symbol: "PFEB",  family: "bStock", price: 28.83,  multiplier: 1.0,     referencePrice: 28.82, holders: 9000,  bnTrader: 9000 }),
  ];
  const routerPerShare = scripted({ "0xpon": 100 / 28.842, "0xpb": 100 / 28.83 });

  it("ranks by shares, so the multiplier the router ignored is credited to the buyer", async () => {
    const plan = await bestExecution(assay("PFE", PFE, "premarket"), { PFEon: "0xpon", PFEB: "0xpb" }, 100, routerPerShare);
    const on = plan.legs.find((l) => l.symbol === "PFEon")!;
    const b = plan.legs.find((l) => l.symbol === "PFEB")!;
    // Fewer tokens...
    expect(on.quote!.tokensOut).toBeLessThan(b.quote!.tokensOut);
    // ...but ~6% more stock.
    expect(on.shares! / b.shares! - 1).toBeGreaterThan(0.05);
    expect(plan.best!.symbol).toBe("PFEon");
  });
});
