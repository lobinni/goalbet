import { db } from "@/db";
import { markets } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

/**
 * POST /api/seed-test — creates markets for World Cup 2026 matches (no fake data)
 */
export async function POST() {
  try {
    const wcMarkets = [
      {
        id: "wc2026-3rd-fra-eng",
        gameDate: "2026-07-18", team1: "France", team2: "England",
        team1Code: "FRA", team2Code: "ENG",
        league: "FIFA World Cup 2026 — Third Place",
        kickoffTime: "2026-07-18T21:00:00Z",
      },
      {
        id: "wc2026-final-esp-arg",
        gameDate: "2026-07-19", team1: "Spain", team2: "Argentina",
        team1Code: "ESP", team2Code: "ARG",
        league: "FIFA World Cup 2026 — Final",
        kickoffTime: "2026-07-19T19:00:00Z",
      },
    ];

    for (const m of wcMarkets) {
      const exists = await db.select().from(markets).where(eq(markets.id, m.id)).limit(1);
      if (!exists.length) {
        await db.insert(markets).values({
          id: m.id, gameDate: m.gameDate, team1: m.team1, team2: m.team2,
          team1Code: m.team1Code, team2Code: m.team2Code,
          league: m.league, kickoffTime: m.kickoffTime,
        });
      }
    }

    const allMarkets = await db.select().from(markets);

    return Response.json({
      success: true,
      message: "World Cup 2026 markets ready",
      markets: allMarkets.map(m => ({
        id: m.id,
        match: `${m.team1} vs ${m.team2}`,
        status: m.isResolved ? `✅ Resolved: ${m.finalScore}` : "⏳ Pending",
        pool: `${m.totalPool} USDC`,
      })),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
