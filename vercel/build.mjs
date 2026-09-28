/**
 * Emits Vercel's Build Output API (v3) directly: the static site plus one bundled
 * serverless function for /api. Owning the output means the exact artifact Vercel runs
 * can be exercised locally (`npm run vercel:local`) before anything is deployed.
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const OUT = ".vercel/output";
// Germany is outside Binance's Web3 API restricted regions; Vercel's default (iad1) is not.
const REGION = process.env.ASSAY_FUNCTION_REGION ?? "fra1";

rmSync(OUT, { recursive: true, force: true });

execSync("npx vite build", { stdio: "inherit" });
mkdirSync(`${OUT}/static`, { recursive: true });
cpSync("web/dist", `${OUT}/static`, { recursive: true });

const fn = `${OUT}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ["vercel/function.ts"],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Bundled CommonJS dependencies still call require(); give ESM one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  maxDuration: 60,
  regions: [REGION],
}, null, 2));

writeFileSync(`${OUT}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: "^/api/(.*)$", dest: "/api?path=$1" },
    { handle: "filesystem" },
    { src: "^/(.*)$", dest: "/index.html" },
  ],
}, null, 2));

console.log(`build output ready: ${OUT} (function region ${REGION})`);
