import { NextResponse } from "next/server";
import { getCandles } from "@/lib/bitunix";
import { calcSqz } from "@/lib/sqz";
import { calcMtf, countConsecutiveDir } from "@/lib/mtf";
import { calcRsiSignal, rsiLongSignal, rsiShortSignal } from "@/lib/rsi";
import { calcCerebro } from "@/lib/cerebro";
import { getCurrentSession } from "@/lib/sessions";
import { getBotConfig } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();

  const [c5m, c15m, c1h, c4h] = await Promise.all([
    getCandles(symbol, "5m", 200),
    getCandles(symbol, "15m", 200),
    getCandles(symbol, "1h", 200),
    getCandles(symbol, "4h", 200),
  ]);

  const sqz5m  = calcSqz(c5m);
  const sqz15m = calcSqz(c15m);
  const sqz1h  = calcSqz(c1h);
  const sqz4h  = calcSqz(c4h);

  const rsi = calcRsiSignal(c1h);
  const mtf = calcMtf({
    sqz5m, sqz15m, sqz1h, sqz4h,
    tf1hConsecutiveBull: countConsecutiveDir([sqz1h], "BULL"),
    tf1hConsecutiveBear: countConsecutiveDir([sqz1h], "BEAR"),
    rsiPivotLong: rsiLongSignal(rsi), rsiPivotShort: rsiShortSignal(rsi),
  });
  const cerebro = calcCerebro(c15m, sqz1h, sqz4h, sqz15m, sqz15m.sqzPrevVal, c1h, sqz5m);

  // Golden triangle — usa dos velas CERRADAS (sqzPrevVal vs sqzPrev2Val), igual que TradingView
  const goldenTriangleLong  = sqz15m.sqzPrevVal < 0 && sqz15m.sqzPrevVal > sqz15m.sqzPrev2Val;
  const goldenTriangleShort = sqz15m.sqzPrevVal > 0 && sqz15m.sqzPrevVal < sqz15m.sqzPrev2Val;

  // Throttle key state
  const gtKeyLong  = await getBotConfig(`notify_gt_${symbol}_LONG`);
  const gtKeyShort = await getBotConfig(`notify_gt_${symbol}_SHORT`);
  const twentyMinsAgo = Date.now() - 20 * 60 * 1000;

  const session = getCurrentSession();
  const curCandle = c15m[c15m.length - 1];

  return NextResponse.json({
    symbol,
    timestamp: new Date().toISOString(),
    session: { active: session.active, name: session.session, utcHour: session.utcHour },
    price: curCandle.close,

    // ── DIAGNÓSTICO TRIÁNGULO DORADO ──────────────────────────
    sqz15m: {
      sqzVal:      sqz15m.sqzVal,
      sqzPrevVal:  sqz15m.sqzPrevVal,
      sqzPrev2Val: sqz15m.sqzPrev2Val,
      diff_forming_vs_closed: sqz15m.sqzVal     - sqz15m.sqzPrevVal,
      diff_closed_vs_prev2:   sqz15m.sqzPrevVal - sqz15m.sqzPrev2Val,
      momentumDir: sqz15m.momentumDir,
      sqzOn:  sqz15m.sqzOn,
      sqzOff: sqz15m.sqzOff,
      highSqz: sqz15m.highSqz,
      adxValue: sqz15m.adxValue,
      adxStrength: sqz15m.adxStrength,
    },
    sqz1h: {
      sqzVal: sqz1h.sqzVal, sqzPrevVal: sqz1h.sqzPrevVal, sqzPrev2Val: sqz1h.sqzPrev2Val, momentumDir: sqz1h.momentumDir,
    },
    sqz4h: {
      sqzVal: sqz4h.sqzVal, sqzPrevVal: sqz4h.sqzPrevVal, sqzPrev2Val: sqz4h.sqzPrev2Val, momentumDir: sqz4h.momentumDir,
    },

    goldenTriangle: {
      // LONG  (giro_alza): sqzPrevVal < 0 AND sqzPrevVal > sqzPrev2Val — última vela cerrada girando al alza
      long:  { firing: goldenTriangleLong,  condition: `${sqz15m.sqzPrevVal.toFixed(6)} < 0 → ${sqz15m.sqzPrevVal < 0} | ${sqz15m.sqzPrevVal.toFixed(6)} > ${sqz15m.sqzPrev2Val.toFixed(6)} → ${sqz15m.sqzPrevVal > sqz15m.sqzPrev2Val}` },
      // SHORT (giro_baja): sqzPrevVal > 0 AND sqzPrevVal < sqzPrev2Val — última vela cerrada girando a la baja
      short: { firing: goldenTriangleShort, condition: `${sqz15m.sqzPrevVal.toFixed(6)} > 0 → ${sqz15m.sqzPrevVal > 0} | ${sqz15m.sqzPrevVal.toFixed(6)} < ${sqz15m.sqzPrev2Val.toFixed(6)} → ${sqz15m.sqzPrevVal < sqz15m.sqzPrev2Val}` },
    },

    throttle: {
      long:  { key: gtKeyLong,  wouldNotify: !gtKeyLong  || parseInt(gtKeyLong)  < twentyMinsAgo },
      short: { key: gtKeyShort, wouldNotify: !gtKeyShort || parseInt(gtKeyShort) < twentyMinsAgo },
    },

    mtf: { setup: mtf.setup, direction: mtf.direction, canTrade: mtf.canTrade, tf5m: mtf.tf5m, tf15m: mtf.tf15m, tf1h: mtf.tf1h, tf4h: mtf.tf4h },
    scores: { long: cerebro.scoreLong, short: cerebro.scoreShort },
    antiTrampa: { long: cerebro.antiTrampaLong, short: cerebro.antiTrampaShort },
  });
}
