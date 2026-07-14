import { db } from "@/db";
import { bets, users, pool } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

// ── GET: list bets for a user ────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId is required" }, { status: 400 });

  const userBets = await db.select().from(bets).where(eq(bets.userId, userId));
  return Response.json({ bets: userBets });
}

// ── POST: place a bet (solvency-checked, odds-constrained) ──────
export async function POST(request: Request) {
  const body = await request.json();
  const { userId, gameDate, team1, team2, team1Code, team2Code, league, predictedWinner, stake, odds } = body;

  if (!userId || !gameDate || !team1 || !team2 || !predictedWinner || !stake || !odds)
    return Response.json({ error: "Missing required fields" }, { status: 400 });

  const stakeNum = Number(stake);
  if (isNaN(stakeNum) || stakeNum < 1)
    return Response.json({ error: "Minimum stake is 1 GEN" }, { status: 400 });

  const oddsNum = Number(odds);
  if (oddsNum <= 1.0)
    return Response.json({ error: "Odds must be greater than 1.00x" }, { status: 400 });

  // ── User balance check ──────────────────────────────────────
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (userRows.length === 0)
    return Response.json({ error: "User not found" }, { status: 404 });
  const user = userRows[0];
  if (stakeNum > Number(user.balance))
    return Response.json({ error: "Insufficient GEN balance" }, { status: 400 });

  // ── Duplicate check ─────────────────────────────────────────
  const betId = `${gameDate}_${team1}_${team2}`.toLowerCase().replace(/ /g, "-");
  const existing = await db.select().from(bets)
    .where(and(eq(bets.userId, userId), eq(bets.id, betId))).limit(1);
  if (existing.length > 0)
    return Response.json({ error: "Bet already exists for this match" }, { status: 400 });

  // ── Solvency check ──────────────────────────────────────────
  // Pool must be able to back every pending payout + this new one.
  //   invariant:  pendingPayouts ≤ poolBalance
  const poolRows = await db.select().from(pool).limit(1);
  const p = poolRows.length > 0 ? poolRows[0] : null;
  const poolBalance = p ? Number(p.poolBalance) : 1000;   // default seed
  const pendingPayouts = p ? Number(p.pendingPayouts) : 0;

  const newPending = pendingPayouts + stakeNum * oddsNum;
  const newPoolBal = poolBalance + stakeNum;   // stake enters pool

  if (newPending > newPoolBal) {
    // ── Constrain odds to what the pool can back ────────────
    const maxPayout = newPoolBal - pendingPayouts;
    const maxOdds = Math.max(1, maxPayout / stakeNum);
    return Response.json(
      {
        error:
          `Insufficient pool liquidity for ${oddsNum}× odds. ` +
          `Max odds backed by pool: ${maxOdds.toFixed(2)}× ` +
          `(pool ${newPoolBal.toFixed(2)} GEN, pending ${pendingPayouts.toFixed(2)} GEN). ` +
          `Deposit more GEN or lower your odds.`,
      },
      { status: 400 },
    );
  }

  const payout = (stakeNum * oddsNum).toFixed(18);

  // ── Deduct from user ────────────────────────────────────────
  const newBalance = (Number(user.balance) - stakeNum).toFixed(18);
  await db.update(users).set({ balance: newBalance }).where(eq(users.id, userId));

  // ── Create bet ──────────────────────────────────────────────
  await db.insert(bets).values({
    id: betId, userId, gameDate, team1, team2,
    team1Code: team1Code || null, team2Code: team2Code || null,
    league: league || null, predictedWinner,
    stake: stakeNum.toFixed(18), odds: oddsNum.toFixed(2), payout,
    hasResolved: false, hasClaimed: false, isWon: false,
    realWinner: "", realScore: "",
  });

  // ── Update user stats ───────────────────────────────────────
  await db.update(users).set({
    totalBets: user.totalBets + 1,
    totalStaked: (Number(user.totalStaked) + stakeNum).toFixed(18),
  }).where(eq(users.id, userId));

  // ── Update pool ─────────────────────────────────────────────
  if (p) {
    await db.update(pool).set({
      poolBalance: newPoolBal.toFixed(18),
      pendingPayouts: newPending.toFixed(18),
      updatedAt: new Date(),
    }).where(eq(pool.id, "singleton"));
  } else {
    await db.insert(pool).values({
      id: "singleton",
      poolBalance: newPoolBal.toFixed(18),
      pendingPayouts: newPending.toFixed(18),
    });
  }

  return Response.json({
    success: true, betId,
    message: `Bet ${stakeNum} GEN placed! 🎯`,
    poolLiquidity: (newPoolBal - newPending).toFixed(2),
  });
}
