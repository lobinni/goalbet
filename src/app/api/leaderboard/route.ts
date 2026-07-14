import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const leaderboard = await db
    .select({
      id: users.id,
      address: users.address,
      name: users.name,
      totalWon: users.totalWon,
      totalStaked: users.totalStaked,
      totalLost: users.totalLost,
      wins: users.wins,
      losses: users.losses,
      totalBets: users.totalBets,
    })
    .from(users)
    .where(sql`${users.totalBets} > 0`)
    .orderBy(desc(users.totalWon));

  const entries = leaderboard.map((entry) => {
    const totalWon = Number(entry.totalWon);
    const totalStaked = Number(entry.totalStaked);
    const totalLost = Number(entry.totalLost);
    const profit = totalWon - totalLost;
    const winRate = entry.totalBets > 0 ? Math.round((entry.wins / entry.totalBets) * 100) : 0;

    return {
      ...entry,
      totalWon,
      totalStaked,
      totalLost,
      profit,
      winRate,
    };
  });

  return Response.json({ leaderboard: entries });
}
