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
  // Tiny qty to test parameter validation without risking real execution
  const qty = "0.001";

  const orderVariants = [
    { label: "tradeSide_OPEN", body: { symbol, side: "SELL", tradeSide: "OPEN", type: "MARKET", qty } },
    { label: "positionSide_SHORT", body: { symbol, side: "SELL", positionSide: "SHORT", type: "MARKET", qty } },
    { label: "minimal_no_extra", body: { symbol, side: "SELL", type: "MARKET", qty } },
    { label: "tradeSide+marginMode", body: { symbol, side: "SELL", tradeSide: "OPEN", type: "MARKET", qty, marginMode: "ISOLATION" } },
    { label: "positionSide+marginMode", body: { symbol, side: "SELL", positionSide: "SHORT", type: "MARKET", qty, marginMode: "ISOLATION" } },
    { label: "tradeSide+leverage", body: { symbol, side: "SELL", tradeSide: "OPEN", type: "MARKET", qty, leverage: "5" } },
  ];

  const tpslVariants = [
    { endpoint: "/api/v1/futures/tpsl/position/place_order", body: { symbol, positionId, slPrice, slStopType: "MARK" } },
    { endpoint: "/api/v1/futures/tpsl/position/place_order", body: { symbol, positionId, slPrice, slStopType: "MARK", tpPrice, tpStopType: "MARK" } },
    { endpoint: "/api/v1/futures/tpsl/position/place_order", body: { symbol, positionId, slPrice, slStopType: "LAST_PRICE" } },
    { endpoint: "/api/v1/futures/tpsl/place_order", body: { symbol, positionId, slPrice, slStopType: "MARK", slOrderType: "MARKET" } },
  ];

  if (mode === "order") {
    const results = [];
    for (const { label, body } of orderVariants) {
      const result = await callBitunixPost("/api/v1/futures/order", body);
      const r = result.raw as Record<string, unknown>;
      results.push({ label, body, code: r?.code, msg: r?.msg, data: r?.data, httpStatus: result.httpStatus });
    }
    return NextResponse.json({ mode: "order", symbol, results });
  }

  if (mode !== "real") {
    return NextResponse.json({ mode: "dry", symbol, positionId, slPrice, tpPrice, orderVariants, tpslVariants });
  }

  const results = [];
  for (const { endpoint, body } of tpslVariants) {
    const result = await callBitunixPost(endpoint, body);
    const r = result.raw as Record<string, unknown>;
    results.push({ endpoint, body, code: r?.code, msg: r?.msg, httpStatus: result.httpStatus });
  }
  return NextResponse.json({ mode: "real", symbol, results });
}
