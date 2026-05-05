"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────
interface SessionInfo { active: boolean; session: string; utcHour: number; }
interface AccountInfo { available: number; equity: number; unrealizedPnl: number; }
interface Position { symbol: string; side: string; size: number; entryPrice: number; unrealizedPnl: number; leverage: number; }
interface Trade { id: string; symbol: string; side: string; entry_price: number; sl: number; tp: number; size: number; score: number; setup_type: string; session: string; opened_at: string; closed_at?: string; pnl?: number; status: string; }
interface SignalLog { id: string; symbol: string; timestamp: string; score_long: number; score_short: number; mtf_setup: string; rsi_zone: number; rsi_pivot: string; adx_value: number; adx_strength: string; momentum_dir: string; action_taken: string; }
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

// ── Helpers ──────────────────────────────────────────────────────
function parseMtf(s: string) {
  const p = s.split("|");
  return { setup: p[0] ?? "—", tf5m: p[1], tf15m: p[2], tf1h: p[3], tf4h: p[4] };
}
function parseAction(s: string) {
  const i = s.indexOf(":");
  if (i === -1) return { status: s, reason: "" };
  return { status: s.slice(0, i), reason: s.slice(i + 1) };
}
function fmt(n: number | undefined | null, d = 2) {
  if (n == null || isNaN(n as number)) return "—";
  return (n as number).toFixed(d);
}
function fmtPrice(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
}

// ── Primitive Components ─────────────────────────────────────────

function NexusMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="nxg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00e5ff"/>
          <stop offset="1" stopColor="#b14bff"/>
        </linearGradient>
      </defs>
      <path d="M4 28 L4 4 L10 4 L22 22 L22 4 L28 4 L28 28 L22 28 L10 10 L10 28 Z"
        fill="url(#nxg)" filter="drop-shadow(0 0 8px rgba(0,229,255,0.5))"/>
    </svg>
  );
}

