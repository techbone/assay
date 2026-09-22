import { describe, expect, it } from "vitest";
import { BinanceRwaClient } from "../../src/binance/client.js";

/**
 * Opt-in: `npm run test:live`.
 *
 * These assert the shape of the upstream API, not our logic. They are excluded from the
 * regression suite so a Binance outage never turns the build red - but schema drift on a
 * field we depend on would silently corrupt weeks of collection, so it is worth checking
 * deliberately at each submission milestone.
 */
const client = new BinanceRwaClient();
const NVDAon = "0xa9ee28c80f960b889dfbd1902055218cba016f75";

describe("upstream schema", () => {
  it("dynamic payload still carries the fields the engine depends on", async () => {
    const d = await client.dynamic(NVDAon);
    expect(d).not.toBeNull();
    expect(d!.tokenInfo?.price).toBeTruthy();
    // The whole product rests on this field existing and being parseable.
    expect(Number(d!.tokenInfo?.sharesMultiplier)).toBeGreaterThan(0);
    expect(d!.statusInfo).toBeTruthy();
  }, 30_000);

  it("market status still publishes a session label", async () => {
    const s = await client.marketStatus();
    expect(s).not.toBeNull();
    expect(typeof s!.marketStatus === "string" || s!.marketStatus === null).toBe(true);
  }, 30_000);

  it("the universe still contains multi-wrapper tickers on BSC", async () => {
    const u = await client.universe();
    expect(u.filter((e) => e.chainId === "56").length).toBeGreaterThan(400);
  }, 60_000);
});
