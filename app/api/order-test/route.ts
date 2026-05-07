import { NextResponse } from "next/server";
import { getTicker } from "@/lib/bitunix";
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
    headers: { "Content-Type": "application/json", "language": "en-US", "api-key": apiKey, "sign": signature, "timestamp": timestamp, "nonce": nonce },
    body: bodyStr,
    signal: AbortSignal.timeout(8000),
  });
  let raw: unknown;
  try { raw = await res.json(); } catch (e) { raw = String(e); }
  return { httpStatus: res.status, raw };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") ?? "ETHUSDT").toUpperCase();
    const mode = searchParams.get("mode") ?? "dry";

    const ticker = await getTicker(symbol);
    const price = ticker.lastPrice;
    const triggerPrice = parseFloat((price * 0.95).toFixed(2)).toString();

    const body = {
      symbol,
      side: "SELL",
      positionSide: "LONG",
      type: "STOP_MARKET",
      qty: "0.001",
      triggerPrice,
      reduceOnly: true,
    };

    if (mode !== "real") {
      return NextResponse.json({ mode: "dry", symbol, price, body, note: "Add ?mode=real to send to Bitunix" });
    }

    const result = await callBitunix(body);
    return NextResponse.json({ mode: "real", symbol, price, body, bitunixResponse: result.raw, httpStatus: result.httpStatus });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
