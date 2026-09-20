-- Assay store. Raw observations are append-only and never mutated: the engine will
-- improve over the build window, and every derived table must stay recomputable from
-- this one. A day not collected is evidence lost forever, so collection precedes polish.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- One row per wrapper per poll. The sacred table.
CREATE TABLE IF NOT EXISTS observation (
  id               INTEGER PRIMARY KEY,
  ts               INTEGER NOT NULL,          -- poll time, epoch ms
  ticker           TEXT    NOT NULL,
  symbol           TEXT    NOT NULL,
  contract         TEXT    NOT NULL,
  family           TEXT    NOT NULL,
  price            REAL,
  multiplier       REAL,
  list_multiplier  REAL,
  reference_price  REAL,                      -- frozen outside RTH
  status_code      TEXT,
  holders          INTEGER,
  bn_trader        INTEGER,
  volume24h        REAL,
  regime           TEXT    NOT NULL,
  -- Derived at write time because it needs the previous row: consecutive polls in which
  -- this wrapper's quote has not moved. The API exposes no lastTradeTime (DEVEX.md #5),
  -- so staleness has to be synthesised by diffing.
  ticks_since_change INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_obs_ticker_ts   ON observation (ticker, ts);
CREATE INDEX IF NOT EXISTS idx_obs_contract_ts ON observation (contract, ts);
CREATE INDEX IF NOT EXISTS idx_obs_ts          ON observation (ts);

-- Venue session state, sampled each cycle. Drives regime and the scorecard's boundaries.
CREATE TABLE IF NOT EXISTS session_status (
  ts              INTEGER PRIMARY KEY,
  market_status   TEXT,
  open_state      INTEGER,
  reason_code     TEXT,
  reason_msg      TEXT,
  next_open_time  INTEGER,
  next_close_time INTEGER,
  regime          TEXT NOT NULL
);

-- Derived, and deliberately disposable: drop and rebuild from `observation` whenever
-- the engine changes.
CREATE TABLE IF NOT EXISTS assay_snapshot (
  ts              INTEGER NOT NULL,
  ticker          TEXT    NOT NULL,
  assay_price     REAL    NOT NULL,
  confidence_bp   REAL    NOT NULL,
  reference_price REAL,
  regime          TEXT    NOT NULL,
  accepted_count  INTEGER NOT NULL,
  quote_count     INTEGER NOT NULL,
  PRIMARY KEY (ts, ticker)
);
CREATE INDEX IF NOT EXISTS idx_assay_ticker_ts ON assay_snapshot (ticker, ts);

-- Proves the collector was alive. Gaps here are the honest record of downtime.
CREATE TABLE IF NOT EXISTS heartbeat (
  ts            INTEGER PRIMARY KEY,
  cycle_ms      INTEGER NOT NULL,
  tickers       INTEGER NOT NULL,
  observations  INTEGER NOT NULL,
  errors        INTEGER NOT NULL,
  regime        TEXT    NOT NULL
);

-- Universe membership, sampled hourly. Wrappers get listed and delisted mid-window.
CREATE TABLE IF NOT EXISTS universe_snapshot (
  ts        INTEGER NOT NULL,
  contract  TEXT    NOT NULL,
  ticker    TEXT    NOT NULL,
  symbol    TEXT    NOT NULL,
  family    TEXT    NOT NULL,
  multiplier REAL,
  PRIMARY KEY (ts, contract)
);
