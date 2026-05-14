import { getBotConfig, setBotConfig } from "./supabase";
import { notifyPriority } from "./notify";

interface DomReading { ts: number; val: number; }

async function getUsdtDominance(): Promise<number | null> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const val = data?.data?.market_cap_percentage?.usdt;
    return typeof val === "number" ? Math.round(val * 100) / 100 : null;
  } catch {
    return null;
  }
}

export async function checkUsdtDominanceGT(): Promise<void> {
  const current = await getUsdtDominance();
  if (current === null) return;

  // Cargar historial y agregar nueva lectura (máx 80 puntos = ~6.7h a 5min)
  const storedStr = await getBotConfig("usdt_d_readings");
  let readings: DomReading[] = [];
  try { readings = storedStr ? JSON.parse(storedStr) : []; } catch { readings = []; }
  readings.push({ ts: Date.now(), val: current });
  while (readings.length > 80) readings.shift();
  await setBotConfig("usdt_d_readings", JSON.stringify(readings));

  if (readings.length < 20) return; // mínimo de historia para señal fiable

  const vals = readings.map(r => r.val);
  const n = vals.length;

  // Momentum = valor vs SMA(14), misma lógica que TTM Squeeze histogram
  const sma14Cur  = vals.slice(n - 14).reduce((a, b) => a + b) / 14;
  const sma14Prev = vals.slice(n - 15, n - 1).reduce((a, b) => a + b) / 14;
  const momCur    = vals[n - 1] - sma14Cur;
  const momPrev   = vals[n - 2] - sma14Prev;

  // GT conditions — mismo patrón que goldenTriangleLong/Short
  const gtRising  = momCur < 0 && momCur > momPrev; // dominancia girando al alza  → bajista crypto
  const gtFalling = momCur > 0 && momCur < momPrev; // dominancia girando a la baja → alcista crypto

  if (!gtRising && !gtFalling) return;

  // Throttle 2 horas por lado
  const side = gtRising ? "RISING" : "FALLING";
  const lastTs = await getBotConfig(`notify_usdtd_${side}`);
  if (lastTs && parseInt(lastTs) > Date.now() - 120 * 60 * 1000) return;
  await setBotConfig(`notify_usdtd_${side}`, String(Date.now()));

  const limaTime = new Date().toLocaleString("es-PE", {
    timeZone: process.env.TIMEZONE ?? "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  const emoji   = gtRising ? "⚠️" : "🟢";
  const dir     = gtRising ? "SUBIENDO ▲" : "CAYENDO ▼";
  const context = gtRising
    ? "Capital fluyendo hacia USDT — contexto <b>BAJISTA</b> para BTC/ETH"
    : "Capital saliendo de USDT → crypto — contexto <b>ALCISTA</b> para BTC/ETH";
  const momStr  = (momCur >= 0 ? "+" : "") + momCur.toFixed(3);

  await notifyPriority(`${emoji} <b>NEXUS IA · DOMINANCIA USDT</b>
━━━━━━━━━━━━━━━━━━
📊 <b>USDT.D ${dir}</b>
💹 Dominancia: <code>${current.toFixed(2)}%</code>  ·  Momentum: <code>${momStr}</code>
🔍 ${context}
🕑 ${limaTime} (Lima)`);
}
