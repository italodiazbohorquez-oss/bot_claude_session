"use client";

import { useEffect, useState, useCallback } from "react";

interface SessionInfo { active: boolean; session: string; utcHour: number; }
interface AccountInfo { available: number; equity: number; unrealizedPnl: number; }
interface Position { symbol: string; side: string; size: number; entryPrice: number; unrealizedPnl: number; }
interface Trade {
  id: string; symbol: string; side: string; entry_price: number; sl: number; tp: number;
  size: number; score: number; setup_type: string; session: string; opened_at: string;
  closed_at?: string; pnl?: number; status: string;
}
interface SignalLog {
  id: string; symbol: string; timestamp: string; score_long: number; score_short: number;
  mtf_setup: string; rsi_zone: number; rsi_pivot: string; adx_value: number;
  adx_strength: string; momentum_dir: string; action_taken: string;
}
interface DashboardData {
  session: SessionInfo;
  account: AccountInfo | null;
  positions: Position[];
  prices: Record<string, number>;
  config: { minScore: number; capital: number; symbols: string[]; leverage: number; botEnabled: boolean };
  recentTrades: Trade[];
  latestSignals: Record<string, SignalLog>;
  signalLogs: SignalLog[];
  timestamp: string;
}

// Parse the encoded mtf_setup: "PERFECT|BULL|BEAR|BEAR|BEAR"
function parseMtfSetup(s: string) {
  const parts = s.split("|");
  return { setup: parts[0], tf5m: parts[1], tf15m: parts[2], tf1h: parts[3], tf4h: parts[4] };
}

// Parse action_taken: "WAIT:PERSIST_15M" or "OPENED_SHORT"
function parseAction(s: string) {
  const idx = s.indexOf(":");
  if (idx === -1) return { status: s, reason: "" };
  return { status: s.slice(0, idx), reason: s.slice(idx + 1) };
}

function fmt(n: number | undefined | null, d = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(d);
}

function clsColor(v: number | undefined | null) {
  if (v == null || isNaN(v as number)) return "neutral";
  return (v as number) >= 0 ? "positive" : "negative";
}

function Badge({ label, type }: { label: string; type: "green" | "red" | "yellow" | "blue" | "gray" | "purple" }) {
  return <span className={`badge badge-${type}`}>{label}</span>;
}

function DirBadge({ dir }: { dir?: string }) {
  if (!dir) return <Badge label="—" type="gray" />;
  return <Badge label={dir} type={dir === "BULL" ? "green" : "red"} />;
}

function AdxBadge({ str }: { str: string }) {
  const t = str === "VERY_STRONG" || str === "STRONG" ? "green" : str === "MODERATE" ? "yellow" : "red";
  const short = str === "VERY_STRONG" ? "V.STR" : str === "STRONG" ? "STR" : str === "MODERATE" ? "MOD" : "WEAK";
  return <Badge label={short} type={t} />;
}

function SessionBadge({ session }: { session: SessionInfo }) {
  if (!session.active) return <Badge label="OUT OF SESSION" type="gray" />;
  const colors: Record<string, "green" | "blue" | "yellow"> = {
    TOKYO: "blue", LONDON: "yellow", NEW_YORK: "green", LONDON_NY_OVERLAP: "green",
  };
  return <Badge label={session.session.replace(/_/g, " ")} type={colors[session.session] ?? "blue"} />;
}

