import {
  sma, ema, stdev, highest, lowest, linreg, atr as calcAtr,
  bollingerBands, keltnerChannels, adx as calcAdx, clamp, last, prev
} from "./math";
import type { Candle } from "./math";
import type { SqzResult } from "./sqz";
import type { RrFactors } from "./risk";

export interface CerebroResult {
  scoreLong: number;
  scoreShort: number;
  points: CerebroPoints;
  antiTrampaLong: boolean;
  antiTrampaShort: boolean;
  rrFactors: RrFactors;
  atr7: number;
  atr50: number;
  ema9: number;
}

export interface CerebroPoints {
  p1_mtf: { long: boolean; short: boolean };
  p2_compression: { long: boolean; short: boolean };
  p3_sqzOff: { long: boolean; short: boolean };
  p4_adx: { long: boolean; short: boolean };
  p5_momentum: { long: boolean; short: boolean };
  p6_vwap: { long: boolean; short: boolean };
  p7_deltaZ: { long: boolean; short: boolean };
  p8_cvd: { long: boolean; short: boolean };
  p9_priceAction: { long: boolean; short: boolean };
}

function calcVwapDaily(candles: Candle[]): number {
  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    if (c.timestamp >= todayStart) {
      const hlc3 = (c.high + c.low + c.close) / 3;
      cumTPV += hlc3 * c.volume;
      cumVol += c.volume;
    }
  }
  return cumVol > 0 ? cumTPV / cumVol : candles[candles.length - 1].close;
}

function calcVwapWeekly(candles: Candle[]): number {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday);
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    if (c.timestamp >= weekStart) {
      const hlc3 = (c.high + c.low + c.close) / 3;
      cumTPV += hlc3 * c.volume;
      cumVol += c.volume;
    }
  }
  return cumVol > 0 ? cumTPV / cumVol : candles[candles.length - 1].close;
}

