import type { Match } from "./matches";

/* ── Odds (deterministic pool-style) ── */
const T1 = new Set(["FRA","ESP","ARG","BRA","GER","ENG","POR","NED","BEL","ITA","MCI","LIV","ARS","CHE","RMA","FCB","BAY","PSG"]);
const T2 = new Set(["URU","CRO","COL","USA","MEX","JPN","KOR","SEN","MAR","NOR","SUI","TOT","MUN","ATM","JUV","BVB"]);

function odds(a: string, b: string): [number, number, number] {
  const s1 = T1.has(a) ? 3 : T2.has(a) ? 2 : 1, s2 = T1.has(b) ? 3 : T2.has(b) ? 2 : 1, d = s1 - s2;
  const s = ((a + b).split("").reduce((x, c) => x + c.charCodeAt(0), 0) % 100) / 100;
  if (d >= 2) return [+(1.3 + s * .15).toFixed(2), +(4 + s * .5).toFixed(2), +(5 + s).toFixed(2)];
  if (d === 1) return [+(1.55 + s * .25).toFixed(2), +(3.4 + s * .4).toFixed(2), +(3 + s * .5).toFixed(2)];
  if (d === 0) return [+(2.1 + s * .3).toFixed(2), +(3.1 + s * .3).toFixed(2), +(2.1 + s * .3).toFixed(2)];
  if (d === -1) return [+(3 + s * .5).toFixed(2), +(3.4 + s * .4).toFixed(2), +(1.55 + s * .25).toFixed(2)];
  return [+(5 + s).toFixed(2), +(4 + s * .5).toFixed(2), +(1.3 + s * .15).toFixed(2)];
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

/* ═══════════════════════════════════════════════════════════════
   ESPN Public JSON API — all leagues, grouped
   ═══════════════════════════════════════════════════════════════ */

const ESPN_SLUGS: string[] = [
  // World / International
  "fifa.world",
  "fifa.friendly",
  // Europe – top leagues
  "eng.1", "eng.2",
  "esp.1",
  "ger.1",
  "ita.1",
  "fra.1",
  "ned.1",
  "por.1",
  "sco.prem",
  // Europe – continental
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conference",
  // Americas
  "usa.1",
  "mex.1",
  "bra.1",
  "arg.1",
  "col.1",
  "ecu.1",
  "bol.1",
  // Continental cups
  "conmebol.libertadores",
  "conmebol.sudamericana",
  "concacaf.champions",
];

/** Info about a league from ESPN, kept alongside each match */
export interface LeagueGroup {
  slug: string;
  name: string;
  logo: string;
}

interface EspnCompetitor {
  homeAway: string;
  score: string;
  winner: boolean;
  team: { abbreviation: string; displayName: string; name: string };
}

async function fetchEspnLeague(
  slug: string,
  range: string,
): Promise<{ group: LeagueGroup; matches: Match[] }> {
  const empty: { group: LeagueGroup; matches: Match[] } = {
    group: { slug, name: slug, logo: "" },
    matches: [],
  };
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${range}&limit=300`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(9000),
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return empty;

    const data = await res.json();
    const events = data?.events;
    if (!Array.isArray(events) || events.length === 0) return empty;

    const leagueMeta = data?.leagues?.[0] || {};
    const leagueName: string = leagueMeta.name || slug;
    const leagueLogo: string =
      leagueMeta.logos?.[0]?.href || "";

    const group: LeagueGroup = { slug, name: leagueName, logo: leagueLogo };
    const matches: Match[] = [];

    for (const event of events) {
      const comp = event?.competitions?.[0];
      if (!comp) continue;
      const competitors = comp?.competitors as EspnCompetitor[] | undefined;
      if (!Array.isArray(competitors) || competitors.length !== 2) continue;
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const ko = new Date(event.date || comp.date || comp.startDate);
      const statusType = comp?.status?.type;
      const statusState = statusType?.state || "pre";

      let status: string;
      if (statusType?.completed) status = "FINISHED";
      else if (statusState === "in") {
        const detail = statusType?.detail || "";
        status = detail.includes("Half") ? "PAUSED" : "IN_PLAY";
      } else status = "SCHEDULED";

      const homeScore = parseInt(home.score) || 0;
      const awayScore = parseInt(away.score) || 0;
      const score = status !== "SCHEDULED" ? `${homeScore}-${awayScore}` : undefined;

      const homeCode = home.team?.abbreviation || "";
      const awayCode = away.team?.abbreviation || "";
      const [o1, od, o2] = odds(homeCode, awayCode);

      const hh = ko.getUTCHours().toString().padStart(2, "0");
      const mm = ko.getUTCMinutes().toString().padStart(2, "0");

      let elapsed: number | null = null;
      if (status === "IN_PLAY") {
        const clockMatch = (statusType?.detail || "").match(/(\d+)'/);
        elapsed = clockMatch
          ? parseInt(clockMatch[1])
          : Math.min(90, Math.floor((Date.now() - ko.getTime()) / 60000));
      }

      let leagueLabel = leagueName;
      const altNote: string = comp.altGameNote || "";
      if (altNote && altNote.includes(",")) {
        const round = altNote.split(",").pop()?.trim();
        if (round && !leagueLabel.includes(round))
          leagueLabel = `${leagueName} — ${round}`;
      }

      matches.push({
        id: `espn-${event.id}`,
        team1: home.team?.displayName || home.team?.name || "Home",
        team2: away.team?.displayName || away.team?.name || "Away",
        team1Code: homeCode,
        team2Code: awayCode,
        league: leagueLabel,
        leagueCode: slug.toUpperCase(),
        matchday: null,
        gameDate: ko.toISOString().split("T")[0],
        kickoffTime: ko.toISOString(),
        kickoffLocal: `${hh}:${mm} UTC`,
        oddsTeam1: o1,
        oddsDraw: od,
        oddsTeam2: o2,
        status,
        score,
        elapsed,
        venue: comp.venue?.fullName || undefined,
      });
    }

    return { group, matches };
  } catch (e) {
    console.warn(`ESPN ${slug}:`, (e as Error).message?.slice(0, 80));
    return empty;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Public API: grouped fixture data
   ═══════════════════════════════════════════════════════════════ */

/** A league group with its matches, sorted by kickoff */
export interface FixtureGroup {
  league: LeagueGroup;
  matches: Match[];
}

/** Get all fixtures grouped by league — yesterday → tomorrow UTC */
export async function getAllFixtures(): Promise<Match[]> {
  const groups = await getFixtureGroups();
  return groups.flatMap((g) => g.matches);
}

export async function getFixtureGroups(): Promise<FixtureGroup[]> {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  const to = new Date();
  to.setDate(to.getDate() + 2);
  const range = `${fmtDate(from)}-${fmtDate(to)}`;

  const results = await Promise.all(
    ESPN_SLUGS.map((slug) => fetchEspnLeague(slug, range)),
  );

  // Precise UTC window: yesterday → tomorrow
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const fromIso = y.toISOString().split("T")[0];
  const toIso = t.toISOString().split("T")[0];

  const groups: FixtureGroup[] = [];

  for (const { group, matches } of results) {
    const filtered = matches.filter(
      (m) => m.gameDate >= fromIso && m.gameDate <= toIso,
    );
    if (filtered.length === 0) continue;

    // Sort within league: live first, then by kickoff
    filtered.sort((a, b) => {
      const al = a.status === "IN_PLAY" || a.status === "PAUSED" ? 0 : 1;
      const bl = b.status === "IN_PLAY" || b.status === "PAUSED" ? 0 : 1;
      if (al !== bl) return al - bl;
      return (
        new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
      );
    });

    groups.push({ league: group, matches: filtered });
  }

  // Sort groups: leagues with live matches first, then alphabetical
  groups.sort((a, b) => {
    const aLive = a.matches.some(
      (m) => m.status === "IN_PLAY" || m.status === "PAUSED",
    )
      ? 0
      : 1;
    const bLive = b.matches.some(
      (m) => m.status === "IN_PLAY" || m.status === "PAUSED",
    )
      ? 0
      : 1;
    if (aLive !== bLive) return aLive - bLive;
    return a.league.name.localeCompare(b.league.name);
  });

  return groups;
}
