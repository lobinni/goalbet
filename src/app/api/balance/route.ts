import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (userRows.length === 0) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const user = userRows[0];
  return Response.json({
    balance: Number(user.balance),
    totalBets: user.totalBets,
    totalStaked: Number(user.totalStaked),
    totalWon: Number(user.totalWon),
    totalLost: Number(user.totalLost),
    wins: user.wins,
    losses: user.losses,
  });
}
