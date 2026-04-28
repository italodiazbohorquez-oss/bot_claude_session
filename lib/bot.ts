import { getCandles, getPosition, placeOrder, type Position } from "./bitunix";
import { calcSqz } from "./sqz";
import { calcMtf, countConsecutiveDir } from "./mtf";
import { calcRsiSignal, rsiLongSignal, rsiShortSignal } from "./rsi";
import { calcCerebro } from "./cerebro";
import { calcRrDynamic, calcSlTp, calcPositionSize } from "./risk";
import { getCurrentSession } from "./sessions";
import { saveTrade, saveSignalLog, getOpenTrade, updateTrade, getBotConfig } from "./supabase";
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

  // 0. Kill switch — si bot_enabled = "false", no operar
  const botEnabled = await getBotConfig("bot_enabled");
  if (botEnabled === "false") {
    result.action = "BOT_DISABLED";
    result.details = { reason: "Kill switch activo — reactivar desde el dashboard" };
    return result;
  }

  // 1. Verificar sesión
  const session = getCurrentSession();
  if (!session.active) {
    result.action = "NO_SESSION";
    result.details = { session: session.session, utcHour: session.utcHour };
    return result;
  }

  // Config dinámica
  const capital = await getConfig("capital", "CAPITAL", 1000);
  const leverage = getEnvNum("LEVERAGE", 5);
  const riskPerTrade = await getConfig("risk_per_trade", "RISK_PER_TRADE", 1.0);
  const rrRatio = getEnvNum("RR_RATIO", 2.5);
  const atrMult = getEnvNum("ATR_MULT", 0.5);
  const minScore = await getConfig("min_score", "MIN_SCORE", 4);

  // 2. Obtener velas de todos los TF en paralelo
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

  // Calcular indicadores base (necesarios tanto para gestión como para entrada)
  const sqz5m   = calcSqz(candles5m);
  const sqz15m   = calcSqz(candles15m);
  const sqz15mPrev = calcSqz(candles15m.slice(0, -1));
  const sqz1h   = calcSqz(candles1h);
  const sqz4h   = calcSqz(candles4h);

  // 3. Gestión de posición abierta
  let openPosition: Position | null = null;
  try {
    openPosition = await getPosition(symbol);
  } catch (e) {
    console.error(`[Bot] getPosition error: ${e}`);
  }

  if (openPosition) {
    // Gestión por 1H: si el 1H revierte contra la posición, cerrar
    const h1Bull = sqz1h.sqzVal > 0;
    const posLong = openPosition.side === "LONG";
    const h1Reversed = (posLong && !h1Bull) || (!posLong && h1Bull);

    if (h1Reversed) {
      try {
        await placeOrder({
          symbol,
          side: posLong ? "SELL" : "BUY",
          positionSide: openPosition.side,
          type: "MARKET",
          quantity: openPosition.size,
          reduceOnly: true,
        });
        const openTrade = await getOpenTrade(symbol);
        if (openTrade?.id) {
          await updateTrade(openTrade.id, {
            status: "CLOSED",
            closed_at: ts,
            pnl: openPosition.unrealizedPnl,
          });
        }
        result.action = "CLOSED_1H_REVERSAL";
        result.details = {
          side: openPosition.side,
          unrealizedPnl: openPosition.unrealizedPnl,
          h1Direction: h1Bull ? "BULL" : "BEAR",
        };
      } catch (e) {
        result.action = "CLOSE_ERROR";
        result.details = { error: String(e) };
      }
      return result;
    }

    // 1H sigue confirmando — mantener posición
    result.action = "POSITION_ACTIVE";
    result.details = {
      side: openPosition.side,
      size: openPosition.size,
      entryPrice: openPosition.entryPrice,
      unrealizedPnl: openPosition.unrealizedPnl,
      h1Confirmed: true,
      h1Direction: h1Bull ? "BULL" : "BEAR",
    };
    return result;
  }

  // 4. MTF confluence
  const tf1hConsecutiveBull = countConsecutiveDir([sqz1h], "BULL");
  const tf1hConsecutiveBear = countConsecutiveDir([sqz1h], "BEAR");

  const rsiResult = calcRsiSignal(candles1h);
  const rsiBuySignal = rsiLongSignal(rsiResult);
  const rsiSellSignal = rsiShortSignal(rsiResult);

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

  // 5. Cerebro score + bonus divergencia RSI
  const cerebro = calcCerebro(candles15m, sqz1h, sqz4h, sqz15m, sqz15mPrev, candles1h);
  let scoreLong  = cerebro.scoreLong;
  let scoreShort = cerebro.scoreShort;
  if (rsiResult.divergence === "BULL") scoreLong  = Math.min(9, scoreLong + 1);
  if (rsiResult.divergence === "BEAR") scoreShort = Math.min(9, scoreShort + 1);

  const adxStrength = sqz15m.adxStrength;

  // ── FILTROS DE ENTRADA ──────────────────────────────────────────────────────

  // Gatillo 5M: el 5M debe confirmar la dirección
  const gate5mLong  = sqz5m.sqzVal > 0;
  const gate5mShort = sqz5m.sqzVal < 0;

  // Persistencia 15M: la señal debe llevar al menos 2 velas 15M consecutivas
  const persist15mLong  = sqz15m.sqzVal > 0 && sqz15mPrev.sqzVal > 0;
  const persist15mShort = sqz15m.sqzVal < 0 && sqz15mPrev.sqzVal < 0;

  const canOpenLong =
    scoreLong >= minScore &&
    mtf.direction === "LONG" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaLong &&
    persist15mLong &&
    gate5mLong;

  const canOpenShort =
    scoreShort >= minScore &&
    mtf.direction === "SHORT" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaShort &&
    persist15mShort &&
    gate5mShort;

  // RSI pivot (señal independiente — también requiere confirmaciones)
  const rsiLongEntry  = rsiBuySignal  && rsiResult.zoneNumeric <= 45 && mtf.direction === "LONG"  && scoreLong  >= minScore && adxStrength !== "WEAK" && gate5mLong;
  const rsiShortEntry = rsiSellSignal && rsiResult.zoneNumeric >= 55 && mtf.direction === "SHORT" && scoreShort >= minScore && adxStrength !== "WEAK" && gate5mShort;

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
      scoreLong, scoreShort,
      mtfSetup: mtf.setup, mtfDir: mtf.direction,
      adxStrength,
      rsiZone: rsiResult.zone,
      persist15mLong, persist15mShort,
      gate5mLong, gate5mShort,
      antiTrampaLong: cerebro.antiTrampaLong,
      antiTrampaShort: cerebro.antiTrampaShort,
    };
    return result;
  }

  // 6. Calcular SL, TP y tamaño de posición
  const curCandle  = candles15m[candles15m.length - 1];
  const prevCandle = candles15m[candles15m.length - 2];

  const rrDynamic = calcRrDynamic({ capital, riskPerTrade, rrRatio, atrMult, leverage }, cerebro.rrFactors);
  const { sl, tp } = calcSlTp({
    side,
    close:    curCandle.close,
    high:     curCandle.high,
    low:      curCandle.low,
    prevHigh: prevCandle.high,
    prevLow:  prevCandle.low,
    atr7:     cerebro.atr7,
    atr50:    cerebro.atr50,
    atrMult,
    rrDynamic,
  });

  const posResult = calcPositionSize({
    capital, riskPerTrade,
    close: curCandle.close,
    sl, tp, side, adxStrength,
    score: entryScore, minScore,
    stepSize: 0.001,
  });

  if (posResult.contracts <= 0) {
    signalLog.action_taken = "SKIPPED_SIZE_ZERO";
    await saveSignalLog(signalLog);
    result.action = "SKIPPED_SIZE_ZERO";
    return result;
  }

  // 7. Ejecutar órdenes en Bitunix
  let orderId = "";
  const orderSide = side === "LONG" ? "BUY" : "SELL";
  const closeSide = side === "LONG" ? "SELL" : "BUY";

  try {
    orderId = await placeOrder({
      symbol, side: orderSide, positionSide: side,
      type: "MARKET", quantity: posResult.contracts,
    });
    await placeOrder({
      symbol, side: closeSide, positionSide: side,
      type: "STOP_MARKET", quantity: posResult.contracts,
      stopPrice: sl, reduceOnly: true,
    });
    await placeOrder({
      symbol, side: closeSide, positionSide: side,
      type: "TAKE_PROFIT_MARKET", quantity: posResult.contracts,
      stopPrice: tp, reduceOnly: true,
    });
  } catch (e) {
    signalLog.action_taken = "ORDER_ERROR";
    await saveSignalLog(signalLog);
    result.action = "ORDER_ERROR";
    result.details = { error: String(e), side, sl, tp };
    return result;
  }

  // 8. Guardar en Supabase
  await saveTrade({
    symbol, side,
    entry_price: curCandle.close,
    sl, tp,
    size: posResult.contracts,
    score: entryScore,
    setup_type: setupType,
    session: session.session,
    opened_at: ts,
    status: "OPEN",
    order_id: orderId,
  });

  signalLog.action_taken = `OPENED_${side}`;
  await saveSignalLog(signalLog);

  result.action = `OPENED_${side}`;
  result.details = {
    orderId,
    entryPrice: curCandle.close,
    sl, tp,
    contracts: posResult.contracts,
    positionUsd: posResult.positionUsd,
    riskUsd: posResult.riskUsd,
    rrDynamic,
    score: entryScore,
    setupType,
    persist15m: true,
    gate5m: true,
  };

  return result;
}
