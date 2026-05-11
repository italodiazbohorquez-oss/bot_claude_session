import { NextRequest, NextResponse } from "next/server";
import { getRecentTrades, getSignalLogs, getBotConfig } from "@/lib/supabase";
import { getAccount, getAllPositions, getTicker } from "@/lib/bitunix";
import { getCurrentSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  const session = getCurrentSession();
  const DEFAULT_SYMBOLS = "BTCUSDT,ETHUSDT,SOLUSDT,ADAUSDT,SUIUSDT,RENDERUSDT,AVAXUSDT,HYPEUSDT,TAOUSDT,DOTUSDT,CRVUSDT,KSMUSDT,HBARUSDT,LINKUSDT,UNIUSDT,BNBUSDT,NEARUSDT,AAVEUSDT,PENGUUSDT";
  const symbols = (process.env.SYMBOLS ?? DEFAULT_SYMBOLS).split(",").map(s => s.trim());

  const [recentTrades, signalLogs, minScoreDb, capitalDb, botEnabledDb, leverageDb] = await Promise.allSettled([
    getRecentTrades(10),
    getSignalLogs(20),
    getBotConfig("min_score"),
    getBotConfig("capital"),
    getBotConfig("bot_enabled"),
    getBotConfig("leverage"),
  ]);

  const minScore = minScoreDb.status === "fulfilled" && minScoreDb.value
    ? parseFloat(minScoreDb.value)
    : parseFloat(process.env.MIN_SCORE ?? "4");

  const capital = capitalDb.status === "fulfilled" && capitalDb.value
    ? parseFloat(capitalDb.value)
    : parseFloat(process.env.CAPITAL ?? "1000");

  const botEnabled = botEnabledDb.status === "fulfilled"
    ? (botEnabledDb.value !== "false")
    : true;

  const leverage = leverageDb.status === "fulfilled" && leverageDb.value
    ? parseInt(leverageDb.value)
    : parseInt(process.env.LEVERAGE ?? "5");

  // Fetch account, all positions (1 call), and live prices in parallel
  let account = null;
  const positions: Record<string, unknown>[] = [];
  const prices: Record<string, number> = {};

  const [accountResult, positionsResult] = await Promise.allSettled([
    getAccount(),
    getAllPositions(),
  ]);

  if (accountResult.status === "fulfilled") {
    account = accountResult.value;
  } else {
    console.error("[Dashboard] account error:", accountResult.reason);
  }

  if (positionsResult.status === "fulfilled") {
    for (const pos of positionsResult.value) {
      if (symbols.includes(pos.symbol)) positions.push({ ...pos });
    }
  } else {
    console.error("[Dashboard] positions error:", positionsResult.reason);
  }

  // Fetch live prices for all symbols in parallel
  await Promise.all(symbols.map(async (sym) => {
    try {
      const ticker = await getTicker(sym);
      prices[sym] = ticker.lastPrice;
    } catch {
      // price not critical
    }
  }));

  // Latest signals per symbol
  const latestSignals: Record<string, unknown> = {};
  const logs = signalLogs.status === "fulfilled" ? signalLogs.value : [];
  for (const sym of symbols) {
    const symLogs = logs.filter((l) => l.symbol === sym);
    if (symLogs.length > 0) latestSignals[sym] = symLogs[0];
  }

  return NextResponse.json(
    {
      ok: true,
      session,
      account,
      positions,
      prices,
      config: { minScore, capital, symbols, leverage, botEnabled },
      recentTrades: recentTrades.status === "fulfilled" ? recentTrades.value : [],
      latestSignals,
      signalLogs: logs.slice(0, 10),
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
