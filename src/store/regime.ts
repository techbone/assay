import type { MarketRegime } from "../binance/types.js";

/**
 * Maps the venue's status payload onto a regime.
 *
 * The venue publishes `premarket`, `overnight`, `afterhours` and `closed` alongside its
 * regular session. An earlier version collapsed anything with `openState: true` into
 * `rth`, which silently labelled premarket as regular hours and anchored the reference
 * price to a quote the US tape had not yet produced.
 *
 * A null payload means the status call returned no data - which this API does with
 * `success: true` (DEVEX.md #4). That is recorded as `unknown`, never inferred.
 */
export function regimeOf(
  marketStatus: string | null | undefined,
  openState: boolean | null | undefined,
): MarketRegime {
  if (marketStatus === null || marketStatus === undefined) return "unknown";
  switch (marketStatus.toLowerCase()) {
    case "closed": return "closed";
    case "premarket": return "premarket";
    case "overnight": return "overnight";
    case "afterhours":
    case "aftermarket":
    case "postmarket": return "afterhours";
    case "offhours": return "offhours";
    case "open":
    case "regular":
    case "trading":
    case "rth": return "rth";
    // An unrecognised label with the venue open is still not proof of regular hours.
    default: return openState ? "offhours" : "closed";
  }
}
