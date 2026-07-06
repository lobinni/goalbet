/**
 * Team Logo URLs
 * Uses football-data.org crests (clubs have numeric IDs)
 * and flagcdn.com for national teams
 */

// football-data.org team ID mapping
// Source: https://www.football-data.org/documentation/quickstart
const FOOTBALL_DATA_CRESTS: Record<string, number> = {
  // Premier League
  MCI: 65,   // Manchester City
  LIV: 64,   // Liverpool
  ARS: 57,   // Arsenal
  CHE: 61,   // Chelsea
  MUN: 66,   // Manchester United
  TOT: 73,   // Tottenham
  NEW: 67,   // Newcastle
  AVL: 58,   // Aston Villa
  WHU: 563,  // West Ham
  BHA: 397,  // Brighton
  BRE: 402,  // Brentford
  FUL: 63,   // Fulham
  CRY: 354,  // Crystal Palace
  WOL: 76,   // Wolverhampton
  EVE: 62,   // Everton
  NFO: 351,  // Nottingham Forest
  BOU: 1044, // Bournemouth
  LEI: 338,  // Leicester
  IPS: 349,  // Ipswich
  SOU: 340,  // Southampton

  // La Liga
  RMA: 86,   // Real Madrid
  FCB: 81,   // FC Barcelona
  BAR: 81,   // Barcelona alias
  ATM: 78,   // Atletico Madrid
  SEV: 559,  // Sevilla
  BET: 90,   // Real Betis
  RSO: 92,   // Real Sociedad
  VIL: 94,   // Villarreal
  ATH: 77,   // Athletic Bilbao
  VAL: 95,   // Valencia

  // Bundesliga
  BAY: 5,    // Bayern Munich
  BVB: 4,    // Borussia Dortmund
  RBL: 721,  // RB Leipzig
  B04: 3,    // Bayer Leverkusen
  BMG: 18,   // Borussia Mönchengladbach
  FRK: 19,   // Eintracht Frankfurt
  WOB: 11,   // Wolfsburg
  SCF: 17,   // SC Freiburg
  SGE: 19,   // Eintracht Frankfurt alias
  TSG: 2,    // TSG Hoffenheim

  // Serie A
  JUV: 109,  // Juventus
  MIL: 98,   // AC Milan
  INT: 108,  // Inter Milan
  NAP: 113,  // Napoli
  ROM: 100,  // Roma
  LAZ: 110,  // Lazio
  FIO: 99,   // Fiorentina
  ATA: 102,  // Atalanta
  TOR: 586,  // Torino
  BOL: 103,  // Bologna

  // Ligue 1
  PSG: 524,  // PSG
  MON: 548,  // Monaco
  LYO: 523,  // Lyon
  LIL: 521,  // Lille
  OLM: 516,  // Olympique Marseille
  REN: 529,  // Rennes
  NIC: 522,  // Nice
  LEN: 541,  // Lens
  STR: 576,  // Strasbourg
  NAN: 543,  // Nantes
};

// National team ISO Alpha-2 codes for flagcdn
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

/**
 * Get team logo URL.
 * Returns football-data.org crest for clubs, flagcdn for national teams.
 * Returns null if unknown.
 */
export function getTeamLogoUrl(teamCode: string): string | null {
  // Check club teams first
  const crestId = FOOTBALL_DATA_CRESTS[teamCode];
  if (crestId) {
    return `https://crests.football-data.org/${crestId}.png`;
  }

  // Check national teams
  const countryCode = NATIONAL_TEAM_COUNTRY[teamCode];
  if (countryCode) {
    return `https://flagcdn.com/w80/${countryCode}.png`;
  }

  return null;
}

/**
 * Check if a team code is a national team
 */
export function isNationalTeam(teamCode: string): boolean {
  return teamCode in NATIONAL_TEAM_COUNTRY;
}

