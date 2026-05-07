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

  const slPrice = "1000.00";
  const tpPrice = "5000.00";
  const base = { symbol, positionSide: "LONG" };

  const variants = [
    { endpoint: "/api/v1/futures/tpsl/place_position_order", body: { ...base, slPrice, slStopType: "MARK", slOrderType: "MARKET" } },
    { endpoint: "/api/v1/futures/tpsl/place_position_order", body: { ...base, slPrice, slStopType: "MARK_PRICE", slOrderType: "MARKET" } },
    { endpoint: "/api/v1/futures/tpsl/place_position_order", body: { ...base, slPrice, slStopType: "MARK", slOrderType: "MARKET", tpPrice, tpStopType: "MARK", tpOrderType: "MARKET" } },
    { endpoint: "/api/v1/futures/tpsl/place_order", body: { ...base, slPrice, slStopType: "MARK", slOrderType: "MARKET" } },
    { endpoint: "/api/v1/futures/tpsl/place_position_order", body: { symbol, slPrice, slStopType: "MARK", slOrderType: "MARKET" } },
  ];

  if (mode !== "real") {
    return NextResponse.json({ mode: "dry", symbol, slPrice, tpPrice, variants });
  }

  const results = [];
  for (const { endpoint, body } of variants) {
    const result = await callBitunix(endpoint, body);
    const r = result.raw as Record<string, unknown>;
    results.push({ endpoint, body, code: r?.code, msg: r?.msg, httpStatus: result.httpStatus });
  }

  return NextResponse.json({ mode: "real", symbol, results });
}