function Spark({ data, color = "var(--neon-cyan)", width = 80, height = 24 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * height] as [number, number]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gid = `sg${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width, height, display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.4"/>
          <stop offset="1" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ScoreRing({ value, max = 9, color, size = 48, label }: { value: number; max?: number; color?: string; size?: number; label?: string }) {
  const pct = (value / max) * 100;
  const c = color || (value >= 7 ? "var(--bull)" : value >= 4 ? "var(--neon-amber)" : "var(--t-400)");
  return (
    <div className="score-ring" style={{ "--ring-pct": pct, "--ring-color": c, width: size, height: size } as React.CSSProperties}>
      <div className="col" style={{ alignItems: "center", gap: 0 }}>
        <span className="t-mono" style={{ fontSize: size * 0.3, fontWeight: 700, color: c, lineHeight: 1 }}>{value}</span>
        {label && <span className="t-eyebrow" style={{ fontSize: 8, marginTop: 1, letterSpacing: "0.1em" }}>{label}</span>}
      </div>
    </div>
  );
}

function MtfCell({ dir }: { dir?: string }) {
  if (!dir) return <span className="mtf-cell mtf-flat">—</span>;
  const cls = dir === "BULL" ? "mtf-bull" : dir === "BEAR" ? "mtf-bear" : "mtf-flat";
  const arrow = dir === "BULL" ? "▲" : dir === "BEAR" ? "▼" : "—";
  return <span className={`mtf-cell ${cls}`}>{arrow}</span>;
}

function Pill({ kind = "muted", children }: { kind?: string; children: React.ReactNode }) {
  return <span className={`nx-pill nx-pill-${kind}`}>{children}</span>;
}

function AdxLabel({ str }: { str: string }) {
  const color = str === "VERY_STRONG" || str === "STRONG" ? "var(--bull)" : str === "MODERATE" ? "var(--neon-amber)" : "var(--bear)";
  const short = str === "VERY_STRONG" ? "V.STR" : str === "STRONG" ? "STR" : str === "MODERATE" ? "MOD" : "WEAK";
  return <span className="t-mono" style={{ fontSize: 9, color, fontWeight: 700 }}>{short}</span>;
}

function SetupColor({ setup }: { setup: string }) {
  const color = setup === "PERFECT" ? "var(--bull)" : setup === "TRAP" ? "var(--bear)" : setup === "BLOCKED" || setup === "WAIT" ? "var(--t-400)" : "var(--neon-amber)";
  return <span className="t-mono" style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: "0.06em" }}>{setup}</span>;
}

// ── Sidebar ──────────────────────────────────────────────────────
function Sidebar({ session, config, onToggleBot, toggling }: {
  session: SessionInfo;
  config: { botEnabled: boolean; capital: number };
  onToggleBot: () => void;
  toggling: boolean;
}) {
  const items = [
    { id: "dash", label: "Overview", icon: "◇", active: true },
    { id: "pos", label: "Posiciones", icon: "◈" },
    { id: "sig", label: "Señales", icon: "◆" },
    { id: "risk", label: "Risk Mgmt", icon: "◉" },
    { id: "log", label: "Logs", icon: "≡" },
    { id: "set", label: "Config", icon: "⚙" },
  ];
  return (
    <div className="col" style={{ width: 216, flexShrink: 0, padding: "18px 14px", borderRight: "1px solid var(--hairline)", gap: 3, height: "100vh", position: "sticky", top: 0, overflowY: "auto" }}>
      {/* Logo */}
      <div className="row" style={{ alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
        <NexusMark size={26}/>
        <div className="col" style={{ gap: 0 }}>
          <span className="t-display" style={{ fontSize: 14, letterSpacing: "0.04em" }}>
            NEXUS <span style={{ color: "var(--neon-cyan)" }}>IA</span>
          </span>
          <span className="t-eyebrow" style={{ fontSize: 9 }}>v2 · cerebro v21</span>
        </div>
      </div>

      <span className="t-eyebrow" style={{ padding: "6px 8px 3px" }}>Bot</span>
      {items.slice(0, 5).map(it => (
        <div key={it.id} className={`nav-item${it.active ? " active" : ""}`}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 14, opacity: it.active ? 1 : 0.55 }}>{it.icon}</span>
            <span>{it.label}</span>
          </div>
        </div>
      ))}
      <span className="t-eyebrow" style={{ padding: "16px 8px 3px" }}>Sistema</span>
      {items.slice(5).map(it => (
        <div key={it.id} className="nav-item row" style={{ gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 14, opacity: 0.5 }}>{it.icon}</span>
          <span>{it.label}</span>
        </div>
      ))}

      <div style={{ flex: 1 }}/>

      {/* Bot status footer */}
      <div className="glass col" style={{ padding: 12, borderRadius: 12, gap: 10 }}>
        <div className="row between">
          <span className="t-eyebrow">BOT STATUS</span>
          {config.botEnabled ? <span className="dot-live"/> : <span className="dot-idle"/>}
        </div>
        <button
          onClick={onToggleBot}
          disabled={toggling}
          className={`nx-btn ${config.botEnabled ? "nx-btn-bull" : "nx-btn-bear"}`}
          style={{ justifyContent: "center", fontSize: 12, fontWeight: 900, letterSpacing: "0.1em" }}
        >
          {toggling ? "..." : config.botEnabled ? "▶ BOT ON" : "⏹ BOT OFF"}
        </button>
        <div className="hairline"/>
        <div className="row between">
          <span className="t-eyebrow">Sesión</span>
          <span className="t-mono" style={{ fontSize: 11, color: session.active ? "var(--neon-cyan)" : "var(--t-400)" }}>
            {session.active ? session.session.replace(/_/g, " ") : "CERRADA"}
          </span>
        </div>
        <a href="/api/test" target="_blank" style={{ fontSize: 10, textAlign: "center", color: "var(--t-400)", fontFamily: "var(--font-mono)" }}>
          diagnóstico →
        </a>
      </div>
    </div>
  );
}

// ── TopBar ───────────────────────────────────────────────────────
function TopBar({ session, lastRefresh, onRefresh }: {
  session: SessionInfo;
  lastRefresh: string;
  onRefresh: () => void;
}) {
  return (
    <div className="row between" style={{ padding: "16px 26px", borderBottom: "1px solid var(--hairline)", flexShrink: 0 }}>
      <div className="col" style={{ gap: 3 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <h1 className="t-display" style={{ fontSize: 20 }}>Overview</h1>
          {session.active && (
            <span className="nx-pill nx-pill-bull">
              <span className="dot-live" style={{ width: 5, height: 5 }}/>
              LIVE · BITUNIX
            </span>
          )}
        </div>
        <span className="t-eyebrow">UTC {session.utcHour}:xx · auto-refresh 30s{lastRefresh && ` · actualizado ${lastRefresh}`}</span>
      </div>
      <button className="nx-btn" onClick={onRefresh} style={{ padding: "6px 12px" }}>↻ Refresh</button>
    </div>
  );
}

// ── KPI Ribbon ───────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, spark, sparkColor, big }: {
  label: string; value: string; sub?: string; accent?: string;
  spark?: number[]; sparkColor?: string; big?: boolean;
}) {
  return (
    <div className="glass col" style={{ padding: 18, gap: 8, position: "relative", overflow: "hidden" }}>
      <span className="t-eyebrow">{label}</span>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <span className="ticker t-display" style={{ fontSize: big ? 28 : 22, color: accent || "var(--t-100)", letterSpacing: "-0.02em" }}>{value}</span>
        {spark && spark.length >= 2 && <Spark data={spark} color={sparkColor || "var(--neon-cyan)"} width={72} height={22}/>}
      </div>
      {sub && <span className="t-mono" style={{ fontSize: 10, color: "var(--t-300)" }}>{sub}</span>}
    </div>
  );
}

function AccountRibbon({ account, recentTrades }: { account: AccountInfo | null; recentTrades: Trade[] }) {
  const closedTrades = recentTrades.filter(t => t.status === "CLOSED" && t.pnl != null);
  const wins = closedTrades.filter(t => (t.pnl ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(0) : null;
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr", gap: 14 }}>
      <KpiCard
        label="EQUITY"
        value={account ? `$${fmtPrice(account.equity)}` : "—"}
        sub={account ? `disponible $${fmt(account.available, 0)}` : "API Error"}
        accent={account && account.equity > 0 ? "var(--bull)" : undefined}
        big
      />
      <KpiCard
        label="DISPONIBLE"
        value={account ? `$${fmt(account.available, 0)}` : "—"}
        sub="margen libre"
      />
      <KpiCard
        label="PNL NO REALIZADO"
        value={account ? `${(account.unrealizedPnl ?? 0) >= 0 ? "+" : ""}$${fmt(account.unrealizedPnl)}` : "—"}
        accent={account ? ((account.unrealizedPnl ?? 0) >= 0 ? "var(--bull)" : "var(--bear)") : undefined}
        sub="posiciones abiertas"
      />
      <KpiCard
        label="WIN RATE (RECIENTES)"
        value={winRate ? `${winRate}%` : "—"}
        sub={closedTrades.length > 0 ? `${wins}W · ${closedTrades.length - wins}L · PnL ${totalPnl >= 0 ? "+" : ""}$${fmt(totalPnl)}` : "Sin trades cerrados"}
        accent="var(--neon-cyan)"
      />
      <KpiCard
        label="CAPITAL CONFIGURADO"
        value="—"
        sub="Sharpe 30D · coming soon"
        accent="var(--neon-violet)"
      />
    </div>
  );
}

// ── Open Positions ────────────────────────────────────────────────
function PositionsPanel({ positions }: { positions: Position[] }) {
  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  return (
    <div className="glass col" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between" style={{ padding: "18px 22px 12px" }}>
        <div className="col" style={{ gap: 3 }}>
          <span className="t-eyebrow">POSICIONES ABIERTAS</span>
          <h3 className="t-display" style={{ fontSize: 16 }}>
            {positions.length} activa{positions.length !== 1 ? "s" : ""} · PnL{" "}
            <span style={{ color: totalPnl >= 0 ? "var(--bull)" : "var(--bear)" }}>
              {totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}
            </span>
          </h3>
        </div>
      </div>

      {positions.length === 0 ? (
        <div style={{ padding: "20px 22px", color: "var(--t-400)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Sin posiciones abiertas en este momento
        </div>
      ) : positions.map((p, i) => (
        <div key={i} className="row-hover" style={{
          display: "grid",
          gridTemplateColumns: "140px 160px 120px 1fr 60px 120px 100px",
          gap: 16, padding: "16px 22px",
          borderTop: "1px solid var(--hairline)",
          alignItems: "center",
        }}>
          {/* Symbol + side */}
          <div className="col" style={{ gap: 5 }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="t-display" style={{ fontSize: 15 }}>{p.symbol.replace("USDT", "")}</span>
              <span style={{ fontSize: 10, color: "var(--t-400)" }}>USDT</span>
            </div>
            <Pill kind={p.side === "LONG" ? "bull" : "bear"}>
              {p.side === "LONG" ? "▲" : "▼"} {p.side}
            </Pill>
          </div>

          {/* Size / entry */}
          <div className="col" style={{ gap: 3 }}>
            <span className="t-eyebrow">SIZE / ENTRY</span>
            <span className="t-mono" style={{ fontSize: 12 }}>{fmt(p.size, 4)}</span>
            <span className="t-mono" style={{ fontSize: 12, color: "var(--t-300)" }}>${fmtPrice(p.entryPrice)}</span>
          </div>

          {/* Leverage */}
          <div className="col" style={{ gap: 3 }}>
            <span className="t-eyebrow">LEVERAGE</span>
            <span className="t-mono" style={{ fontSize: 14, color: "var(--neon-cyan)" }}>×{p.leverage}</span>
          </div>

          {/* Risk band */}
          <div className="col" style={{ gap: 5 }}>
            <span className="t-eyebrow">DIRECCIÓN</span>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(120,140,220,0.1)", overflow: "hidden", position: "relative" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: p.side === "LONG" ? "60%" : "40%",
                background: p.side === "LONG" ? "linear-gradient(90deg, var(--bull-bg), var(--bull))" : "linear-gradient(90deg, var(--bear), var(--bear-bg))",
              }}/>
            </div>
          </div>

          {/* Score placeholder */}
          <ScoreRing value={0} size={40} color="var(--t-400)"/>

          {/* PnL */}
          <div className="col" style={{ gap: 2, alignItems: "flex-end" }}>
            <span className="t-eyebrow">PNL</span>
            <span className="t-mono t-display" style={{ fontSize: 17, color: p.unrealizedPnl >= 0 ? "var(--bull)" : "var(--bear)" }}>
              {p.unrealizedPnl >= 0 ? "+" : ""}${fmt(p.unrealizedPnl)}
            </span>
          </div>

          {/* Actions */}
          <div className="col" style={{ gap: 6 }}>
            <button className="nx-btn nx-btn-bear" style={{ padding: "5px 8px", fontSize: 9, justifyContent: "center" }}>CERRAR</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Symbols Watchlist ─────────────────────────────────────────────
function SymbolsTable({ symbols, latestSignals, prices, positions }: {
  symbols: string[];
  latestSignals: Record<string, SignalLog>;
  prices: Record<string, number>;
  positions: Position[];
}) {
  const cols = "130px 130px 100px 160px 70px 70px 100px 100px 120px 70px";
  return (
    <div className="glass col" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between" style={{ padding: "18px 22px 14px" }}>
        <div className="col" style={{ gap: 3 }}>
          <span className="t-eyebrow">AI SIGNALS · ESTADO POR SÍMBOLO</span>
          <h3 className="t-display" style={{ fontSize: 16 }}>Watchlist · {symbols.length} pares</h3>
        </div>
      </div>

      {/* Header */}
      <div style={{
        display: "grid", gridTemplateColumns: cols, gap: 10,
        padding: "8px 22px",
        borderTop: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline)",
        background: "rgba(255,255,255,0.01)",
      }}>
        {["Símbolo", "Precio", "Setup", "5M · 15M · 1H · 4H", "Score L", "Score S", "ADX", "RSI", "Estado", ""].map((h, i) => (
          <span key={i} className="t-eyebrow">{h}</span>
        ))}
      </div>

      {symbols.map(sym => {
        const sig = latestSignals[sym] as SignalLog | undefined;
        const hasPos = positions.some(p => p.symbol === sym);
        const mtf = sig ? parseMtf(sig.mtf_setup) : null;
        const act = sig ? parseAction(sig.action_taken) : null;
        const price = prices?.[sym];
        const actColor = !act ? "var(--t-400)"
          : act.status.includes("LONG") ? "var(--bull)"
          : act.status.includes("SHORT") ? "var(--bear)"
          : act.status === "BLOCKED" ? "var(--bear)"
          : "var(--t-300)";

        return (
          <div key={sym} className="row-hover" style={{
            display: "grid", gridTemplateColumns: cols, gap: 10,
            padding: "13px 22px",
            borderTop: "1px solid var(--hairline)",
            alignItems: "center",
          }}>
            {/* Symbol */}
            <div className="col" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <span className="t-display" style={{ fontSize: 14 }}>{sym.replace("USDT", "")}</span>
                <span style={{ fontSize: 9, color: "var(--t-400)" }}>USDT</span>
              </div>
              {hasPos && <Pill kind="info">OPEN</Pill>}
            </div>

            {/* Price */}
            <span className="t-mono" style={{ fontSize: 12, color: "var(--t-100)", fontWeight: 600 }}>
              {price != null ? `$${fmtPrice(price)}` : "—"}
            </span>

            {/* Setup */}
            {mtf ? <SetupColor setup={mtf.setup}/> : <span className="t-mono" style={{ color: "var(--t-400)" }}>—</span>}

            {/* MTF cells */}
            <div className="row" style={{ gap: 4 }}>
              <MtfCell dir={mtf?.tf5m}/>
              <MtfCell dir={mtf?.tf15m}/>
              <MtfCell dir={mtf?.tf1h}/>
              <MtfCell dir={mtf?.tf4h}/>
            </div>

            {/* Score Long */}
            <ScoreRing value={sig?.score_long ?? 0} size={36}
              color={sig && sig.score_long >= 6 ? "var(--bull)" : "var(--t-400)"}/>

            {/* Score Short */}
            <ScoreRing value={sig?.score_short ?? 0} size={36}
              color={sig && sig.score_short >= 6 ? "var(--bear)" : "var(--t-400)"}/>

            {/* ADX */}
            <div className="col" style={{ gap: 2 }}>
              <span className="t-mono" style={{ fontSize: 11 }}>{sig ? fmt(sig.adx_value, 1) : "—"}</span>
              {sig && <AdxLabel str={sig.adx_strength}/>}
            </div>

            {/* RSI */}
            <div className="col" style={{ gap: 3 }}>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <span className="t-mono" style={{ fontSize: 11 }}>{sig ? fmt(sig.rsi_zone, 0) : "—"}</span>
                {sig && (
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(120,140,220,0.15)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, sig.rsi_zone)}%`,
                      background: sig.rsi_zone > 70 ? "var(--bear)" : sig.rsi_zone < 30 ? "var(--bull)" : "var(--neon-cyan)",
                    }}/>
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            <div className="col" style={{ gap: 2 }}>
              <span className="t-mono" style={{ fontSize: 11, color: actColor, fontWeight: 700 }}>{act?.status ?? "—"}</span>
              {act?.reason && <span className="t-mono" style={{ fontSize: 9, color: "var(--t-400)" }}>{act.reason}</span>}
            </div>

            {/* Detail link */}
            <button className="nx-btn" style={{ padding: "4px 8px", fontSize: 9, justifyContent: "center" }}>VER →</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Risk / Config Panel ───────────────────────────────────────────
