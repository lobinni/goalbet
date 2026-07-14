import { db } from "@/db";
import { bets, users, pool } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/bets/[id]/claim
 *
 * Funded payout path: transfers GEN from the pool to the winner.
 *
 * Pool bookkeeping:
 *   poolBalance -= bet.payout   (GEN leaves the pool into user's wallet)
 *
 * This is the ONLY place where GEN leaves the pool for payouts.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await request.json();
  if (!userId) return Response.json({ error: "userId is required" }, { status: 400 });

  const betRows = await db.select().from(bets)
    .where(and(eq(bets.id, id), eq(bets.userId, userId))).limit(1);
  if (betRows.length === 0)
    return Response.json({ error: "Bet not found" }, { status: 404 });

  const bet = betRows[0];

  if (!bet.hasResolved)
    return Response.json({ error: "Bet has not been resolved yet. Resolve it first." }, { status: 400 });
  if (bet.hasClaimed)
    return Response.json({ error: "Winnings already claimed" }, { status: 400 });
  if (!bet.isWon)
    return Response.json({ error: "Bet was not won, nothing to claim" }, { status: 400 });

  // ── Pool solvency guard ──────────────────────────────────────
  const poolRows = await db.select().from(pool).limit(1);
  const currentPoolBalance = poolRows.length > 0 ? Number(poolRows[0].poolBalance) : 0;
  const payoutNum = Number(bet.payout);

  if (payoutNum > currentPoolBalance) {
    // This should never happen if solvency checks are correct,
    // but guard against it anyway.
    return Response.json(
      { error: `Pool insolvent: needs ${payoutNum.toFixed(2)} GEN but only has ${currentPoolBalance.toFixed(2)} GEN. Contact admin to deposit more.` },
      { status: 503 },
    );
  }

  // ── Mark claimed (before transfer — prevents re-entrancy) ───
  await db.update(bets).set({
    hasClaimed: true, claimedAt: new Date(),
  }).where(and(eq(bets.id, id), eq(bets.userId, userId)));

  // ── Transfer payout to user ──────────────────────────────────
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (userRows.length === 0)
    return Response.json({ error: "User not found" }, { status: 404 });
  const user = userRows[0];

  const newBalance = (Number(user.balance) + payoutNum).toFixed(18);
  await db.update(users).set({
    balance: newBalance,
    totalWon: (Number(user.totalWon) + payoutNum).toFixed(18),
  }).where(eq(users.id, userId));

  // ── Deduct from pool balance ─────────────────────────────────
  if (poolRows.length > 0) {
    const newPoolBal = (currentPoolBalance - payoutNum).toFixed(18);
    await db.update(pool).set({
      poolBalance: newPoolBal,
      updatedAt: new Date(),
    }).where(eq(pool.id, "singleton"));
  }

  return Response.json({
    success: true,
    result: { payout: payoutNum.toFixed(18), newBalance },
  });
}
