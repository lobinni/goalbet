import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select({
    username: users.username, address: users.walletAddress,
    totalWon: users.totalWon, totalStaked: users.totalStaked,
    wins: users.wins, losses: users.losses, totalBets: users.totalBets,
  }).from(users)
    .where(sql`${users.totalBets} > 0`)
    .orderBy(desc(users.totalWon))
    .limit(50);

  return Response.json({
    leaderboard: rows.map((r) => ({
      ...r,
      profit: (Number(r.totalWon) - Number(r.totalStaked)).toFixed(2),
    })),
  });
}
