"use client";

import { useEffect, useState, useCallback } from "react";

interface SessionInfo {
  active: boolean;
  session: string;
  utcHour: number;
}

interface AccountInfo {
  available: number;
  equity: number;
  unrealizedPnl: number;
}

interface Position {
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
}

interface Trade {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  sl: number;
  tp: number;
  size: number;
  score: number;
  setup_type: string;
  session: string;
  opened_at: string;
  closed_at?: string;
  pnl?: number;
  status: string;
}

interface SignalLog {
  id: string;
  symbol: string;
  timestamp: string;
  score_long: number;
  score_short: number;
  mtf_setup: string;
  rsi_zone: number;
  adx_value: number;
  adx_strength: string;
  momentum_dir: string;
  action_taken: string;
}

interface DashboardData {
  session: SessionInfo;
  account: AccountInfo | null;
  positions: Position[];
  config: { minScore: number; capital: number; symbols: string[]; leverage: number; botEnabled: boolean };
  recentTrades: Trade[];
  latestSignals: Record<string, SignalLog>;
  signalLogs: SignalLog[];
  timestamp: string;
}

function Badge({ label, type }: { label: string; type: "green" | "red" | "yellow" | "blue" | "gray" }) {
  return <span className={`badge badge-${type}`}>{label}</span>;
}

function MtfCell({ dir }: { dir: string }) {
  const isBull = dir === "BULL";
  return (
    <td>
      <Badge label={dir} type={isBull ? "green" : "red"} />
    </td>
  );
}

function SessionBadge({ session }: { session: SessionInfo }) {
  if (!session.active) return <Badge label="OUT OF SESSION" type="gray" />;
  const colors: Record<string, "green" | "blue" | "yellow"> = {
    TOKYO: "blue", LONDON: "yellow", NEW_YORK: "green", LONDON_NY_OVERLAP: "green",
  };
  return <Badge label={session.session.replace("_", " ")} type={colors[session.session] ?? "blue"} />;
}

function fmt(n: number | undefined | null, digits = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(digits);
}

