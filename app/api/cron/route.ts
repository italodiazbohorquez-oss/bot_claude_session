import { NextRequest, NextResponse } from "next/server";
import { runBotForSymbol, type BotRunResult } from "@/lib/bot";
import { getAllPositions } from "@/lib/bitunix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  const DEFAULT_SYMBOLS = "BTCUSDT,ETHUSDT,SOLUSDT,ADAUSDT,SUIUSDT,RENDERUSDT,AVAXUSDT,HYPEUSDT,TAOUSDT,DOTUSDT,CRVUSDT,KSMUSDT,HBARUSDT,LINKUSDT,UNIUSDT,BNBUSDT,NEARUSDT,AAVEUSDT,PENGUUSDT";
  const symbolsEnv = process.env.SYMBOLS ?? DEFAULT_SYMBOLS;
  const symbols = symbolsEnv.split(",").map(s => s.trim()).filter(Boolean);

  const startTime = Date.now();
  const results: BotRunResult[] = [];

  // 1. Verificar estado del bot y posiciones abiertas
  const { getBotConfig } = await import("@/lib/supabase");
  const botEnabled = await getBotConfig("bot_enabled").catch(() => "true");
  const tradingEnabled = botEnabled !== "false";

  let openPositions: Awaited<ReturnType<typeof getAllPositions>> = [];
  try {
    openPositions = await getAllPositions();
  } catch (e) {
    console.error("[NEXUS] getAllPositions error:", e);
  }

  // Bot deshabilitado: escanear todos los símbolos para alertas (no abre posiciones)
  if (!tradingEnabled) {
    console.log("[NEXUS] Bot pausado — escaneando señales para alertas");
    const BATCH_SIZE = 4;
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > 50000) break;
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch.map(s => runBotForSymbol(s)));
      for (let j = 0; j < batch.length; j++) {
        const r = batchResults[j];
        if (r.status === "fulfilled") {
          results.push(r.value);
          console.log(`[NEXUS] ${batch[j]}: ${r.value.action}`);
        }
      }
    }
    return NextResponse.json({ ok: true, duration: Date.now() - startTime, tradingEnabled: false, results });
  }

  if (openPositions.length > 0) {
    // 2a. Hay posición abierta — solo gestionar cierre de esa posición
    const managedSymbols = [...new Set(openPositions.map(p => p.symbol))];
    console.log(`[NEXUS] Gestionando ${managedSymbols.length} posiciones: ${managedSymbols.join(",")}`);
    for (const sym of managedSymbols) {
      try {
        const r = await runBotForSymbol(sym);
        results.push(r);
        console.log(`[NEXUS] ${sym}: ${r.action}`);
      } catch (e) {
        console.error(`[NEXUS] ${sym} error:`, e);
        results.push({ symbol: sym, action: "UNCAUGHT_ERROR", details: { error: String(e) }, timestamp: new Date().toISOString() });
      }
    }
  } else {
    // 2b. Sin posiciones — escanear todos, abrir solo la mejor señal
    console.log("[NEXUS] Sin posiciones — buscando mejor señal");

    const scanResults: BotRunResult[] = [];
    const BATCH_SIZE = 4;
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > 35000) break; // reservar tiempo para apertura
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch.map(s => runBotForSymbol(s, true)));
      for (let j = 0; j < batch.length; j++) {
        const r = batchResults[j];
        if (r.status === "fulfilled") {
          scanResults.push(r.value);
          console.log(`[NEXUS] scan ${batch[j]}: ${r.value.action}`);
        } else {
          console.error(`[NEXUS] scan ${batch[j]} error:`, r.reason);
        }
      }
    }

    // Encontrar la mejor señal por score
    let bestSymbol: string | null = null;
    let bestScore = 0;
    for (const r of scanResults) {
      if (r.action === "SIGNAL_READY") {
        const score = (r.details.entryScore as number) ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestSymbol = r.symbol;
        }
      }
    }

    // Abrir solo la mejor señal
    if (bestSymbol) {
      console.log(`[NEXUS] Mejor señal: ${bestSymbol} score=${bestScore} — abriendo`);
      try {
        const openResult = await runBotForSymbol(bestSymbol, false);
        results.push(openResult);
        console.log(`[NEXUS] ${bestSymbol}: ${openResult.action}`);
      } catch (e) {
        console.error(`[NEXUS] ${bestSymbol} apertura error:`, e);
        results.push({ symbol: bestSymbol, action: "UNCAUGHT_ERROR", details: { error: String(e) }, timestamp: new Date().toISOString() });
      }
    } else {
      console.log("[NEXUS] Sin señales listas para abrir");
    }

    results.push(...scanResults);
  }

  return NextResponse.json({
    ok: true,
    duration: Date.now() - startTime,
    openPositionsCount: openPositions.length,
    results,
  });
}
