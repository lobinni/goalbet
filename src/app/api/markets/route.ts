import { db } from "@/db";
import { markets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(markets).orderBy(desc(markets.createdAt));
  return Response.json({ markets: rows });
}

/** Upsert a market from fixtures */
export async function POST(req: Request) {
  const body = await req.json();
  const { id, gameDate, team1, team2, team1Code, team2Code, league, kickoffTime } = body;
  if (!id || !gameDate || !team1 || !team2)
    return Response.json({ error: "missing fields" }, { status: 400 });

  const exists = await db.select().from(markets).where(eq(markets.id, id)).limit(1);
  if (exists.length) return Response.json({ market: exists[0] });

  const row = await db.insert(markets).values({
    id, gameDate, team1, team2,
    team1Code: team1Code || "", team2Code: team2Code || "",
    league: league || "", kickoffTime: kickoffTime || null,
  }).returning();
  return Response.json({ market: row[0] });
}
