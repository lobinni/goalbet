/**
 * Team Logo URLs
 * Uses football-data.org crests (clubs have numeric IDs)
 * and flagcdn.com for national teams
 */

const FOOTBALL_DATA_CRESTS: Record<string, number> = {
  // Premier League
  MCI: 65, LIV: 64, ARS: 57, CHE: 61, MUN: 66, TOT: 73,
  NEW: 67, AVL: 58, WHU: 563, BHA: 397, BRE: 402, FUL: 63,
  CRY: 354, WOL: 76, EVE: 62, NFO: 351, BOU: 1044, LEI: 338,
  IPS: 349, SOU: 340,
  // La Liga
  RMA: 86, FCB: 81, BAR: 81, ATM: 78, SEV: 559, BET: 90,
  RSO: 92, VIL: 94, ATH: 77, VAL: 95,
  // Bundesliga
  BAY: 5, BVB: 4, RBL: 721, B04: 3, BMG: 18, FRK: 19,
  WOB: 11, SCF: 17, SGE: 19, TSG: 2,
  // Serie A
  JUV: 109, MIL: 98, INT: 108, NAP: 113, ROM: 100, LAZ: 110,
  FIO: 99, ATA: 102, TOR: 586, BOL: 103,
  // Ligue 1
  PSG: 524, MON: 548, LYO: 523, LIL: 521, OLM: 516, REN: 529,
  NIC: 522, LEN: 541, STR: 576, NAN: 543,
};

const NATIONAL_TEAM_COUNTRY: Record<string, string> = {
  ENG: "gb-eng", FRA: "fr", GER: "de", ESP: "es", ITA: "it",
  POR: "pt", NED: "nl", BEL: "be", CRO: "hr", ARG: "ar",
  BRA: "br", URU: "uy", COL: "co", CHI: "cl", PER: "pe",
  PAR: "py", ECU: "ec", MEX: "mx", USA: "us", CAN: "ca",
  JPN: "jp", KOR: "kr", AUS: "au", QAT: "qa", MAR: "ma",
  SEN: "sn", NGA: "ng", CIV: "ci", COD: "cd", NOR: "no",
  SWE: "se", DEN: "dk", SUI: "ch", AUT: "at", POL: "pl",
  CZE: "cz", UKR: "ua", TUR: "tr", WAL: "gb-wls", SCO: "gb-sct",
  BIH: "ba",
};

export function getTeamLogoUrl(teamCode: string): string | null {
  const crestId = FOOTBALL_DATA_CRESTS[teamCode];
  if (crestId) {
    return `https://crests.football-data.org/${crestId}.png`;
  }
  const countryCode = NATIONAL_TEAM_COUNTRY[teamCode];
  if (countryCode) {
    return `https://flagcdn.com/w80/${countryCode}.png`;
  }
  return null;
}

export function isNationalTeam(teamCode: string): boolean {
  return teamCode in NATIONAL_TEAM_COUNTRY;
}

const TEAM_NAME_TO_CODE: Record<string, string> = {
  "manchester city": "MCI", "man city": "MCI", "liverpool": "LIV",
  "arsenal": "ARS", "chelsea": "CHE", "manchester united": "MUN",
  "man united": "MUN", "tottenham": "TOT", "tottenham hotspur": "TOT",
  "newcastle": "NEW", "newcastle united": "NEW", "aston villa": "AVL",
  "west ham": "WHU", "west ham united": "WHU", "brighton": "BHA",
  "brentford": "BRE", "fulham": "FUL", "crystal palace": "CRY",
  "wolverhampton": "WOL", "wolves": "WOL", "everton": "EVE",
  "nottingham forest": "NFO", "bournemouth": "BOU", "leicester": "LEI",
  "leicester city": "LEI", "ipswich": "IPS", "ipswich town": "IPS",
  "southampton": "SOU",
  "real madrid": "RMA", "barcelona": "FCB", "fc barcelona": "FCB",
  "atletico madrid": "ATM", "sevilla": "SEV", "real betis": "BET",
  "real sociedad": "RSO", "villarreal": "VIL", "athletic bilbao": "ATH",
  "athletic club": "ATH", "valencia": "VAL",
  "bayern munich": "BAY", "fc bayern münchen": "BAY", "bayern münchen": "BAY",
  "borussia dortmund": "BVB", "rb leipzig": "RBL", "bayer leverkusen": "B04",
  "bayer 04 leverkusen": "B04", "borussia mönchengladbach": "BMG",
  "eintracht frankfurt": "FRK", "wolfsburg": "WOB", "vfl wolfsburg": "WOB",
  "sc freiburg": "SCF", "tsg hoffenheim": "TSG",
  "juventus": "JUV", "ac milan": "MIL", "milan": "MIL",
  "inter milan": "INT", "inter": "INT", "fc internazionale milano": "INT",
  "napoli": "NAP", "ssc napoli": "NAP", "roma": "ROM", "as roma": "ROM",
  "lazio": "LAZ", "ss lazio": "LAZ", "fiorentina": "FIO",
  "acf fiorentina": "FIO", "atalanta": "ATA", "torino": "TOR",
  "bologna": "BOL",
  "psg": "PSG", "paris saint-germain": "PSG", "paris sg": "PSG",
  "monaco": "MON", "as monaco": "MON", "lyon": "LYO",
  "olympique lyonnais": "LYO", "lille": "LIL", "marseille": "OLM",
  "olympique marseille": "OLM", "olympique de marseille": "OLM",
  "rennes": "REN", "nice": "NIC", "ogc nice": "NIC", "lens": "LEN",
  "rc lens": "LEN", "strasbourg": "STR", "nantes": "NAN", "fc nantes": "NAN",
  "france": "FRA", "germany": "GER", "spain": "ESP", "england": "ENG",
  "italy": "ITA", "portugal": "POR", "netherlands": "NED", "belgium": "BEL",
  "croatia": "CRO", "argentina": "ARG", "brazil": "BRA", "uruguay": "URU",
  "colombia": "COL", "japan": "JPN", "south korea": "KOR", "australia": "AUS",
  "usa": "USA", "mexico": "MEX", "morocco": "MAR", "senegal": "SEN",
  "nigeria": "NGA", "ivory coast": "CIV", "dr congo": "COD", "norway": "NOR",
  "sweden": "SWE", "denmark": "DEN", "switzerland": "SUI", "austria": "AUT",
  "poland": "POL", "czech republic": "CZE", "ukraine": "UKR", "turkey": "TUR",
  "canada": "CAN",
};

export function getTeamCodeFromName(teamName: string): string {
  const normalized = teamName.toLowerCase().trim();
  return TEAM_NAME_TO_CODE[normalized] || "";
}
