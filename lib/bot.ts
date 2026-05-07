import { getCandles, getPosition, placeOrder, type Position } from "./bitunix";
import { calcSqz } from "./sqz";
import { calcMtf, countConsecutiveDir } from "./mtf";
import { calcRsiSignal, rsiLongSignal, rsiShortSignal } from "./rsi";
import { calcCerebro } from "./cerebro";
import { calcRrDynamic, calcSlTp, calcPositionSize } from "./risk";
import { getCurrentSession } from "./sessions";
import { saveTrade, saveSignalLog, getOpenTrade, updateTrade, getBotConfig, setBotConfig } from "./supabase";
import { notify, buildOpenedMsg, buildClosedMsg, buildCompressionMsg, buildSetupMsg } from "./notify";
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
  let exchangeFetchError = false;

  try {
    openPosition = await getPosition(symbol);
  } catch (e) {
    console.error(`[Bot] getPosition error: ${e}`);
    exchangeFetchError = true;
  }

  if (openPosition === null && !exchangeFetchError) {
    // Exchange confirmed no open position — auto-close any stale Supabase "OPEN" records
    // (happens when TP/SL hit on exchange without the bot catching the close event)
    const stale = await getOpenTrade(symbol);
    if (stale?.id) {
      const curClose = candles15m[candles15m.length - 1].close;
      const priceDiff = stale.side === "LONG"
        ? curClose - stale.entry_price
        : stale.entry_price - curClose;
      const estPnl = priceDiff * stale.size;
      await updateTrade(stale.id, { status: "CLOSED", closed_at: ts, pnl: estPnl });
      console.log(`[Bot] Auto-closed stale Supabase trade for ${symbol} — TP/SL hit on exchange`);
      notify(buildClosedMsg({ symbol, side: stale.side, pnl: estPnl, reason: "TP/SL hit (auto-sync)" })).catch(() => {});
    }
  } else if (openPosition === null && exchangeFetchError) {
    // Exchange API error — use Supabase fallback to avoid opening duplicate positions
    const dbTrade = await getOpenTrade(symbol);
    if (dbTrade) {
      const curClose = candles15m[candles15m.length - 1].close;
      const priceDiff = dbTrade.side === "LONG"
        ? curClose - dbTrade.entry_price
        : dbTrade.entry_price - curClose;
      openPosition = {
        symbol,
        side: dbTrade.side,
        size: dbTrade.size,
        entryPrice: dbTrade.entry_price,
        unrealizedPnl: priceDiff * dbTrade.size,
        leverage: getEnvNum("LEVERAGE", 5),
      };
      console.log(`[Bot] Position from Supabase fallback: ${symbol} ${dbTrade.side} @ ${dbTrade.entry_price}`);
    }
  }

    if (openPosition) {
    const h1Bull = sqz1h.sqzVal > 0;
    const h4Bull = sqz4h.sqzVal > 0;
    const posLong = openPosition.side === "LONG";
    const h1Reversed = (posLong && !h1Bull) || (!posLong && h1Bull);
    const h4Reversed = (posLong && !h4Bull) || (!posLong && h4Bull);

    // Cierra solo cuando 4H confirma reversión — es el timeframe de tendencia mayor
    if (h4Reversed) {
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
        result.action = "CLOSED_4H_REVERSAL";
        result.details = {
          side: openPosition.side,
          unrealizedPnl: openPosition.unrealizedPnl,
          h1Direction: h1Bull ? "BULL" : "BEAR",
          h4Direction: h4Bull ? "BULL" : "BEAR",
        };
        notify(buildClosedMsg({
          symbol,
          side: openPosition.side,
          pnl: openPosition.unrealizedPnl,
          reason: `4H Reversal → ${h4Bull ? "BULL" : "BEAR"}`,
        })).catch(() => {});
      } catch (e) {
        result.action = "CLOSE_ERROR";
        result.details = { error: String(e) };
      }
      return result;
    }

    // 1H retrocedió pero 4H sigue alineado → mantener posición (retroceso temporal)
    if (h1Reversed) {
      const holdKey = `notify_hold_${symbol}`;
      const lastHoldTs = await getBotConfig(holdKey);
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      if (!lastHoldTs || parseInt(lastHoldTs) < twoHoursAgo) {
        await setBotConfig(holdKey, String(Date.now()));
        const pnlStr = `${openPosition.unrealizedPnl >= 0 ? "+" : ""}${openPosition.unrealizedPnl.toFixed(2)}`;
        notify(`⏸️ <b>NEXUS IA · HOLDING ${symbol}</b>\n━━━━━━━━━━━━━━━━━━\n📊 <b>${symbol}</b> ${openPosition.side}\n🔄 1H retrocedió · 4H sigue ${h4Bull ? "BULL ▲" : "BEAR ▼"}\n💰 PnL actual: ${pnlStr} USDT\n👀 Manteniendo por confluencia 4H`).catch(() => {});
      }
      result.action = "HOLDING_1H_RETRACE";
      result.details = {
        side: openPosition.side,
        size: openPosition.size,
        entryPrice: openPosition.entryPrice,
        unrealizedPnl: openPosition.unrealizedPnl,
        h1Direction: h1Bull ? "BULL" : "BEAR",
        h4Direction: h4Bull ? "BULL" : "BEAR",
        reason: "1H retracement — 4H still aligned",
      };
      return result;
    }

    // 1H y 4H alineados — mantener posición normalmente
    result.action = "POSITION_ACTIVE";
    result.details = {
      side: openPosition.side,
      size: openPosition.size,
      entryPrice: openPosition.entryPrice,
      unrealizedPnl: openPosition.unrealizedPnl,
      h1Confirmed: true,
      h4Confirmed: true,
      h1Direction: h1Bull ? "BULL" : "BEAR",
      h4Direction: h4Bull ? "BULL" : "BEAR",
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
  const cerebro = calcCerebro(candles15m, sqz1h, sqz4h, sqz15m, sqz15mPrev, candles1h, sqz5m);
  let scoreLong  = cerebro.scoreLong;
  let scoreShort = cerebro.scoreShort;
  if (rsiResult.divergence === "BULL") scoreLong  = Math.min(9, scoreLong + 1);
  if (rsiResult.divergence === "BEAR") scoreShort = Math.min(9, scoreShort + 1);

  const adxStrength = sqz15m.adxStrength;

  // ── FILTROS DE ENTRADA ──────────────────────────────────────────────────────

  // Gatillo 5M: bono +1 punto si el 5M confirma dirección (ya no es bloqueo duro)
  const gate5mLong  = sqz5m.sqzVal > 0;
  const gate5mShort = sqz5m.sqzVal < 0;
  const effectiveScoreLong  = Math.min(9, scoreLong  + (gate5mLong  ? 1 : 0));
  const effectiveScoreShort = Math.min(9, scoreShort + (gate5mShort ? 1 : 0));

  // Persistencia 15M: la señal debe llevar al menos 2 velas 15M consecutivas
  const persist15mLong  = sqz15m.sqzVal > 0 && sqz15mPrev.sqzVal > 0;
  const persist15mShort = sqz15m.sqzVal < 0 && sqz15mPrev.sqzVal < 0;

  const canOpenLong =
    effectiveScoreLong >= minScore &&
    mtf.direction === "LONG" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaLong &&
    persist15mLong;

  const canOpenShort =
    effectiveScoreShort >= minScore &&
    mtf.direction === "SHORT" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaShort &&
    persist15mShort;

  // RSI pivot (señal independiente — también requiere confirmaciones)
  const rsiLongEntry  = rsiBuySignal  && rsiResult.zoneNumeric <= 45 && mtf.direction === "LONG"  && effectiveScoreLong  >= minScore && adxStrength !== "WEAK";
  const rsiShortEntry = rsiSellSignal && rsiResult.zoneNumeric >= 55 && mtf.direction === "SHORT" && effectiveScoreShort >= minScore && adxStrength !== "WEAK";

  // Codifica TF directions en mtf_setup para el dashboard (sin cambio de schema)
  const tfTag = `|${mtf.tf5m}|${mtf.tf15m}|${mtf.tf1h}|${mtf.tf4h}`;

  // Log signal
  const signalLog = {
    symbol,
    timestamp: ts,
    score_long: scoreLong,
    score_short: scoreShort,
    mtf_setup: `${mtf.setup}${tfTag}`,
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
    entryScore = effectiveScoreLong;
    setupType = rsiLongEntry ? "RSI_PIVOT_LONG" : `CEREBRO_${mtf.setup}_LONG`;
  } else if (canOpenShort || rsiShortEntry) {
    side = "SHORT";
    entryScore = effectiveScoreShort;
    setupType = rsiShortEntry ? "RSI_PIVOT_SHORT" : `CEREBRO_${mtf.setup}_SHORT`;
  }

  if (!side) {
    // Razón principal de bloqueo para el dashboard
    const dir = mtf.direction;
    let blockReason: string;
    if (dir === "LONG") {
      if (!mtf.canTrade)                        blockReason = `MTF_${mtf.setup}`;
      else if (adxStrength === "WEAK")          blockReason = "ADX_WEAK";
      else if (effectiveScoreLong < minScore)   blockReason = `SCORE_${effectiveScoreLong}<${minScore}`;
      else if (cerebro.antiTrampaLong)          blockReason = "ANTI_TRAP";
      else if (!persist15mLong)                 blockReason = "PERSIST_15M";
      else                                       blockReason = "UNKNOWN";
    } else if (dir === "SHORT") {
      if (!mtf.canTrade)                        blockReason = `MTF_${mtf.setup}`;
      else if (adxStrength === "WEAK")          blockReason = "ADX_WEAK";
      else if (effectiveScoreShort < minScore)  blockReason = `SCORE_${effectiveScoreShort}<${minScore}`;
      else if (cerebro.antiTrampaShort)         blockReason = "ANTI_TRAP";
      else if (!persist15mShort)                blockReason = "PERSIST_15M";
      else                                       blockReason = "UNKNOWN";
    } else {
      blockReason = `MTF_${mtf.setup}`;
    }

    signalLog.action_taken = `WAIT:${blockReason}`;
    await saveSignalLog(signalLog);

    const bestScore = Math.max(effectiveScoreLong, effectiveScoreShort);
    const setupSide: "LONG" | "SHORT" = effectiveScoreLong >= effectiveScoreShort ? "LONG" : "SHORT";
    const h1h4Aligned = (sqz1h.sqzVal > 0 && sqz4h.sqzVal > 0) || (sqz1h.sqzVal < 0 && sqz4h.sqzVal < 0);

    // Alerta SETUP FORMANDO: 1H+4H alineados, score ≥ 3 pero sin llegar al gatillo
    // Throttle: 1 vez cada 90 minutos por símbolo
    if (h1h4Aligned && bestScore >= 3 && bestScore < minScore) {
      const setupKey = `notify_setup_${symbol}`;
      const lastTs = await getBotConfig(setupKey);
      const ninetyMinAgo = Date.now() - 90 * 60 * 1000;
      if (!lastTs || parseInt(lastTs) < ninetyMinAgo) {
        await setBotConfig(setupKey, String(Date.now()));
        notify(buildSetupMsg({
          symbol, side: setupSide,
          scoreLong: effectiveScoreLong, scoreShort: effectiveScoreShort,
          tf15m: mtf.tf15m, tf1h: mtf.tf1h, tf4h: mtf.tf4h,
          highSqz: sqz15m.highSqz, midSqz: sqz15m.midSqz,
          sqzOff: sqz15m.sqzOff, sqzOn: sqz15m.sqzOn,
          adxStrength, adxValue: sqz15m.adxValue,
          minScore,
        })).catch(() => {});
      }
    }

    // Alerta COMPRESIÓN: sqzOff activo + score cercano al gatillo
    // Throttle: 1 vez cada 2 horas por símbolo
    if (sqz15m.sqzOff && bestScore >= minScore - 1) {
      const throttleKey = `notify_sqz_${symbol}`;
      const lastNotifyTs = await getBotConfig(throttleKey);
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      if (!lastNotifyTs || parseInt(lastNotifyTs) < twoHoursAgo) {
        await setBotConfig(throttleKey, String(Date.now()));
        notify(buildCompressionMsg({
          symbol,
          scoreLong: effectiveScoreLong,
          scoreShort: effectiveScoreShort,
          highSqz: sqz15m.highSqz,
          midSqz: sqz15m.midSqz,
          sqzOff: sqz15m.sqzOff,
          sqzOn: sqz15m.sqzOn,
          adxStrength,
          minScore,
        })).catch(() => {});
      }
    }

    result.action = "WAIT";
    result.details = {
      scoreLong, scoreShort, effectiveScoreLong, effectiveScoreShort,
      mtfSetup: mtf.setup, mtfDir: dir,
      tf5m: mtf.tf5m, tf15m: mtf.tf15m, tf1h: mtf.tf1h, tf4h: mtf.tf4h,
      adxStrength,
      rsiZone: rsiResult.zone,
      gate5mLong, gate5mShort,
      persist15mLong, persist15mShort,
      antiTrampaLong: cerebro.antiTrampaLong,
      antiTrampaShort: cerebro.antiTrampaShort,
      blockReason,
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

  notify(buildOpenedMsg({
    symbol, side,
    entryPrice: curCandle.close,
    sl, tp,
    contracts: posResult.contracts,
    positionUsd: posResult.positionUsd,
    riskUsd: posResult.riskUsd,
    score: entryScore,
    session: session.session,
    highSqz: sqz15m.highSqz,
    midSqz: sqz15m.midSqz,
    sqzOff: sqz15m.sqzOff,
    sqzOn: sqz15m.sqzOn,
    adxStrength,
  })).catch(() => {});

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
