import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { QuoteProvider } from "./best.js";

const run = promisify(execFile);

/** BSC-USD (USDT on BNB Smart Chain) - the default spend token. */
export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

/**
 * Executable quotes from Binance's Agentic Wallet CLI (`baw market-order quote`): the
 * tokens a swap would actually deliver, route and slippage included.
 *
 * Assay only asks for quotes. Executing the swap is left to Binance's own
 * `binance-agentic-wallet` skill, which runs its security pre-check and requires the
 * user's confirmation - Assay decides what to buy, the wallet does the buying.
 */
export function bawProvider(opts: { fromToken?: string; command?: string } = {}): QuoteProvider {
  const fromToken = opts.fromToken ?? USDT_BSC;
  const [bin, ...pre] = (opts.command ?? process.env.ASSAY_BAW ?? "baw").split(/\s+/);

  return {
    kind: "executable",
    async quote({ toToken, spend }) {
      const { stdout } = await run(bin!, [
        ...pre, "market-order", "quote",
        "--fromTokenQty", String(spend),
        "--fromToken", fromToken,
        "--toToken", toToken,
        "--binanceChainId", "56",
        "--json",
      ], { timeout: 30_000 });
      const body = JSON.parse(stdout) as { success?: boolean; data?: { toCoinAmount?: string } };
      const out = Number(body.data?.toCoinAmount);
      return body.success && out > 0 ? { tokensOut: out, kind: "executable" } : null;
    },
  };
}

/** True when `baw` is installed and signed in, so executable quotes are available. */
export async function bawReady(command = process.env.ASSAY_BAW ?? "baw"): Promise<boolean> {
  const [bin, ...pre] = command.split(/\s+/);
  try {
    const { stdout } = await run(bin!, [...pre, "wallet", "status", "--json"], { timeout: 20_000 });
    return !/UNCONNECTED/i.test(stdout) && /CONNECTED|success"\s*:\s*true/i.test(stdout);
  } catch {
    return false;
  }
}
