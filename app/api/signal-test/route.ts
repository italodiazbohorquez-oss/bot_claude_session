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

  // Golden triangle conditions (giro_alza / giro_baja)
  const goldenTriangleLong  = sqz15m.sqzVal < 0 && sqz15m.sqzVal > sqz15m.sqzPrevVal;
  const goldenTriangleShort = sqz15m.sqzVal > 0 && sqz15m.sqzVal < sqz15m.sqzPrevVal;

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
      sqzVal:     sqz15m.sqzVal,
      sqzPrevVal: sqz15m.sqzPrevVal,
      diff:       sqz15m.sqzVal - sqz15m.sqzPrevVal,
      momentumDir: sqz15m.momentumDir,
      sqzOn:  sqz15m.sqzOn,
      sqzOff: sqz15m.sqzOff,
      highSqz: sqz15m.highSqz,
      adxValue: sqz15m.adxValue,
      adxStrength: sqz15m.adxStrength,
    },
    sqz1h: {
      sqzVal: sqz1h.sqzVal, sqzPrevVal: sqz1h.sqzPrevVal, momentumDir: sqz1h.momentumDir,
    },
    sqz4h: {
      sqzVal: sqz4h.sqzVal, sqzPrevVal: sqz4h.sqzPrevVal, momentumDir: sqz4h.momentumDir,
    },

    goldenTriangle: {
      // LONG  (giro_alza): sqzVal < 0 AND sqzVal > sqzPrevVal — momentum negativo girando arriba
      long:  { firing: goldenTriangleLong,  condition: `${sqz15m.sqzVal.toFixed(6)} < 0 → ${sqz15m.sqzVal < 0} | ${sqz15m.sqzVal.toFixed(6)} > ${sqz15m.sqzPrevVal.toFixed(6)} → ${sqz15m.sqzVal > sqz15m.sqzPrevVal}` },
      // SHORT (giro_baja): sqzVal > 0 AND sqzVal < sqzPrevVal — momentum positivo girando abajo
      short: { firing: goldenTriangleShort, condition: `${sqz15m.sqzVal.toFixed(6)} > 0 → ${sqz15m.sqzVal > 0} | ${sqz15m.sqzVal.toFixed(6)} < ${sqz15m.sqzPrevVal.toFixed(6)} → ${sqz15m.sqzVal < sqz15m.sqzPrevVal}` },
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
