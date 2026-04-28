export type SessionName = "TOKYO" | "LONDON" | "NEW_YORK" | "LONDON_NY_OVERLAP" | "NONE";

export interface SessionState {
  active: boolean;
  session: SessionName;
  utcHour: number;
}

export function getCurrentSession(): SessionState {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const fractional = utcHour + utcMin / 60;

  // London+NY overlap: 13:00–16:00 UTC
  if (fractional >= 13 && fractional < 16) {
    return { active: true, session: "LONDON_NY_OVERLAP", utcHour };
  }
  // Tokyo: 00:00–08:00 UTC
  if (fractional >= 0 && fractional < 8) {
    return { active: true, session: "TOKYO", utcHour };
  }
  // London: 08:00–16:00 UTC
  if (fractional >= 8 && fractional < 16) {
    return { active: true, session: "LONDON", utcHour };
  }
  // New York: 13:00–21:00 UTC
  if (fractional >= 13 && fractional < 21) {
    return { active: true, session: "NEW_YORK", utcHour };
  }

  return { active: false, session: "NONE", utcHour };
}

export function isSessionActive(): boolean {
  return getCurrentSession().active;
}
