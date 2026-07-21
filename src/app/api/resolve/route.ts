import { db } from "@/db";
import { markets } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/resolve
 *
 * Resolution priority:
 *  1. ESPN public JSON API (most reliable, no auth, structured data)
 *  2. football-data.org API (if API key set)
 *  3. GenLayer AI Oracle (can be slow/flaky)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: "Invalid request body" }, { status: 400 });

    const { marketId, fast } = body;
    if (!marketId) return Response.json({ error: "marketId required" }, { status: 400 });

    const rows = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
    if (!rows.length) return Response.json({ error: "Market not found" }, { status: 404 });
    const market = rows[0];

    if (market.isResolved) {
      return Response.json({
        success: true, alreadyResolved: true,
        winner: market.winningOutcome, score: market.finalScore,
        source: "cache",
      });
    }

    // ── Source 1: ESPN Public JSON API (primary — most reliable) ──
    let result: { winner: number; score: string; source: string } | null = null;

    try {
      result = await fetchFromEspnApi(market.team1, market.team2, market.gameDate);
    } catch (e) {
      console.warn("ESPN API failed:", (e as Error).message?.slice(0, 200));
    }

    // ── Source 2: football-data.org (if API key available) ──
    if (!result) {
      try {
        result = await fetchFromFootballDataOrg(market.team1, market.team2, market.gameDate);
      } catch (e) {
        console.warn("football-data.org failed:", (e as Error).message?.slice(0, 200));
      }
    }

    // ── Source 3: GenLayer AI Oracle (slow, can fail) — skipped in fast mode
    //    (fast = background auto-resolve of matches the user didn't bet on) ──
    if (!result && !fast) {
      try {
        result = await fetchFromGenLayer(marketId, market);
      } catch (e) {
        console.warn("GenLayer failed:", (e as Error).message?.slice(0, 200));
      }
    }

    if (result && result.winner !== -1) {
      await db.update(markets).set({
        isResolved: true,
        winningOutcome: result.winner,
        finalScore: result.score,
        resolvedAt: new Date(),
      }).where(eq(markets.id, marketId));

      return Response.json({
        success: true,
        winner: result.winner,
        score: result.score,
        source: result.source,
      });
    }

    return Response.json({
      success: false,
      error: "Could not resolve. Match may not have finished yet.",
    }, { status: 400 });

  } catch (e) {
    console.error("POST /api/resolve top-level error:", e);
    return Response.json({
      success: false,
      error: "Internal server error while resolving market",
    }, { status: 500 });
  }
}


/* ═══════════════════════════════════════════════════════════════
   Source 1: ESPN Public JSON API
   No auth required, structured JSON, very reliable
   ═══════════════════════════════════════════════════════════════ */

// Map of ESPN league slugs to search for matches
const ESPN_LEAGUES = [
  "fifa.world",       // FIFA World Cup
  "eng.1",            // Premier League
  "esp.1",            // La Liga
  "ger.1",            // Bundesliga
  "ita.1",            // Serie A
  "fra.1",            // Ligue 1
  "uefa.champions",   // Champions League
  "uefa.europa",      // Europa League
];

async function fetchFromEspnApi(
  team1: string,
  team2: string,
  gameDate: string,
): Promise<{ winner: number; score: string; source: string } | null> {
  const dateStr = gameDate.replace(/-/g, "");

  for (const league of ESPN_LEAGUES) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dateStr}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const events = data?.events;
      if (!Array.isArray(events)) continue;

      for (const event of events) {
        const comp = event?.competitions?.[0];
        if (!comp) continue;

        // Check if match is completed
        const status = comp?.status?.type;
        if (!status?.completed) continue;

        const competitors = comp?.competitors;
        if (!Array.isArray(competitors) || competitors.length !== 2) continue;

        const home = competitors.find((c: { homeAway: string }) => c.homeAway === "home");
        const away = competitors.find((c: { homeAway: string }) => c.homeAway === "away");
        if (!home || !away) continue;

        const homeName = (home.team?.displayName || home.team?.name || "").toLowerCase();
        const awayName = (away.team?.displayName || away.team?.name || "").toLowerCase();
        const homeAbbr = (home.team?.abbreviation || "").toLowerCase();
        const awayAbbr = (away.team?.abbreviation || "").toLowerCase();

        const t1 = team1.toLowerCase();
        const t2 = team2.toLowerCase();

        // Match by team name or abbreviation
        const t1IsHome = homeName.includes(t1) || t1.includes(homeName) ||
                         homeAbbr === t1.slice(0, 3).toLowerCase();
        const t2IsAway = awayName.includes(t2) || t2.includes(awayName) ||
                         awayAbbr === t2.slice(0, 3).toLowerCase();
        const t1IsAway = awayName.includes(t1) || t1.includes(awayName) ||
                         awayAbbr === t1.slice(0, 3).toLowerCase();
        const t2IsHome = homeName.includes(t2) || t2.includes(homeName) ||
                         homeAbbr === t2.slice(0, 3).toLowerCase();

        let g1: number, g2: number;

        if (t1IsHome && t2IsAway) {
          // team1 = home, team2 = away
          g1 = parseInt(home.score) || 0;
          g2 = parseInt(away.score) || 0;
        } else if (t1IsAway && t2IsHome) {
          // team1 = away, team2 = home → swap
          g1 = parseInt(away.score) || 0;
          g2 = parseInt(home.score) || 0;
        } else {
          continue; // not our match
        }

        const winner = g1 > g2 ? 1 : g2 > g1 ? 2 : 0;
        const statusDetail = status.detail || status.shortDetail || "FT";
        const scoreStr = statusDetail === "AET" || statusDetail === "FT - Pens"
          ? `${g1}-${g2} (${statusDetail})`
          : `${g1}-${g2}`;

        return { winner, score: scoreStr, source: `espn:${league}` };
      }
    } catch {
      continue;
    }
  }

  return null;
}


