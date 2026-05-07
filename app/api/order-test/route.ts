import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function callBitunixPost(
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

async function callBitunixGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const url = `https://fapi.bitunix.com${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", "language": "en-US" },
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "ETHUSDT").toUpperCase();
  const mode = searchParams.get("mode") ?? "dry";
  const positionId = searchParams.get("positionId") ?? "fake-id-000";

  if (mode === "ticker") {
    // Diagnostic: test both ticker endpoints raw
    const [r1, r2] = await Promise.all([
      callBitunixGet("/api/v1/futures/market/ticker", { symbol }),
      callBitunixGet("/api/v1/futures/ticker", { symbol }),
    ]);
    return NextResponse.json({ symbol, marketTicker: r1, plainTicker: r2 });
  }

  const slPrice = "1000.00";
  const tpPrice = "5000.00";
  const variants = [
    { endpoint: "/api/v1/futures/tpsl/position/place_order", body: { symbol, positionId, slPrice, slStopType: "MARK" } },
    { endpoint: "/api/v1/futures/tpsl/position/place_order", body: { symbol, positionId, slPrice, slStopType: "MARK", tpPrice, tpStopType: "MARK" } },
    { endpoint: "/api/v1/futures/tpsl/position/place_order", body: { symbol, positionId, slPrice, slStopType: "LAST_PRICE" } },
    { endpoint: "/api/v1/futures/tpsl/place_order", body: { symbol, positionId, slPrice, slStopType: "MARK", slOrderType: "MARKET" } },
    { endpoint: "/api/v1/futures/tpsl/position/place_order", body: { symbol, slPrice, slStopType: "MARK" } },
  ];

  if (mode !== "real") {
    return NextResponse.json({ mode: "dry", symbol, positionId, slPrice, tpPrice, variants });
  }

  const results = [];
  for (const { endpoint, body } of variants) {
    const result = await callBitunixPost(endpoint, body);
    const r = result.raw as Record<string, unknown>;
    results.push({ endpoint, body, code: r?.code, msg: r?.msg, httpStatus: result.httpStatus });
  }
  return NextResponse.json({ mode: "real", symbol, results });
}
