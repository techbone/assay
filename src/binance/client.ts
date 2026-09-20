import type {
  ApiEnvelope, DynamicPayload, MarketStatus, StatusInfo, UniverseEntry,
} from "./types.js";

const BAPI = "https://www.binance.com/bapi/defi";

/**
 * Both headers are load-bearing and undocumented in the API reference; without
 * them requests fail opaquely. Found in the Skills Hub source. See DEVEX.md #7.
 */
const HEADERS: Record<string, string> = {
  "Accept-Encoding": "identity",
  "User-Agent": "assay/0.1 (BNB Hack Tokenized Stocks)",
};

export const BSC_CHAIN_ID = "56";

export class BinanceApiError extends Error {
  constructor(message: string, readonly url: string, readonly code?: string) {
    super(message);
    this.name = "BinanceApiError";
  }
}

export interface ClientOptions {
  /** Delay between calls; the API has no documented rate limit, so we self-throttle. */
  throttleMs?: number;
  retries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class BinanceRwaClient {
  private readonly throttleMs: number;
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private lastCallAt = 0;

  constructor(opts: ClientOptions = {}) {
    this.throttleMs = opts.throttleMs ?? 120;
    this.retries = opts.retries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async get<T>(url: string): Promise<T | null> {
    const wait = this.throttleMs - (Date.now() - this.lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
        try {
          const res = await this.fetchImpl(url, { headers: HEADERS, signal: ctrl.signal });
          this.lastCallAt = Date.now();
          if (!res.ok) throw new BinanceApiError(`HTTP ${res.status}`, url);
          const body = (await res.json()) as ApiEnvelope<T>;
          // `success: true` with `data: null` is returned for unknown assets —
          // we must check data, not success. See DEVEX.md #4.
          if (body.code !== "000000") {
            throw new BinanceApiError(body.message ?? "api error", url, body.code);
          }
          return body.data;
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastErr = err;
        if (attempt < this.retries) {
          await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new BinanceApiError(String(lastErr), url);
  }

  /** Full tokenized-stock universe across all chains. */
  async universe(): Promise<UniverseEntry[]> {
    const d = await this.get<UniverseEntry[]>(
      `${BAPI}/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai`,
    );
    return d ?? [];
  }

  /** Full real-time payload for one wrapper. `null` means the asset is unknown. */
  async dynamic(contractAddress: string, chainId = BSC_CHAIN_ID): Promise<DynamicPayload | null> {
    return this.get<DynamicPayload>(
      `${BAPI}/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai` +
        `?chainId=${chainId}&contractAddress=${contractAddress}`,
    );
  }

  /** Venue-wide session state, including next open/close boundaries. */
  async marketStatus(): Promise<MarketStatus | null> {
    return this.get<MarketStatus>(
      `${BAPI}/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai`,
    );
  }

  /** Per-asset trading status — carries corporate-action halt codes. */
  async assetStatus(contractAddress: string, chainId = BSC_CHAIN_ID): Promise<StatusInfo | null> {
    return this.get<StatusInfo>(
      `${BAPI}/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai` +
        `?chainId=${chainId}&contractAddress=${contractAddress}`,
    );
  }

  /** OHLC candles. Note: the volume slot returns "0" — see DEVEX.md #6. */
  async kline(
    contractAddress: string,
    interval = "1d",
    limit = 100,
    chainId = BSC_CHAIN_ID,
  ): Promise<{ klineInfos: (string | number)[][]; decimals: number } | null> {
    return this.get(
      `${BAPI}/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai` +
        `?chainId=${chainId}&contractAddress=${contractAddress}&interval=${interval}&limit=${limit}`,
    );
  }
}

/** Groups a universe listing into ticker -> wrappers, for one chain. */
export function groupByTicker(
  entries: UniverseEntry[],
  chainId = BSC_CHAIN_ID,
): Map<string, UniverseEntry[]> {
  const out = new Map<string, UniverseEntry[]>();
  for (const e of entries) {
    if (e.chainId !== chainId) continue;
    const list = out.get(e.ticker);
    if (list) list.push(e);
    else out.set(e.ticker, [e]);
  }
  return out;
}
