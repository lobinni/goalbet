import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureTables } from "@/db/ensure-tables";
import { desc, sql } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureTables();

    const rows = await db.select({
      address: users.walletAddress,
      totalWon: users.totalWon, totalStaked: users.totalStaked,
      wins: users.wins, losses: users.losses, totalBets: users.totalBets,
    }).from(users)
      .where(sql`${users.totalBets} > 0`)
      .orderBy(desc(users.totalWon))
      .limit(50);

    return Response.json({
      leaderboard: rows.map(r => ({
        ...r, profit: (Number(r.totalWon) - Number(r.totalStaked)).toFixed(2),
      })),
    });
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    console.error("GET /api/leaderboard error:", msg);
    return Response.json({ leaderboard: [] }, { status: 500 });
  }
}
