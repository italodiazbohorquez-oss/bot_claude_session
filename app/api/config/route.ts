import { NextRequest, NextResponse } from "next/server";
import { getBotConfig, setBotConfig } from "@/lib/supabase";

export const runtime = "nodejs";

const ALLOWED_KEYS = ["capital", "min_score", "risk_per_trade", "symbols"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key || !ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  const value = await getBotConfig(key);
  return NextResponse.json({ ok: true, key, value });
}

export async function POST(req: NextRequest) {
  try {
    const { key, value } = await req.json();
    if (!key || !ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }
    const strValue = String(value);

    // Validate numeric keys
    if (["capital", "min_score", "risk_per_trade"].includes(key)) {
      const num = parseFloat(strValue);
      if (isNaN(num) || num <= 0) {
        return NextResponse.json({ error: "Value must be a positive number" }, { status: 400 });
      }
      if (key === "min_score" && (num < 4 || num > 9)) {
        return NextResponse.json({ error: "min_score must be between 4 and 9" }, { status: 400 });
      }
    }

    await setBotConfig(key, strValue);
    return NextResponse.json({ ok: true, key, value: strValue });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
