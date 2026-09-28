/**
 * Serves `.vercel/output` the way Vercel does - the same routes, the same bundled
 * function - so the deploy artifact can be exercised before it is deployed.
 *
 *   npm run vercel-build && ASSAY_DNS=1.1.1.1,8.8.8.8 npm run vercel:local
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const OUT = ".vercel/output";
const PORT = Number(process.env.PORT ?? 3939);
const { default: handler } = await import(`../${OUT}/functions/api.func/index.mjs`);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const api = /^\/api\/(.*)$/.exec(url.pathname);
  if (api) {
    // Mirror config.json: /api/(.*) -> /api?path=$1, keeping the original query.
    url.searchParams.set("path", api[1]);
    req.url = `/api?${url.searchParams}`;
    return handler(req, res);
  }
  let file = join(OUT, "static", url.pathname);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(OUT, "static", "index.html");
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`vercel output served on http://localhost:${PORT}`));