/* ═══════════════════════════════════════════════════════════════
   Source 2: football-data.org (requires API key)
   ═══════════════════════════════════════════════════════════════ */

async function fetchFromFootballDataOrg(
  team1: string,
  team2: string,
  gameDate: string,
): Promise<{ winner: number; score: string; source: string } | null> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${gameDate}&dateTo=${gameDate}&status=FINISHED`,
      {
        headers: { "X-Auth-Token": apiKey },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();

    for (const m of data.matches || []) {
      const home = (m.homeTeam?.name || "").toLowerCase();
      const away = (m.awayTeam?.name || "").toLowerCase();
      const t1Low = team1.toLowerCase();
      const t2Low = team2.toLowerCase();

      if (
        (home.includes(t1Low) || t1Low.includes(home)) &&
        (away.includes(t2Low) || t2Low.includes(away))
      ) {
        const g1 = m.score?.fullTime?.home;
        const g2 = m.score?.fullTime?.away;
        if (g1 !== null && g2 !== null) {
          return {
            winner: g1 > g2 ? 1 : g2 > g1 ? 2 : 0,
            score: `${g1}-${g2}`,
            source: "football-data.org",
          };
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}


/* ═══════════════════════════════════════════════════════════════
   Source 3: GenLayer AI Oracle (fallback — can be slow/flaky)
   ═══════════════════════════════════════════════════════════════ */

async function fetchFromGenLayer(
  marketId: string,
  market: { gameDate: string; team1: string; team2: string; league: string; onChainCreated: boolean },
): Promise<{ winner: number; score: string; source: string } | null> {
  // Lazy import to avoid crashing if genlayer-js has issues
  let glCreateMarket, glResolveMarket, glGetMarket, leagueToEspnSlug, EXPLORER_TX: string;
  try {
    const mod = await import("@/lib/genlayer");
    glCreateMarket = mod.glCreateMarket;
    glResolveMarket = mod.glResolveMarket;
    glGetMarket = mod.glGetMarket;
    leagueToEspnSlug = mod.leagueToEspnSlug;
    EXPLORER_TX = mod.EXPLORER_TX;
  } catch {
    console.warn("Could not import genlayer module");
    return null;
  }

  try {
    const leagueSlug = leagueToEspnSlug(market.league || "");

    if (!market.onChainCreated) {
      try {
        await glCreateMarket(marketId, market.gameDate, market.team1, market.team2, leagueSlug);
      } catch (e) {
        console.warn("glCreateMarket failed:", (e as Error).message?.slice(0, 100));
      }
      await db.update(markets).set({ onChainCreated: true }).where(eq(markets.id, marketId));
    }

    const txHash = await glResolveMarket(marketId);
    const onChain = await glGetMarket(marketId);
    if (onChain?.resolved && Number(onChain.winner) !== -1) {
      return {
        winner: Number(onChain.winner),
        score: String(onChain.score || ""),
        source: `genlayer:${EXPLORER_TX}${txHash}`,
      };
    }
  } catch (e) {
    console.warn("GenLayer resolve call failed:", (e as Error).message?.slice(0, 200));
  }

  return null;
}