// Reverse lookup: team name → code
const TEAM_NAME_TO_CODE: Record<string, string> = {
  // Premier League
  "manchester city": "MCI", "man city": "MCI",
  "liverpool": "LIV",
  "arsenal": "ARS",
  "chelsea": "CHE",
  "manchester united": "MUN", "man united": "MUN",
  "tottenham": "TOT", "tottenham hotspur": "TOT",
  "newcastle": "NEW", "newcastle united": "NEW",
  "aston villa": "AVL",
  "west ham": "WHU", "west ham united": "WHU",
  "brighton": "BHA",
  "brentford": "BRE",
  "fulham": "FUL",
  "crystal palace": "CRY",
  "wolverhampton": "WOL", "wolves": "WOL",
  "everton": "EVE",
  "nottingham forest": "NFO",
  "bournemouth": "BOU",
  "leicester": "LEI", "leicester city": "LEI",
  "ipswich": "IPS", "ipswich town": "IPS",
  "southampton": "SOU",
  // La Liga
  "real madrid": "RMA",
  "barcelona": "FCB", "fc barcelona": "FCB",
  "atletico madrid": "ATM",
  "sevilla": "SEV",
  "real betis": "BET",
  "real sociedad": "RSO",
  "villarreal": "VIL",
  "athletic bilbao": "ATH", "athletic club": "ATH",
  "valencia": "VAL",
  // Bundesliga
  "bayern munich": "BAY", "fc bayern münchen": "BAY", "bayern münchen": "BAY",
  "borussia dortmund": "BVB",
  "rb leipzig": "RBL",
  "bayer leverkusen": "B04", "bayer 04 leverkusen": "B04",
  "borussia mönchengladbach": "BMG",
  "eintracht frankfurt": "FRK",
  "wolfsburg": "WOB", "vfl wolfsburg": "WOB",
  "sc freiburg": "SCF",
  "tsg hoffenheim": "TSG",
  // Serie A
  "juventus": "JUV",
  "ac milan": "MIL", "milan": "MIL",
  "inter milan": "INT", "inter": "INT", "fc internazionale milano": "INT",
  "napoli": "NAP", "ssc napoli": "NAP",
  "roma": "ROM", "as roma": "ROM",
  "lazio": "LAZ", "ss lazio": "LAZ",
  "fiorentina": "FIO", "acf fiorentina": "FIO",
  "atalanta": "ATA",
  "torino": "TOR",
  "bologna": "BOL",
  // Ligue 1
  "psg": "PSG", "paris saint-germain": "PSG", "paris sg": "PSG",
  "monaco": "MON", "as monaco": "MON",
  "lyon": "LYO", "olympique lyonnais": "LYO",
  "lille": "LIL",
  "marseille": "OLM", "olympique marseille": "OLM", "olympique de marseille": "OLM",
  "rennes": "REN",
  "nice": "NIC", "ogc nice": "NIC",
  "lens": "LEN", "rc lens": "LEN",
  "strasbourg": "STR",
  "nantes": "NAN", "fc nantes": "NAN",
  // National teams
  "france": "FRA", "germany": "GER", "spain": "ESP", "england": "ENG",
  "italy": "ITA", "portugal": "POR", "netherlands": "NED", "belgium": "BEL",
  "croatia": "CRO", "argentina": "ARG", "brazil": "BRA", "uruguay": "URU",
  "colombia": "COL", "japan": "JPN", "south korea": "KOR", "australia": "AUS",
  "usa": "USA", "mexico": "MEX", "morocco": "MAR", "senegal": "SEN",
  "nigeria": "NGA", "ivory coast": "CIV", "dr congo": "COD",
  "norway": "NOR", "sweden": "SWE", "denmark": "DEN", "switzerland": "SUI",
  "austria": "AUT", "poland": "POL", "czech republic": "CZE", "ukraine": "UKR",
  "turkey": "TUR", "canada": "CAN",
};

/**
 * Try to guess team code from team name
 */
export function getTeamCodeFromName(teamName: string): string {
  const normalized = teamName.toLowerCase().trim();
  return TEAM_NAME_TO_CODE[normalized] || "";
}
