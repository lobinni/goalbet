import type { Match } from "./matches";

/* ── Odds (deterministic pool-style) ── */
const T1 = new Set(["FRA","ESP","ARG","BRA","GER","ENG","POR","NED","BEL","ITA","MCI","LIV","ARS","CHE","RMA","FCB","BAY","PSG","BOCA","RIV","FLA","PAL"]);
const T2 = new Set(["URU","CRO","COL","USA","MEX","JPN","KOR","SEN","MAR","NOR","SUI","TOT","MUN","ATM","JUV","BVB","LAG","LAX","INT","CRUZ","Gremio"]);

function odds(a: string, b: string): [number, number, number] {
  const s1 = T1.has(a) ? 3 : T2.has(a) ? 2 : 1, s2 = T1.has(b) ? 3 : T2.has(b) ? 2 : 1, d = s1 - s2;
  const s = ((a + b).split("").reduce((x, c) => x + c.charCodeAt(0), 0) % 100) / 100;
  if (d >= 2) return [+(1.3 + s * .15).toFixed(2), +(4 + s * .5).toFixed(2), +(5 + s).toFixed(2)];
  if (d === 1) return [+(1.55 + s * .25).toFixed(2), +(3.4 + s * .4).toFixed(2), +(3 + s * .5).toFixed(2)];
  if (d === 0) return [+(2.1 + s * .3).toFixed(2), +(3.1 + s * .3).toFixed(2), +(2.1 + s * .3).toFixed(2)];
  if (d === -1) return [+(3 + s * .5).toFixed(2), +(3.4 + s * .4).toFixed(2), +(1.55 + s * .25).toFixed(2)];
  return [+(5 + s).toFixed(2), +(4 + s * .5).toFixed(2), +(1.3 + s * .15).toFixed(2)];
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0].replace(/-/g, "");
}


/* ═══════════════════════════════════════════════════════════════
   ESPN Public JSON API — no auth, structured, stable
   Window: YESTERDAY → TOMORROW (UTC)
   ═══════════════════════════════════════════════════════════════ */

const ESPN_LEAGUES: string[] = [
  "fifa.world",                 // FIFA World Cup
  "fifa.friendly",              // International friendlies
  "eng.1",                      // Premier League
  "eng.2",                      // Championship
  "esp.1",                      // La Liga
  "ger.1",                      // Bundesliga
  "ita.1",                      // Serie A
  "fra.1",                      // Ligue 1
  "uefa.champions",             // Champions League
  "uefa.europa",                // Europa League
  "uefa.europa.conference",     // Conference League
  "ned.1",                      // Eredivisie
  "por.1",                      // Primeira Liga
  "usa.1",                      // MLS
  "mex.1",                      // Liga MX
  "bra.1",                      // Brasileirão
  "arg.1",                      // Liga Profesional
];

interface EspnCompetitor {
  homeAway: string;
  score: string;
  winner: boolean;
  team: {
    abbreviation: string;
    displayName: string;
    name: string;
  };
}

