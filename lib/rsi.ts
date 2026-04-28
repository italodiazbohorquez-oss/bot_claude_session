import { rsi as calcRsi, highest, lowest } from "./math";
import type { Candle } from "./math";

export type RsiZone = "LONG_ACTIVE" | "SHORT_EXIT" | "NEUTRAL" | "LONG_EXIT" | "SHORT_ACTIVE";
export type RsiPivot = "PIVOT_HIGH" | "PIVOT_LOW" | "NONE";
export type DivergenceType = "BULL" | "BEAR" | "NONE";

export interface RsiResult {
  value: number;
  zone: RsiZone;
  pivot: RsiPivot;
  divergence: DivergenceType;
  zoneNumeric: number;
}

function getRsiZone(rsiVal: number): RsiZone {
  if (rsiVal >= 65) return "LONG_ACTIVE";
  if (rsiVal >= 55) return "SHORT_EXIT";
  if (rsiVal >= 45) return "NEUTRAL";
  if (rsiVal >= 35) return "LONG_EXIT";
  return "SHORT_ACTIVE";
}

function detectPivot(rsiArr: number[]): RsiPivot {
  const n = rsiArr.length;
  if (n < 3) return "NONE";
  const r2 = rsiArr[n - 1];
  const r1 = rsiArr[n - 2];
  const r0 = rsiArr[n - 3];
  if (isNaN(r0) || isNaN(r1) || isNaN(r2)) return "NONE";
  // pivot_high: RSI[1] > RSI[0] AND RSI[1] > RSI[2]
  if (r1 > r2 && r1 > r0) return "PIVOT_HIGH";
  // pivot_low: RSI[1] < RSI[0] AND RSI[1] < RSI[2]
  if (r1 < r2 && r1 < r0) return "PIVOT_LOW";
  return "NONE";
}

function detectDivergence(candles: Candle[], rsiArr: number[], lookback = 20): DivergenceType {
  const n = candles.length;
  if (n < lookback + 2) return "NONE";

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const curClose = closes[n - 1];
  const curRsi = rsiArr[n - 1];
  if (isNaN(curRsi)) return "NONE";

  // Look back for pivot points
  let maxClose = -Infinity, maxRsiAtClose = -Infinity;
  let minClose = Infinity, minRsiAtClose = Infinity;

  for (let i = n - 2; i >= Math.max(0, n - 1 - lookback); i--) {
    if (isNaN(rsiArr[i])) continue;
    if (highs[i] > maxClose) { maxClose = highs[i]; maxRsiAtClose = rsiArr[i]; }
    if (lows[i] < minClose) { minClose = lows[i]; minRsiAtClose = rsiArr[i]; }
  }

  // Bear divergence: price makes HH but RSI makes LH
  if (candles[n - 1].high > maxClose && curRsi < maxRsiAtClose) return "BEAR";
  // Bull divergence: price makes LL but RSI makes HL
  if (candles[n - 1].low < minClose && curRsi > minRsiAtClose) return "BULL";

  return "NONE";
}

export function calcRsiSignal(candles: Candle[]): RsiResult {
  const closes = candles.map(c => c.close);
  const rsiArr = calcRsi(closes, 14);
  const curRsi = rsiArr[rsiArr.length - 1];

  if (isNaN(curRsi)) {
    return { value: 50, zone: "NEUTRAL", pivot: "NONE", divergence: "NONE", zoneNumeric: 50 };
  }

  const zone = getRsiZone(curRsi);
  const pivot = detectPivot(rsiArr);
  const divergence = detectDivergence(candles, rsiArr);

  return { value: curRsi, zone, pivot, divergence, zoneNumeric: curRsi };
}

export function rsiLongSignal(result: RsiResult): boolean {
  return result.pivot === "PIVOT_LOW" && result.zoneNumeric <= 45;
}

export function rsiShortSignal(result: RsiResult): boolean {
  return result.pivot === "PIVOT_HIGH" && result.zoneNumeric >= 55;
}
