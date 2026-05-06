// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n >= 10000 ? n.toFixed(0) : n >= 1000 ? n.toFixed(1) : n >= 100 ? n.toFixed(2) : n.toFixed(4);
}

function diffPct(from: number, to: number): string {
  return Math.abs(((to - from) / from) * 100).toFixed(2);
}

function sqzLabel(highSqz: boolean, midSqz: boolean, sqzOff: boolean, sqzOn: boolean): string {
  const comp = highSqz ? "🔴 HIGH" : midSqz ? "🟠 MID" : "🟡 LOW";
  const state = sqzOff ? "OFF 🚀" : sqzOn ? "ON 🔒" : "NEUTRO";
  return `${comp} · ${state}`;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/━/g, "-");
}

// ── Message builders ──────────────────────────────────────────────────────────

export interface OpenedCtx {
  symbol: string; side: "LONG" | "SHORT";
  entryPrice: number; sl: number; tp: number;
  contracts: number; positionUsd: number; riskUsd: number;
  score: number; session: string;
  highSqz: boolean; midSqz: boolean; sqzOff: boolean; sqzOn: boolean;
  adxStrength: string;
}

export function buildOpenedMsg(ctx: OpenedCtx): string {
  const { symbol, side, entryPrice: e, sl, tp, contracts, positionUsd, riskUsd, score, session, highSqz, midSqz, sqzOff, sqzOn, adxStrength } = ctx;
  const emoji = side === "LONG" ? "🟢" : "🔴";
  return `${emoji} <b>NEXUS IA · ${side} ABIERTO</b>
━━━━━━━━━━━━━━━━━━
📊 <b>${symbol}</b> · Score <b>${score}/9</b>
💵 Entry: <code>$${fmtPrice(e)}</code>
🛑 SL:    <code>$${fmtPrice(sl)}</code>  (-${diffPct(e, sl)}%)
🎯 TP:    <code>$${fmtPrice(tp)}</code>  (+${diffPct(e, tp)}%)
📦 Size:  <code>${contracts} · $${positionUsd.toFixed(0)}</code>  Riesgo: $${riskUsd.toFixed(0)}
⚡ Sqz: ${sqzLabel(highSqz, midSqz, sqzOff, sqzOn)}
💪 ADX: ${adxStrength}  |  🕐 ${session}`;
}

export interface ClosedCtx {
  symbol: string; side: "LONG" | "SHORT";
  pnl: number | null; reason: string;
}

export function buildClosedMsg(ctx: ClosedCtx): string {
  const { symbol, side, pnl, reason } = ctx;
  const pnlStr = pnl != null
    ? (pnl >= 0 ? `+$${pnl.toFixed(2)} ✅` : `-$${Math.abs(pnl).toFixed(2)} ❌`)
    : "—";
  const emoji = pnl != null && pnl >= 0 ? "🟢" : "🔴";
  return `${emoji} <b>NEXUS IA · ${side} CERRADO</b>
━━━━━━━━━━━━━━━━━━
📊 <b>${symbol}</b>
📋 Razón: ${reason}
💰 PnL: <b>${pnlStr}</b>`;
}

export interface CompressionCtx {
  symbol: string;
  scoreLong: number; scoreShort: number;
  highSqz: boolean; midSqz: boolean; sqzOff: boolean; sqzOn: boolean;
  adxStrength: string; minScore: number;
}

export function buildCompressionMsg(ctx: CompressionCtx): string {
  const { symbol, scoreLong, scoreShort, highSqz, midSqz, sqzOff, sqzOn, adxStrength, minScore } = ctx;
  const bestScore = Math.max(scoreLong, scoreShort);
  const dir = scoreLong >= scoreShort ? "LONG" : "SHORT";
  return `⚡ <b>NEXUS IA · COMPRESIÓN + SQUEEZE</b>
━━━━━━━━━━━━━━━━━━
📊 <b>${symbol}</b>
🔥 ${sqzLabel(highSqz, midSqz, sqzOff, sqzOn)}
📈 LONG: <b>${scoreLong}/9</b>  |  SHORT: <b>${scoreShort}/9</b>
🎯 Mejor score: <b>${bestScore}/9 ${dir}</b>  (gatillo: ${minScore})
💪 ADX: ${adxStrength}
⏳ Precio expandiendo — esperando confirmación...`;
}

// ── Transport ─────────────────────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) console.error("[Notify] Telegram HTTP", res.status, await res.text());
  } catch (e) {
    console.error("[Notify] Telegram error:", e);
  }
}

// WhatsApp via CallMeBot (free, needs one-time registration at callmebot.com/blog/free-whatsapp-messages-callmebot)
async function sendWhatsApp(message: string): Promise<void> {
  const phone = process.env.WHATSAPP_PHONE;   // international format, no +: e.g. 573001234567
  const apiKey = process.env.WHATSAPP_API_KEY; // from CallMeBot
  if (!phone || !apiKey) return;
  try {
    const text = encodeURIComponent(stripHtml(message));
    const res = await fetch(
      `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${text}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" }
    );
    if (!res.ok) console.error("[Notify] WhatsApp HTTP", res.status);
  } catch (e) {
    console.error("[Notify] WhatsApp error:", e);
  }
}

export async function notify(message: string): Promise<void> {
  await Promise.allSettled([sendTelegram(message), sendWhatsApp(message)]);
}
