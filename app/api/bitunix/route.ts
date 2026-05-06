import { NextRequest, NextResponse } from "next/server";
import { getCandles, getTicker, getAccount, getPosition } from "@/lib/bitunix";
import type { TimeFrame } from "@/lib/bitunix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const symbol = searchParams.get("symbol") ?? "BTCUSDT";

  try {
    switch (action) {
      case "candles": {
        const interval = (searchParams.get("interval") ?? "15m") as TimeFrame;
        const limit = parseInt(searchParams.get("limit") ?? "200");
        const data = await getCandles(symbol, interval, limit);
        return NextResponse.json({ ok: true, data });
      }
      case "ticker": {
        const data = await getTicker(symbol);
        return NextResponse.json({ ok: true, data });
      }
      case "account": {
        const data = await getAccount();
        return NextResponse.json({ ok: true, data });
      }
      case "position": {
        const data = await getPosition(symbol);
        return NextResponse.json({ ok: true, data });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