function fmtPct(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function PnlCell({ pnl }: { pnl?: number | null }) {
  if (pnl == null) return <td className="neutral">—</td>;
  return <td className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{fmt(pnl)} USDT</td>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  // Config edit state
  const [editMinScore, setEditMinScore] = useState("");
  const [editCapital, setEditCapital] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [togglingBot, setTogglingBot] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DashboardData = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (data) {
      setEditMinScore(String(data.config.minScore));
      setEditCapital(String(data.config.capital));
    }
  }, [data?.config.minScore, data?.config.capital]);

  const toggleBot = async () => {
    if (!data) return;
    const newVal = data.config.botEnabled ? "false" : "true";
    setTogglingBot(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "bot_enabled", value: newVal }),
      });
      await fetchData();
    } finally {
      setTogglingBot(false);
    }
  };

  const saveConfig = async (key: string, value: string) => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSaveMsg(`${key} saved`);
      fetchData();
    } catch (e) {
      setSaveMsg(`Error: ${e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <p className="neutral">Loading NEXUS IA v2...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 32 }}>
        <p className="negative">Connection error: {error}</p>
        <button style={{ marginTop: 12 }} onClick={fetchData}>Retry</button>
      </div>
    );
  }

  const symbols = data.config.symbols;

  return (
    <div style={{ padding: "16px 24px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.05em", color: "#3b82f6" }}>
            NEXUS IA <span style={{ color: "#8b5cf6" }}>v2</span>
          </h1>
          <p style={{ color: "#6b7280", fontSize: 11 }}>Automated Perpetual Futures Bot — Bitunix</p>
        </div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SessionBadge session={data.session} />
            <button
              onClick={toggleBot}
              disabled={togglingBot}
              style={{
                background: data.config.botEnabled ? "#064e3b" : "#450a0a",
                color: data.config.botEnabled ? "#10b981" : "#ef4444",
                border: `1px solid ${data.config.botEnabled ? "#10b981" : "#ef4444"}`,
                borderRadius: 6,
                padding: "4px 14px",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              {togglingBot ? "..." : data.config.botEnabled ? "BOT ON" : "BOT OFF"}
            </button>
          </div>
          <p style={{ color: "#6b7280", fontSize: 10 }}>
            UTC {data.session.utcHour}:xx &nbsp;|&nbsp; {lastRefresh}
          </p>
          <button style={{ fontSize: 10, padding: "3px 10px" }} onClick={fetchData}>Refresh</button>
        </div>
      </div>

      {/* Account Overview */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="label">Account Equity</div>
          <div className="value positive">{data.account ? `$${fmt(data.account.equity)}` : "—"}</div>
        </div>
        <div className="card">
          <div className="label">Available Balance</div>
          <div className="value">{data.account ? `$${fmt(data.account.available)}` : "—"}</div>
        </div>
        <div className="card">
          <div className="label">Unrealized PnL</div>
          <div className={`value ${(data.account?.unrealizedPnl ?? 0) >= 0 ? "positive" : "negative"}`}>
            {data.account ? `$${fmt(data.account.unrealizedPnl)}` : "—"}
          </div>
        </div>
        <div className="card">
          <div className="label">Config Capital / Leverage</div>
          <div className="value-sm">${fmt(data.config.capital, 0)} <span className="neutral">×{data.config.leverage}</span></div>
          <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>MIN_SCORE: {data.config.minScore}</div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#9ca3af" }}>OPEN POSITIONS</h2>
        {data.positions.length === 0 ? (
          <p className="neutral" style={{ fontSize: 12 }}>No open positions</p>
        ) : (
          <table>
            <thead>
              <tr><th>Symbol</th><th>Side</th><th>Size</th><th>Entry Price</th><th>Unrealized PnL</th></tr>
            </thead>
            <tbody>
              {data.positions.map((pos, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{pos.symbol}</td>
                  <td><Badge label={pos.side} type={pos.side === "LONG" ? "green" : "red"} /></td>
                  <td>{fmt(pos.size, 4)}</td>
                  <td>{fmt(pos.entryPrice, 2)}</td>
                  <PnlCell pnl={pos.unrealizedPnl} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Signal Status by Symbol */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#9ca3af" }}>SIGNAL STATUS</h2>
        <div className={symbols.length === 1 ? "grid-2" : "grid-2"} style={{ gap: 12 }}>
          {symbols.map(sym => {
            const sig = data.latestSignals[sym] as SignalLog | undefined;
            const tf15 = sig?.momentum_dir ?? "—";
            const isBullMom = tf15.includes("BULL");

            return (
              <div key={sym} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{sym}</span>
                  {sig && (
                    <Badge
                      label={sig.action_taken}
                      type={sig.action_taken.includes("OPENED") ? (sig.action_taken.includes("LONG") ? "green" : "red") : "gray"}
                    />
                  )}
                </div>
                <div className="grid-2" style={{ gap: 8, marginBottom: 12 }}>
                  <div>
                    <div className="label">Score LONG</div>
                    <div className="value positive">{sig?.score_long ?? "—"}<span className="neutral">/9</span></div>
                  </div>
                  <div>
                    <div className="label">Score SHORT</div>
                    <div className="value negative">{sig?.score_short ?? "—"}<span className="neutral">/9</span></div>
                  </div>
                </div>
                <div className="grid-2" style={{ gap: 8, marginBottom: 12 }}>
                  <div>
                    <div className="label">ADX</div>
                    <div className="value-sm">{sig ? fmt(sig.adx_value, 1) : "—"}</div>
                    <div style={{ marginTop: 2 }}>
                      {sig && (
                        <Badge
                          label={sig.adx_strength}
                          type={sig.adx_strength === "VERY_STRONG" || sig.adx_strength === "STRONG" ? "green" : sig.adx_strength === "MODERATE" ? "yellow" : "red"}
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="label">Momentum</div>
                    <div style={{ marginTop: 4 }}>
                      {sig && (
                        <Badge
                          label={tf15}
                          type={isBullMom ? "green" : "red"}
                        />
                      )}
                    </div>
                  </div>
                </div>
                {/* MTF Table */}
                <div className="label" style={{ marginBottom: 6 }}>MTF CONFLUENCE</div>
                <table style={{ fontSize: 11 }}>
                  <thead>
                    <tr><th>5M</th><th>15M</th><th>1H</th><th>4H</th><th>SETUP</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><Badge label="—" type="gray" /></td>
                      <td><Badge label={isBullMom ? "BULL" : "BEAR"} type={isBullMom ? "green" : "red"} /></td>
                      <td><Badge label="—" type="gray" /></td>
                      <td><Badge label="—" type="gray" /></td>
                      <td style={{ fontWeight: 700 }}>{sig?.mtf_setup ?? "—"}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: 8, color: "#6b7280", fontSize: 10 }}>
                  RSI {sig ? fmt(sig.rsi_zone, 1) : "—"} &nbsp;|&nbsp;
                  {sig?.timestamp ? new Date(sig.timestamp).toLocaleTimeString() : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Trades */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#9ca3af" }}>RECENT TRADES</h2>
        {data.recentTrades.length === 0 ? (
          <p className="neutral" style={{ fontSize: 12 }}>No trades yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th><th>Side</th><th>Entry</th><th>SL</th><th>TP</th>
                <th>Size</th><th>Score</th><th>Setup</th><th>PnL</th><th>Status</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTrades.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 700 }}>{t.symbol}</td>
                  <td><Badge label={t.side} type={t.side === "LONG" ? "green" : "red"} /></td>
                  <td>{fmt(t.entry_price)}</td>
                  <td className="negative">{fmt(t.sl)}</td>
                  <td className="positive">{fmt(t.tp)}</td>
                  <td>{fmt(t.size, 4)}</td>
                  <td style={{ fontWeight: 700, color: "#f59e0b" }}>{t.score}/9</td>
                  <td style={{ fontSize: 10, color: "#9ca3af" }}>{t.setup_type}</td>
                  <PnlCell pnl={t.pnl} />
                  <td>
                    <Badge
                      label={t.status}
                      type={t.status === "OPEN" ? "blue" : t.status === "CLOSED" ? "green" : "gray"}
                    />
                  </td>
                  <td style={{ color: "#6b7280", fontSize: 10 }}>
                    {new Date(t.opened_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Config Panel */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#9ca3af" }}>CONFIGURATION</h2>
        <div className="grid-3" style={{ gap: 12, alignItems: "end" }}>
          <div>
            <div className="label">Capital (USD)</div>
            <input
              type="number"
              value={editCapital}
              onChange={e => setEditCapital(e.target.value)}
              min="1"
              step="100"
            />
          </div>
          <div>
            <div className="label">Min Score (4–9)</div>
            <input
              type="number"
              value={editMinScore}
              onChange={e => setEditMinScore(e.target.value)}
              min="4"
              max="9"
              step="1"
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={saving}
              onClick={() => {
                saveConfig("capital", editCapital);
                saveConfig("min_score", editMinScore);
              }}
            >
              {saving ? "Saving..." : "Save Config"}
            </button>
          </div>
        </div>
        {saveMsg && (
          <p style={{ marginTop: 8, fontSize: 11, color: saveMsg.includes("Error") ? "#ef4444" : "#10b981" }}>
            {saveMsg}
          </p>
        )}
      </div>

      {/* Signal Log */}
      <div className="card">
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#9ca3af" }}>SIGNAL LOG (last 10)</h2>
        {data.signalLogs.length === 0 ? (
          <p className="neutral" style={{ fontSize: 12 }}>No signals yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Symbol</th><th>Score L</th><th>Score S</th>
                <th>Setup</th><th>ADX</th><th>Strength</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.signalLogs.map((l, i) => (
                <tr key={l.id ?? i}>
                  <td style={{ color: "#6b7280", fontSize: 10 }}>{new Date(l.timestamp).toLocaleTimeString()}</td>
                  <td style={{ fontWeight: 700 }}>{l.symbol}</td>
                  <td className="positive">{l.score_long}</td>
                  <td className="negative">{l.score_short}</td>
                  <td style={{ fontSize: 10 }}>{l.mtf_setup}</td>
                  <td>{fmt(l.adx_value, 1)}</td>
                  <td>
                    <Badge
                      label={l.adx_strength}
                      type={l.adx_strength === "STRONG" || l.adx_strength === "VERY_STRONG" ? "green" : l.adx_strength === "MODERATE" ? "yellow" : "red"}
                    />
                  </td>
                  <td>
                    <Badge
                      label={l.action_taken}
                      type={l.action_taken.includes("OPENED") ? (l.action_taken.includes("LONG") ? "green" : "red") : "gray"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 20, textAlign: "center", color: "#374151", fontSize: 10 }}>
        NEXUS IA v2 — Auto-refresh every 30s — {data.timestamp}
      </div>
    </div>
  );
}
