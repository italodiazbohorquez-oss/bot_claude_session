import type { SqzResult } from "./sqz";

export type MtfDirection = "LONG" | "SHORT" | "WAIT";
export type MtfSetup = "PERFECT" | "TWO_TF" | "ONE_TF" | "RSI_PIVOT" | "TRAP" | "BLOCKED";

export interface MtfResult {
  canTrade: boolean;
  direction: MtfDirection;
  setup: MtfSetup;
  tf5m: "BULL" | "BEAR";
  tf15m: "BULL" | "BEAR";
  tf1h: "BULL" | "BEAR";
  tf4h: "BULL" | "BEAR";
}

function sqzDir(sqz: SqzResult): "BULL" | "BEAR" {
  return sqz.sqzVal >= 0 ? "BULL" : "BEAR";
}

export interface MtfInputs {
  sqz5m: SqzResult;
  sqz15m: SqzResult;
  sqz1h: SqzResult;
  sqz4h: SqzResult;
  tf1hConsecutiveBull: number;
  tf1hConsecutiveBear: number;
  rsiPivotLong?: boolean;
  rsiPivotShort?: boolean;
}

export function calcMtf(inputs: MtfInputs): MtfResult {
  const { sqz5m, sqz15m, sqz1h, sqz4h, tf1hConsecutiveBull, tf1hConsecutiveBear, rsiPivotLong, rsiPivotShort } = inputs;

  const d5m = sqzDir(sqz5m);
  const d15m = sqzDir(sqz15m);
  const d1h = sqzDir(sqz1h);
  const d4h = sqzDir(sqz4h);

  // TRAP patterns — always block
  if (d4h === "BULL" && d1h === "BEAR" && d15m === "BULL") {
    return { canTrade: false, direction: "WAIT", setup: "TRAP", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }
  if (d4h === "BEAR" && d1h === "BULL" && d15m === "BEAR") {
    return { canTrade: false, direction: "WAIT", setup: "TRAP", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }

  // PERFECT setup: all 3 TF aligned
  if (d4h === "BULL" && d1h === "BULL" && d15m === "BULL") {
    return { canTrade: true, direction: "LONG", setup: "PERFECT", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }
  if (d4h === "BEAR" && d1h === "BEAR" && d15m === "BEAR") {
    return { canTrade: true, direction: "SHORT", setup: "PERFECT", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }

  // RSI Pivot signal: 1H independent entry
  if (rsiPivotLong && d1h === "BULL" && d4h === "BULL") {
    return { canTrade: true, direction: "LONG", setup: "RSI_PIVOT", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }
  if (rsiPivotShort && d1h === "BEAR" && d4h === "BEAR") {
    return { canTrade: true, direction: "SHORT", setup: "RSI_PIVOT", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }

  // 2/3 TF rule: 4H + 1H aligned, 1H >= 4 consecutive candles
  if (d4h === "BULL" && d1h === "BULL" && tf1hConsecutiveBull >= 4 && d15m === "BULL") {
    return { canTrade: true, direction: "LONG", setup: "TWO_TF", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }
  if (d4h === "BEAR" && d1h === "BEAR" && tf1hConsecutiveBear >= 4 && d15m === "BEAR") {
    return { canTrade: true, direction: "SHORT", setup: "TWO_TF", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }

  // ONE_TF: 1H + 15M alineados — 4H puede ser opuesto (requiere score más alto)
  if (d1h === "BULL" && d15m === "BULL") {
    return { canTrade: true, direction: "LONG", setup: "ONE_TF", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }
  if (d1h === "BEAR" && d15m === "BEAR") {
    return { canTrade: true, direction: "SHORT", setup: "ONE_TF", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
  }

  return { canTrade: false, direction: "WAIT", setup: "BLOCKED", tf5m: d5m, tf15m: d15m, tf1h: d1h, tf4h: d4h };
}

export function countConsecutiveDir(sqzHistory: SqzResult[], dir: "BULL" | "BEAR"): number {
  let count = 0;
  for (let i = sqzHistory.length - 1; i >= 0; i--) {
    if (sqzDir(sqzHistory[i]) === dir) count++;
    else break;
  }
  return count;
}
