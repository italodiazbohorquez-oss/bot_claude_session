import { NextRequest, NextResponse } from "next/server";
import { saveSignalLog } from "@/lib/supabase";

export const runtime = "nodejs";

interface TradingViewAlert {
  symbol?: string;
  action?: string;
  price?: number;
  message?: string;
}

// Webhook endpoint for TradingView alerts (future integration)
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-webhook-secret");
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret && secret !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: TradingViewAlert = await req.json();
    console.log("[Webhook] Received TradingView alert:", body);

    await saveSignalLog({
      symbol: body.symbol ?? "UNKNOWN",
      timestamp: new Date().toISOString(),
      score_long: 0,
      score_short: 0,
      mtf_setup: "WEBHOOK",
      rsi_zone: 50,
      rsi_pivot: "NONE",
      adx_value: 0,
      adx_strength: "UNKNOWN",
      momentum_dir: body.action ?? "UNKNOWN",
      action_taken: `WEBHOOK_${body.action ?? "UNKNOWN"}`,
    });

    return NextResponse.json({ ok: true, received: body });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
