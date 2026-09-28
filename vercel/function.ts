/**
 * Vercel serverless entry for `/api/*`.
 *
 * Module scope survives between invocations on a warm instance, so the universe, the
 * session status and the full-market sweep are cached across requests - and the CDN
 * caches responses on top of that via `s-maxage`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { BinanceRwaClient } from "../src/binance/client.js";
import { Recorded, DEFAULT_RECORDED_BASE } from "../src/live/recorded.js";
import { route } from "../src/live/router.js";
import { LiveSource } from "../src/live/source.js";

const live = new LiveSource(new BinanceRwaClient({ throttleMs: 25, retries: 2, timeoutMs: 8_000 }));
const recorded = new Recorded(process.env.ASSAY_RECORDED_BASE ?? DEFAULT_RECORDED_BASE);

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  // Vercel rewrites /api/<path> to this function as ?path=<path>.
  const path = url.searchParams.get("path") ?? url.pathname.replace(/^\/api\/?/, "");

  let status = 500, body: unknown = { error: "internal error" }, maxAge = 0;
  try {
    ({ status, body, maxAge } = await route(path, live, recorded));
  } catch (err) {
    body = { error: err instanceof Error ? err.message : String(err) };
  }

  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": maxAge > 0
      ? `public, s-maxage=${maxAge}, stale-while-revalidate=300`
      : "no-store",
  });
  res.end(JSON.stringify(body));
}
