/**
 * Read-only HTTP API over the collected store.
 *
 *   npx tsx src/api/server.ts [--port 8787] [--db data/assay.db]
 *
 * Plain node:http on purpose - this runs in the same container as the collector and
 * should add no dependency that could take the collector down with it.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { AssayStore } from "../store/db.js";
import { Queries } from "./queries.js";

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const port = Number(arg("--port", "8787"));
const dbPath = arg("--db", "data/assay.db");
const webRoot = arg("--web", "web/dist");

const store = new AssayStore(dbPath);
const q = new Queries(store);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function json(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    // The collector writes every 2 minutes; a short cache keeps reloads cheap
    // without letting a judge see stale numbers.
    "cache-control": "public, max-age=15",
  });
  res.end(payload);
}

function serveStatic(res: ServerResponse, urlPath: string): boolean {
  if (!existsSync(webRoot)) return false;
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
  let file = join(webRoot, rel || "index.html");
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(webRoot, "index.html");
  if (!existsSync(file)) return false;
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
  return true;
}

const handler = (req: IncomingMessage, res: ServerResponse): void => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const p = url.pathname;

  try {
    if (p === "/api/health") {
      const c = store.coverage();
      const ageMin = c.lastTs ? (Date.now() - c.lastTs) / 60_000 : Infinity;
      return json(res, { ok: ageMin < 6, ageMin, ...c, gaps: store.gaps(5 * 60_000).length },
                  ageMin < 6 ? 200 : 503);
    }
    if (p === "/api/summary") return json(res, q.summary());
    if (p === "/api/sessions") return json(res, q.sessions(Number(url.searchParams.get("hours") ?? 48)));
    if (p === "/api/tickers") {
      const rows = q.latest()
        .map((r) => {
          const worst = r.quotes
            .filter((x) => !x.rejected)
            .reduce((a, x) => (Math.abs(x.multiplierEffectBp) > Math.abs(a) ? x.multiplierEffectBp : a), 0);
          return {
            ticker: r.ticker, assayPrice: r.assayPrice, confidenceBp: r.confidenceBp,
            referencePrice: r.referencePrice, regime: r.regime,
            wrappers: r.quotes.length, accepted: r.accepted.length,
            phantomBp: worst,
            families: r.quotes.map((x) => x.family),
          };
        })
        .sort((a, b) => Math.abs(b.phantomBp) - Math.abs(a.phantomBp));
      return json(res, rows);
    }
    const m = /^\/api\/ticker\/([A-Za-z0-9.\-]+)$/.exec(p);
    if (m) {
      const r = q.ticker(m[1]!);
      if (!r) return json(res, { error: "unknown ticker" }, 404);
      return json(res, r);
    }
    const h = /^\/api\/history\/([A-Za-z0-9.\-]+)$/.exec(p);
    if (h) {
      return json(res, q.history(h[1]!, Number(url.searchParams.get("hours") ?? 24)));
    }
    if (p.startsWith("/api/")) return json(res, { error: "not found" }, 404);

    if (serveStatic(res, p)) return;
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found - build the web app with: npm run web:build");
  } catch (err) {
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

createServer(handler).listen(port, () => {
  console.log(`assay api · http://localhost:${port} · db=${dbPath}`);
  console.log(`  /api/summary  /api/tickers  /api/ticker/NVDA  /api/history/NVDA  /api/health`);
});
