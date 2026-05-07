import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function callBitunix(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ httpStatus: number; raw: unknown }> {
  const apiKey = (process.env.BITUNIX_API_KEY ?? "").trim();
  const apiSecret = (process.env.BITUNIX_API_SECRET ?? "").trim();
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString("hex");
  const bodyStr = JSON.stringify(body);
  const digest = crypto.createHash("sha256").update(nonce + timestamp + apiKey + "" + bodyStr).digest("hex");
  const signature = crypto.createHash("sha256").update(digest + apiSecret).digest("hex");
  const res = await fetch(`https://fapi.bitunix.com${endpoint}`, {
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

  // Group A: /api/v1/futures/order (current — all failing with code 2)
  const groupA = [
    { endpoint: "/api/v1/futures/order", body: { ...base, type: "STOP_MARKET", triggerPrice, reduceOnly: true } },
  ];

  // Group B: /api/v1/futures/plan/order — the conditional order endpoint
  const groupB = [
    { endpoint: "/api/v1/futures/plan/order", body: { ...base, type: "STOP_MARKET", triggerPrice, triggerType: "MARK_PRICE" } },
    { endpoint: "/api/v1/futures/plan/order", body: { ...base, type: "STOP_MARKET", triggerPrice, triggerType: "LAST_PRICE" } },
    { endpoint: "/api/v1/futures/plan/order", body: { ...base, type: "STOP_MARKET", triggerPrice } },
    { endpoint: "/api/v1/futures/plan/order", body: { ...base, type: "STOP",        triggerPrice, triggerType: "MARK_PRICE" } },
    { endpoint: "/api/v1/futures/plan/order", body: { symbol, side: "SELL", type: "STOP_MARKET", qty: "0.001", triggerPrice, triggerType: "MARK_PRICE" } },
  ];

  // Group C: larger qty in case 0.001 is below minimum lot size
  const groupC = [
    { endpoint: "/api/v1/futures/plan/order", body: { ...base, qty: "0.01", type: "STOP_MARKET", triggerPrice, triggerType: "MARK_PRICE" } },
    { endpoint: "/api/v1/futures/order",      body: { ...base, qty: "0.01", type: "STOP_MARKET", triggerPrice } },
  ];

  const allVariants = [...groupA, ...groupB, ...groupC];

  if (mode !== "real") {
    return NextResponse.json({ mode: "dry", symbol, triggerPrice, allVariants });
  }

  const results = [];
  for (const { endpoint, body } of allVariants) {
    const result = await callBitunix(endpoint, body);
    const r = result.raw as Record<string, unknown>;
    results.push({ endpoint, body, code: r?.code, msg: r?.msg, httpStatus: result.httpStatus });
  }

  return NextResponse.json({ mode: "real", symbol, results });
}
