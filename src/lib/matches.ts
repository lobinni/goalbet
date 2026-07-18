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
  const date = new Date(gameDate + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  if (targetDate.getTime() === today.getTime()) return "📅 Today";
  if (targetDate.getTime() === tomorrow.getTime()) return "📅 Tomorrow";
  if (targetDate.getTime() === dayAfter.getTime()) {
    return "📅 " + date.toLocaleDateString("en-US", { weekday: "long" });
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
}

export function getTimeUntilMatch(kickoffTime?: string): string {
  if (!kickoffTime) return "";
  const now = new Date();
  const kickoff = new Date(kickoffTime);
  const diffMs = kickoff.getTime() - now.getTime();

  if (diffMs < -7200_000) return "FT"; // >2h ago → finished
  if (diffMs < 0) return "LIVE";

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffHours >= 48) {
    const days = Math.floor(diffHours / 24);
    return `${days}d`;
  } else if (diffHours >= 24) {
    return `Tomorrow`;
  } else if (diffHours > 0) {
    return `${diffHours}h ${diffMins % 60}m`;
  } else {
    return `${diffMins}m`;
  }
}

/** Format kickoff as local time string e.g. "20:00" */
export function formatKickoffTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
