import { NextRequest, NextResponse } from "next/server";
import { getAccount, getRawAccount, getCandles, getPosition, getRawPosition } from "@/lib/bitunix";
import { calcSqz } from "@/lib/sqz";
import { calcMtf, countConsecutiveDir } from "@/lib/mtf";
import { calcRsiSignal, rsiLongSignal, rsiShortSignal } from "@/lib/rsi";
import { calcCerebro } from "@/lib/cerebro";
import { getCurrentSession } from "@/lib/sessions";
import { getBotConfig } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const ts = new Date().toISOString();

  // Account test — mapped fields
  let account: Record<string, unknown> = { ok: false };
  try {
    const acc = await getAccount();
    account = { ok: true, equity: acc.equity, available: acc.available, unrealizedPnl: acc.unrealizedPnl };
  } catch (e) {
    account = { ok: false, error: String(e) };
  }

  // Raw account — reveals actual field names from Bitunix
  let accountRaw: unknown = null;
  try {
    accountRaw = await getRawAccount();
  } catch (e) {
    accountRaw = { error: String(e) };
  }

  const session = getCurrentSession();
  const symbols = (process.env.SYMBOLS ?? "BTCUSDT,ETHUSDT").split(",").map(s => s.trim());
  const minScoreRaw = await getBotConfig("min_score");
  const minScore = parseFloat(minScoreRaw ?? process.env.MIN_SCORE ?? "4");
  const botEnabled = await getBotConfig("bot_enabled");

  const symbolsResult: Record<string, unknown> = {};

  for (const symbol of symbols) {
    const r: Record<string, unknown> = {};

    // Position (mapped)
    try {
      const pos = await getPosition(symbol);
      r.position = pos ?? "NONE";
    } catch (e) {
      r.position = { error: String(e) };
    }

    // Raw position — reveals actual Bitunix response / fields
    try {
      r.positionRaw = await getRawPosition(symbol);
    } catch (e) {
      r.positionRaw = { error: String(e) };
    }


    // Candles + signals
    try {
      const [c5m, c15m, c1h, c4h] = await Promise.all([
        getCandles(symbol, "5m", 200),
        getCandles(symbol, "15m", 200),
        getCandles(symbol, "1h", 200),
        getCandles(symbol, "4h", 200),
      ]);

      const sqz5m     = calcSqz(c5m);
      const sqz15m    = calcSqz(c15m);
      const sqz15mPrv = calcSqz(c15m.slice(0, -1));
      const sqz1h     = calcSqz(c1h);
      const sqz4h     = calcSqz(c4h);

      const rsi     = calcRsiSignal(c1h);
      const rsiBuy  = rsiLongSignal(rsi);
      const rsiSell = rsiShortSignal(rsi);

      const mtf = calcMtf({
        sqz5m, sqz15m, sqz1h, sqz4h,
        tf1hConsecutiveBull: countConsecutiveDir([sqz1h], "BULL"),
        tf1hConsecutiveBear: countConsecutiveDir([sqz1h], "BEAR"),
        rsiPivotLong: rsiBuy,
        rsiPivotShort: rsiSell,
      });

      const cerebro = calcCerebro(c15m, sqz1h, sqz4h, sqz15m, sqz15mPrv, c1h);
      let scoreLong  = cerebro.scoreLong;
      let scoreShort = cerebro.scoreShort;
      if (rsi.divergence === "BULL") scoreLong  = Math.min(9, scoreLong  + 1);
      if (rsi.divergence === "BEAR") scoreShort = Math.min(9, scoreShort + 1);

      const gate5mLong  = sqz5m.sqzVal > 0;
      const gate5mShort = sqz5m.sqzVal < 0;
      const effL = Math.min(9, scoreLong  + (gate5mLong  ? 1 : 0));
      const effS = Math.min(9, scoreShort + (gate5mShort ? 1 : 0));

      const persist15mLong  = sqz15m.sqzVal > 0 && sqz15mPrv.sqzVal > 0;
      const persist15mShort = sqz15m.sqzVal < 0 && sqz15mPrv.sqzVal < 0;

      const canOpenLong  = effL >= minScore && mtf.direction === "LONG"  && mtf.canTrade && sqz15m.adxStrength !== "WEAK" && !cerebro.antiTrampaLong  && persist15mLong;
      const canOpenShort = effS >= minScore && mtf.direction === "SHORT" && mtf.canTrade && sqz15m.adxStrength !== "WEAK" && !cerebro.antiTrampaShort && persist15mShort;

      // Block reason
      const dir = mtf.direction;
      let blockReason = "NO_SIGNAL";
      if (dir === "LONG") {
        if (!mtf.canTrade)                  blockReason = `MTF_${mtf.setup}`;
        else if (sqz15m.adxStrength === "WEAK") blockReason = `ADX_WEAK_${sqz15m.adxValue.toFixed(1)}`;
        else if (effL < minScore)           blockReason = `SCORE_${effL}<${minScore}`;
        else if (cerebro.antiTrampaLong)    blockReason = "ANTI_TRAP";
        else if (!persist15mLong)           blockReason = "PERSIST_15M";
        else                                blockReason = "READY_TO_OPEN_LONG";
      } else if (dir === "SHORT") {
        if (!mtf.canTrade)                  blockReason = `MTF_${mtf.setup}`;
        else if (sqz15m.adxStrength === "WEAK") blockReason = `ADX_WEAK_${sqz15m.adxValue.toFixed(1)}`;
        else if (effS < minScore)           blockReason = `SCORE_${effS}<${minScore}`;
        else if (cerebro.antiTrampaShort)   blockReason = "ANTI_TRAP";
        else if (!persist15mShort)          blockReason = "PERSIST_15M";
        else                                blockReason = "READY_TO_OPEN_SHORT";
      } else {
        blockReason = `MTF_${mtf.setup}`;
      }

      r.price  = c15m[c15m.length - 1]?.close;
      r.candles = { "5m": c5m.length, "15m": c15m.length, "1h": c1h.length, "4h": c4h.length };
      r.tfs = {
        "5m":  { dir: mtf.tf5m,  sqzVal: +sqz5m.sqzVal.toFixed(4),  adx: +sqz5m.adxValue.toFixed(1) },
        "15m": { dir: mtf.tf15m, sqzVal: +sqz15m.sqzVal.toFixed(4), adx: +sqz15m.adxValue.toFixed(1), sqzOn: sqz15m.sqzOn, sqzOff: sqz15m.sqzOff },
        "1h":  { dir: mtf.tf1h,  sqzVal: +sqz1h.sqzVal.toFixed(4) },
        "4h":  { dir: mtf.tf4h,  sqzVal: +sqz4h.sqzVal.toFixed(4) },
      };
      r.mtf = { setup: mtf.setup, direction: mtf.direction, canTrade: mtf.canTrade };
      r.scores = { long: scoreLong, short: scoreShort, effLong: effL, effShort: effS, gate5mLong, gate5mShort };
      r.filters = { adxStrength: sqz15m.adxStrength, adxValue: sqz15m.adxValue, persist15mLong, persist15mShort, antiTrampaLong: cerebro.antiTrampaLong, antiTrampaShort: cerebro.antiTrampaShort };
      r.rsi = { value: rsi.zoneNumeric, zone: rsi.zone, pivot: rsi.pivot, divergence: rsi.divergence };
      r.canOpen  = canOpenLong ? "LONG" : canOpenShort ? "SHORT" : "NONE";
      r.blockReason = blockReason;
    } catch (e) {
      r.signalError = String(e);
    }

    symbolsResult[symbol] = r;
  }

  return NextResponse.json({
    timestamp: ts,
    session,
    account,
    accountRaw,
    botEnabled,
    minScore,
    symbols: symbolsResult,
  });
}
