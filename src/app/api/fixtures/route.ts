import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { name: string; tla: string };
  awayTeam: { name: string; tla: string };
  competition: { name: string };
  score?: {
    fullTime?: { home: number | null; away: number | null };
  };
}

interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Code: string;
  team2Code: string;
  league: string;
  matchDate: string;
  gameDate: string;
  kickoffTime: string;
  oddsTeam1: number;
  oddsDraw: number;
  oddsTeam2: number;
  status: string;
  score?: string;
}

function generateOdds(team1Code: string, team2Code: string): [number, number, number] {
  const topTeams = ["ENG", "ESP", "GER", "FRA", "BRA", "ARG", "ITA", "POR", "NED", "BEL"];
  const midTeams = ["URU", "CRO", "DEN", "SUI", "USA", "MEX", "JPN", "KOR", "SEN", "MAR"];
  const team1Strength = topTeams.includes(team1Code) ? 3 : midTeams.includes(team1Code) ? 2 : 1;
  const team2Strength = topTeams.includes(team2Code) ? 3 : midTeams.includes(team2Code) ? 2 : 1;
  const diff = team1Strength - team2Strength;

  let odds1: number, oddsDraw: number, odds2: number;
  if (diff > 1) {
    odds1 = 1.35 + Math.random() * 0.2;
    oddsDraw = 4.0 + Math.random() * 0.5;
    odds2 = 3.5 + Math.random() * 0.5;
  } else if (diff > 0) {
    odds1 = 1.6 + Math.random() * 0.3;
    oddsDraw = 3.5 + Math.random() * 0.4;
    odds2 = 2.8 + Math.random() * 0.4;
  } else if (diff === 0) {
    odds1 = 2.0 + Math.random() * 0.3;
    oddsDraw = 3.2 + Math.random() * 0.3;
    odds2 = 2.0 + Math.random() * 0.3;
  } else if (diff > -2) {
    odds1 = 2.8 + Math.random() * 0.4;
    oddsDraw = 3.5 + Math.random() * 0.4;
    odds2 = 1.6 + Math.random() * 0.3;
  } else {
    odds1 = 3.5 + Math.random() * 0.5;
    oddsDraw = 4.0 + Math.random() * 0.5;
    odds2 = 1.35 + Math.random() * 0.2;
  }

  return [
    Math.round(odds1 * 100) / 100,
    Math.round(oddsDraw * 100) / 100,
    Math.round(odds2 * 100) / 100,
  ];
}

async function fetchFromFootballData(): Promise<Match[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const dateFrom = today.toISOString().split("T")[0];
  const dateTo = nextWeek.toISOString().split("T")[0];

  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["X-Auth-Token"] = apiKey;
  }

  try {
    const competitions = ["PL", "PD", "BL1", "SA", "FL1", "CL", "WC", "EC"];
    const allMatches: Match[] = [];

    for (const comp of competitions) {
      try {
        const response = await fetch(
          `https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED,TIMED,IN_PLAY`,
          { headers, next: { revalidate: 300 } }
        );
        if (!response.ok) continue;
        const data = await response.json();
        const matches = data.matches || [];

        for (const match of matches as ApiMatch[]) {
          const kickoff = new Date(match.utcDate);
          const [odds1, oddsDraw, odds2] = generateOdds(
            match.homeTeam.tla || "XXX",
            match.awayTeam.tla || "XXX"
          );

          allMatches.push({
            id: `api-${match.id}`,
            team1: match.homeTeam.name,
            team2: match.awayTeam.name,
            team1Code: match.homeTeam.tla || "XXX",
            team2Code: match.awayTeam.tla || "XXX",
            league: match.competition.name,
            matchDate: kickoff.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            gameDate: kickoff.toISOString().split("T")[0],
            kickoffTime: kickoff.toISOString(),
            oddsTeam1: odds1,
            oddsDraw: oddsDraw,
            oddsTeam2: odds2,
            status: match.status,
            score:
              match.score?.fullTime?.home !== null
                ? `${match.score?.fullTime?.home}-${match.score?.fullTime?.away}`
                : undefined,
          });
        }
      } catch {
        // Skip failed competitions
      }
    }

    allMatches.sort(
      (a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
    );
    return allMatches;
  } catch (error) {
    console.error("Error fetching from football-data.org:", error);
    return [];
  }
}

