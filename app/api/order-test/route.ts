import { NextResponse } from "next/server";
import { getCandles, getTicker } from "@/lib/bitunix";
import { calcSqz } from "@/lib/sqz";
import { calcCerebro } from "@/lib/cerebro";
import { calcRrDynamic, calcSlTp, calcPositionSize } from "@/lib/risk";
import { getBotConfig } from "@/lib/supabase";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildOrderBody(params: {
  symbol: string; side: string; positionSide: string;
  type: string; qty: number; triggerPrice?: number; reduceOnly?: boolean;
}) {
  const body: Record<string, unknown> = {
    symbol: params.symbol, side: params.side, positionSide: params.positionSide,
    type: params.type, qty: params.qty.toString(), reduceOnly: params.reduceOnly ?? false,
  };
  if (params.triggerPrice !== undefined) body.triggerPrice = params.triggerPrice.toString();
  return body;
}

async function sendRealOrder(body: Record<string, unknown>): Promise<{ ok: boolean; response: unknown }> {
  const apiKey = (process.env.BITUNIX_API_KEY ?? "").trim();
  const apiSecret = (process.env.BITUNIX_API_SECRET ?? "").trim();
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString("hex");
  const bodyStr = JSON.stringify(body);
  const digest = crypto.createHash("sha256").update(nonce + timestamp + apiKey + "" + bodyStr).digest("hex");
  const signature = crypto.createHash("sha256").update(digest + apiSecret).digest("hex");
  const res = await fetch("https://fapi.bitunix.com/api/v1/futures/order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "language": "en-US", "api-key": apiKey, "sign": signature, "timestamp": timestamp, "nonce": nonce },
    body: bodyStr, signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let response: unknown;
  try { response = JSON.parse(text); } catch { response = text; }
  return { ok: res.ok, response };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "ETHUSDT").toUpperCase();
  const mode = searchParams.get("mode") ?? "dry";

  const [[c15m, c1h], [c5m, c4h]] = await Promise.all([
    Promise.all([getCandles(symbol, "15m", 100), getCandles(symbol, "1h", 100)]),
    Promise.all([getCandles(symbol, "5m", 100), getCandles(symbol, "4h", 100)]),
  ]);
  const sqz15m = calcSqz(c15m); const sqz1h = calcSqz(c1h);
  const sqz5m = calcSqz(c5m); const sqz4h = calcSqz(c4h);
  const sqz15mPrev = calcSqz(c15m.slice(0, -1));
  const cerebro = calcCerebro(c15m, sqz1h, sqz4h, sqz15m, sqz15mPrev, c1h, sqz5m);

  const capital = parseFloat((await getBotConfig("capital")) ?? "100");
  const riskPerTrade = parseFloat((await getBotConfig("risk_per_trade")) ?? "1.0");
  const minScore = parseFloat((await getBotConfig("min_score")) ?? "4");
  const rrRatio = parseFloat(process.env.RR_RATIO ?? "2.5");
  const atrMult = parseFloat(process.env.ATR_MULT ?? "0.5");
  const leverage = parseFloat(process.env.LEVERAGE ?? "5");

  const cur = c15m[c15m.length - 1]; const prev = c15m[c15m.length - 2];
  const rrDynamic = calcRrDynamic({ capital, riskPerTrade, rrRatio, atrMult, leverage }, cerebro.rrFactors);
  const { sl, tp } = calcSlTp({ side: "LONG", close: cur.close, high: cur.high, low: cur.low, prevHigh: prev.high, prevLow: prev.low, atr7: cerebro.atr7, atr50: cerebro.atr50, atrMult, rrDynamic });
  const posResult = calcPositionSize({ capital, riskPerTrade, close: cur.close, sl, tp, side: "LONG", adxStrength: sqz15m.adxStrength, score: minScore, minScore, stepSize: 0.001 });

  const ticker = await getTicker(symbol);
  const marketBody = buildOrderBody({ symbol, side: "BUY", positionSide: "LONG", type: "MARKET", qty: posResult.contracts });
  const slBody = buildOrderBody({ symbol, side: "SELL", positionSide: "LONG", type: "STOP_MARKET", qty: posResult.contracts, triggerPrice: sl, reduceOnly: true });
  const tpBody = buildOrderBody({ symbol, side: "SELL", positionSide: "LONG", type: "TAKE_PROFIT_MARKET", qty: posResult.contracts, triggerPrice: tp, reduceOnly: true });

  if (mode !== "real") {
    return NextResponse.json({ mode: "dry", symbol, price: ticker.lastPrice, sl, tp, contracts: posResult.contracts, positionUsd: posResult.positionUsd, riskUsd: posResult.riskUsd, orders: { marketBody, slBody, tpBody }, note: "Add ?mode=real to send only the SL order to Bitunix (no position opened)" });
  }

  const slResponse = await sendRealOrder(slBody);
  return NextResponse.json({ mode: "real", symbol, price: ticker.lastPrice, sl, tp, contracts: posResult.contracts, slBody, slResponse, note: "Only the SL order was sent — no real position opened. Check slResponse.response for the Bitunix error." });
}