function RiskConfigPanel({ config, onSave, saving, saveMsg }: {
  config: { minScore: number; capital: number; symbols: string[]; leverage: number; botEnabled: boolean };
  onSave: (key: string, value: string) => void;
  saving: boolean;
  saveMsg: string;
}) {
  const [editCapital, setEditCapital] = useState(String(config.capital));
  const [editScore, setEditScore] = useState(String(config.minScore));
  useEffect(() => { setEditCapital(String(config.capital)); }, [config.capital]);
  useEffect(() => { setEditScore(String(config.minScore)); }, [config.minScore]);

  return (
    <div className="glass col" style={{ padding: 22, gap: 18 }}>
      <div className="row between">
        <span className="t-eyebrow">RISK · STRATEGY CONFIG</span>
        <Pill kind="info">EN VIVO · sin redeploy</Pill>
      </div>

      {/* Min score slider visual */}
      <div className="col" style={{ gap: 8 }}>
        <div className="row between">
          <label className="nx-label" style={{ marginBottom: 0 }}>Min Score (gatillo)</label>
          <span className="t-mono" style={{ fontSize: 14, color: "var(--neon-cyan)", fontWeight: 700 }}>{editScore} / 9</span>
        </div>
        <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(120,140,220,0.1)" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${((parseFloat(editScore) - 2) / 7) * 100}%`,
            background: "linear-gradient(90deg, var(--neon-cyan), var(--neon-violet))",
            borderRadius: 3, boxShadow: "var(--glow-cyan)",
          }}/>
        </div>
        <input className="nx-input" type="number" value={editScore} min="2" max="9" step="1"
          onChange={e => setEditScore(e.target.value)}/>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <label className="nx-label">Capital (USD)</label>
        <input className="nx-input" type="number" value={editCapital} min="1" step="100"
          onChange={e => setEditCapital(e.target.value)}/>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="t-eyebrow">Leverage</span>
        <span className="t-mono" style={{ fontSize: 16, color: "var(--neon-amber)" }}>×{config.leverage}</span>
      </div>

      <div className="col" style={{ gap: 6 }}>
        <span className="t-eyebrow">Pares activos</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {config.symbols.map(s => (
            <span key={s} className="nx-pill nx-pill-info" style={{ fontSize: 10, padding: "3px 8px" }}>
              {s.replace("USDT", "")}
            </span>
          ))}
        </div>
      </div>

      <div className="hairline"/>

      <div className="col" style={{ gap: 8 }}>
        <span className="t-eyebrow">Sesiones permitidas</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {[
            { name: "TOKYO", on: false },
            { name: "LONDON", on: true },
            { name: "NEW YORK", on: true },
            { name: "OVERLAP", on: true },
          ].map(s => (
            <div key={s.name} className="row" style={{
              gap: 5, padding: "5px 10px", borderRadius: 6, alignItems: "center",
              border: `1px solid ${s.on ? "rgba(0,229,255,0.3)" : "var(--hairline)"}`,
              background: s.on ? "rgba(0,229,255,0.05)" : "transparent",
            }}>
              {s.on ? <span className="dot-live" style={{ width: 5, height: 5 }}/> : <span className="dot-idle" style={{ width: 5, height: 5 }}/>}
              <span style={{ fontSize: 10, color: s.on ? "var(--neon-cyan)" : "var(--t-400)", fontFamily: "var(--font-mono)" }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="nx-btn nx-btn-primary"
        disabled={saving}
        onClick={() => { onSave("capital", editCapital); onSave("min_score", editScore); }}
        style={{ justifyContent: "center", padding: "11px" }}
      >
        {saving ? "GUARDANDO..." : "GUARDAR CAMBIOS"}
      </button>
      {saveMsg && (
        <p style={{ fontSize: 11, color: saveMsg.includes("Error") ? "var(--bear)" : "var(--bull)", fontFamily: "var(--font-mono)" }}>
          {saveMsg}
        </p>
      )}
    </div>
  );
}

// ── Signal Log ────────────────────────────────────────────────────
function SignalLogPanel({ signalLogs }: { signalLogs: SignalLog[] }) {
  const cols = "70px 80px 160px 50px 50px 80px 1fr";
  return (
    <div className="glass col" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between" style={{ padding: "18px 22px 12px" }}>
        <div className="col" style={{ gap: 3 }}>
          <span className="t-eyebrow">SIGNAL LOG · CRON</span>
          <h3 className="t-display" style={{ fontSize: 15 }}>Últimas {signalLogs.length} evaluaciones</h3>
        </div>
        <span className="t-mono" style={{ fontSize: 10, color: "var(--t-300)" }}>cada 60s · vercel cron</span>
      </div>

      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: cols, padding: "7px 22px", gap: 10, borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)", background: "rgba(255,255,255,0.01)" }}>
        {["TIME", "SYM", "5M·15M·1H·4H", "L", "S", "ADX", "ACCIÓN"].map((h, i) => (
          <span key={i} className="t-eyebrow" style={{ fontSize: 9 }}>{h}</span>
        ))}
      </div>

      {signalLogs.length === 0 ? (
        <div style={{ padding: "16px 22px", color: "var(--t-400)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Sin señales aún — el bot no ha corrido
        </div>
      ) : signalLogs.map((l, i) => {
        const mtf = parseMtf(l.mtf_setup);
        const act = parseAction(l.action_taken);
        const actColor = act.status.includes("LONG") ? "var(--bull)" : act.status.includes("SHORT") ? "var(--bear)" : act.status === "BLOCKED" ? "var(--bear)" : "var(--t-300)";
        return (
          <div key={l.id ?? i} className="row-hover" style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "9px 22px", borderTop: "1px solid var(--hairline)", alignItems: "center" }}>
            <span className="t-mono" style={{ fontSize: 10, color: "var(--t-300)" }}>{new Date(l.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="t-display" style={{ fontSize: 12 }}>{l.symbol.replace("USDT", "")}</span>
            <div className="row" style={{ gap: 3 }}>
              <MtfCell dir={mtf.tf5m}/>
              <MtfCell dir={mtf.tf15m}/>
              <MtfCell dir={mtf.tf1h}/>
              <MtfCell dir={mtf.tf4h}/>
            </div>
            <span className="t-mono" style={{ fontSize: 11, color: l.score_long >= 6 ? "var(--bull)" : "var(--t-300)", fontWeight: 700 }}>{l.score_long}/9</span>
            <span className="t-mono" style={{ fontSize: 11, color: l.score_short >= 6 ? "var(--bear)" : "var(--t-300)", fontWeight: 700 }}>{l.score_short}/9</span>
            <div className="col" style={{ gap: 1 }}>
              <span className="t-mono" style={{ fontSize: 10 }}>{fmt(l.adx_value, 1)}</span>
              <AdxLabel str={l.adx_strength}/>
            </div>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="t-mono" style={{ fontSize: 11, color: actColor, fontWeight: 700 }}>{act.status}</span>
              {act.reason && <span className="t-mono" style={{ fontSize: 9, color: "var(--t-400)" }}>· {act.reason}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Recent Trades ─────────────────────────────────────────────────
function RecentTradesPanel({ trades }: { trades: Trade[] }) {
  return (
    <div className="glass col" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between" style={{ padding: "18px 22px 12px" }}>
        <div className="col" style={{ gap: 3 }}>
          <span className="t-eyebrow">TRADES RECIENTES</span>
          <h3 className="t-display" style={{ fontSize: 15 }}>Últimos {trades.length} cierres</h3>
        </div>
      </div>

      {trades.length === 0 ? (
        <div style={{ padding: "16px 22px", color: "var(--t-400)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Sin trades aún — el bot aún no ha operado
        </div>
      ) : trades.map(t => (
        <div key={t.id} className="row-hover" style={{ display: "flex", gap: 14, padding: "13px 22px", borderTop: "1px solid var(--hairline)", alignItems: "center" }}>
          <span className="t-mono" style={{ fontSize: 10, color: "var(--t-400)", width: 45, flexShrink: 0 }}>
            {new Date(t.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="t-display" style={{ fontSize: 13, width: 50, flexShrink: 0 }}>{t.symbol.replace("USDT", "")}</span>
          <Pill kind={t.side === "LONG" ? "bull" : "bear"}>{t.side === "LONG" ? "▲" : "▼"} {t.side}</Pill>
          <div className="col grow" style={{ gap: 2 }}>
            <span className="t-mono" style={{ fontSize: 11, color: "var(--t-300)" }}>
              ${fmtPrice(t.entry_price)} → SL ${fmtPrice(t.sl)} · TP ${fmtPrice(t.tp)}
            </span>
            <span className="t-mono" style={{ fontSize: 10, color: "var(--t-400)" }}>{t.setup_type}</span>
          </div>
          <ScoreRing value={t.score} size={32}/>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="t-mono t-display" style={{ fontSize: 15, color: t.pnl != null ? (t.pnl >= 0 ? "var(--bull)" : "var(--bear)") : "var(--t-300)", width: 80, textAlign: "right" }}>
              {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}$${fmt(t.pnl)}` : "—"}
            </span>
            <span className={`nx-pill nx-pill-${t.status === "OPEN" ? "info" : t.status === "CLOSED" ? "bull" : "muted"}`} style={{ fontSize: 9 }}>
              {t.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cerebro Panel (best symbol) ───────────────────────────────────
function CerebroPanel({ symbols, latestSignals }: { symbols: string[]; latestSignals: Record<string, SignalLog> }) {
  // Pick symbol with best effective score
  let bestSym = symbols[0] ?? "—";
  let bestScore = 0;
  let bestSide: "LONG" | "SHORT" = "LONG";
  for (const sym of symbols) {
    const sig = latestSignals[sym];
    if (!sig) continue;
    if (sig.score_long > bestScore) { bestScore = sig.score_long; bestSym = sym; bestSide = "LONG"; }
    if (sig.score_short > bestScore) { bestScore = sig.score_short; bestSym = sym; bestSide = "SHORT"; }
  }
  const sig = latestSignals[bestSym];

  const scoreL = sig?.score_long ?? 0;
  const scoreS = sig?.score_short ?? 0;
  const points = [
    { id: "P1", label: "MTF aligned" },
    { id: "P2", label: "Sqz compress" },
    { id: "P3", label: "Squeeze off" },
    { id: "P4", label: "ADX > 25" },
    { id: "P5", label: "15M momentum" },
    { id: "P6", label: "VWAP side" },
    { id: "P7", label: "Delta Z-score" },
    { id: "P8", label: "CVD trend" },
    { id: "P9", label: "SFP / wick" },
  ].map((p, idx) => ({
    ...p,
    on: bestSide === "LONG" ? idx < scoreL : idx < scoreS,
  }));

  const mtf = sig ? parseMtf(sig.mtf_setup) : null;

  return (
    <div className="glass col" style={{ padding: 22, gap: 16 }}>
      <div className="row between">
        <div className="col" style={{ gap: 3 }}>
          <span className="t-eyebrow">CEREBRO IA · {bestSym} · {bestSide}</span>
          <h3 className="t-display" style={{ fontSize: 17 }}>
            Score <span style={{ color: bestSide === "LONG" ? "var(--bull)" : "var(--bear)" }}>{bestScore}/9</span>
          </h3>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <ScoreRing value={scoreL} max={9} color="var(--bull)" size={52} label="LONG"/>
          <ScoreRing value={scoreS} max={9} color="var(--bear)" size={52} label="SHORT"/>
        </div>
      </div>

      {/* 9-point grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 6 }}>
        {points.map(p => (
          <div key={p.id} className="col" style={{
            alignItems: "center",
            padding: "8px 4px",
            borderRadius: 8,
            gap: 4,
            background: p.on ? "rgba(0,255,157,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${p.on ? "rgba(0,255,157,0.25)" : "var(--hairline)"}`,
            boxShadow: p.on ? "0 0 12px rgba(0,255,157,0.1)" : "none",
            position: "relative",
          }}>
            <span className="t-mono" style={{ fontSize: 13, fontWeight: 700, color: p.on ? "var(--bull)" : "var(--t-400)" }}>{p.id}</span>
            <span style={{ fontSize: 8, color: "var(--t-300)", textAlign: "center", lineHeight: 1.2 }}>{p.label}</span>
            {p.on && <div style={{ position: "absolute", top: 5, right: 5, width: 4, height: 4, borderRadius: "50%", background: "var(--bull)", boxShadow: "0 0 6px var(--bull)" }}/>}
          </div>
        ))}
      </div>

      {/* MTF summary */}
      {mtf && (
        <div className="row between" style={{ paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
          <div className="row" style={{ gap: 14 }}>
            <div className="col" style={{ gap: 3 }}>
              <span className="t-eyebrow">ADX</span>
              <span className="t-mono" style={{ fontSize: 12 }}>{sig ? fmt(sig.adx_value, 1) : "—"} <AdxLabel str={sig?.adx_strength ?? "WEAK"}/></span>
            </div>
            <div className="col" style={{ gap: 3 }}>
              <span className="t-eyebrow">MTF setup</span>
              <SetupColor setup={mtf.setup}/>
            </div>
            <div className="col" style={{ gap: 3 }}>
              <span className="t-eyebrow">Anti-trap</span>
              <span className="t-mono" style={{ fontSize: 12, color: "var(--bull)" }}>CHECK</span>
            </div>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <MtfCell dir={mtf.tf5m}/>
            <MtfCell dir={mtf.tf15m}/>
            <MtfCell dir={mtf.tf1h}/>
            <MtfCell dir={mtf.tf4h}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [toggling, setToggling] = useState(false);

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

  const toggleBot = async () => {
    if (!data) return;
    setToggling(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "bot_enabled", value: data.config.botEnabled ? "false" : "true" }),
      });
      await fetchData();
    } finally {
      setToggling(false);
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
      setSaveMsg(`✓ ${key} guardado`);
      fetchData();
    } catch (e) {
      setSaveMsg(`Error: ${e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3500);
    }
  };

  if (loading) {
    return (
      <div className="nx-bg" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="col" style={{ alignItems: "center", gap: 16 }}>
          <NexusMark size={48}/>
          <span className="t-mono" style={{ color: "var(--t-300)", letterSpacing: "0.1em" }}>CARGANDO NEXUS IA v2...</span>
          <span className="dot-live"/>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="nx-bg" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="glass col" style={{ padding: 32, gap: 16, maxWidth: 400 }}>
          <span className="t-eyebrow" style={{ color: "var(--bear)" }}>Error de conexión</span>
          <p className="t-mono" style={{ fontSize: 12, color: "var(--t-200)" }}>{error}</p>
          <button className="nx-btn nx-btn-primary" onClick={fetchData} style={{ justifyContent: "center" }}>REINTENTAR</button>
        </div>
      </div>
    );
  }

  const { session, account, positions, prices, config, recentTrades, latestSignals, signalLogs } = data;
  const symbols = config.symbols;

  return (
    <div className="nx-bg" style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar session={session} config={config} onToggleBot={toggleBot} toggling={toggling}/>

      <div className="col grow" style={{ minWidth: 0 }}>
        <TopBar session={session} lastRefresh={lastRefresh} onRefresh={fetchData}/>

        <div className="col" style={{ padding: "22px 26px", gap: 18 }}>

          {/* KPI Ribbon */}
          <AccountRibbon account={account} recentTrades={recentTrades}/>

          {/* Cerebro + Positions */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
            <PositionsPanel positions={positions}/>
            <CerebroPanel symbols={symbols} latestSignals={latestSignals}/>
          </div>

          {/* Watchlist */}
          <SymbolsTable symbols={symbols} latestSignals={latestSignals} prices={prices} positions={positions}/>

          {/* Config + Trades + Log */}
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18 }}>
            <RiskConfigPanel config={config} onSave={saveConfig} saving={saving} saveMsg={saveMsg}/>
            <div className="col" style={{ gap: 18 }}>
              <RecentTradesPanel trades={recentTrades}/>
              <SignalLogPanel signalLogs={signalLogs}/>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", color: "var(--t-500)", fontSize: 10, padding: "12px 0 20px", fontFamily: "var(--font-mono)" }}>
          NEXUS IA v2 · Cerebro v21 · auto-refresh 30s · {data.timestamp}
        </div>
      </div>
    </div>
  );
}
