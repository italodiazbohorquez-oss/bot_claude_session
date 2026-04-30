import crypto from "crypto";
import type { Candle } from "./math";

const BASE_URL = "https://fapi.bitunix.com";
const MAX_RETRIES = 3;

function buildSignature(apiKey: string, apiSecret: string, nonce: string, timestamp: string, qs: string, bodyStr: string): string {
  // Stage 1: SHA256(nonce + timestamp + apiKey + queryParams + bodyJson)
  // queryParams format: key+value concatenated (NO = or &), sorted ascending by key
  const digest = crypto.createHash("sha256")
    .update(nonce + timestamp + apiKey + qs + bodyStr)
    .digest("hex");
  // Stage 2: SHA256(digest + secretKey)
  return crypto.createHash("sha256")
    .update(digest + apiSecret)
    .digest("hex");
}

// For URL construction: key=value&key=value
function buildQueryString(params: Record<string, string | number>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

// For signature: keyValuekeyValue (sorted, no separators) — per Bitunix docs
function buildSignatureParams(params: Record<string, string | number>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join("");
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number> = {},
  body: Record<string, unknown> = {},
  requiresAuth = true
): Promise<T> {
  const apiKey = (process.env.BITUNIX_API_KEY ?? "").trim();
  const apiSecret = (process.env.BITUNIX_API_SECRET ?? "").trim();
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString("hex");

  let url = `${BASE_URL}${path}`;
  let headers: Record<string, string> = { "Content-Type": "application/json", "language": "en-US" };

  if (requiresAuth) {
    const sigParams = buildSignatureParams(params);
    const bodyStr = method === "POST" ? JSON.stringify(body) : "";
    const signature = buildSignature(apiKey, apiSecret, nonce, timestamp, sigParams, bodyStr);

    headers = {
      ...headers,
      "api-key": apiKey,
      "sign": signature,
      "timestamp": timestamp,
      "nonce": nonce,
    };
  }

  if (method === "GET" && Object.keys(params).length > 0) {
    url += "?" + buildQueryString(params);
  }

  let lastError: Error = new Error("Unknown error");
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 1000);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === "POST" ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      if (data.code !== 0 && data.code !== undefined) {
        throw new Error(`Bitunix API error ${data.code}: ${data.msg}`);
      }
      return data.data as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(`[Bitunix] attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Candles
export type TimeFrame = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

interface RawKline {
  time: string | number;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVol: string;
  quoteVol: string;
}

export async function getCandles(symbol: string, interval: TimeFrame, limit = 200): Promise<Candle[]> {
  const raw = await request<RawKline[]>("GET", "/api/v1/futures/market/kline", {
    symbol,
    interval,
    limit,
  }, {}, false);

  return raw.map(k => ({
    timestamp: Number(k.time),
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
    volume: parseFloat(k.baseVol),
  })).sort((a, b) => a.timestamp - b.timestamp);
}

// ── Ticker
interface RawTicker {
  symbol: string;
  lastPrice: string;
  markPrice: string;
  indexPrice: string;
  volume24h: string;
}

export async function getTicker(symbol: string): Promise<{ lastPrice: number; markPrice: number }> {
  const data = await request<RawTicker>("GET", "/api/v1/futures/ticker", { symbol }, {}, false);
  return {
    lastPrice: parseFloat(data.lastPrice),
    markPrice: parseFloat(data.markPrice),
  };
}

// ── Account balance
export async function getAccount(): Promise<{ available: number; equity: number; unrealizedPnl: number }> {
  const data = await request<Record<string, string>>("GET", "/api/v1/futures/account", { marginCoin: "USDT" });
  const available     = parseFloat(data.available ?? "0");
  const margin        = parseFloat(data.margin    ?? "0");
  const isoUpnl       = parseFloat(data.isolationUnrealizedPNL ?? "0");
  const crossUpnl     = parseFloat(data.crossUnrealizedPNL    ?? "0");
  const unrealizedPnl = isoUpnl + crossUpnl;
  const equity        = available + margin + unrealizedPnl;
  return { available, equity, unrealizedPnl };
}

// Returns the raw account response — used by /api/test for field discovery
export async function getRawAccount(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("GET", "/api/v1/futures/account", { marginCoin: "USDT" });
}

// ── Positions
interface RawPosition {
  symbol: string;
  positionSide: string;   // "LONG" | "SHORT" in HEDGE mode
  side: string;            // "BUY" | "SELL" (opening side)
  size: string;
  qty: string;             // alternate field name
  openAvgPrice: string;    // entry price (Bitunix naming)
  entryPrice: string;      // alternate field name
  unrealizedPNL: string;   // Bitunix uppercase
  unrealizedPnl: string;   // alternate casing
  leverage: string;
}

export interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

export async function getPosition(symbol: string): Promise<Position | null> {
  const data = await request<RawPosition[]>("GET", "/api/v1/futures/position/get_pending_positions", { symbol });
  if (!data || data.length === 0) return null;
  const pos = data.find(p => p.symbol === symbol && parseFloat(p.size ?? p.qty ?? "0") > 0);
  if (!pos) return null;
  const side: "LONG" | "SHORT" = pos.positionSide === "LONG" || pos.positionSide === "SHORT"
    ? pos.positionSide as "LONG" | "SHORT"
    : pos.side === "BUY" ? "LONG" : "SHORT";
  return {
    symbol: pos.symbol,
    side,
    size: parseFloat(pos.size ?? pos.qty ?? "0"),
    entryPrice: parseFloat(pos.openAvgPrice ?? pos.entryPrice ?? "0"),
    unrealizedPnl: parseFloat(pos.unrealizedPNL ?? pos.unrealizedPnl ?? "0"),
    leverage: parseFloat(pos.leverage ?? "1"),
  };
}

// Returns raw position list — used by /api/test to inspect actual fields
export async function getRawPosition(symbol: string): Promise<unknown> {
  return request<unknown>("GET", "/api/v1/futures/position/get_pending_positions", { symbol });
}


// ── Orders
export interface OrderParams {
  symbol: string;
  side: "BUY" | "SELL";
  positionSide: "LONG" | "SHORT";
  type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  timeInForce?: "GTC" | "IOC" | "FOK";
}

interface RawOrder {
  orderId: string;
  symbol: string;
  status: string;
}

export async function placeOrder(params: OrderParams): Promise<string> {
  if (process.env.IS_TESTNET === "true") {
    console.log("[TESTNET] Would place order:", JSON.stringify(params));
    return `testnet-${Date.now()}`;
  }

  const body: Record<string, unknown> = {
    symbol: params.symbol,
    side: params.side,
    positionSide: params.positionSide,
    type: params.type,
    qty: params.quantity.toString(),
    reduceOnly: params.reduceOnly ?? false,
  };
  if (params.price !== undefined) body.price = params.price.toString();
  if (params.stopPrice !== undefined) body.stopPrice = params.stopPrice.toString();
  if (params.timeInForce) body.timeInForce = params.timeInForce;

  const data = await request<RawOrder>("POST", "/api/v1/futures/order", {}, body);
  return data.orderId;
}

export async function cancelOrder(symbol: string, orderId: string): Promise<void> {
  if (process.env.IS_TESTNET === "true") {
    console.log("[TESTNET] Would cancel order:", orderId);
    return;
  }
  await request("POST", "/api/v1/futures/order/cancel", {}, { symbol, orderId });
}

export async function setLeverage(symbol: string, leverage: number): Promise<void> {
  if (process.env.IS_TESTNET === "true") return;
  await request("POST", "/api/v1/futures/leverage", {}, { symbol, leverage: leverage.toString() });
}
