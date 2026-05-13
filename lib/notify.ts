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

function localTime(): string {
  return new Date().toLocaleString("es-PE", {
    timeZone: process.env.TIMEZONE ?? "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

// ── Message builders ──────────────────────────────────────────────────────────

export interface OpenedCtx {
  symbol: string; side: "LONG" | "SHORT";
  entryPrice: number; sl: number; tp: number;
  contracts: number; positionUsd: number; riskUsd: number;
  score: number; session: string;
  highSqz: boolean; midSqz: boolean; sqzOff: boolean; sqzOn: boolean;
  adxStrength: string;
  setupType: string;
  tf5m: string; tf15m: string; tf1h: string; tf4h: string;
  gtTimeframes: string;
}

function tfArrow(tf: string): string {
  return tf === "BULL" ? "▲" : tf === "BEAR" ? "▼" : "—";
}

function setupLabel(setupType: string): string {
  if (setupType.includes("PERFECT")) return "PERFECT";
  if (setupType.includes("TWO_TF")) return "TWO_TF";
  if (setupType.includes("ONE_TF")) return "ONE_TF";
  if (setupType.includes("RSI")) return "RSI_PIVOT";
  return setupType;
}

export function buildOpenedMsg(ctx: OpenedCtx): string {
  const { symbol, side, entryPrice: e, sl, tp, contracts, positionUsd, riskUsd, score, session, highSqz, midSqz, sqzOff, sqzOn, adxStrength, setupType, tf5m, tf15m, tf1h, tf4h, gtTimeframes } = ctx;
  const emoji = side === "LONG" ? "🟢" : "🔴";
  return `${emoji} <b>NEXUS IA · ${side} ABIERTO</b>
━━━━━━━━━━━━━━━━━━
📊 <b>${symbol}</b> · Score <b>${score}/9</b>  [${setupLabel(setupType)}]
📐 Triángulo Dorado: <b>${gtTimeframes}</b>
🕐 5M ${tfArrow(tf5m)} · 15M ${tfArrow(tf15m)} · 1H ${tfArrow(tf1h)} · 4H ${tfArrow(tf4h)}
💵 Entry: <code>$${fmtPrice(e)}</code>
🛑 SL:    <code>$${fmtPrice(sl)}</code>  (-${diffPct(e, sl)}%)
🎯 TP:    <code>$${fmtPrice(tp)}</code>  (+${diffPct(e, tp)}%)
📦 Size:  <code>${contracts} · $${positionUsd.toFixed(0)}</code>  Riesgo: $${riskUsd.toFixed(0)}
⚡ Sqz: ${sqzLabel(highSqz, midSqz, sqzOff, sqzOn)}
💪 ADX: ${adxStrength}  |  🕐 ${session}
🕑 ${localTime()} (Lima)`;
}

export interface GoldenTriangleCtx {
  symbol: string; side: "LONG" | "SHORT";
  score: number; gtTimeframes: string;
  entryPrice: number; sl: number; tp: number;
  botPaused: boolean;
}

export function buildGoldenTriangleMsg(ctx: GoldenTriangleCtx): string {
  const { symbol, side, score, gtTimeframes, entryPrice, sl, tp, botPaused } = ctx;

  // Visual emphasis scales with number of confirmed timeframes
  const tfCount = (gtTimeframes.match(/\+/g) || []).length + 1;

  let headerEmoji: string;
  let headerTitle: string;
  let tfLine: string;

  if (tfCount >= 3) {
    // 15M + 1H + 4H — máxima confluencia
    headerEmoji = "🌟";
    headerTitle = botPaused ? "TRIÁNGULO DORADO · MAX CONFLUENCIA (bot pausado)" : "TRIÁNGULO DORADO · MAX CONFLUENCIA";
    tfLine = `📐 <b><u>TF confirmado: ${gtTimeframes}</u></b>`;
  } else if (tfCount === 2) {
    // 15M+1H / 15M+4H / 1H+4H — señal reforzada, azul
    headerEmoji = "🔵";
    headerTitle = botPaused ? "TRIÁNGULO DORADO · DOBLE TF (bot pausado)" : "TRIÁNGULO DORADO · DOBLE TF";
    tfLine = `📐 <u>TF confirmado: <b>${gtTimeframes}</b></u>`;
  } else {
    // Solo 15M — señal base
    headerEmoji = side === "LONG" ? "🟢" : "🔴";
    headerTitle = botPaused ? "TRIÁNGULO DORADO (bot pausado)" : "TRIÁNGULO DORADO CONFIRMADO";
    tfLine = `📐 TF confirmado: <b>${gtTimeframes}</b>`;
  }

  return `${headerEmoji} <b>NEXUS IA · ${headerTitle}</b>
━━━━━━━━━━━━━━━━━━
📊 <b>${symbol}</b> · ${side} · Score <b>${score}/9</b>
${tfLine}
💵 Precio: <code>$${fmtPrice(entryPrice)}</code>
🛑 SL aprox: <code>$${fmtPrice(sl)}</code>  (-${diffPct(entryPrice, sl)}%)
🎯 TP aprox: <code>$${fmtPrice(tp)}</code>  (+${diffPct(entryPrice, tp)}%)${botPaused ? "\n⏸️ Reactiva el bot para operar" : ""}
🕑 ${localTime()} (Lima)`;
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
💰 PnL: <b>${pnlStr}</b>
🕑 ${localTime()} (Lima)`;
}

export interface SetupCtx {
  symbol: string;
  side: "LONG" | "SHORT";
  scoreLong: number; scoreShort: number;
  tf15m: string; tf1h: string; tf4h: string;
  highSqz: boolean; midSqz: boolean; sqzOff: boolean; sqzOn: boolean;
  adxStrength: string; adxValue: number;
  minScore: number;
  currentPrice: number; sl: number; tp: number;
}

export function buildSetupMsg(ctx: SetupCtx): string {
  const { symbol, side, scoreLong, scoreShort, tf15m, tf1h, tf4h, highSqz, midSqz, sqzOff, sqzOn, adxStrength, adxValue, minScore, currentPrice, sl, tp } = ctx;
  const score = side === "LONG" ? scoreLong : scoreShort;
  const missing = minScore - score;
  const arrow15m = tf15m === "BULL" ? "▲" : tf15m === "BEAR" ? "▼" : "—";
  const arrow1h  = tf1h  === "BULL" ? "▲" : tf1h  === "BEAR" ? "▼" : "—";
  const arrow4h  = tf4h  === "BULL" ? "▲" : tf4h  === "BEAR" ? "▼" : "—";
  const emoji = side === "LONG" ? "📈" : "📉";
  return `${emoji} <b>NEXUS IA · SETUP FORMANDO ${side}</b>
━━━━━━━━━━━━━━━━━━
📊 <b>${symbol}</b>
🕐 15M ${arrow15m}  ·  1H ${arrow1h}  ·  4H ${arrow4h}  <i>(confluencia MTF)</i>
📈 Score: <b>${score}/9</b>  (faltan ${missing} para gatillo ${minScore})
💵 Precio actual: <code>$${fmtPrice(currentPrice)}</code>
🛑 SL aprox:     <code>$${fmtPrice(sl)}</code>  (-${diffPct(currentPrice, sl)}%)
🎯 TP aprox:     <code>$${fmtPrice(tp)}</code>  (+${diffPct(currentPrice, tp)}%)
⚡ Sqz: ${sqzLabel(highSqz, midSqz, sqzOff, sqzOn)}
💪 ADX: ${adxValue.toFixed(1)} ${adxStrength}
👀 Monitorear entrada en próximas velas 15M
🕑 ${localTime()} (Lima)`;
}

export interface CompressionCtx {
  symbol: string;
  scoreLong: number; scoreShort: number;
  highSqz: boolean; midSqz: boolean; sqzOff: boolean; sqzOn: boolean;
  adxStrength: string; minScore: number;
  currentPrice: number; sl: number; tp: number;
  tf15m: string; tf1h: string; tf4h: string;
}

export function buildCompressionMsg(ctx: CompressionCtx): string {
  const { symbol, scoreLong, scoreShort, highSqz, midSqz, sqzOff, sqzOn, adxStrength, minScore, currentPrice, sl, tp, tf15m, tf1h, tf4h } = ctx;
  const bestScore = Math.max(scoreLong, scoreShort);
  const dir = scoreLong >= scoreShort ? "LONG" : "SHORT";
  const arrow15m = tf15m === "BULL" ? "▲" : tf15m === "BEAR" ? "▼" : "—";
  const arrow1h  = tf1h  === "BULL" ? "▲" : tf1h  === "BEAR" ? "▼" : "—";
  const arrow4h  = tf4h  === "BULL" ? "▲" : tf4h  === "BEAR" ? "▼" : "—";
  return `🗜️ <b>NEXUS IA · ALTA COMPRESIÓN · SQUEEZE ON</b>
━━━━━━━━━━━━━━━━━━
📊 <b>${symbol}</b>
🔴 HIGH Squeeze ON — mercado coil, explosión inminente
🕐 15M ${arrow15m}  ·  1H ${arrow1h}  ·  4H ${arrow4h}
📈 LONG: <b>${scoreLong}/9</b>  |  SHORT: <b>${scoreShort}/9</b>
🎯 Sesgo probable: <b>${bestScore}/9 ${dir}</b>
💵 Precio actual: <code>$${fmtPrice(currentPrice)}</code>
🛑 SL aprox:     <code>$${fmtPrice(sl)}</code>  (-${diffPct(currentPrice, sl)}%)
🎯 TP aprox:     <code>$${fmtPrice(tp)}</code>  (+${diffPct(currentPrice, tp)}%)
💪 ADX: ${adxStrength}
⏰ Preparar — esperar triángulo dorado en 15M para entrar
🕑 ${localTime()} (Lima)`;
}

// ── Transport ─────────────────────────────────────────────────────────────────

export async function sendTelegram(message: string): Promise<void> {
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
export async function sendWhatsApp(message: string): Promise<void> {
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
  await sendTelegram(message);
}
