import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "nexus_session";

async function getExpectedToken(): Promise<string> {
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rutas siempre accesibles: login, auth API, cron y webhooks externos
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/webhook")
  ) {
    return NextResponse.next();
  }

  // Proteger dashboard y todas las demás APIs
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api")) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const expected = await getExpectedToken();
    if (token !== expected) {
      const res = NextResponse.redirect(new URL("/login", req.url));
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/login"],
};
