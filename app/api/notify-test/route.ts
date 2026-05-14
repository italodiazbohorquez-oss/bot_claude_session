import { NextResponse } from "next/server";
import { sendWhatsApp, sendTelegram } from "@/lib/notify";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const limaTime = new Date().toLocaleString("es-PE", {
    timeZone: process.env.TIMEZONE ?? "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const message = `🤖 NEXUS IA · TEST DE NOTIFICACIÓN
✅ Conexión establecida correctamente
📊 Bot activo · Cerebro v21
⚡ Alertas configuradas y activas
🕑 ${limaTime} (Lima)`;

  const results: Record<string, string> = {};

  const waPhone = process.env.WHATSAPP_PHONE;
  const waKey = process.env.WHATSAPP_API_KEY;
  if (waPhone && waKey) {
    try {
      const text = encodeURIComponent(`NEXUS IA test - ${new Date().toUTCString()}`);
      const res = await fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${waPhone}&text=${text}&apikey=${waKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const body = await res.text();
      results.whatsapp = `HTTP ${res.status} · ${body.slice(0, 200)}`;
    } catch (e) {
      results.whatsapp = `error: ${e}`;
    }
  } else {
    results.whatsapp = "no configurado (faltan WHATSAPP_PHONE o WHATSAPP_API_KEY)";
  }

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat  = process.env.TELEGRAM_CHAT_ID;
  const tgPriority = process.env.TELEGRAM_CHAT_ID_PRIORITY;

  if (tgToken && tgChat) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgChat, text: message, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json();
      results.telegram_principal = `HTTP ${res.status} · ${body.ok ? "enviado ✓" : JSON.stringify(body.description ?? body)}`;
    } catch (e) {
      results.telegram_principal = `error: ${e}`;
    }
  } else {
    results.telegram_principal = `no configurado · token=${tgToken ? "✓" : "FALTA"} · chat_id=${tgChat ? "✓" : "FALTA"}`;
  }

  if (tgToken && tgPriority) {
    try {
      const priorityMsg = `🔵 <b>NEXUS IA · TEST CHAT PRIORITARIO</b>
━━━━━━━━━━━━━━━━━━
✅ Canal BTC/ETH conectado correctamente
📊 Recibirás aquí las señales de BTCUSDT y ETHUSDT
🕑 ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima", hour12: false })} (Lima)`;
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgPriority, text: priorityMsg, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json();
      results.telegram_prioritario = `HTTP ${res.status} · ${body.ok ? "enviado ✓" : JSON.stringify(body.description ?? body)}`;
    } catch (e) {
      results.telegram_prioritario = `error: ${e}`;
    }
  } else {
    results.telegram_prioritario = `no configurado · TELEGRAM_CHAT_ID_PRIORITY=${tgPriority ? "✓" : "FALTA"}`;
  }

  return NextResponse.json({ ok: true, results, timestamp: new Date().toISOString() });
}
