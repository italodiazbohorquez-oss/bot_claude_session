import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET ?? "nexus-default-secret";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode("nexus_authenticated_v1"));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const validEmail    = process.env.ADMIN_EMAIL;
    const validPassword = process.env.ADMIN_PASSWORD;

    if (!validEmail || !validPassword) {
      return NextResponse.json({ error: "Servidor no configurado" }, { status: 500 });
    }

    if (email !== validEmail || password !== validPassword) {
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }

    const token = await getSessionToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set("nexus_session", token, {
      httpOnly: true,
      secure:   true,
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 7, // 7 días
      path:     "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
