import {
  sma, ema, stdev, linreg, atr, bollingerBands, keltnerChannels,
  highest, lowest, adx as calcAdx, last, prev
} from "./math";
import type { Candle } from "./math";

export type AdxStrength = "VERY_STRONG" | "STRONG" | "MODERATE" | "WEAK";
export type MomentumDir = "BULL_STRONG" | "BULL_WEAK" | "BEAR_STRONG" | "BEAR_WEAK";
export type DmiDir = "BULL" | "BEAR";

export interface SqzResult {
  adxStrength: AdxStrength;
  momentumDir: MomentumDir;
  dmiDir: DmiDir;
  adxValue: number;
  diPlus: number;
  diMinus: number;
  sqzVal: number;
  sqzPrevVal: number;
  sqzPrev2Val: number;
  sqzOn: boolean;
  sqzOff: boolean;
  highSqz: boolean;
  midSqz: boolean;
  lowSqz: boolean;
}

export function calcSqz(candles: Candle[]): SqzResult {
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // Squeeze Momentum (TTM)
  const bb = bollingerBands(closes, 20, 2.0);
  const kc = keltnerChannels(candles, 20, 1.5);

  const highSqzKC = keltnerChannels(candles, 20, 1.0);
  const midSqzKC = kc;
  const lowSqzKC = keltnerChannels(candles, 20, 2.0);

  const bbUpper = last(bb.upper);
  const bbLower = last(bb.lower);
  const kcUpper = last(kc.upper);
  const kcLower = last(kc.lower);
  const hsKcUpper = last(highSqzKC.upper);
  const hsKcLower = last(highSqzKC.lower);
  const lsKcUpper = last(lowSqzKC.upper);
  const lsKcLower = last(lowSqzKC.lower);

  const highSqz = bbUpper < hsKcUpper && bbLower > hsKcLower;
  const midSqz = bbUpper < kcUpper && bbLower > kcLower;
  const lowSqz = bbUpper < lsKcUpper && bbLower > lsKcLower;
  const sqzOn = midSqz || highSqz;
  const sqzOff = bbLower < kcLower && bbUpper > kcUpper;

  // Squeeze momentum value
  const highestArr = highest(highs, 20);
  const lowestArr = lowest(lows, 20);
  const smaClose = sma(closes, 20);

  const sqzInput: number[] = closes.map((c, i) => {
    if (isNaN(highestArr[i]) || isNaN(lowestArr[i]) || isNaN(smaClose[i])) return NaN;
    const midHL = (highestArr[i] + lowestArr[i]) / 2;
    return c - (midHL + smaClose[i]) / 2;
  });

  const sqzLinReg = linreg(sqzInput, 20, 0);
  const sqzVal = last(sqzLinReg);
  const sqzPrevVal = prev(sqzLinReg, 1);
  const sqzPrev2Val = prev(sqzLinReg, 2);

  // ADX
  const { adx: adxArr, diPlus: diPlusArr, diMinus: diMinusArr } = calcAdx(candles, 14);
  const adxValue = last(adxArr);
  const diPlusVal = last(diPlusArr);
  const diMinusVal = last(diMinusArr);

  let adxStrength: AdxStrength;
  if (adxValue >= 40) adxStrength = "VERY_STRONG";
  else if (adxValue >= 25) adxStrength = "STRONG";
  else if (adxValue >= 18) adxStrength = "MODERATE";
  else adxStrength = "WEAK";

  const dmiDir: DmiDir = diPlusVal >= diMinusVal ? "BULL" : "BEAR";

  let momentumDir: MomentumDir;
  if (sqzVal > 0 && sqzVal > sqzPrevVal) momentumDir = "BULL_STRONG";
  else if (sqzVal > 0 && sqzVal <= sqzPrevVal) momentumDir = "BULL_WEAK";
  else if (sqzVal < 0 && sqzVal < sqzPrevVal) momentumDir = "BEAR_STRONG";
  else momentumDir = "BEAR_WEAK";

  return {
    adxStrength,
    momentumDir,
    dmiDir,
    adxValue: isNaN(adxValue) ? 0 : adxValue,
    diPlus: isNaN(diPlusVal) ? 0 : diPlusVal,
    diMinus: isNaN(diMinusVal) ? 0 : diMinusVal,
    sqzVal: isNaN(sqzVal) ? 0 : sqzVal,
    sqzPrevVal: isNaN(sqzPrevVal) ? 0 : sqzPrevVal,
    sqzPrev2Val: isNaN(sqzPrev2Val) ? 0 : sqzPrev2Val,
    sqzOn,
    sqzOff,
    highSqz,
    midSqz,
    lowSqz,
  };
}
