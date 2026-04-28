import type { AdxStrength } from "./sqz";
import { clamp } from "./math";

export interface RiskParams {
  capital: number;
  riskPerTrade: number;
  rrRatio: number;
  atrMult: number;
  leverage: number;
}

export interface PositionResult {
  sl: number;
  tp: number;
  positionUsd: number;
  contracts: number;
  rrDynamic: number;
  riskUsd: number;
}

export interface RrFactors {
  volRelativa: number;
  highSqz: boolean;
  midSqz: boolean;
  lowSqz: boolean;
  sqzOn: boolean;
  sqzOff: boolean;
  atrCurrent: number;
  atrSma100: number;
}

export function calcRrDynamic(params: RiskParams, factors: RrFactors): number {
  const { rrRatio } = params;
  const { volRelativa, highSqz, midSqz, lowSqz, sqzOn, sqzOff } = factors;

  const volFactor = volRelativa < 75 ? 0.8 : volRelativa > 150 ? 1.4 : 1.0;
  const sqzFactor = highSqz ? 1.4 : midSqz ? 1.2 : lowSqz ? 1.0 : 0.85;
  const estadoFactor = sqzOff ? 1.15 : sqzOn ? 0.90 : 1.0;

  return clamp(rrRatio * volFactor * sqzFactor * estadoFactor, 1.5, 5.0);
}

export interface SlTpInput {
  side: "LONG" | "SHORT";
  close: number;
  high: number;
  low: number;
  prevHigh: number;
  prevLow: number;
  atr7: number;
  atr50: number;
  atrMult: number;
  rrDynamic: number;
}

export function calcSlTp(input: SlTpInput): { sl: number; tp: number } {
  const { side, close, high, low, prevHigh, prevLow, atr7, atr50, atrMult, rrDynamic } = input;
  const atrAdapt = (atr7 + atr50) / 2;

  if (side === "LONG") {
    const sl = Math.min(low, prevLow) - atrAdapt * atrMult;
    const dist = Math.abs(close - sl);
    const tp = close + dist * rrDynamic;
    return { sl, tp };
  } else {
    const sl = Math.max(high, prevHigh) + atrAdapt * atrMult;
    const dist = Math.abs(close - sl);
    const tp = close - dist * rrDynamic;
    return { sl, tp };
  }
}

export interface PositionSizeInput {
  capital: number;
  riskPerTrade: number;
  close: number;
  sl: number;
  tp: number;
  side: "LONG" | "SHORT";
  adxStrength: AdxStrength;
  score: number;
  minScore: number;
  stepSize?: number;
}

export function calcPositionSize(input: PositionSizeInput): PositionResult {
  const { capital, riskPerTrade, close, sl, tp, side, adxStrength, score, minScore, stepSize = 0.001 } = input;

  let riskUsd = capital * (riskPerTrade / 100);
  const distSlPct = Math.abs(close - sl) / close;

  // Adjust for ADX moderate
  if (adxStrength === "MODERATE") riskUsd *= 0.5;

  // Adjust for minimum score
  if (score === minScore) riskUsd *= 0.75;

  let positionUsd = distSlPct > 0 ? riskUsd / distSlPct : 0;
  let contracts = positionUsd / close;

  // Round down to step size
  contracts = Math.floor(contracts / stepSize) * stepSize;
  positionUsd = contracts * close;

  const rrDynamic = distSlPct > 0 ? Math.abs(tp - close) / (close * distSlPct) : 0;

  return { sl, tp, positionUsd, contracts, rrDynamic, riskUsd };
}
