import { db } from "@/db";
import { bets, markets, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
export const dynamic = "force-dynamic";

/** Claim winnings after market is resolved */
export async function POST(req: Request) {
  const { betId, userId } = await req.json();
  if (!betId || !userId) return Response.json({ error: "missing fields" }, { status: 400 });

  const b = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
  if (!b.length) return Response.json({ error: "bet not found" }, { status: 404 });
  const bet = b[0];
  if (bet.userId !== userId) return Response.json({ error: "not your bet" }, { status: 403 });
  if (bet.claimed) return Response.json({ error: "already claimed" }, { status: 400 });

  const m = await db.select().from(markets).where(eq(markets.id, bet.marketId)).limit(1);
  if (!m.length) return Response.json({ error: "market not found" }, { status: 404 });
  if (!m[0].isResolved) return Response.json({ error: "market not resolved" }, { status: 400 });

  const mkt = m[0];
  const isWon = bet.outcome === mkt.winningOutcome;

  let payout = 0;
  if (isWon) {
    const wp = mkt.winningOutcome === 1 ? Number(mkt.poolHome)
             : mkt.winningOutcome === 0 ? Number(mkt.poolDraw)
             : Number(mkt.poolAway);
    if (wp > 0) {
      payout = (Number(bet.amount) * Number(mkt.totalPool)) / wp;
      payout = Math.floor(payout * 1e6) / 1e6; // round to 6 decimals
    }
  }

  // update bet
  await db.update(bets).set({
    isWon, payout: payout.toFixed(6), claimed: true, claimedAt: new Date(),
  }).where(eq(bets.id, betId));

  // credit user
  if (payout > 0) {
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (u.length) {
      await db.update(users).set({
        balance: (Number(u[0].balance) + payout).toFixed(6),
        totalWon: (Number(u[0].totalWon) + payout).toFixed(6),
        wins: u[0].wins + 1,
      }).where(eq(users.id, userId));
    }
  } else {
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (u.length) {
      await db.update(users).set({ losses: u[0].losses + 1 }).where(eq(users.id, userId));
    }
  }

  return Response.json({ success: true, isWon, payout: payout.toFixed(6) });
}
