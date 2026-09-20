/** Issuer family, as encoded by the RWA API's `type` field. */
export enum WrapperFamily {
  Ondo = 1,
  xStock = 2,
  bStock = 3,
}

export const FAMILY_NAME: Record<number, string> = {
  [WrapperFamily.Ondo]: "Ondo",
  [WrapperFamily.xStock]: "xStock",
  [WrapperFamily.bStock]: "bStock",
};

/** Entry from `rwa/stock/detail/list/ai`. Note: its `multiplier` can lag the dynamic endpoint. */
export interface UniverseEntry {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  assetType?: number;
  /** Cached copy of sharesMultiplier. Treat as advisory — see DEVEX.md pitfall 2. */
  multiplier: string;
  lastUpdateTime?: number;
  /** token decimals */
  d: number;
  /** CEX spot symbol, present on bStocks */
  cs?: string;
}

export interface TokenInfo {
  price: string | null;
  priceChange24h: string | null;
  priceChangePct24h: string | null;
  totalHolders: string | null;
  /** Underlying shares represented by one token. The crux of this asset class. */
  sharesMultiplier: string | null;
  volume24h: string | null;
  circulatingSupply: string | null;
  /** Binance-side trader / holder counts — useful liquidity proxies. */
  bnTrader: string | null;
  bnHolder: string | null;
}

export interface StockInfo {
  /** Underlying equity reference price. Frozen while the tape is closed. */
  price: string | null;
  dividendYield: string | null;
  lastCashAmount: string | null;
}

export interface StatusInfo {
  openState: boolean | null;
  marketStatus: string | null;
  /** `TRADING`, or a corporate-action halt code (earnings, dividend, split, merger). */
  reasonCode: string | null;
  reasonMsg: string | null;
}

export interface DynamicPayload {
  symbol: string;
  ticker: string;
  type: number;
  tokenInfo: TokenInfo | null;
  stockInfo: StockInfo | null;
  statusInfo: StatusInfo | null;
}

export type MarketRegime = "rth" | "offhours" | "closed";

export interface MarketStatus {
  marketStatus: string | null;
  openState: boolean | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpen?: string;
  nextClose?: string;
  nextOpenTime?: number;
  nextCloseTime?: number;
  offhours?: { openState: boolean | null } | null;
}

/** Envelope shared by every bapi endpoint. */
export interface ApiEnvelope<T> {
  code: string;
  message: string | null;
  data: T | null;
  success: boolean;
}
