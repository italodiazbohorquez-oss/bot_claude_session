import { getCandles, getPosition, placeOrder, placePositionSlTp, setLeverage, type Position } from "./bitunix";
import { calcSqz } from "./sqz";
import { calcMtf, countConsecutiveDir } from "./mtf";
import { calcRsiSignal, rsiLongSignal, rsiShortSignal } from "./rsi";
import { calcCerebro } from "./cerebro";
import { calcRrDynamic, calcSlTp } from "./risk";
import { getCurrentSession } from "./sessions";
import { saveTrade, saveSignalLog, getOpenTrade, updateTrade, getBotConfig, setBotConfig } from "./supabase";
import { notify, buildOpenedMsg, buildClosedMsg, buildCompressionMsg, buildSetupMsg, buildGoldenTriangleMsg } from "./notify";
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

export async function runBotForSymbol(symbol: string, signalOnly = false): Promise<BotRunResult> {
  const ts = new Date().toISOString();
  const result: BotRunResult = { symbol, action: "NONE", details: {}, timestamp: ts };

  // 0. Kill switch — bloquea solo apertura de nuevas posiciones, no alertas ni cierre
  const botEnabled = await getBotConfig("bot_enabled");
  const tradingEnabled = botEnabled !== "false";

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

  // 3. Indicadores — calculados siempre, incluso con posición abierta (necesarios para watchlist)
  const sqz5m      = calcSqz(candles5m);
  const sqz15m     = calcSqz(candles15m);
  const sqz15mPrev = calcSqz(candles15m.slice(0, -1));
  const sqz1h      = calcSqz(candles1h);
  const sqz1hPrev  = calcSqz(candles1h.slice(0, -1));
  const sqz4h      = calcSqz(candles4h);
  const sqz4hPrev  = calcSqz(candles4h.slice(0, -1));

  const tf1hConsecutiveBull = countConsecutiveDir([sqz1h], "BULL");
  const tf1hConsecutiveBear = countConsecutiveDir([sqz1h], "BEAR");

  const rsiResult    = calcRsiSignal(candles1h);
  const rsiBuySignal = rsiLongSignal(rsiResult);
  const rsiSellSignal = rsiShortSignal(rsiResult);

  const mtf = calcMtf({
    sqz5m, sqz15m, sqz1h, sqz4h,
    tf1hConsecutiveBull, tf1hConsecutiveBear,
    rsiPivotLong: rsiBuySignal, rsiPivotShort: rsiSellSignal,
  });

  const cerebro = calcCerebro(candles15m, sqz1h, sqz4h, sqz15m, sqz15mPrev, candles1h, sqz5m);
  let scoreLong  = cerebro.scoreLong;
  let scoreShort = cerebro.scoreShort;
  if (rsiResult.divergence === "BULL") scoreLong  = Math.min(9, scoreLong + 1);
  if (rsiResult.divergence === "BEAR") scoreShort = Math.min(9, scoreShort + 1);

  const adxStrength = sqz15m.adxStrength;
  const tfTag = `|${mtf.tf5m}|${mtf.tf15m}|${mtf.tf1h}|${mtf.tf4h}`;

  // Signal log base (siempre guardado, incluso para posiciones activas)
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

  // 4. Gestión de posición abierta
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
        positionId: "",
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

  // Skip management for positions the bot didn't open (manually opened on exchange)
  if (openPosition && !exchangeFetchError) {
    const dbTrade = await getOpenTrade(symbol);
    if (!dbTrade) {
      signalLog.action_taken = "MANUAL_POSITION";
      await saveSignalLog(signalLog);
      result.action = "MANUAL_POSITION";
      result.details = { side: openPosition.side, size: openPosition.size, entryPrice: openPosition.entryPrice };
      return result;
    }
  }

  if (openPosition) {
    const h1Bull = sqz1h.sqzVal > 0;
    const h4Bull = sqz4h.sqzVal > 0;
    const posLong = openPosition.side === "LONG";
    const h1Reversed = (posLong && !h1Bull) || (!posLong && h1Bull);
    const h4Reversed = (posLong && !h4Bull) || (!posLong && h4Bull);

    // Cierra solo cuando 1H Y 4H ambos confirman reversión
    if (h1Reversed && h4Reversed) {
      try {
        await placeOrder({
          symbol,
          side: posLong ? "SELL" : "BUY",
          tradeSide: "CLOSE",
          orderType: "MARKET",
          quantity: openPosition.size,
        });
        const openTrade = await getOpenTrade(symbol);
        if (openTrade?.id) {
          await updateTrade(openTrade.id, {
            status: "CLOSED",
            closed_at: ts,
            pnl: openPosition.unrealizedPnl,
          });
        }
        result.action = "CLOSED_1H4H_REVERSAL";
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
          reason: `1H+4H Reversal → ${h4Bull ? "BULL" : "BEAR"}`,
        })).catch(() => {});
      } catch (e) {
        result.action = "CLOSE_ERROR";
        result.details = { error: String(e) };
      }
      signalLog.action_taken = result.action;
      await saveSignalLog(signalLog);
      return result;
    }

    // Al menos un TF sigue alineado — mantener posición
    const holdMsg = h1Reversed
      ? `1H revertido · 4H sigue ${h4Bull ? "BULL ▲" : "BEAR ▼"}`
      : h4Reversed
        ? `4H revertido · 1H sigue ${h1Bull ? "BULL ▲" : "BEAR ▼"}`
        : null;

    if (holdMsg) {
      const holdKey = `notify_hold_${symbol}`;
      const lastHoldTs = await getBotConfig(holdKey);
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      if (!lastHoldTs || parseInt(lastHoldTs) < twoHoursAgo) {
        await setBotConfig(holdKey, String(Date.now()));
        const pnlStr = `${openPosition.unrealizedPnl >= 0 ? "+" : ""}${openPosition.unrealizedPnl.toFixed(2)}`;
        notify(`⏸️ <b>NEXUS IA · HOLDING ${symbol}</b>\n━━━━━━━━━━━━━━━━━━\n📊 <b>${symbol}</b> ${openPosition.side}\n🔄 ${holdMsg}\n💰 PnL actual: ${pnlStr} USDT\n👀 Esperando que ambos TF reviertan`).catch(() => {});
      }
    }

    const posAction = h1Reversed || h4Reversed ? "HOLDING_TF_RETRACE" : "POSITION_ACTIVE";
    signalLog.action_taken = `${posAction}:${openPosition.side}`;
    await saveSignalLog(signalLog);

    result.action = posAction;
    result.details = {
      side: openPosition.side,
      size: openPosition.size,
      entryPrice: openPosition.entryPrice,
      unrealizedPnl: openPosition.unrealizedPnl,
      h1Direction: h1Bull ? "BULL" : "BEAR",
      h4Direction: h4Bull ? "BULL" : "BEAR",
    };
    return result;
  }

  // 5. Filtros de entrada
  const gate5mLong  = sqz5m.sqzVal > 0;
  const gate5mShort = sqz5m.sqzVal < 0;
  const effectiveScoreLong  = Math.min(9, scoreLong  + (gate5mLong  ? 1 : 0));
  const effectiveScoreShort = Math.min(9, scoreShort + (gate5mShort ? 1 : 0));

  // Triángulo dorado: giro_alza / giro_baja — igual que el screener HTML y TradingView
  // giro_alza: momentum negativo pero subiendo → LONG inminente (vela previa a cruzar cero)
  // giro_baja: momentum positivo pero bajando → SHORT inminente
  const goldenTriangleLong  = sqz15m.sqzVal < 0 && sqz15m.sqzVal > sqz15mPrev.sqzVal;
  const goldenTriangleShort = sqz15m.sqzVal > 0 && sqz15m.sqzVal < sqz15mPrev.sqzVal;

  // Detectar en qué TFs está activo el triángulo dorado (misma lógica giro_alza/giro_baja por TF)
  function calcGtTfs(s: "LONG" | "SHORT"): string {
    const tfs: string[] = [];
    if (s === "LONG") {
      if (sqz15m.sqzVal < 0 && sqz15m.sqzVal > sqz15mPrev.sqzVal) tfs.push("15M");
      if (sqz1h.sqzVal  < 0 && sqz1h.sqzVal  > sqz1hPrev.sqzVal)  tfs.push("1H");
      if (sqz4h.sqzVal  < 0 && sqz4h.sqzVal  > sqz4hPrev.sqzVal)  tfs.push("4H");
    } else {
      if (sqz15m.sqzVal > 0 && sqz15m.sqzVal < sqz15mPrev.sqzVal) tfs.push("15M");
      if (sqz1h.sqzVal  > 0 && sqz1h.sqzVal  < sqz1hPrev.sqzVal)  tfs.push("1H");
      if (sqz4h.sqzVal  > 0 && sqz4h.sqzVal  < sqz4hPrev.sqzVal)  tfs.push("4H");
    }
    return tfs.join(" + ") || "15M";
  }

  const canOpenLong =
    goldenTriangleLong &&
    mtf.direction === "LONG" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaLong;

  const canOpenShort =
    goldenTriangleShort &&
    mtf.direction === "SHORT" &&
    mtf.canTrade &&
    adxStrength !== "WEAK" &&
    !cerebro.antiTrampaShort;

  // RSI pivot: también requiere triángulo dorado en 15M para confirmar
  const rsiLongEntry  = rsiBuySignal  && rsiResult.zoneNumeric <= 45 && mtf.direction === "LONG"  && adxStrength !== "WEAK" && goldenTriangleLong;
  const rsiShortEntry = rsiSellSignal && rsiResult.zoneNumeric >= 55 && mtf.direction === "SHORT" && adxStrength !== "WEAK" && goldenTriangleShort;

  // effectiveMinScore se mantiene para uso en alertas SETUP/COMPRESIÓN (no para entrada)
  const effectiveMinScore = mtf.setup === "ONE_TF" ? minScore + 1 : minScore;

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
    const dir = mtf.direction;
    let blockReason: string;
    if (dir === "LONG") {
      if (!mtf.canTrade)               blockReason = `MTF_${mtf.setup}`;
      else if (adxStrength === "WEAK") blockReason = "ADX_WEAK";
      else if (cerebro.antiTrampaLong) blockReason = "ANTI_TRAP";
      else if (!goldenTriangleLong)    blockReason = "WAIT_GOLDEN_TRIANGLE";
      else                             blockReason = "UNKNOWN";
    } else if (dir === "SHORT") {
      if (!mtf.canTrade)                blockReason = `MTF_${mtf.setup}`;
      else if (adxStrength === "WEAK")  blockReason = "ADX_WEAK";
      else if (cerebro.antiTrampaShort) blockReason = "ANTI_TRAP";
      else if (!goldenTriangleShort)    blockReason = "WAIT_GOLDEN_TRIANGLE";
      else                              blockReason = "UNKNOWN";
    } else {
      blockReason = `MTF_${mtf.setup}`;
    }

    signalLog.action_taken = `WAIT:${blockReason}`;
    await saveSignalLog(signalLog);

    const bestScore = Math.max(effectiveScoreLong, effectiveScoreShort);
    const setupSide: "LONG" | "SHORT" = effectiveScoreLong >= effectiveScoreShort ? "LONG" : "SHORT";
    const h1h4Aligned = (sqz1h.sqzVal > 0 && sqz4h.sqzVal > 0) || (sqz1h.sqzVal < 0 && sqz4h.sqzVal < 0);

    const alertCandle     = candles15m[candles15m.length - 1];
    const alertPrevCandle = candles15m[candles15m.length - 2];
    const alertRrDynamic  = calcRrDynamic({ capital, riskPerTrade, rrRatio, atrMult, leverage }, cerebro.rrFactors);
    const { sl: alertSl, tp: alertTp } = calcSlTp({
      side: setupSide,
      close:    alertCandle.close,
      high:     alertCandle.high,
      low:      alertCandle.low,
      prevHigh: alertPrevCandle.high,
      prevLow:  alertPrevCandle.low,
      atr7:     cerebro.atr7,
      atr50:    cerebro.atr50,
      atrMult,
      rrDynamic: alertRrDynamic,
    });

    // Alerta SETUP FORMANDO: 1H+4H alineados, score ≥ 3 pero sin llegar al gatillo
    if (h1h4Aligned && bestScore >= 3 && bestScore < minScore) {
      const setupKey = `notify_setup_${symbol}`;
      const lastTs = await getBotConfig(setupKey);
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      if (!lastTs || parseInt(lastTs) < threeHoursAgo) {
        await setBotConfig(setupKey, String(Date.now()));
        notify(buildSetupMsg({
          symbol, side: setupSide,
          scoreLong: effectiveScoreLong, scoreShort: effectiveScoreShort,
          tf15m: mtf.tf15m, tf1h: mtf.tf1h, tf4h: mtf.tf4h,
          highSqz: sqz15m.highSqz, midSqz: sqz15m.midSqz,
          sqzOff: sqz15m.sqzOff, sqzOn: sqz15m.sqzOn,
          adxStrength, adxValue: sqz15m.adxValue,
          minScore,
          currentPrice: alertCandle.close,
          sl: alertSl, tp: alertTp,
        })).catch(() => {});
      }
    }

    // Alerta COMPRESIÓN: HIGH squeeze activo — precio coil, explosión inminente
    if (sqz15m.highSqz && sqz15m.sqzOn) {
      const throttleKey = `notify_sqz_${symbol}`;
      const lastNotifyTs = await getBotConfig(throttleKey);
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      if (!lastNotifyTs || parseInt(lastNotifyTs) < threeHoursAgo) {
        await setBotConfig(throttleKey, String(Date.now()));
        notify(buildCompressionMsg({
          symbol,
          scoreLong: effectiveScoreLong, scoreShort: effectiveScoreShort,
          highSqz: sqz15m.highSqz, midSqz: sqz15m.midSqz,
          sqzOff: sqz15m.sqzOff, sqzOn: sqz15m.sqzOn,
          adxStrength, minScore,
          currentPrice: alertCandle.close,
          sl: alertSl, tp: alertTp,
          tf15m: mtf.tf15m, tf1h: mtf.tf1h, tf4h: mtf.tf4h,
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
      goldenTriangleLong, goldenTriangleShort,
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

  // Posición fija $100 notional con apalancamiento configurado
  const POSITION_USD = 100;
  const stepSize = 0.001;
  const rawContracts = POSITION_USD / curCandle.close;
  const contracts = Math.floor(rawContracts / stepSize) * stepSize;
  const positionUsd = Math.round(contracts * curCandle.close * 100) / 100;
  const riskUsd = Math.abs(curCandle.close - sl) / curCandle.close * positionUsd;

  if (contracts <= 0) {
    signalLog.action_taken = "SKIPPED_SIZE_ZERO";
    await saveSignalLog(signalLog);
    result.action = "SKIPPED_SIZE_ZERO";
    result.details = { side, entryScore, setupType, close: curCandle.close };
    return result;
  }

  // Modo señal: devolver info sin abrir orden (para selección de mejor señal en cron)
  if (signalOnly) {
    result.action = "SIGNAL_READY";
    result.details = { side, entryScore, setupType, sl, tp, close: curCandle.close, contracts, positionUsd };
    return result;
  }

  // 7. Ejecutar orden de mercado
  // Si kill switch activo: señal detectada pero no abrir posición
  if (!tradingEnabled) {
    result.action = "BOT_DISABLED";
    const gtTfs = calcGtTfs(side);
    result.details = { side, entryScore, setupType, sl, tp, close: curCandle.close, gtTimeframes: gtTfs };
    // Dedup por vela de 15M — notificar solo una vez por evento
    const candleSlot = String(Math.floor(Date.now() / (15 * 60 * 1000)));
    const gtKey = `notify_gt_${symbol}_${side}`;
    const lastSlot = await getBotConfig(gtKey);
    if (lastSlot !== candleSlot) {
      await setBotConfig(gtKey, candleSlot);
      notify(buildGoldenTriangleMsg({
        symbol, side, score: entryScore, gtTimeframes: gtTfs,
        entryPrice: curCandle.close, sl, tp, botPaused: true,
      })).catch(() => {});
    }
    return result;
  }

  let orderId = "";
  const orderSide = side === "LONG" ? "BUY" : "SELL";
  const closeSide = side === "LONG" ? "SELL" : "BUY";

  // Configurar apalancamiento antes de abrir
  try {
    await setLeverage(symbol, leverage);
  } catch (e) {
    console.warn(`[Bot] setLeverage skip: ${e}`);
  }

  try {
    orderId = await placeOrder({
      symbol, side: orderSide, tradeSide: "OPEN",
      orderType: "MARKET", quantity: contracts,
    });
  } catch (e) {
    const errMsg = String(e).slice(0, 150);
    signalLog.action_taken = "ORDER_ERROR";
    signalLog.mtf_setup = `${signalLog.mtf_setup}|ERR:${errMsg}`;
    await saveSignalLog(signalLog);
    result.action = "ORDER_ERROR";
    result.details = { error: String(e), step: "MARKET", side, sl, tp };
    return result;
  }

  // 8. Guardar en Supabase
  await saveTrade({
    symbol, side,
    entry_price: curCandle.close,
    sl, tp,
    size: contracts,
    score: entryScore,
    setup_type: setupType,
    session: session.session,
    opened_at: ts,
    status: "OPEN",
    order_id: orderId,
  });

  signalLog.action_taken = `OPENED_${side}`;
  await saveSignalLog(signalLog);

  // 9. Colocar SL/TP — obtener positionId del exchange, luego colocar stops
  try {
    const openPos = await getPosition(symbol);
    const positionId = openPos?.positionId ?? "";
    if (!positionId) throw new Error("positionId vacío tras abrir posición");
    await placePositionSlTp({ symbol, positionId, sl, tp });
  } catch (e) {
    console.error(`[Bot] SL/TP placement failed for ${symbol}: ${e}`);
    notify(`⚠️ <b>NEXUS IA · SIN STOPS</b>\n${symbol} ${side} abierto\nSL/TP fallaron: ${String(e).slice(0, 100)}\n⚡ Coloca SL/TP manualmente`).catch(() => {});
  }

  notify(buildOpenedMsg({
    symbol, side,
    entryPrice: curCandle.close,
    sl, tp,
    contracts,
    positionUsd,
    riskUsd,
    score: entryScore,
    session: session.session,
    highSqz: sqz15m.highSqz,
    midSqz: sqz15m.midSqz,
    sqzOff: sqz15m.sqzOff,
    sqzOn: sqz15m.sqzOn,
    adxStrength,
    setupType,
    tf5m: mtf.tf5m,
    tf15m: mtf.tf15m,
    tf1h: mtf.tf1h,
    tf4h: mtf.tf4h,
    gtTimeframes: calcGtTfs(side),
  })).catch(() => {});

  result.action = `OPENED_${side}`;
  result.details = {
    orderId,
    entryPrice: curCandle.close,
    sl, tp,
    contracts,
    positionUsd,
    riskUsd,
    rrDynamic,
    score: entryScore,
    setupType,
  };

  return result;
}
