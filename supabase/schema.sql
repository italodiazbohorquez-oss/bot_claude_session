-- NEXUS IA v2 — Supabase Schema
-- Run this in the Supabase SQL Editor

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      TEXT NOT NULL,
  side        TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price NUMERIC(20, 8) NOT NULL,
  sl          NUMERIC(20, 8) NOT NULL,
  tp          NUMERIC(20, 8) NOT NULL,
  size        NUMERIC(20, 8) NOT NULL,
  score       INTEGER NOT NULL,
  setup_type  TEXT NOT NULL,
  session     TEXT NOT NULL,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,
  pnl         NUMERIC(20, 8),
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
  order_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_status ON trades(symbol, status);
CREATE INDEX IF NOT EXISTS idx_trades_opened_at ON trades(opened_at DESC);

-- Signals log table
CREATE TABLE IF NOT EXISTS signals_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol       TEXT NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score_long   INTEGER NOT NULL DEFAULT 0,
  score_short  INTEGER NOT NULL DEFAULT 0,
  mtf_setup    TEXT NOT NULL DEFAULT '',
  rsi_zone     NUMERIC(8, 2) NOT NULL DEFAULT 50,
  rsi_pivot    TEXT NOT NULL DEFAULT 'NONE',
  adx_value    NUMERIC(8, 2) NOT NULL DEFAULT 0,
  adx_strength TEXT NOT NULL DEFAULT 'WEAK',
  momentum_dir TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol_ts ON signals_log(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals_log(timestamp DESC);

-- Bot config table
CREATE TABLE IF NOT EXISTS bot_config (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key   TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL
);

-- Default config values
INSERT INTO bot_config (key, value) VALUES
  ('capital', '1000'),
  ('min_score', '4'),
  ('risk_per_trade', '1.0'),
  ('symbols', 'BTCUSDT,ETHUSDT')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security (adjust policies for your use case)
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by the bot via anon key in server-side context)
CREATE POLICY "Allow all for service" ON trades FOR ALL USING (true);
CREATE POLICY "Allow all for service" ON signals_log FOR ALL USING (true);
CREATE POLICY "Allow all for service" ON bot_config FOR ALL USING (true);
