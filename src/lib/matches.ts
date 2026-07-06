/**
 * Match Data Utilities
 * Supports both real-time API data and fallback static data
 */

export interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Code: string;
  team2Code: string;
  league: string;
  matchDate: string;
  gameDate: string; // YYYY-MM-DD for BBC URL
  kickoffTime?: string;
  oddsTeam1: number;
  oddsDraw: number;
  oddsTeam2: number;
  status?: string;
  score?: string;
}

// Country/Team flag emoji mapping
export const FLAG_MAP: Record<string, string> = {
  // National teams
  CIV: "🇨🇮", NOR: "🇳🇴", FRA: "🇫🇷", SWE: "🇸🇪", MEX: "🇲🇽", ECU: "🇪🇨",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", COD: "🇨🇩", BEL: "🇧🇪", SEN: "🇸🇳", USA: "🇺🇸", BIH: "🇧🇦",
  BRA: "🇧🇷", KOR: "🇰🇷", ARG: "🇦🇷", AUS: "🇦🇺", GER: "🇩🇪", JPN: "🇯🇵",
  ESP: "🇪🇸", MAR: "🇲🇦", POR: "🇵🇹", CRO: "🇭🇷", NED: "🇳🇱", NGA: "🇳🇬",
  ITA: "🇮🇹", URU: "🇺🇾", COL: "🇨🇴", CHI: "🇨🇱", PER: "🇵🇪", PAR: "🇵🇾",
  CAN: "🇨🇦", QAT: "🇶🇦", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", SUI: "🇨🇭",
  DEN: "🇩🇰", POL: "🇵🇱", AUT: "🇦🇹", CZE: "🇨🇿", UKR: "🇺🇦", TUR: "🇹🇷",
  // Club teams - Premier League
  MCI: "🔵", LIV: "🔴", ARS: "🔴", CHE: "🔵", MUN: "🔴", TOT: "⚪",
  NEW: "⚫", AVL: "🟣", WHU: "🟤", BHA: "🔵", BRE: "🔴", FUL: "⚪",
  CRY: "🔴", WOL: "🟠", EVE: "🔵", NFO: "🔴", BOU: "🔴", LEI: "🔵",
  IPS: "🔵", SOU: "🔴",
  // La Liga
  RMA: "⚪", FCB: "🔵🔴", BAR: "🔵🔴", ATM: "🔴⚪", SEV: "⚪", BET: "💚",
  RSO: "🔵⚪", VIL: "🟡", ATH: "🔴⚪", VAL: "🦇",
  // Bundesliga
  BAY: "🔴", BVB: "🟡", RBL: "🔴⚪", B04: "🔴", BMG: "🟢", FRK: "⚪",
  WOB: "🟢", SCF: "⚫", SGE: "⚫🔴", TSG: "🔵",
  // Serie A
  JUV: "⚫⚪", MIL: "🔴⚫", INT: "🔵⚫", NAP: "🔵", ROM: "🟠", LAZ: "🔵",
  FIO: "🟣", ATA: "🔵⚫", TOR: "🟤", BOL: "🔴🔵",
  // Ligue 1
  PSG: "🔵🔴", MON: "🔴⚪", LYO: "🔵", LIL: "🔴", OLM: "🔵⚪", REN: "🔴⚫",
  NIC: "🔴⚫", LEN: "🔴🟡", STR: "🔵", NAN: "🟡💚",
};

export const getFlag = (code: string): string => FLAG_MAP[code] || "⚽";

// Group matches by date
export function groupMatchesByDate(matches: Match[]): Record<string, Match[]> {
  return matches.reduce((acc, match) => {
    const dateKey = match.gameDate;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(match);
    return acc;
  }, {} as Record<string, Match[]>);
}

// Generate bet ID (same format as contract)
export function generateBetId(gameDate: string, team1: string, team2: string): string {
  return `${gameDate}_${team1}_${team2}`.toLowerCase().replace(/ /g, "-");
}

// Format date for display in section header
export function formatDateHeader(gameDate: string): string {
  const date = new Date(gameDate + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  if (targetDate.getTime() === today.getTime()) {
    return "📅 Today";
  } else if (targetDate.getTime() === tomorrow.getTime()) {
    return "📅 Tomorrow";
  } else {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
}

// Get time until match
export function getTimeUntilMatch(kickoffTime?: string): string {
  if (!kickoffTime) return "";
  
  const now = new Date();
  const kickoff = new Date(kickoffTime);
  const diffMs = kickoff.getTime() - now.getTime();
  
  if (diffMs <= 0) return "LIVE";
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours >= 24) {
    const days = Math.floor(diffHours / 24);
    return `in ${days}d`;
  } else if (diffHours > 0) {
    return `in ${diffHours}h ${diffMins}m`;
  } else {
    return `in ${diffMins}m`;
  }
}
