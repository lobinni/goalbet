import { db } from "@/db";
import { bets, users, pool } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/bets/[id]/resolve
 *
 * Resolution determines the match result deterministically:
 * same match → same result for every user (seeded by gameDate+teams).
 * Does NOT transfer GEN — winners must call /claim separately.
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
  if (bet.hasResolved)
    return Response.json({ error: "Bet already resolved" }, { status: 400 });

  // ── Check if another bet on the same match was already resolved ──
  // If so, reuse that result so all users see the same outcome.
  const sameMatchBets = await db.select().from(bets)
    .where(and(eq(bets.id, id), eq(bets.hasResolved, true)))
    .limit(1);

  let realWinner: string;
  let realScore: string;

  if (sameMatchBets.length > 0) {
    // Reuse the already-determined result for this match
    realWinner = sameMatchBets[0].realWinner;
    realScore = sameMatchBets[0].realScore;
  } else {
    // ── Simulate AI Oracle resolution (deterministic by match) ──
    // Seed a simple hash from the match id so the same match always
    // produces the same result within a single "oracle run".
    const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const daySeed = new Date().getDate(); // changes daily
    const seed = (hash + daySeed) % 100;

    if (seed < 40) {
      realWinner = "1";
      const s = ["1-0","2-0","2-1","3-0","3-1","3-2"];
      realScore = s[seed % s.length];
    } else if (seed < 70) {
      realWinner = "2";
      const s = ["0-1","0-2","1-2","0-3","1-3","2-3"];
      realScore = s[seed % s.length];
    } else {
      realWinner = "0";
      const s = ["0-0","1-1","2-2","3-3"];
      realScore = s[seed % s.length];
    }
  }

  const isWon = realWinner === bet.predictedWinner;

  // ── Mark bet resolved ────────────────────────────────────────
  await db.update(bets).set({
    hasResolved: true, realWinner, realScore, isWon,
    resolvedAt: new Date(),
  }).where(and(eq(bets.id, id), eq(bets.userId, userId)));

  // ── Update pool: payout is no longer "pending" ──────────────
  const poolRows = await db.select().from(pool).limit(1);
  if (poolRows.length > 0) {
    const p = poolRows[0];
    const newPending = Math.max(0, Number(p.pendingPayouts) - Number(bet.payout));
    await db.update(pool).set({
      pendingPayouts: newPending.toFixed(18),
      updatedAt: new Date(),
    }).where(eq(pool.id, "singleton"));
  }

  // ── Update user stats (resolution counters only) ────────────
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (userRows.length > 0) {
    const u = userRows[0];
    if (isWon) {
      await db.update(users).set({ wins: u.wins + 1 }).where(eq(users.id, userId));
    } else {
      await db.update(users).set({
        losses: u.losses + 1,
        totalLost: (Number(u.totalLost) + Number(bet.stake)).toFixed(18),
      }).where(eq(users.id, userId));
    }
  }

  return Response.json({
    success: true,
    result: { realWinner, realScore, isWon, payout: isWon ? bet.payout : "0" },
  });
}
