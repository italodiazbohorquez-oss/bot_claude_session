export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function sma(series: number[], length: number): number[] {
  const result: number[] = new Array(series.length).fill(NaN);
  for (let i = length - 1; i < series.length; i++) {
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) sum += series[j];
    result[i] = sum / length;
  }
  return result;
}

export function ema(series: number[], length: number): number[] {
  const result: number[] = new Array(series.length).fill(NaN);
  const k = 2 / (length + 1);
  let started = false;
  let prev = 0;
  for (let i = 0; i < series.length; i++) {
    if (isNaN(series[i])) continue;
    if (!started) {
      if (i >= length - 1) {
        let sum = 0;
        for (let j = i - length + 1; j <= i; j++) sum += series[j];
        prev = sum / length;
        result[i] = prev;
        started = true;
      }
    } else {
      prev = series[i] * k + prev * (1 - k);
      result[i] = prev;
    }
  }
  return result;
}

export function stdev(series: number[], length: number): number[] {
  const result: number[] = new Array(series.length).fill(NaN);
  for (let i = length - 1; i < series.length; i++) {
    let sum = 0;
    let sumSq = 0;
    for (let j = i - length + 1; j <= i; j++) {
      sum += series[j];
      sumSq += series[j] * series[j];
    }
    const mean = sum / length;
    const variance = sumSq / length - mean * mean;
    result[i] = Math.sqrt(Math.max(0, variance));
  }
  return result;
}

export function highest(series: number[], length: number): number[] {
  const result: number[] = new Array(series.length).fill(NaN);
  for (let i = length - 1; i < series.length; i++) {
    let max = -Infinity;
    for (let j = i - length + 1; j <= i; j++) if (series[j] > max) max = series[j];
    result[i] = max;
  }
  return result;
}

export function lowest(series: number[], length: number): number[] {
  const result: number[] = new Array(series.length).fill(NaN);
  for (let i = length - 1; i < series.length; i++) {
    let min = Infinity;
    for (let j = i - length + 1; j <= i; j++) if (series[j] < min) min = series[j];
    result[i] = min;
  }
  return result;
}

export function linreg(series: number[], length: number, offset: number): number[] {
  const result: number[] = new Array(series.length).fill(NaN);
  for (let i = length - 1 + offset; i < series.length; i++) {
    const start = i - length - offset + 1;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let j = 0; j < length; j++) {
      const x = j;
      const y = series[start + j];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const n = length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    result[i] = intercept + slope * (length - 1 - offset);
  }
  return result;
}

export function atr(candles: Candle[], length: number): number[] {
  const tr: number[] = new Array(candles.length).fill(NaN);
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  const result: number[] = new Array(candles.length).fill(NaN);
  let rma = 0;
  let started = false;
  for (let i = 1; i < candles.length; i++) {
    if (isNaN(tr[i])) continue;
    if (!started && i >= length) {
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += isNaN(tr[j]) ? 0 : tr[j];
      rma = sum / length;
      result[i] = rma;
      started = true;
    } else if (started) {
      rma = (rma * (length - 1) + tr[i]) / length;
      result[i] = rma;
    }
  }
  return result;
}

export function rsi(closes: number[], length: number): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < length + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= length;
  avgLoss /= length;
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[length] = 100 - 100 / (1 + rs0);
  for (let i = length + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
}

export function adx(candles: Candle[], length: number): { adx: number[]; diPlus: number[]; diMinus: number[] } {
  const n = candles.length;
  const adxArr = new Array(n).fill(NaN);
  const diPlusArr = new Array(n).fill(NaN);
  const diMinusArr = new Array(n).fill(NaN);
  if (n < length * 2) return { adx: adxArr, diPlus: diPlusArr, diMinus: diMinusArr };

  const dmPlus: number[] = new Array(n).fill(0);
  const dmMinus: number[] = new Array(n).fill(0);
  const trArr: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    dmPlus[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    dmMinus[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    trArr[i] = Math.max(hl, hpc, lpc);
  }

  let smTr = 0, smDmPlus = 0, smDmMinus = 0;
  for (let i = 1; i <= length; i++) {
    smTr += trArr[i];
    smDmPlus += dmPlus[i];
    smDmMinus += dmMinus[i];
  }

  const dx: number[] = new Array(n).fill(NaN);
  const calcDI = (smPlus: number, smMinus: number, smTrVal: number) => {
    const diP = smTrVal === 0 ? 0 : (smPlus / smTrVal) * 100;
    const diM = smTrVal === 0 ? 0 : (smMinus / smTrVal) * 100;
    return { diP, diM };
  };

  let { diP, diM } = calcDI(smDmPlus, smDmMinus, smTr);
  diPlusArr[length] = diP;
  diMinusArr[length] = diM;
  const dxVal = diP + diM === 0 ? 0 : (Math.abs(diP - diM) / (diP + diM)) * 100;
  dx[length] = dxVal;

  for (let i = length + 1; i < n; i++) {
    smTr = smTr - smTr / length + trArr[i];
    smDmPlus = smDmPlus - smDmPlus / length + dmPlus[i];
    smDmMinus = smDmMinus - smDmMinus / length + dmMinus[i];
    const r = calcDI(smDmPlus, smDmMinus, smTr);
    diPlusArr[i] = r.diP;
    diMinusArr[i] = r.diM;
    const dxV = r.diP + r.diM === 0 ? 0 : (Math.abs(r.diP - r.diM) / (r.diP + r.diM)) * 100;
    dx[i] = dxV;
  }

  let adxSum = 0;
  let adxStarted = false;
  for (let i = length; i < n; i++) {
    if (isNaN(dx[i])) continue;
    if (!adxStarted && i >= length * 2 - 1) {
      let s = 0;
      let cnt = 0;
      for (let j = i - length + 1; j <= i; j++) if (!isNaN(dx[j])) { s += dx[j]; cnt++; }
      adxArr[i] = cnt > 0 ? s / cnt : NaN;
      adxStarted = true;
    } else if (adxStarted && !isNaN(adxArr[i - 1])) {
      adxArr[i] = (adxArr[i - 1] * (length - 1) + dx[i]) / length;
    }
  }

  return { adx: adxArr, diPlus: diPlusArr, diMinus: diMinusArr };
}

export function bollingerBands(closes: number[], length: number, mult: number): { upper: number[]; mid: number[]; lower: number[] } {
  const mid = sma(closes, length);
  const sd = stdev(closes, length);
  const upper = mid.map((m, i) => isNaN(m) ? NaN : m + mult * sd[i]);
  const lower = mid.map((m, i) => isNaN(m) ? NaN : m - mult * sd[i]);
  return { upper, mid, lower };
}

export function keltnerChannels(candles: Candle[], length: number, atrMult: number): { upper: number[]; mid: number[]; lower: number[] } {
  const closes = candles.map(c => c.close);
  const mid = ema(closes, length);
  const atrVals = atr(candles, length);
  const upper = mid.map((m, i) => isNaN(m) || isNaN(atrVals[i]) ? NaN : m + atrMult * atrVals[i]);
  const lower = mid.map((m, i) => isNaN(m) || isNaN(atrVals[i]) ? NaN : m - atrMult * atrVals[i]);
  return { upper, mid, lower };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

export function prev<T>(arr: T[], offset = 1): T {
  return arr[arr.length - 1 - offset];
}