function generateMockFixtures(): Match[] {
  const now = new Date();
  const matches: Match[] = [];

  const fixtures = [
    { team1: "Manchester City", team2: "Liverpool", team1Code: "MCI", team2Code: "LIV", league: "Premier League", hoursFromNow: 2 },
    { team1: "Arsenal", team2: "Chelsea", team1Code: "ARS", team2Code: "CHE", league: "Premier League", hoursFromNow: 5 },
    { team1: "Real Madrid", team2: "Barcelona", team1Code: "RMA", team2Code: "FCB", league: "La Liga", hoursFromNow: 8 },
    { team1: "Bayern Munich", team2: "Borussia Dortmund", team1Code: "BAY", team2Code: "BVB", league: "Bundesliga", hoursFromNow: 26 },
    { team1: "AC Milan", team2: "Inter Milan", team1Code: "MIL", team2Code: "INT", league: "Serie A", hoursFromNow: 28 },
    { team1: "PSG", team2: "Marseille", team1Code: "PSG", team2Code: "MAR", league: "Ligue 1", hoursFromNow: 30 },
    { team1: "Juventus", team2: "Napoli", team1Code: "JUV", team2Code: "NAP", league: "Serie A", hoursFromNow: 50 },
    { team1: "Atletico Madrid", team2: "Sevilla", team1Code: "ATM", team2Code: "SEV", league: "La Liga", hoursFromNow: 52 },
    { team1: "Tottenham", team2: "Manchester United", team1Code: "TOT", team2Code: "MUN", league: "Premier League", hoursFromNow: 74 },
    { team1: "RB Leipzig", team2: "Bayer Leverkusen", team1Code: "RBL", team2Code: "B04", league: "Bundesliga", hoursFromNow: 76 },
    { team1: "Roma", team2: "Lazio", team1Code: "ROM", team2Code: "LAZ", league: "Serie A", hoursFromNow: 98 },
    { team1: "Lyon", team2: "Monaco", team1Code: "LYO", team2Code: "MON", league: "Ligue 1", hoursFromNow: 100 },
  ];

  for (const fixture of fixtures) {
    const kickoff = new Date(now.getTime() + fixture.hoursFromNow * 60 * 60 * 1000);
    const [odds1, oddsDraw, odds2] = generateOdds(fixture.team1Code, fixture.team2Code);
    matches.push({
      id: `mock-${fixture.team1Code}-${fixture.team2Code}-${kickoff.toISOString().split("T")[0]}`,
      team1: fixture.team1,
      team2: fixture.team2,
      team1Code: fixture.team1Code,
      team2Code: fixture.team2Code,
      league: fixture.league,
      matchDate: kickoff.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      gameDate: kickoff.toISOString().split("T")[0],
      kickoffTime: kickoff.toISOString(),
      oddsTeam1: odds1,
      oddsDraw: oddsDraw,
      oddsTeam2: odds2,
      status: "SCHEDULED",
    });
  }

  return matches;
}

export async function GET() {
  try {
    let matches = await fetchFromFootballData();
    if (matches.length === 0) {
      matches = generateMockFixtures();
    }
    return NextResponse.json({
      success: true,
      count: matches.length,
      lastUpdated: new Date().toISOString(),
      matches,
    });
  } catch (error) {
    console.error("Error in fixtures API:", error);
    const matches = generateMockFixtures();
    return NextResponse.json({
      success: true,
      count: matches.length,
      lastUpdated: new Date().toISOString(),
      matches,
      source: "mock",
    });
  }
}