async function fetchEspnLeague(slug: string, range: string): Promise<Match[]> {
  const out: Match[] = [];
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${range}&limit=300`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(9000),
      headers: { "Accept": "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return out;

    const data = await res.json();
    const events = data?.events;
    if (!Array.isArray(events)) return out;

    // Use ESPN's own league name (accurate + localized)
    const leagueName: string = data?.leagues?.[0]?.name || slug.toUpperCase();

    for (const event of events) {
      const comp = event?.competitions?.[0];
      if (!comp) continue;

      const competitors = comp?.competitors as EspnCompetitor[] | undefined;
      if (!Array.isArray(competitors) || competitors.length !== 2) continue;

      const home = competitors.find(c => c.homeAway === "home");
      const away = competitors.find(c => c.homeAway === "away");
      if (!home || !away) continue;

      const ko = new Date(event.date || comp.date || comp.startDate);
      const statusType = comp?.status?.type;
      const statusState = statusType?.state || "pre";

      let status: string;
      if (statusType?.completed) {
        status = "FINISHED";
      } else if (statusState === "in") {
        const detail = statusType?.detail || "";
        status = detail.includes("Half") ? "PAUSED" : "IN_PLAY";
      } else {
        status = "SCHEDULED";
      }

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
        if (clockMatch) elapsed = parseInt(clockMatch[1]);
        else elapsed = Math.min(90, Math.floor((Date.now() - ko.getTime()) / 60000));
      }

      // League label + stage (e.g. "FIFA World Cup — Final")
      let leagueLabel = leagueName;
      const altNote: string = comp.altGameNote || "";
      if (altNote && altNote.includes(",")) {
        const round = altNote.split(",").pop()?.trim();
        if (round && !leagueLabel.includes(round)) leagueLabel = `${leagueName} — ${round}`;
      }

      out.push({
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
  } catch (e) {
    console.warn(`ESPN fetch failed for ${slug}:`, (e as Error).message?.slice(0, 80));
  }
  return out;
}

async function fetchEspnFixtures(): Promise<Match[]> {
  // ESPN filters by US-local date, so widen the fetch window by one extra day
  // and trim precisely to yesterday..tomorrow (UTC) in getAllFixtures below.
  const from = new Date();
  from.setDate(from.getDate() - 1);
  const to = new Date();
  to.setDate(to.getDate() + 2);
  const range = `${fmt(from)}-${fmt(to)}`;

  const perLeague = await Promise.all(ESPN_LEAGUES.map(slug => fetchEspnLeague(slug, range)));
  return perLeague.flat();
}


/* ═══════════════════════════════════════════════════════════════
   football-data.org (secondary source, requires API key)
   ═══════════════════════════════════════════════════════════════ */

interface FdMatch {
  id: number; utcDate: string; status: string; matchday: number | null; venue: string | null;
  homeTeam: { name: string; tla: string }; awayTeam: { name: string; tla: string };
  competition: { name: string; code: string }; score: { fullTime: { home: number | null; away: number | null } };
}

async function fetchFootballData(): Promise<Match[]> {
  const k = process.env.FOOTBALL_DATA_API_KEY;
  if (!k) return [];

  const from = new Date();
  from.setDate(from.getDate() - 1);
  const to = new Date();
  to.setDate(to.getDate() + 1);
  const h: HeadersInit = { "X-Auth-Token": k };
  const out: Match[] = [];

  for (const c of ["PL", "PD", "BL1", "SA", "FL1", "CL", "EC", "WC"]) {
    try {
      const r = await fetch(
        `https://api.football-data.org/v4/competitions/${c}/matches?dateFrom=${from.toISOString().split("T")[0]}&dateTo=${to.toISOString().split("T")[0]}&status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED`,
        { headers: h, next: { revalidate: 120 } },
      );
      if (!r.ok) continue;
      for (const m of ((await r.json()).matches || []) as FdMatch[]) {
        const ko = new Date(m.utcDate);
        const [o1, od, o2] = odds(m.homeTeam.tla || "", m.awayTeam.tla || "");
        const sc = m.score?.fullTime?.home != null ? `${m.score.fullTime.home}-${m.score.fullTime.away}` : undefined;
        const hh = ko.getUTCHours().toString().padStart(2, "0"), mm = ko.getUTCMinutes().toString().padStart(2, "0");
        out.push({
          id: `fd-${m.id}`,
          team1: m.homeTeam.name, team2: m.awayTeam.name,
          team1Code: m.homeTeam.tla || "", team2Code: m.awayTeam.tla || "",
          league: m.competition.name, leagueCode: m.competition.code || c,
          matchday: m.matchday,
          gameDate: ko.toISOString().split("T")[0],
          kickoffTime: ko.toISOString(), kickoffLocal: `${hh}:${mm} UTC`,
          oddsTeam1: o1, oddsDraw: od, oddsTeam2: o2,
          status: m.status, score: sc,
          elapsed: m.status === "IN_PLAY" ? Math.min(90, Math.floor((Date.now() - ko.getTime()) / 60000)) : null,
          venue: m.venue || undefined,
        });
      }
    } catch { /* ignore */ }
  }
  return out;
}


/* ═══════════════════════════════════════════════════════════════
   Dedup + combine + sort (yesterday → tomorrow, live first)
   ═══════════════════════════════════════════════════════════════ */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function dedup(matches: Match[]): Match[] {
  const seen = new Map<string, Match>();
  for (const m of matches) {
    const k = `${m.gameDate}_${norm(m.team1)}_${norm(m.team2)}`;
    const ex = seen.get(k);
    if (!ex) { seen.set(k, m); continue; }
    if (m.id.startsWith("espn-")) seen.set(k, m);
    else if (m.score && !ex.score) seen.set(k, m);
  }
  return Array.from(seen.values());
}

/** Get all fixtures — yesterday's results, today's board, tomorrow's schedule */
export async function getAllFixtures(): Promise<Match[]> {
  const [espn, fd] = await Promise.all([
    fetchEspnFixtures().catch(() => []),
    fetchFootballData().catch(() => []),
  ]);

  // Precise UTC window: yesterday → tomorrow
  const y = new Date(); y.setDate(y.getDate() - 1);
  const t = new Date(); t.setDate(t.getDate() + 1);
  const fromIso = y.toISOString().split("T")[0];
  const toIso = t.toISOString().split("T")[0];
  const all = dedup([...espn, ...fd]).filter(m => m.gameDate >= fromIso && m.gameDate <= toIso);

  all.sort((a, b) => {
    // 1. Date sections: yesterday → today → tomorrow
    if (a.gameDate !== b.gameDate) return a.gameDate < b.gameDate ? -1 : 1;
    // 2. Within a day: live matches first
    const al = a.status === "IN_PLAY" || a.status === "PAUSED" ? 0 : 1;
    const bl = b.status === "IN_PLAY" || b.status === "PAUSED" ? 0 : 1;
    if (al !== bl) return al - bl;
    // 3. Then by kickoff
    return new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime();
  });

  return all;
}
