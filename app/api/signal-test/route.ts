import { NextResponse } from "next/server";
import { getCandles } from "@/lib/bitunix";
import { calcSqz } from "@/lib/sqz";
import { calcMtf, countConsecutiveDir } from "@/lib/mtf";
import { calcRsiSignal, rsiLongSignal, rsiShortSignal } from "@/lib/rsi";
import { calcCerebro } from "@/lib/cerebro";
import { calcRrDynamic, calcSlTp, calcPositionSize } from "@/lib/risk";
import { getCurrentSession } from "@/lib/sessions";
import { getBotConfig } from "@/lib/supabase";
import { notify, buildOpenedMsg, buildSetupMsg } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "ETHUSDT").toUpperCase();
  const forceMode = searchParams.get("force") ?? "auto"; // "long" | "short" | "auto" | "setup"

  // Fetch candles
  const [c5m, c15m, c1h, c4h] = await Promise.all([
    getCandles(symbol, "5m", 200),
    getCandles(symbol, "15m", 200),
    getCandles(symbol, "1h", 200),
    getCandles(symbol, "4h", 200),
  ]);

  // Indicators
  const sqz5m    = calcSqz(c5m);
  const sqz15m   = calcSqz(c15m);
  const sqz15mPrv = calcSqz(c15m.slice(0, -1));
  const sqz1h    = calcSqz(c1h);
  const sqz4h    = calcSqz(c4h);

  const rsi = calcRsiSignal(c1h);
  const rsiBuy  = rsiLongSignal(rsi);
  const rsiSell = rsiShortSignal(rsi);

  const mtf = calcMtf({
    sqz5m, sqz15m, sqz1h, sqz4h,
    tf1hConsecutiveBull: countConsecutiveDir([sqz1h], "BULL"),
    tf1hConsecutiveBear: countConsecutiveDir([sqz1h], "BEAR"),
    rsiPivotLong: rsiBuy, rsiPivotShort: rsiSell,
  });

  const cerebro = calcCerebro(c15m, sqz1h, sqz4h, sqz15m, sqz15mPrv, c1h, sqz5m);
  let scoreLong  = cerebro.scoreLong;
  let scoreShort = cerebro.scoreShort;
  if (rsi.divergence === "BULL") scoreLong  = Math.min(9, scoreLong  + 1);
  if (rsi.divergence === "BEAR") scoreShort = Math.min(9, scoreShort + 1);

  const gate5mLong  = sqz5m.sqzVal > 0;
  const gate5mShort = sqz5m.sqzVal < 0;
  const effL = Math.min(9, scoreLong  + (gate5mLong  ? 1 : 0));
  const effS = Math.min(9, scoreShort + (gate5mShort ? 1 : 0));

  const minScoreRaw = await getBotConfig("min_score");
  const minScore = parseFloat(minScoreRaw ?? process.env.MIN_SCORE ?? "4");
  const capital = parseFloat(process.env.CAPITAL ?? "1000");
  const leverage = parseFloat(process.env.LEVERAGE ?? "5");
  const riskPerTrade = parseFloat(process.env.RISK_PER_TRADE ?? "1.0");
  const rrRatio = parseFloat(process.env.RR_RATIO ?? "2.5");
  const atrMult = parseFloat(process.env.ATR_MULT ?? "0.5");
  const session = getCurrentSession();

  const curCandle  = c15m[c15m.length - 1];
  const prevCandle = c15m[c15m.length - 2];

  // Determine side for notification
  let side: "LONG" | "SHORT";
  if (forceMode === "long") {
    side = "LONG";
  } else if (forceMode === "short") {
    side = "SHORT";
  } else if (forceMode === "setup") {
    // Send setup alert instead
    const bestSide: "LONG" | "SHORT" = effL >= effS ? "LONG" : "SHORT";
    const msg = buildSetupMsg({
      symbol, side: bestSide,
      scoreLong: effL, scoreShort: effS,
      tf15m: mtf.tf15m, tf1h: mtf.tf1h, tf4h: mtf.tf4h,
      highSqz: sqz15m.highSqz, midSqz: sqz15m.midSqz,
      sqzOff: sqz15m.sqzOff, sqzOn: sqz15m.sqzOn,
      adxStrength: sqz15m.adxStrength, adxValue: sqz15m.adxValue,
      minScore,
    });
    await notify(msg);
    return NextResponse.json({
      ok: true, type: "SETUP_ALERT", symbol, side: bestSide,
      scores: { long: effL, short: effS },
      price: curCandle.close, message: msg,
    });
  } else {
    // auto: use the stronger direction
    side = effL >= effS ? "LONG" : "SHORT";
  }

  const entryScore = side === "LONG" ? effL : effS;

  // Calc SL/TP with real ATR
  const rrDynamic = calcRrDynamic({ capital, riskPerTrade, rrRatio, atrMult, leverage }, cerebro.rrFactors);
  const { sl, tp } = calcSlTp({
    side, close: curCandle.close, high: curCandle.high, low: curCandle.low,
    prevHigh: prevCandle.high, prevLow: prevCandle.low,
    atr7: cerebro.atr7, atr50: cerebro.atr50, atrMult, rrDynamic,
  });

  const posResult = calcPositionSize({
    capital, riskPerTrade, close: curCandle.close, sl, tp, side,
    adxStrength: sqz15m.adxStrength, score: entryScore, minScore, stepSize: 0.001,
  });

  const msg = buildOpenedMsg({
    symbol, side,
    entryPrice: curCandle.close, sl, tp,
    contracts: posResult.contracts,
    positionUsd: posResult.positionUsd,
    riskUsd: posResult.riskUsd,
    score: entryScore,
    session: session.session,
    highSqz: sqz15m.highSqz, midSqz: sqz15m.midSqz,
    sqzOff: sqz15m.sqzOff, sqzOn: sqz15m.sqzOn,
    adxStrength: sqz15m.adxStrength,
    setupType: `CEREBRO_${mtf.setup}_${side}`,
    tf5m: mtf.tf5m, tf15m: mtf.tf15m, tf1h: mtf.tf1h, tf4h: mtf.tf4h,
  });

  await notify(msg);

  return NextResponse.json({
    ok: true,
    type: "ENTRY_SIGNAL",
    symbol, side,
    price: curCandle.close, sl, tp,
    scores: { long: scoreLong, short: scoreShort, effLong: effL, effShort: effS },
    adx: { value: sqz15m.adxValue, strength: sqz15m.adxStrength },
    sqz: { val15m: sqz15m.sqzVal, sqzOn: sqz15m.sqzOn, sqzOff: sqz15m.sqzOff, highSqz: sqz15m.highSqz },
    mtf: { setup: mtf.setup, direction: mtf.direction, canTrade: mtf.canTrade },
    positionUsd: posResult.positionUsd,
    riskUsd: posResult.riskUsd,
    contracts: posResult.contracts,
    rrDynamic,
    message: msg,
  });
}
