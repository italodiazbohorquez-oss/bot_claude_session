import { NextRequest, NextResponse } from "next/server";
import { runBotForSymbol } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  const DEFAULT_SYMBOLS = "BTCUSDT,ETHUSDT,SOLUSDT,ADAUSDT,SUIUSDT,RENDERUSDT,AVAXUSDT,HYPEUSDT,TAOUSDT,DOTUSDT,CRVUSDT,KSMUSDT,HBARUSDT,LINKUSDT,UNIUSDT,BNBUSDT,NEARUSDT,AAVEUSDT,PENGUUSDT";
  const symbolsEnv = process.env.SYMBOLS ?? DEFAULT_SYMBOLS;
  const symbols = symbolsEnv.split(",").map(s => s.trim()).filter(Boolean);

    const startTime = Date.now();
  const results = [];

  // Process in parallel batches of 3 to fit all symbols in 60s window
  const BATCH_SIZE = 3;
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > 50000) {
      symbols.slice(i).forEach(s =>
        results.push({ symbol: s, action: "TIMEOUT_SKIP", timestamp: new Date().toISOString() })
      );
      break;
    }
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(s => runBotForSymbol(s)));
    for (let j = 0; j < batch.length; j++) {
      const r = batchResults[j];
      if (r.status === "fulfilled") {
        results.push(r.value);
        console.log(`[NEXUS] ${batch[j]}: ${r.value.action}`);
      } else {
        console.error(`[NEXUS] ${batch[j]} error:`, r.reason);
        results.push({ symbol: batch[j], action: "UNCAUGHT_ERROR", error: String(r.reason), timestamp: new Date().toISOString() });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    duration: Date.now() - startTime,
    results,
  });
}
