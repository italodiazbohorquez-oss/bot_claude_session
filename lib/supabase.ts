import { createClient } from "@supabase/supabase-js";

export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";
export type TradeSide = "LONG" | "SHORT";

export interface Trade {
  id?: string;
  symbol: string;
  side: TradeSide;
  entry_price: number;
  sl: number;
  tp: number;
  size: number;
  score: number;
  setup_type: string;
  session: string;
  opened_at: string;
  closed_at?: string | null;
  pnl?: number | null;
  status: TradeStatus;
  order_id?: string | null;
}

export interface SignalLog {
  id?: string;
  symbol: string;
  timestamp: string;
  score_long: number;
  score_short: number;
  mtf_setup: string;
  rsi_zone: number;
  rsi_pivot: string;
  adx_value: number;
  adx_strength: string;
  momentum_dir: string;
  action_taken: string;
}

export interface BotConfig {
  id?: string;
  key: string;
  value: string;
}

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? "";

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function saveTrade(trade: Trade): Promise<Trade | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("trades")
      .insert(trade)
      .select()
      .single();
    if (error) throw error;
    return data as Trade;
  } catch (e) {
    console.error("[Supabase] saveTrade error:", e);
    return null;
  }
}

export async function updateTrade(id: string, updates: Partial<Trade>): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("trades").update(updates).eq("id", id);
    if (error) throw error;
  } catch (e) {
    console.error("[Supabase] updateTrade error:", e);
  }
}

export async function getOpenTrade(symbol: string): Promise<Trade | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("symbol", symbol)
      .eq("status", "OPEN")
      .order("opened_at", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data as Trade | null;
  } catch (e) {
    console.error("[Supabase] getOpenTrade error:", e);
    return null;
  }
}

export async function getRecentTrades(limit = 10): Promise<Trade[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Trade[];
  } catch (e) {
    console.error("[Supabase] getRecentTrades error:", e);
    return [];
  }
}

export async function saveSignalLog(log: SignalLog): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("signals_log").insert(log);
    if (error) throw error;
  } catch (e) {
    console.error("[Supabase] saveSignalLog error:", e);
  }
}

export async function getBotConfig(key: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("bot_config")
      .select("value")
      .eq("key", key)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data?.value ?? null;
  } catch (e) {
    console.error("[Supabase] getBotConfig error:", e);
    return null;
  }
}

export async function setBotConfig(key: string, value: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("bot_config")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;
  } catch (e) {
    console.error("[Supabase] setBotConfig error:", e);
  }
}

export async function getSignalLogs(limit = 20): Promise<SignalLog[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("signals_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as SignalLog[];
  } catch (e) {
    console.error("[Supabase] getSignalLogs error:", e);
    return [];
  }
}
