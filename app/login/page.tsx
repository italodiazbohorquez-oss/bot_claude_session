"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email,    setEmail]    = useState("italodiazbohorquez@gmail.com");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error ?? "Error al iniciar sesión");
      }
    } catch {
      setError("Error de conexión");
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "monospace",
    }}>
      <div style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 12,
        padding: "40px 36px",
        width: "100%",
        maxWidth: 380,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}>
        {/* Logo / título */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
            NEXUS IA
          </div>
          <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
            Trading Bot · Panel de Control
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Correo
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: "100%",
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 6,
                color: "#fff",
                padding: "10px 12px",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 6,
                color: "#fff",
                padding: "10px 12px",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "#2a0a0a",
              border: "1px solid #5a1a1a",
              color: "#ff6b6b",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 13,
              marginBottom: 16,
              textAlign: "center",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "#1a3a1a" : "#1a5c1a",
              border: "1px solid #2a8a2a",
              borderRadius: 6,
              color: loading ? "#555" : "#4ade80",
              padding: "11px",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
