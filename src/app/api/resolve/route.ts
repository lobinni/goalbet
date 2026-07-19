import { db } from "@/db";
import { markets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { glCreateMarket, glResolveMarket, glGetMarket, EXPLORER_TX } from "@/lib/genlayer";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/resolve
 *
 * Multi-source resolution:
 *  1. Try GenLayer AI Oracle (BBC Sport) 
 *  2. If fails, try ESPN API
 *  3. If fails, try football-data.org
 */
export async function POST(req: Request) {
  const { marketId } = await req.json();
  if (!marketId) return Response.json({ error: "marketId required" }, { status: 400 });

  const rows = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!rows.length) return Response.json({ error: "Market not found" }, { status: 404 });
  const market = rows[0];

  if (market.isResolved) {
    return Response.json({
      success: true, alreadyResolved: true,
      winner: market.winningOutcome, score: market.finalScore,
    });
  }

  // ── Source 1: Try GenLayer AI Oracle ──
  let glResult: { winner: number; score: string } | null = null;
  let glTxHash: string | null = null;

  try {
    if (!market.onChainCreated) {
      try { await glCreateMarket(marketId, market.gameDate, market.team1, market.team2); } catch {}
      await db.update(markets).set({ onChainCreated: true }).where(eq(markets.id, marketId));
    }

    glTxHash = await glResolveMarket(marketId);
    const onChain = await glGetMarket(marketId);
    if (onChain?.resolved && onChain.winner !== -1) {
      glResult = { winner: onChain.winner, score: onChain.score || "" };
    }
  } catch (e) {
    console.warn("GenLayer resolve failed, trying fallback:", (e as Error).message?.slice(0, 100));
  }

  // ── Source 2: Try ESPN / web scraping ──
  if (!glResult) {
    try {
      glResult = await fetchResultFromWeb(market.team1, market.team2, market.gameDate);
    } catch (e) {
      console.warn("Web scrape failed:", (e as Error).message?.slice(0, 100));
    }
  }

  // ── Source 3: Try football-data.org API ──
  if (!glResult) {
    try {
      glResult = await fetchResultFromFootballData(market.team1, market.team2, market.gameDate);
    } catch (e) {
      console.warn("football-data.org failed:", (e as Error).message?.slice(0, 100));
    }
  }

  if (glResult && glResult.winner !== -1) {
    await db.update(markets).set({
      isResolved: true,
      winningOutcome: glResult.winner,
      finalScore: glResult.score,
      resolvedAt: new Date(),
    }).where(eq(markets.id, marketId));

    return Response.json({
      success: true, txHash: glTxHash,
      explorerUrl: glTxHash ? EXPLORER_TX + glTxHash : null,
      winner: glResult.winner, score: glResult.score,
    });
  }

  return Response.json({ error: "Could not resolve. Match may not have finished yet." }, { status: 400 });
}

/** Fetch result from multiple web sources */
async function fetchResultFromWeb(team1: string, team2: string, gameDate: string) {
  // Try Google search for quick score
  const searchUrls = [
    `https://www.google.com/search?q=${encodeURIComponent(`${team1} vs ${team2} ${gameDate} score result`)}`,
    `https://www.espn.com/soccer/scoreboard/_/date/${gameDate.replace(/-/g, "")}`,
  ];

  for (const url of searchUrls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GoalBet/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const text = await res.text();

      // Simple pattern matching for score
      const t1 = team1.split(" ").pop() || team1; // last word (e.g., "England" from "England")
      const t2 = team2.split(" ").pop() || team2;

      // Look for patterns like "France 4-6 England" or "4 - 6"
      const patterns = [
        new RegExp(`${t1}\\s*(\\d+)\\s*[-–]\\s*(\\d+)\\s*${t2}`, "i"),
        new RegExp(`${t2}\\s*(\\d+)\\s*[-–]\\s*(\\d+)\\s*${t1}`, "i"),
        new RegExp(`(\\d+)\\s*[-–]\\s*(\\d+).*?(?:${t1}|${t2})`, "i"),
      ];

      for (const pat of patterns) {
        const match = text.match(pat);
        if (match) {
          let g1 = parseInt(match[1]);
          let g2 = parseInt(match[2]);

          // If pattern matched team2 first, swap
          if (pat.source.startsWith(t2)) { [g1, g2] = [g2, g1]; }

          const winner = g1 > g2 ? 1 : g2 > g1 ? 2 : 0;
          return { winner, score: `${g1}-${g2}` };
        }
      }
    } catch { continue; }
  }
  return null;
}

/** Fetch result from football-data.org */
async function fetchResultFromFootballData(team1: string, team2: string, gameDate: string) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${gameDate}&dateTo=${gameDate}&status=FINISHED`,
      { headers: { "X-Auth-Token": apiKey }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();

    for (const m of data.matches || []) {
      const home = (m.homeTeam?.name || "").toLowerCase();
      const away = (m.awayTeam?.name || "").toLowerCase();
      const t1 = team1.toLowerCase();
      const t2 = team2.toLowerCase();

      if ((home.includes(t1) || t1.includes(home)) && (away.includes(t2) || t2.includes(away))) {
        const g1 = m.score?.fullTime?.home;
        const g2 = m.score?.fullTime?.away;
        if (g1 !== null && g2 !== null) {
          return { winner: g1 > g2 ? 1 : g2 > g1 ? 2 : 0, score: `${g1}-${g2}` };
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}
