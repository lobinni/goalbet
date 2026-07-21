import { db } from "@/db";
import { bets, markets, users } from "@/db/schema";
import { ensureTables } from "@/db/ensure-tables";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureTables();

    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: "Invalid request body" }, { status: 400 });

    const { betId, userId } = body;
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
      if (wp > 0) payout = Math.floor((Number(bet.amount) * Number(mkt.totalPool)) / wp * 1e6) / 1e6;
    }

    await db.update(bets).set({
      isWon, payout: payout.toFixed(6), claimed: true, claimedAt: new Date(),
    }).where(eq(bets.id, betId));

    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (u.length) {
      if (isWon) {
        await db.update(users).set({
          totalWon: (Number(u[0].totalWon) + payout).toFixed(6),
          wins: u[0].wins + 1,
        }).where(eq(users.id, userId));
      } else {
        await db.update(users).set({ losses: u[0].losses + 1 }).where(eq(users.id, userId));
      }
    }

    return Response.json({ success: true, isWon, payout: payout.toFixed(6) });
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    console.error("POST /api/bets/claim error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
