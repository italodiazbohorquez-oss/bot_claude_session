import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function callBitunix(body: Record<string, unknown>): Promise<{ httpStatus: number; raw: unknown }> {
  const apiKey = (process.env.BITUNIX_API_KEY ?? "").trim();
  const apiSecret = (process.env.BITUNIX_API_SECRET ?? "").trim();
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString("hex");
  const bodyStr = JSON.stringify(body);
  const digest = crypto.createHash("sha256").update(nonce + timestamp + apiKey + "" + bodyStr).digest("hex");
  const signature = crypto.createHash("sha256").update(digest + apiSecret).digest("hex");
  const res = await fetch("https://fapi.bitunix.com/api/v1/futures/order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "language": "en-US",
      "api-key": apiKey, "sign": signature, "timestamp": timestamp, "nonce": nonce,
    },
    body: bodyStr,
    signal: AbortSignal.timeout(8000),
  });
  let raw: unknown;
  try { raw = await res.json(); } catch (e) { raw = String(e); }
  return { httpStatus: res.status, raw };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "ETHUSDT").toUpperCase();
  const mode = searchParams.get("mode") ?? "dry";

  const triggerPrice = "1000.00";
  const base = { symbol, side: "SELL", positionSide: "LONG", qty: "0.001" };
  const variants = [
    { ...base, type: "STOP_MARKET", triggerPrice, reduceOnly: true },
    { ...base, type: "STOP",        triggerPrice, reduceOnly: true },
    { ...base, type: "STOP_MARKET", triggerPrice },
    { ...base, type: "STOP",        triggerPrice },
    { symbol,  side: "SELL", type: "STOP_MARKET", qty: "0.001", triggerPrice },
    { symbol,  side: "SELL", type: "STOP",        qty: "0.001", triggerPrice },
  ];

  if (mode !== "real") {
    return NextResponse.json({ mode: "dry", symbol, triggerPrice, variants });
  }

  const results = [];
  for (const body of variants) {
    const result = await callBitunix(body);
    const r = result.raw as Record<string, unknown>;
    results.push({ body, code: r?.code, msg: r?.msg, httpStatus: result.httpStatus });
    if (r?.code === 0 || (typeof r?.code === "number" && r?.code !== 2)) break;
  }

  return NextResponse.json({ mode: "real", symbol, results });
}
