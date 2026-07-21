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
  leagueCode: string; // e.g. "PL", "PD"
  matchday: number | null; // round / matchday
  gameDate: string; // YYYY-MM-DD
  kickoffTime: string; // ISO-8601
  kickoffLocal: string; // e.g. "20:00"
  oddsTeam1: number;
  oddsDraw: number;
  oddsTeam2: number;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED
  score?: string; // "2-1"
  elapsed?: number | null; // minutes elapsed if live
  venue?: string;
}

// ── League config with emoji (keys match both ESPN + football-data names) ──
export const LEAGUE_INFO: Record<string, { emoji: string; country: string }> = {
  "Premier League": { emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", country: "England" },
  "English Premier League": { emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", country: "England" },
  "La Liga": { emoji: "🇪🇸", country: "Spain" },
  "Spanish LALIGA": { emoji: "🇪🇸", country: "Spain" },
  "Primera Division": { emoji: "🇪🇸", country: "Spain" },
  "Bundesliga": { emoji: "🇩🇪", country: "Germany" },
  "German Bundesliga": { emoji: "🇩🇪", country: "Germany" },
  "Serie A": { emoji: "🇮🇹", country: "Italy" },
  "Italian Serie A": { emoji: "🇮🇹", country: "Italy" },
  "Ligue 1": { emoji: "🇫🇷", country: "France" },
  "French Ligue 1": { emoji: "🇫🇷", country: "France" },
  "UEFA Champions League":{ emoji: "🏆", country: "Europe" },
  "UEFA Europa League": { emoji: "🥈", country: "Europe" },
  "UEFA Conference League": { emoji: "🥉", country: "Europe" },
  "Championship": { emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", country: "England" },
  "English League Championship": { emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", country: "England" },
  "Eredivisie": { emoji: "🇳🇱", country: "Netherlands" },
  "Dutch Eredivisie": { emoji: "🇳🇱", country: "Netherlands" },
  "Primeira Liga": { emoji: "🇵🇹", country: "Portugal" },
  "Portuguese Primeira Liga": { emoji: "🇵🇹", country: "Portugal" },
  "Copa Libertadores": { emoji: "🏆", country: "South America" },
  "FIFA World Cup": { emoji: "🏆", country: "World" },
  "FIFA World Cup 2026": { emoji: "🏆", country: "World" },
  "International Friendly": { emoji: "🤝", country: "International" },
  "European Championship":{ emoji: "🇪🇺", country: "Europe" },
  "MLS": { emoji: "🇺🇸", country: "USA" },
  "Liga MX": { emoji: "🇲🇽", country: "Mexico" },
  "Mexican Liga BBVA MX": { emoji: "🇲🇽", country: "Mexico" },
  "Brazilian Serie A": { emoji: "🇧🇷", country: "Brazil" },
  "Brasileirão Série A": { emoji: "🇧🇷", country: "Brazil" },
  "Argentine Primera División": { emoji: "🇦🇷", country: "Argentina" },
  "Liga Profesional de Fútbol": { emoji: "🇦🇷", country: "Argentina" },
};

export const FLAG_MAP: Record<string, string> = {
  CIV: "🇨🇮", NOR: "🇳🇴", FRA: "🇫🇷", SWE: "🇸🇪", MEX: "🇲🇽", ECU: "🇪🇨",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", COD: "🇨🇩", BEL: "🇧🇪", SEN: "🇸🇳", USA: "🇺🇸", BIH: "🇧🇦",
  BRA: "🇧🇷", KOR: "🇰🇷", ARG: "🇦🇷", AUS: "🇦🇺", GER: "🇩🇪", JPN: "🇯🇵",
  ESP: "🇪🇸", MAR: "🇲🇦", POR: "🇵🇹", CRO: "🇭🇷", NED: "🇳🇱", NGA: "🇳🇬",
  ITA: "🇮🇹", URU: "🇺🇾", COL: "🇨🇴", CHI: "🇨🇱", PER: "🇵🇪", PAR: "🇵🇾",
  CAN: "🇨🇦", QAT: "🇶🇦", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  SUI: "🇨🇭", DEN: "🇩🇰", POL: "🇵🇱", AUT: "🇦🇹", CZE: "🇨🇿", UKR: "🇺🇦",
  TUR: "🇹🇷",
  MCI: "🔵", LIV: "🔴", ARS: "🔴", CHE: "🔵", MUN: "🔴", TOT: "⚪",
  NEW: "⚫", AVL: "🟣", WHU: "🟤", BHA: "🔵", BRE: "🔴", FUL: "⚪",
  CRY: "🔴", WOL: "🟠", EVE: "🔵", NFO: "🔴", BOU: "🔴", LEI: "🔵",
  IPS: "🔵", SOU: "🔴",
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
  const parts = gameDate.split("-");
  const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(parts[1])-1];
  const day = parseInt(parts[2]);
  return `📅 ${month} ${day}`;
}

/** UTC-based relative label for a YYYY-MM-DD game date */
export function relativeDayLabel(gameDate: string): "YESTERDAY" | "TODAY" | "TOMORROW" | null {
  const d = new Date();
  const iso = (dt: Date) => dt.toISOString().split("T")[0];
  const today = new Date(iso(d) + "T12:00:00Z");
  if (gameDate === iso(today)) return "TODAY";
  const y = new Date(today); y.setUTCDate(y.getUTCDate() - 1);
  if (gameDate === iso(y)) return "YESTERDAY";
  const t = new Date(today); t.setUTCDate(t.getUTCDate() + 1);
  if (gameDate === iso(t)) return "TOMORROW";
  return null;
}

/** Returns countdown string — safe for SSR (no Date.now dependency for finished) */
export function getTimeUntilMatch(kickoffTime?: string): string {
  if (!kickoffTime) return "";
  return "";
}

/** Format kickoff as UTC time — consistent server/client */
export function formatKickoffTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m} UTC`;
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
