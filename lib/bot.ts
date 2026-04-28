import { getCandles, getPosition, placeOrder, getAccount, type Position } from "./bitunix";
import { calcSqz } from "./sqz";
import { calcMtf, countConsecutiveDir } from "./mtf";
import { calcRsiSignal, rsiLongSignal, rsiShortSignal } from "./rsi";
import { calcCerebro } from "./cerebro";
import { calcRrDynamic, calcSlTp, calcPositionSize } from "./risk";
import { getCurrentSession, isSessionActive } from "./sessions";
import { saveTrade, saveSignalLog, getOpenTrade, getBotConfig } from "./supabase";
import type { Candle } from "./math";

export interface BotRunResult {
  symbol: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
}

function getEnvNum(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseFloat(v) : fallback;
}

async function getConfig(key: string, envKey: string, fallback: number): Promise<number> {
  const dbVal = await getBotConfig(key);
  if (dbVal !== null) return parseFloat(dbVal);
  return getEnvNum(envKey, fallback);
}

export async function runBotForSymbol(symbol: string): Promise<BotRunResult> {
  const ts = new Date().toISOString();
  const result: BotRunResult = { symbol, action: "NONE", details: {}, timestamp: ts };

  // 1. Verificar sesión
  const session = getCurrentSession();
  if (!session.active) {
    result.action = "NO_SESSION";
    result.details = { session: session.session, utcHour: session.utcHour };
    return result;
  }

  // Load dynamic config
  const capital = await getConfig("capital", "CAPITAL", 1000);
  const leverage = getEnvNum("LEVERAGE", 5);
  const riskPerTrade = await getConfig("risk_per_trade", "RISK_PER_TRADE", 1.0);
  const rrRatio = getEnvNum("RR_RATIO", 2.5);
  const atrMult = getEnvNum("ATR_MULT", 0.5);
  const minScore = await getConfig("min_score", "MIN_SCORE", 4);

  // 2. Obtener velas de todos los TF
  let candles5m: Candle[], candles15m: Candle[], candles1h: Candle[], candles4h: Candle[];
  try {
    [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
      getCandles(symbol, "5m", 200),
      getCandles(symbol, "15m", 200),
      getCandles(symbol, "1h", 200),
      getCandles(symbol, "4h", 200),
    ]);
  } catch (e) {
    result.action = "ERROR_FETCH";
    result.details = { error: String(e) };
    return result;
  }

  if (candles15m.length < 50 || candles1h.length < 50 || candles4h.length < 50) {
    result.action = "INSUFFICIENT_DATA";
    return result;
  }

  // 3. Verificar posición abierta
  let openPosition: Position | null = null;
  try {
    openPosition = await getPosition(symbol);
  } catch (e) {
    console.error(`[Bot] getPosition error: ${e}`);
  }

  if (openPosition) {
    result.action = "POSITION_ACTIVE";
    result.details = {
      side: openPosition.side,
      size: openPosition.size,
      entryPrice: openPosition.entryPrice,
      unrealizedPnl: openPosition.unrealizedPnl,
    };
    return result;
  }

  // 4. Calcular indicadores
  const sqz5m = calcSqz(candles5m);
  const sqz15m = calcSqz(candles15m);
  const sqz15mPrev = calcSqz(candles15m.slice(0, -1));
  const sqz1h = calcSqz(candles1h);
  const sqz4h = calcSqz(candles4h);

  // Count consecutive 1H direction
  const sqz1hHistory = [sqz1h];
  const tf1hConsecutiveBull = countConsecutiveDir(sqz1hHistory, "BULL");
  const tf1hConsecutiveBear = countConsecutiveDir(sqz1hHistory, "BEAR");

  // RSI 1H
  const rsiResult = calcRsiSignal(candles1h);
  const rsiBuySignal = rsiLongSignal(rsiResult);
  const rsiSellSignal = rsiShortSignal(rsiResult);

  // MTF confluence
  const mtf = calcMtf({
    sqz5m,
    sqz15m,
    sqz1h,
    sqz4h,
    tf1hConsecutiveBull,
    tf1hConsecutiveBear,
    rsiPivotLong: rsiBuySignal,
    rsiPivotShort: rsiSellSignal,
  });

  // Cerebro score
  const cerebro = calcCerebro(candles15m, sqz1h, sqz4h, sqz15m, sqz15mPrev, candles1h);

  // RSI divergence bonus
  let scoreLong = cerebro.scoreLong;
  let scoreShort = cerebro.scoreShort;
  if (rsiResult.divergence === "BULL") scoreLong = Math.min(9, scoreLong + 1);
  if (rsiResult.divergence === "BEAR") scoreShort = Math.min(9, scoreShort + 1);

  // ADX strength
  const adxStrength = sqz15m.adxStrength;

  // Log signal
  const signalLog = {
    symbol,
    timestamp: ts,
    score_long: scoreLong,
    score_short: scoreShort,
    mtf_setup: mtf.setup,
    rsi_zone: rsiResult.zoneNumeric,
    rsi_pivot: rsiResult.pivot,
    adx_value: sqz15m.adxValue,
    adx_strength: adxStrength,
    momentum_dir: sqz15m.momentumDir,
    action_taken: "EVALUATING",
  };

  // 5–7. Decisión de entrada
  const canOpenLong =
    scoreLong >= minScore &&
    mtf.direction === "LONG" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaLong;

  const canOpenShort =
    scoreShort >= minScore &&
    mtf.direction === "SHORT" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaShort;

  const rsiLongEntry = rsiBuySignal && rsiResult.zoneNumeric <= 45 && mtf.direction === "LONG" && scoreLong >= minScore && adxStrength !== "WEAK";
  const rsiShortEntry = rsiSellSignal && rsiResult.zoneNumeric >= 55 && mtf.direction === "SHORT" && scoreShort >= minScore && adxStrength !== "WEAK";

  let side: "LONG" | "SHORT" | null = null;
  let entryScore = 0;
  let setupType = "";

  if (canOpenLong || rsiLongEntry) {
    side = "LONG";
    entryScore = scoreLong;
    setupType = rsiLongEntry ? "RSI_PIVOT_LONG" : `CEREBRO_${mtf.setup}_LONG`;
  } else if (canOpenShort || rsiShortEntry) {
    side = "SHORT";
    entryScore = scoreShort;
    setupType = rsiShortEntry ? "RSI_PIVOT_SHORT" : `CEREBRO_${mtf.setup}_SHORT`;
  }

  if (!side) {
    signalLog.action_taken = "WAIT";
    await saveSignalLog(signalLog);
    result.action = "WAIT";
    result.details = {
      scoreLong, scoreShort, mtfSetup: mtf.setup, mtfDir: mtf.direction,
      adxStrength, rsiZone: rsiResult.zone, antiTrampaLong: cerebro.antiTrampaLong,
      antiTrampaShort: cerebro.antiTrampaShort,
    };
    return result;
  }

  // 8. Calcular SL, TP, tamaño
  const curCandle = candles15m[candles15m.length - 1];
  const prevCandle = candles15m[candles15m.length - 2];

  const rrDynamic = calcRrDynamic({ capital, riskPerTrade, rrRatio, atrMult, leverage }, cerebro.rrFactors);

  const { sl, tp } = calcSlTp({
    side,
    close: curCandle.close,
    high: curCandle.high,
    low: curCandle.low,
    prevHigh: prevCandle.high,
    prevLow: prevCandle.low,
    atr7: cerebro.atr7,
    atr50: cerebro.atr50,
    atrMult,
    rrDynamic,
  });

  const posResult = calcPositionSize({
    capital,
    riskPerTrade,
    close: curCandle.close,
    sl,
    tp,
    side,
    adxStrength,
    score: entryScore,
    minScore,
    stepSize: 0.001,
  });

  if (posResult.contracts <= 0) {
    signalLog.action_taken = "SKIPPED_SIZE_ZERO";
    await saveSignalLog(signalLog);
    result.action = "SKIPPED_SIZE_ZERO";
    return result;
  }

  // 9. Ejecutar orden en Bitunix
  let orderId = "";
  const orderSide = side === "LONG" ? "BUY" : "SELL";
  const closeSide = side === "LONG" ? "SELL" : "BUY";

  try {
    orderId = await placeOrder({
      symbol,
      side: orderSide,
      positionSide: side,
      type: "MARKET",
      quantity: posResult.contracts,
    });

    // SL order
    await placeOrder({
      symbol,
      side: closeSide,
      positionSide: side,
      type: "STOP_MARKET",
      quantity: posResult.contracts,
      stopPrice: sl,
      reduceOnly: true,
    });

    // TP order
    await placeOrder({
      symbol,
      side: closeSide,
      positionSide: side,
      type: "TAKE_PROFIT_MARKET",
      quantity: posResult.contracts,
      stopPrice: tp,
      reduceOnly: true,
    });
  } catch (e) {
    signalLog.action_taken = "ORDER_ERROR";
    await saveSignalLog(signalLog);
    result.action = "ORDER_ERROR";
    result.details = { error: String(e), side, sl, tp };
    return result;
  }

  // 10. Guardar en Supabase
  const tradeData = {
    symbol,
    side,
    entry_price: curCandle.close,
    sl,
    tp,
    size: posResult.contracts,
    score: entryScore,
    setup_type: setupType,
    session: session.session,
    opened_at: ts,
    status: "OPEN" as const,
    order_id: orderId,
  };

  await saveTrade(tradeData);

  signalLog.action_taken = `OPENED_${side}`;
  await saveSignalLog(signalLog);

  result.action = `OPENED_${side}`;
  result.details = {
    orderId,
    entryPrice: curCandle.close,
    sl,
    tp,
    contracts: posResult.contracts,
    positionUsd: posResult.positionUsd,
    riskUsd: posResult.riskUsd,
    rrDynamic,
    score: entryScore,
    setupType,
  };

  return result;
}
