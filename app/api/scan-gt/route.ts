import { NextRequest, NextResponse } from "next/server";
import { getCandles } from "@/lib/bitunix";
import { calcSqz } from "@/lib/sqz";
import { notify, buildGoldenTriangleMsg } from "@/lib/notify";
import { calcCerebro } from "@/lib/cerebro";
import { calcRrDynamic, calcSlTp } from "@/lib/risk";
import { getBotConfig, setBotConfig } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_SYMBOLS = "BTCUSDT,ETHUSDT,SOLUSDT,ADAUSDT,SUIUSDT,RENDERUSDT,AVAXUSDT,HYPEUSDT,TAOUSDT,DOTUSDT,CRVUSDT,KSMUSDT,HBARUSDT,LINKUSDT,UNIUSDT,BNBUSDT,NEARUSDT,AAVEUSDT,PENGUUSDT";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // ?force=1 ignora el throttle de 20 min y envía notificación si condición es true
  const force = searchParams.get("force") === "1";
  const symbolsParam = searchParams.get("symbols");
  const symbols = symbolsParam
    ? symbolsParam.split(",").map(s => s.trim().toUpperCase())
    : DEFAULT_SYMBOLS.split(",");

  const results: Record<string, unknown>[] = [];
  const fired: string[] = [];

  const capital      = 1000;
  const leverage     = 5;
  const riskPerTrade = 1.0;
  const rrRatio      = 2.5;
  const atrMult      = 0.5;

  for (const symbol of symbols) {
    try {
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

      // Condición usando dos velas CERRADAS (igual que TradingView)
      const gtLong  = sqz15m.sqzPrevVal < 0 && sqz15m.sqzPrevVal > sqz15m.sqzPrev2Val;
      const gtShort = sqz15m.sqzPrevVal > 0 && sqz15m.sqzPrevVal < sqz15m.sqzPrev2Val;
      const gtSide  = gtLong ? "LONG" : gtShort ? "SHORT" : null;

      const twentyMinsAgo = Date.now() - 20 * 60 * 1000;
      let throttled = false;
      let wouldNotify = false;

      if (gtSide) {
        const lastTs = await getBotConfig(`notify_gt_${symbol}_${gtSide}`);
        throttled   = !!lastTs && parseInt(lastTs) > twentyMinsAgo;
        wouldNotify = !throttled;

        if (wouldNotify || force) {
          // Enviar notificación
          const cerebro = calcCerebro(c15m, sqz1h, sqz4h, sqz15m, sqz15m.sqzPrevVal, c1h, sqz5m);
          const gtRr = calcRrDynamic({ capital, riskPerTrade, rrRatio, atrMult, leverage }, cerebro.rrFactors);
          const gtCandle = c15m[c15m.length - 1];
          const gtPrev   = c15m[c15m.length - 2];
          const { sl, tp } = calcSlTp({
            side: gtSide, close: gtCandle.close, high: gtCandle.high, low: gtCandle.low,
            prevHigh: gtPrev.high, prevLow: gtPrev.low,
            atr7: cerebro.atr7, atr50: cerebro.atr50, atrMult, rrDynamic: gtRr,
          });
          const score = gtSide === "LONG" ? cerebro.scoreLong : cerebro.scoreShort;
          await setBotConfig(`notify_gt_${symbol}_${gtSide}`, String(Date.now()));
          await notify(buildGoldenTriangleMsg({
            symbol, side: gtSide, score, gtTimeframes: "15M",
            entryPrice: gtCandle.close, sl, tp, botPaused: false,
          }));
          fired.push(`${symbol} ${gtSide}`);
        }
      }

      results.push({
        symbol,
        price: c15m[c15m.length - 1].close,
        sqzPrevVal:  sqz15m.sqzPrevVal,
        sqzPrev2Val: sqz15m.sqzPrev2Val,
        diff: sqz15m.sqzPrevVal - sqz15m.sqzPrev2Val,
        gtLong,
        gtShort,
        gtSide,
        throttled,
        wouldNotify,
        notified: (wouldNotify || force) && !!gtSide,
      });
    } catch (e) {
      results.push({ symbol, error: String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    force,
    timestamp: new Date().toISOString(),
    fired,
    results,
  });
}
