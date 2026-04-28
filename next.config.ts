import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  env: {
    CAPITAL: process.env.CAPITAL ?? "1000",
    LEVERAGE: process.env.LEVERAGE ?? "5",
    RISK_PER_TRADE: process.env.RISK_PER_TRADE ?? "1.0",
    RR_RATIO: process.env.RR_RATIO ?? "2.5",
    ATR_MULT: process.env.ATR_MULT ?? "0.5",
    MIN_SCORE: process.env.MIN_SCORE ?? "4",
    SYMBOLS: process.env.SYMBOLS ?? "BTCUSDT,ETHUSDT",
  },
};

export default nextConfig;
