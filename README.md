# NEXUS IA v2 — Automated Perpetual Futures Trading Bot

Automated trading bot for Bitunix perpetual futures, powered by the **Cerebro IA v21** signal engine. Runs 24/7 on Vercel via Cron Jobs.

## Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Deploy**: Vercel (serverless + cron)
- **Exchange**: Bitunix Futures API
- **Database**: Supabase (PostgreSQL)
- **Dashboard**: `/dashboard` — auto-refreshes every 30s

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd nexus-trading-bot
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `BITUNIX_API_KEY` | Bitunix API key (futures trading enabled) |
| `BITUNIX_API_SECRET` | Bitunix API secret |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `CAPITAL` | Trading capital in USD |
| `LEVERAGE` | Fixed leverage (default: 5) |
| `RISK_PER_TRADE` | Max risk per trade % (default: 1.0) |
| `RR_RATIO` | Base Risk:Reward ratio (default: 2.5) |
| `ATR_MULT` | ATR multiplier for SL (default: 0.5) |
| `MIN_SCORE` | Minimum Cerebro score to open (4–9, default: 4) |
| `SYMBOLS` | Comma-separated pairs (default: BTCUSDT,ETHUSDT) |
| `IS_TESTNET` | Set `true` to paper trade (no real orders) |
| `CRON_SECRET` | Secret for Vercel cron authentication |

### 3. Setup Supabase

Run the SQL schema in your Supabase SQL Editor:

```bash
# Copy contents of supabase/schema.sql
# Paste and run in Supabase Dashboard > SQL Editor
```

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Add all environment variables in the Vercel dashboard under **Settings > Environment Variables**.

Vercel will automatically pick up the cron job from `vercel.json` (runs every minute).

### 5. Paper Trading First

Set `IS_TESTNET=true` to run in paper trading mode. Orders are simulated in Supabase only — no real orders sent to Bitunix.

---

## Signal Engine — Cerebro IA v21

9-point scoring system. Signal fires when `score >= MIN_SCORE`:

| Point | Condition |
|---|---|
| P1 | MTF aligned (1H + 4H squeeze momentum same direction) |
| P2 | Mid or High squeeze compression active |
| P3 | Squeeze Off (momentum release) |
| P4 | ADX > 25 with DMI directional confirmation |
| P5 | 15M squeeze momentum direction |
| P6 | Price above/below VWAP (daily + weekly) |
| P7 | Delta Z-Score > 0 (volume-weighted buying/selling pressure) |
| P8 | CVD (Cumulative Volume Delta) trend direction |
| P9 | Price action: SFP or rejection wick |

### Anti-Trap Filter
Blocks entry when momentum giro is detected with price on wrong side of EMA9.

### Dynamic R:R
Adjusts R:R ratio based on volatility, squeeze level, and squeeze state. Clamped to 1.5–5.0.

---

## MTF Confluence (Multi-Timeframe)

| 4H | 1H | 15M | Result |
|---|---|---|---|
| BULL | BULL | BULL | PERFECT — Enter Long |
| BEAR | BEAR | BEAR | PERFECT — Enter Short |
| BULL | BEAR | BULL | TRAP — Block |
| BEAR | BULL | BEAR | TRAP — Block |
| BULL | BULL | BEAR | Wait for 15M to flip |

---

## Trading Sessions (UTC)

| Session | Hours UTC |
|---|---|
| Tokyo | 00:00 – 08:00 |
| London | 08:00 – 16:00 |
| New York | 13:00 – 21:00 |
| London+NY Overlap | 13:00 – 16:00 |

Bot does **not** open new positions outside these windows. Open positions are held.

---

## Risk Management

- **Position size** = `(capital × risk%) / SL distance %`
- ADX Moderate → 50% position size
- Score = MIN_SCORE (minimum) → 75% position size
- Max 1 position per symbol at a time

---

## Project Structure

```
app/
  api/
    cron/route.ts       ← Main bot loop (Vercel Cron, every minute)
    bitunix/route.ts    ← Bitunix API wrapper
    webhook/route.ts    ← TradingView alerts (future)
    config/route.ts     ← Dynamic config API
    dashboard/route.ts  ← Dashboard data API
  dashboard/page.tsx    ← UI dashboard
lib/
  cerebro.ts    ← Cerebro IA v21 signal engine
  rsi.ts        ← RSI Div-Lib
  sqz.ts        ← SQZ+ADX+TTM
  mtf.ts        ← MTF confluence manager
  risk.ts       ← Risk management & position sizing
  sessions.ts   ← Trading session clock
  bitunix.ts    ← Bitunix exchange client
  bot.ts        ← Main bot orchestration loop
  math.ts       ← All indicators from scratch (EMA, SMA, ATR, ADX, RSI, etc.)
  supabase.ts   ← Supabase client & queries
supabase/
  schema.sql    ← Database schema
```

---

## Dashboard

Visit `/dashboard` for:
- Bot status, current session, balance
- Open positions with unrealized PnL
- Cerebro score per symbol (LONG/SHORT out of 9)
- MTF confluence table
- ADX strength and momentum direction
- Last 10 closed trades with PnL
- Live config editor (MIN_SCORE, CAPITAL) — no redeploy needed

---

## Indicators — All From Scratch

All technical indicators are implemented in pure TypeScript (`lib/math.ts`):
- SMA, EMA, Stdev, Highest, Lowest
- Linear Regression (linreg)
- ATR (Wilder's smoothing)
- RSI (Wilder's)
- ADX / DI+ / DI-
- Bollinger Bands
- Keltner Channels
- VWAP (daily, weekly anchored)

No external indicator libraries (`talib`, `technicalindicators`, etc.).

---

## ⚠ Disclaimer

This software is for educational and research purposes. Trading cryptocurrency futures involves substantial risk of loss. Past performance of the signal engine does not guarantee future results. Always test thoroughly in paper trading mode before using real capital.