function ReasonBadge({ reason }: { reason: string }) {
  if (!reason) return null;
  const color = reason.startsWith("READY") ? "green"
    : reason.startsWith("SCORE") || reason.startsWith("ADX") ? "red"
    : "yellow";
  return <span className={`badge badge-${color}`} style={{ fontSize: 10, marginLeft: 4 }}>{reason}</span>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [editMinScore, setEditMinScore] = useState("");
  const [editCapital, setEditCapital] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [togglingBot, setTogglingBot] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
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
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    if (data) {
      setEditMinScore(String(data.config.minScore));
      setEditCapital(String(data.config.capital));
    }
  }, [data?.config.minScore, data?.config.capital]);

  const toggleBot = async () => {
    if (!data) return;
    setTogglingBot(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "bot_enabled", value: data.config.botEnabled ? "false" : "true" }),
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
      setSaveMsg(`${key} guardado`);
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
        <p className="neutral">Cargando NEXUS IA v2...</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div style={{ padding: 32 }}>
        <p className="negative">Error de conexión: {error}</p>
        <button style={{ marginTop: 12 }} onClick={fetchData}>Reintentar</button>
      </div>
    );
  }

  const { session, account, positions, prices, config, recentTrades, latestSignals, signalLogs } = data;
  const symbols = config.symbols;

  return (
    <div style={{ padding: "16px 24px", maxWidth: 1440, margin: "0 auto" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.04em", color: "#3b82f6" }}>
            NEXUS IA <span style={{ color: "#8b5cf6" }}>v2</span>
          </h1>
          <p style={{ color: "#6b7280", fontSize: 11, marginTop: 1 }}>Bot Perpetuos Futuros — Bitunix</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SessionBadge session={session} />
            <button
              onClick={toggleBot}
              disabled={togglingBot}
              style={{
                background: config.botEnabled ? "#064e3b" : "#450a0a",
                color: config.botEnabled ? "#10b981" : "#ef4444",
                border: `1px solid ${config.botEnabled ? "#10b981" : "#ef4444"}`,
                borderRadius: 6, padding: "4px 16px",
                fontWeight: 900, fontSize: 13, cursor: "pointer", letterSpacing: "0.06em",
              }}
            >
              {togglingBot ? "..." : config.botEnabled ? "BOT ON" : "BOT OFF"}
            </button>
            <a
              href="/api/test"
              target="_blank"
              style={{
                background: "#1f2937", border: "1px solid #374151", borderRadius: 6,
                color: "#9ca3af", padding: "4px 10px", fontSize: 11, fontWeight: 600,
              }}
            >
              TEST API
            </a>
          </div>
          <p style={{ color: "#6b7280", fontSize: 10 }}>UTC {session.utcHour}:xx &nbsp;|&nbsp; {lastRefresh}</p>
          <button style={{ fontSize: 10, padding: "3px 10px" }} onClick={fetchData}>Refresh</button>
        </div>
      </div>

      {/* ── ACCOUNT CARDS ── */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="label">Equity</div>
          <div className={`value ${clsColor(account?.equity)}`}>
            {account ? `$${fmt(account.equity)}` : <span className="negative">— (API Error)</span>}
          </div>
        </div>
        <div className="card">
          <div className="label">Disponible</div>
          <div className="value">{account ? `$${fmt(account.available)}` : "—"}</div>
        </div>
        <div className="card">
          <div className="label">PnL no realizado</div>
          <div className={`value ${clsColor(account?.unrealizedPnl)}`}>
            {account ? `${(account.unrealizedPnl ?? 0) >= 0 ? "+" : ""}$${fmt(account.unrealizedPnl)}` : "—"}
          </div>
        </div>
        <div className="card">
          <div className="label">Capital / Leverage</div>
          <div className="value-sm">${fmt(config.capital, 0)} <span className="neutral">×{config.leverage}</span></div>
          <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 4 }}>MIN SCORE: {config.minScore}/9</div>
        </div>
      </div>

      {/* ── AI SIGNALS TABLE ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af" }}>AI SIGNALS — ESTADO POR SÍMBOLO</h2>
          <span style={{ color: "#6b7280", fontSize: 10 }}>actualiza cada 30s</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Símbolo</th>
              <th>Precio</th>
              <th>5M</th><th>15M</th><th>1H</th><th>4H</th>
              <th>Setup</th>
              <th>Score L</th><th>Score S</th>
              <th>ADX</th>
              <th>RSI</th>
              <th>Estado</th>
              <th>Razón</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map(sym => {
              const sig = latestSignals[sym] as SignalLog | undefined;
              const hasPos = positions.some(p => p.symbol === sym);
              const mtf = sig ? parseMtfSetup(sig.mtf_setup) : null;
              const act = sig ? parseAction(sig.action_taken) : null;
              const livePrice = prices?.[sym];

              const statusType = !act ? "gray"
                : act.status.includes("OPENED") && act.status.includes("LONG") ? "green"
                : act.status.includes("OPENED") && act.status.includes("SHORT") ? "red"
                : act.status === "POSITION_ACTIVE" ? "blue"
                : "gray";

              return (
                <tr key={sym}>
                  <td>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{sym}</span>
                    {hasPos && <span style={{ marginLeft: 6 }}><Badge label="OPEN" type="blue" /></span>}
                  </td>
                  <td style={{ fontWeight: 700, color: "#f3f4f6", fontFamily: "monospace" }}>
                    {livePrice != null ? `$${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td><DirBadge dir={mtf?.tf5m} /></td>
                  <td><DirBadge dir={mtf?.tf15m} /></td>
                  <td><DirBadge dir={mtf?.tf1h} /></td>
                  <td><DirBadge dir={mtf?.tf4h} /></td>
                  <td style={{ fontSize: 11, color: "#9ca3af" }}>{mtf?.setup ?? "—"}</td>
                  <td className="positive" style={{ fontWeight: 700 }}>{sig?.score_long ?? "—"}</td>
                  <td className="negative" style={{ fontWeight: 700 }}>{sig?.score_short ?? "—"}</td>
                  <td>
                    {sig ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 11 }}>{fmt(sig.adx_value, 1)}</span>
                        <AdxBadge str={sig.adx_strength} />
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ fontSize: 11 }}>{sig ? fmt(sig.rsi_zone, 0) : "—"}</td>
                  <td>
                    {act ? <Badge label={act.status} type={statusType} /> : <Badge label="—" type="gray" />}
                  </td>
                  <td>
                    {act?.reason ? <ReasonBadge reason={act.reason} /> : null}
                    {!sig && <span className="neutral" style={{ fontSize: 10 }}>Sin datos</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── OPEN POSITIONS ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#9ca3af" }}>POSICIONES ABIERTAS</h2>
        {positions.length === 0 ? (
          <p className="neutral" style={{ fontSize: 12 }}>Sin posiciones abiertas</p>
        ) : (
          <table>
            <thead>
              <tr><th>Símbolo</th><th>Lado</th><th>Tamaño</th><th>Entrada</th><th>PnL no realizado</th></tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{pos.symbol}</td>
                  <td><Badge label={pos.side} type={pos.side === "LONG" ? "green" : "red"} /></td>
                  <td>{fmt(pos.size, 4)}</td>
                  <td>{fmt(pos.entryPrice, 2)}</td>
                  <td className={clsColor(pos.unrealizedPnl)}>
                    {pos.unrealizedPnl >= 0 ? "+" : ""}{fmt(pos.unrealizedPnl)} USDT
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── RECENT TRADES ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#9ca3af" }}>TRADES RECIENTES</h2>
        {recentTrades.length === 0 ? (
          <p className="neutral" style={{ fontSize: 12 }}>Sin trades aún</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Símbolo</th><th>Lado</th><th>Entrada</th><th>SL</th><th>TP</th>
                <th>Contratos</th><th>Score</th><th>Setup</th><th>PnL</th><th>Estado</th><th>Hora</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 700 }}>{t.symbol}</td>
                  <td><Badge label={t.side} type={t.side === "LONG" ? "green" : "red"} /></td>
                  <td>{fmt(t.entry_price)}</td>
                  <td className="negative">{fmt(t.sl)}</td>
                  <td className="positive">{fmt(t.tp)}</td>
                  <td>{fmt(t.size, 4)}</td>
                  <td style={{ fontWeight: 700, color: "#f59e0b" }}>{t.score}/9</td>
                  <td style={{ fontSize: 10, color: "#9ca3af" }}>{t.setup_type}</td>
                  <td className={t.pnl != null ? clsColor(t.pnl) : "neutral"}>
                    {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}${fmt(t.pnl)} USDT` : "—"}
                  </td>
                  <td>
                    <Badge
                      label={t.status}
                      type={t.status === "OPEN" ? "blue" : t.status === "CLOSED" ? "green" : "gray"}
                    />
                  </td>
                  <td style={{ color: "#6b7280", fontSize: 10 }}>{new Date(t.opened_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CONFIG + LOG (side by side on wide screens) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, marginBottom: 16 }}>
        {/* Config */}
        <div className="card">
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "#9ca3af" }}>CONFIGURACIÓN</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div className="label">Capital (USD)</div>
              <input type="number" value={editCapital} onChange={e => setEditCapital(e.target.value)} min="1" step="100" />
            </div>
            <div>
              <div className="label">Min Score (2–9)</div>
              <input type="number" value={editMinScore} onChange={e => setEditMinScore(e.target.value)} min="2" max="9" step="1" />
            </div>
            <button
              disabled={saving}
              onClick={() => {
                saveConfig("capital", editCapital);
                saveConfig("min_score", editMinScore);
              }}
            >
              {saving ? "Guardando..." : "Guardar Config"}
            </button>
            {saveMsg && (
              <p style={{ fontSize: 11, color: saveMsg.includes("Error") ? "#ef4444" : "#10b981" }}>{saveMsg}</p>
            )}
          </div>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #374151", color: "#6b7280", fontSize: 10 }}>
            <p>Símbolos: {config.symbols.join(", ")}</p>
            <p style={{ marginTop: 4 }}>
              Testnet: {process.env.IS_TESTNET === "true" ? "SI" : "NO"} &nbsp;|&nbsp;
              <a href="/api/test" target="_blank" style={{ color: "#3b82f6" }}>Ver diagnóstico</a>
            </p>
          </div>
        </div>

        {/* Signal Log */}
        <div className="card">
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#9ca3af" }}>LOG DE SEÑALES (últimas 10)</h2>
          {signalLogs.length === 0 ? (
            <p className="neutral" style={{ fontSize: 12 }}>Sin señales aún — el bot aún no ha corrido</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Hora</th><th>Símbolo</th>
                  <th>5M</th><th>15M</th><th>1H</th><th>4H</th>
                  <th>L</th><th>S</th>
                  <th>ADX</th><th>Acción</th><th>Razón</th>
                </tr>
              </thead>
              <tbody>
                {signalLogs.map((l, i) => {
                  const mtf = parseMtfSetup(l.mtf_setup);
                  const act = parseAction(l.action_taken);
                  const t = act.status.includes("LONG") ? "green" : act.status.includes("SHORT") ? "red" : "gray";
                  return (
                    <tr key={l.id ?? i}>
                      <td style={{ color: "#6b7280", fontSize: 10 }}>{new Date(l.timestamp).toLocaleTimeString()}</td>
                      <td style={{ fontWeight: 700 }}>{l.symbol}</td>
                      <td><DirBadge dir={mtf.tf5m} /></td>
                      <td><DirBadge dir={mtf.tf15m} /></td>
                      <td><DirBadge dir={mtf.tf1h} /></td>
                      <td><DirBadge dir={mtf.tf4h} /></td>
                      <td className="positive" style={{ fontWeight: 700 }}>{l.score_long}</td>
                      <td className="negative" style={{ fontWeight: 700 }}>{l.score_short}</td>
                      <td style={{ fontSize: 10 }}>{fmt(l.adx_value, 1)} <AdxBadge str={l.adx_strength} /></td>
                      <td><Badge label={act.status} type={t} /></td>
                      <td>{act.reason ? <ReasonBadge reason={act.reason} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", color: "#374151", fontSize: 10, marginTop: 8 }}>
        NEXUS IA v2 — auto-refresh 30s — {data.timestamp}
      </div>
    </div>
  );
}
