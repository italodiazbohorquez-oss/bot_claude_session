import { NextResponse } from "next/server";
import { sendWhatsApp, sendTelegram } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const message = `🤖 <b>NEXUS IA · TEST DE NOTIFICACIÓN</b>
━━━━━━━━━━━━━━━━━━
✅ Conexión establecida correctamente
📊 Bot activo · Cerebro v21
⚡ Las alertas de señales están configuradas
🕐 ${new Date().toUTCString()}`;

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
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    try {
      await sendTelegram(message);
      results.telegram = "enviado ✓";
    } catch (e) {
      results.telegram = `error: ${e}`;
    }
  } else {
    results.telegram = "no configurado (faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID)";
  }

  return NextResponse.json({ ok: true, results, timestamp: new Date().toISOString() });
}
