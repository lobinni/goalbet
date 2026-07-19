/**
 * Match Data Utilities
 */

export interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Code: string;
  team2Code: string;
  league: string;
  leagueCode: string;      // e.g. "PL", "PD"
  matchday: number | null;  // round / matchday
  gameDate: string;         // YYYY-MM-DD
  kickoffTime: string;      // ISO-8601
  kickoffLocal: string;     // e.g. "20:00"
  oddsTeam1: number;
  oddsDraw: number;
  oddsTeam2: number;
  status: string;           // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED
  score?: string;           // "2-1"
  elapsed?: number | null;  // minutes elapsed if live
  venue?: string;
}

// ── League config with emoji ────────────────────────────────
export const LEAGUE_INFO: Record<string, { emoji: string; country: string }> = {
  "Premier League":       { emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", country: "England" },
  "La Liga":              { emoji: "🇪🇸", country: "Spain" },
  "Primera Division":     { emoji: "🇪🇸", country: "Spain" },
  "Bundesliga":           { emoji: "🇩🇪", country: "Germany" },
  "Serie A":              { emoji: "🇮🇹", country: "Italy" },
  "Ligue 1":              { emoji: "🇫🇷", country: "France" },
  "UEFA Champions League":{ emoji: "🏆", country: "Europe" },
  "Championship":         { emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", country: "England" },
  "Eredivisie":           { emoji: "🇳🇱", country: "Netherlands" },
  "Primeira Liga":        { emoji: "🇵🇹", country: "Portugal" },
  "Copa Libertadores":    { emoji: "🏆", country: "South America" },
  "FIFA World Cup":       { emoji: "🏆", country: "World" },
  "FIFA World Cup 2026":  { emoji: "🏆", country: "World" },
  "FIFA World Cup 2026 — Third Place": { emoji: "🏆", country: "World" },
  "FIFA World Cup 2026 — Final": { emoji: "🏆", country: "World" },
  "European Championship":{ emoji: "🇪🇺", country: "Europe" },
  "Liga MX":              { emoji: "🇲🇽", country: "Mexico" },
};

export const FLAG_MAP: Record<string, string> = {
  CIV: "🇨🇮", NOR: "🇳🇴", FRA: "🇫🇷", SWE: "🇸🇪", MEX: "🇲🇽",
  ECU: "🇪🇨", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", COD: "🇨🇩", BEL: "🇧🇪", SEN: "🇸🇳",
  USA: "🇺🇸", BIH: "🇧🇦", BRA: "🇧🇷", KOR: "🇰🇷", ARG: "🇦🇷",
  AUS: "🇦🇺", GER: "🇩🇪", JPN: "🇯🇵", ESP: "🇪🇸", MAR: "🇲🇦",
  POR: "🇵🇹", CRO: "🇭🇷", NED: "🇳🇱", NGA: "🇳🇬", ITA: "🇮🇹",
  URU: "🇺🇾", COL: "🇨🇴", CHI: "🇨🇱", PER: "🇵🇪", PAR: "🇵🇾",
  CAN: "🇨🇦", QAT: "🇶🇦", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  SUI: "🇨🇭", DEN: "🇩🇰", POL: "🇵🇱", AUT: "🇦🇹", CZE: "🇨🇿",
  UKR: "🇺🇦", TUR: "🇹🇷",
  MCI: "🔵", LIV: "🔴", ARS: "🔴", CHE: "🔵", MUN: "🔴",
  TOT: "⚪", NEW: "⚫", AVL: "🟣", WHU: "🟤", BHA: "🔵",
  BRE: "🔴", FUL: "⚪", CRY: "🔴", WOL: "🟠", EVE: "🔵",
  NFO: "🔴", BOU: "🔴", LEI: "🔵", IPS: "🔵", SOU: "🔴",
  RMA: "⚪", FCB: "🔵🔴", BAR: "🔵🔴", ATM: "🔴⚪", SEV: "⚪",
  BET: "💚", RSO: "🔵⚪", VIL: "🟡", ATH: "🔴⚪", VAL: "🦇",
  BAY: "🔴", BVB: "🟡", RBL: "🔴⚪", B04: "🔴", BMG: "🟢",
  FRK: "⚪", WOB: "🟢", SCF: "⚫", SGE: "⚫🔴", TSG: "🔵",
  JUV: "⚫⚪", MIL: "🔴⚫", INT: "🔵⚫", NAP: "🔵", ROM: "🟠",
  LAZ: "🔵", FIO: "🟣", ATA: "🔵⚫", TOR: "🟤", BOL: "🔴🔵",
  PSG: "🔵🔴", MON: "🔴⚪", LYO: "🔵", LIL: "🔴", OLM: "🔵⚪",
  REN: "🔴⚫", NIC: "🔴⚫", LEN: "🔴🟡", STR: "🔵", NAN: "🟡💚",
};

export const getFlag = (code: string): string => FLAG_MAP[code] || "⚽";

export function groupMatchesByDate(matches: Match[]): Record<string, Match[]> {
  return matches.reduce(
    (acc, match) => {
      const dateKey = match.gameDate;
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(match);
      return acc;
    },
    {} as Record<string, Match[]>,
  );
}

export function formatDateHeader(gameDate: string): string {
  // Use fixed UTC parsing to avoid SSR/client mismatch
  const parts = gameDate.split("-");
  const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(parts[1])-1];
  const day = parseInt(parts[2]);
  return `📅 ${month} ${day}`;
}

/** Returns countdown string — safe for SSR (no Date.now dependency for finished) */
export function getTimeUntilMatch(kickoffTime?: string): string {
  if (!kickoffTime) return "";
  // This runs on both server and client — only use for rough display
  return ""; // Countdown calculated client-side only via useEffect
}

/** Format kickoff as UTC time — consistent server/client */
export function formatKickoffTime(iso: string): string {
  // Parse ISO and extract UTC hours/minutes directly (no locale dependency)
  const d = new Date(iso);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m} UTC`;
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
