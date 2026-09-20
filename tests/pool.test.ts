import { describe, expect, it } from "vitest";
import { mapPool } from "../src/collector/pool.js";

describe("mapPool", () => {
  it("preserves input order regardless of completion order", async () => {
    const out = await mapPool([50, 10, 30, 0], 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 25 }, (_, i) => i), 4, async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("handles an empty list and a limit larger than the list", async () => {
    expect(await mapPool([], 8, async () => 1)).toEqual([]);
    expect(await mapPool([1, 2], 99, async (x) => x * 2)).toEqual([2, 4]);
  });

  it("processes every item exactly once", async () => {
    const seen = new Set<number>();
    const items = Array.from({ length: 100 }, (_, i) => i);
    await mapPool(items, 7, async (x) => { seen.add(x); });
    expect(seen.size).toBe(100);
  });
});
