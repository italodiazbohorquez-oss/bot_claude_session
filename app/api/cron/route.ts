import { NextRequest, NextResponse } from "next/server";
import { runBotForSymbol } from "@/lib/bot";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  const symbolsEnv = process.env.SYMBOLS ?? "BTCUSDT,ETHUSDT";
  const symbols = symbolsEnv.split(",").map(s => s.trim()).filter(Boolean);

  const startTime = Date.now();
  const results = [];

  for (const symbol of symbols) {
    const elapsed = Date.now() - startTime;
    // Leave 2s buffer for Vercel response overhead
    if (elapsed > 55000) {
      results.push({ symbol, action: "TIMEOUT_SKIP", timestamp: new Date().toISOString() });
      break;
    }
    try {
      const result = await runBotForSymbol(symbol);
      results.push(result);
      console.log(`[NEXUS] ${symbol}: ${result.action}`);
    } catch (e) {
      console.error(`[NEXUS] ${symbol} error:`, e);
      results.push({ symbol, action: "UNCAUGHT_ERROR", error: String(e), timestamp: new Date().toISOString() });
    }
  }

  return NextResponse.json({
    ok: true,
    duration: Date.now() - startTime,
    results,
  });
}