export function calcCerebro(
  candles15m: Candle[],
  sqz1h: SqzResult,
  sqz4h: SqzResult,
  sqz15m: SqzResult,
  sqz15mPrevVal: number,
  candles1h: Candle[],
  sqz5m: SqzResult
): CerebroResult {
  const n = candles15m.length;
  const closes = candles15m.map(c => c.close);
  const highs = candles15m.map(c => c.high);
  const lows = candles15m.map(c => c.low);
  const volumes = candles15m.map(c => c.volume);

  // ── PUNTO 1 — MTF alineado
  const p1_long = sqz1h.sqzVal > 0 && sqz4h.sqzVal > 0;
  const p1_short = sqz1h.sqzVal < 0 && sqz4h.sqzVal < 0;

  // ── PUNTO 2 — Compresión MID o HIGH
  const p2_long = sqz15m.midSqz || sqz15m.highSqz;
  const p2_short = sqz15m.midSqz || sqz15m.highSqz;

  // ── PUNTO 3 — sqzOff activo
  const p3_long = sqz15m.sqzOff;
  const p3_short = sqz15m.sqzOff;

  // ── PUNTO 4 — ADX fuerte con dirección DMI
  const p4_long = sqz15m.adxValue > 25 && sqz15m.diPlus > sqz15m.diMinus;
  const p4_short = sqz15m.adxValue > 25 && sqz15m.diMinus > sqz15m.diPlus;

  // ── PUNTO 5 — Sentimiento TF actual (Squeeze Momentum 15M)
  const p5_long = sqz15m.sqzVal > 0;
  const p5_short = sqz15m.sqzVal < 0;

  // ── PUNTO 6 — VWAP a favor
  const curClose = closes[n - 1];
  const vwapDaily = calcVwapDaily(candles15m);
  const vwapWeekly = calcVwapWeekly(candles15m);
  const p6_long = curClose > vwapDaily && curClose > vwapWeekly;
  const p6_short = curClose < vwapDaily && curClose < vwapWeekly;

  // ── PUNTO 7 — Delta Z-Score fuerte
  // Pine: delta_positivo = delta_z > 0 AND delta_fuerte = |delta_z| > 1.0
  // Combined: LONG = delta_z > 1.0, SHORT = delta_z < -1.0
  const opens = candles15m.map(c => c.open);
  const deltaRaw = closes.map((c, i) => (c >= opens[i] ? volumes[i] : -volumes[i]));
  const deltaMean = sma(deltaRaw, 100);
  const deltaStd = stdev(deltaRaw, 100);
  const lastDelta = deltaRaw[n - 1];
  const lastMean = deltaMean[n - 1];
  const lastStd = deltaStd[n - 1];
  const deltaZ = lastStd > 0 ? (lastDelta - lastMean) / lastStd : 0;
  const p7_long = deltaZ > 1.0;
  const p7_short = deltaZ < -1.0;

  // ── PUNTO 8 — Dirección CVD suavizado
  let cvd = 0;
  const cvdSeries: number[] = deltaRaw.map(d => (cvd += d));
  const cvdSmooth = ema(cvdSeries, 20);
  const cvdNow = cvdSmooth[n - 1];
  const cvdPrev = cvdSmooth[n - 2];
  const p8_long = !isNaN(cvdNow) && !isNaN(cvdPrev) && cvdNow > cvdPrev;
  const p8_short = !isNaN(cvdNow) && !isNaN(cvdPrev) && cvdNow < cvdPrev;

  // ── PUNTO 9 — Acción del precio (SFP o rechazo)
  // Pine: sfp_activo_bull = is_sfp_bull OR is_sfp_bull[1] (current AND previous bar)
  const c = candles15m[n - 1];
  const body = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const rechazoBull = lowerWick > body * 1.5;
  const rechazoBear = upperWick > body * 1.5;

  // highest/lowest excluding current candle (high[1] / low[1] in Pine)
  const highsExcl = highs.slice(0, n - 1);
  const lowsExcl = lows.slice(0, n - 1);
  const lastHigh = highsExcl.length >= 20 ? Math.max(...highsExcl.slice(-20)) : Math.max(...highsExcl);
  const lastLow = lowsExcl.length >= 20 ? Math.min(...lowsExcl.slice(-20)) : Math.min(...lowsExcl);

  const sfpBull = c.low < lastLow && c.close > lastLow && rechazoBull;
  const sfpBear = c.high > lastHigh && c.close < lastHigh && rechazoBear;

  // Check previous bar too (is_sfp_bull[1] in Pine)
  const cp = candles15m[n - 2];
  const bodyP = Math.abs(cp.close - cp.open);
  const sfpBullPrev = cp.low < lastLow && cp.close > lastLow && (Math.min(cp.open, cp.close) - cp.low) > bodyP * 1.5;
  const sfpBearPrev = cp.high > lastHigh && cp.close < lastHigh && (cp.high - Math.max(cp.open, cp.close)) > bodyP * 1.5;

  const p9_long = sfpBull || sfpBullPrev || rechazoBull;
  const p9_short = sfpBear || sfpBearPrev || rechazoBear;

  // ── ANTI-TRAMPA
  // Pine: giro_alza = sqz > sqz[1] AND sqz < 0 (momentum girando DESDE negativo, en TF rápido)
  // Usamos 5m como "chart TF" y 15m como referencia de confirmación — igual que el indicador
  // cuando se ejecuta en 5m con MTF 15m.
  const ema9Arr = ema(closes, 9);
  const ema9Val = ema9Arr[n - 1];
  const giroAlza = sqz5m.sqzVal > sqz5m.sqzPrevVal && sqz5m.sqzVal < 0;
  const giroBaja = sqz5m.sqzVal < sqz5m.sqzPrevVal && sqz5m.sqzVal > 0;
  const antiTrampaLong = giroAlza && curClose < ema9Val && sqz15m.sqzVal < sqz15mPrevVal;
  const antiTrampaShort = giroBaja && curClose > ema9Val && sqz15m.sqzVal > sqz15mPrevVal;

  // ── SCORES
  const pointsLong = [p1_long, p2_long, p3_long, p4_long, p5_long, p6_long, p7_long, p8_long, p9_long];
  const pointsShort = [p1_short, p2_short, p3_short, p4_short, p5_short, p6_short, p7_short, p8_short, p9_short];
  const scoreLong = pointsLong.filter(Boolean).length;
  const scoreShort = pointsShort.filter(Boolean).length;

  // ── ATR adaptativo
  const atr7Arr = calcAtr(candles15m, 7);
  const atr50Arr = calcAtr(candles15m, 50);
  const atr7 = atr7Arr[n - 1] ?? 0;
  const atr50 = atr50Arr[n - 1] ?? 0;
  const atrCurrent = (atr7 + atr50) / 2;

  const atrSma100Arr = sma(atr7Arr.filter(v => !isNaN(v)), 100);
  const atrSma100 = atrSma100Arr[atrSma100Arr.length - 1] ?? atrCurrent;
  const volRelativa = atrSma100 > 0 ? (atrCurrent / atrSma100) * 100 : 100;

  const rrFactors: RrFactors = {
    volRelativa,
    highSqz: sqz15m.highSqz,
    midSqz: sqz15m.midSqz,
    lowSqz: sqz15m.lowSqz,
    sqzOn: sqz15m.sqzOn,
    sqzOff: sqz15m.sqzOff,
    atrCurrent,
    atrSma100,
  };

  return {
    scoreLong,
    scoreShort,
    points: {
      p1_mtf: { long: p1_long, short: p1_short },
      p2_compression: { long: p2_long, short: p2_short },
      p3_sqzOff: { long: p3_long, short: p3_short },
      p4_adx: { long: p4_long, short: p4_short },
      p5_momentum: { long: p5_long, short: p5_short },
      p6_vwap: { long: p6_long, short: p6_short },
      p7_deltaZ: { long: p7_long, short: p7_short },
      p8_cvd: { long: p8_long, short: p8_short },
      p9_priceAction: { long: p9_long, short: p9_short },
    },
    antiTrampaLong,
    antiTrampaShort,
    rrFactors,
    atr7,
    atr50,
    ema9: ema9Val ?? closes[n - 1],
  };
}
