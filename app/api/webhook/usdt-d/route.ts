import { NextRequest, NextResponse } from "next/server";
import { notifyPriority } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtPrice(n: number): string {
  return n >= 10 ? n.toFixed(2) : n.toFixed(3);
}

function localTime(): string {
  return new Date().toLocaleString("es-PE", {
    timeZone: process.env.TIMEZONE ?? "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar secret para evitar llamadas no autorizadas
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && body.secret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Payload esperado de TradingView:
    // { "secret": "...", "signal": "BULL" | "BEAR", "close": 5.83, "timeframe": "15M" }
    const signal:    "BULL" | "BEAR" = body.signal;
    const close:     number          = parseFloat(body.close ?? "0");
    const timeframe: string          = body.timeframe ?? "15M";

    if (signal !== "BULL" && signal !== "BEAR") {
      return NextResponse.json({ error: "signal must be BULL or BEAR" }, { status: 400 });
    }

    // BULL en USDT.D = dominancia subiendo = bajista para BTC/ETH
    // BEAR en USDT.D = dominancia cayendo = alcista para BTC/ETH
    const isBullDom = signal === "BULL";
    const emoji     = isBullDom ? "⚠️" : "🟢";
    const dir       = isBullDom ? "SUBIENDO ▲" : "CAYENDO ▼";
    const context   = isBullDom
      ? "Capital fluyendo hacia USDT — contexto <b>BAJISTA</b> para BTC/ETH"
      : "Capital saliendo de USDT → crypto — contexto <b>ALCISTA</b> para BTC/ETH";

    // Número de TFs en la etiqueta → mismo sistema visual que GT de símbolos
    const tfCount = (timeframe.match(/\+/g) || []).length + 1;
    let headerEmoji: string;
    let tfLine: string;
    if (tfCount >= 3) {
      headerEmoji = "🌟";
      tfLine = `📐 <b><u>TF confirmado: ${timeframe}</u></b>`;
    } else if (tfCount === 2) {
      headerEmoji = "🔵";
      tfLine = `📐 <u>TF confirmado: <b>${timeframe}</b></u>`;
    } else {
      headerEmoji = emoji;
      tfLine = `📐 TF confirmado: <b>${timeframe}</b>`;
    }

    const msg = `${headerEmoji} <b>NEXUS IA · DOMINANCIA USDT.D</b>
━━━━━━━━━━━━━━━━━━
📊 <b>USDT.D ${dir}</b>
${tfLine}
💹 Dominancia: <code>${fmtPrice(close)}%</code>
🔍 ${context}
🕑 ${localTime()} (Lima)`;

    await notifyPriority(msg);
    console.log(`[Webhook] USDT.D ${signal} @ ${close}% — enviado al chat prioritario`);

    return NextResponse.json({ ok: true, signal, close, timeframe });
  } catch (e) {
    console.error("[Webhook] USDT.D error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
