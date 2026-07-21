import { db } from "@/db";
import { markets } from "@/db/schema";
import { ensureTables } from "@/db/ensure-tables";
import { desc, eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureTables();
    const rows = await db.select().from(markets).orderBy(desc(markets.createdAt));
    return Response.json({ markets: rows });
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    console.error("GET /api/markets error:", msg);
    return Response.json({ error: msg, markets: [] }, { status: 500 });
  }
}

/** Upsert a market from fixtures */
export async function POST(req: Request) {
  try {
    await ensureTables();

    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: "Invalid request body" }, { status: 400 });

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
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    console.error("POST /api/markets error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
