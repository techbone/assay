#!/usr/bin/env node
/**
 * Does the Binance Agentic Wallet router price tokenized stocks per token or per share?
 *
 *   node router-check.mjs PFE STRC PEP SPY TSM NVDA
 *
 * For each Ondo/bStock wrapper, compares the router's executable price per token against the
 * token's screen price and against the underlying share price. If the router's gap tracks
 * -(multiplier - 1), it is valuing one token as one share and ignoring accrued dividends.
 * Read-only: quotes only, no funds needed. Requires `baw` signed in.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const API = process.env.ASSAY_API ?? "https://assay-woad.vercel.app";
const BAW = (process.env.ASSAY_BAW ?? "baw").split(/\s+/);
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const SPEND = Number(process.env.SPEND ?? 100);
const tickers = process.argv.slice(2).length ? process.argv.slice(2) : ["PFE", "STRC", "PEP", "SPY", "TSM", "NVDA"];

async function routerTokens(contract) {
  let stdout;
  try {
    ({ stdout } = await run(BAW[0], [...BAW.slice(1), "market-order", "quote", "--fromTokenQty", String(SPEND),
      "--fromToken", USDT, "--toToken", contract, "--binanceChainId", "56", "--json"], { timeout: 30_000 }));
  } catch (e) { stdout = e?.stdout; }
  try { const n = Number(JSON.parse(stdout)?.data?.toCoinAmount); return n > 0 ? n : null; } catch { return null; }
}

console.log(`router quote for $${SPEND} USDT, ${new Date().toISOString()}\n`);
console.log("wrapper   family     mult    screen  router/tok   share px   router vs screen   -(mult-1)");
for (const t of tickers) {
  const [tk, buy] = await Promise.all([
    fetch(`${API}/api/ticker/${t}`).then((r) => r.json()),
    fetch(`${API}/api/buy/${t}?spend=${SPEND}`).then((r) => r.json()),
  ]);
  const share = tk.referencePrice;
  for (const l of buy.legs.filter((x) => (x.family === "Ondo" || x.family === "bStock") && !x.rejected)) {
    const tokens = await routerTokens(l.contract);
    if (!tokens) { console.log(`${l.symbol.padEnd(9)} ${l.family.padEnd(7)} no quote`); continue; }
    const perToken = SPEND / tokens;
    const gap = (perToken / l.quotedPrice - 1) * 1e4;
    console.log(`${l.symbol.padEnd(9)} ${l.family.padEnd(7)} ${l.multiplier.toFixed(5)} ${l.quotedPrice.toFixed(3).padStart(9)} ` +
      `${perToken.toFixed(3).padStart(11)} ${(share ?? NaN).toFixed(3).padStart(10)} ` +
      `${(gap >= 0 ? "+" : "") + gap.toFixed(1)}bp`.padStart(19) + `${(-(l.multiplier - 1) * 1e4).toFixed(1)}bp`.padStart(13));
  }
}
