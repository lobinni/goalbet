import { db } from "@/db";
import { bets, markets, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { glCreateMarket, glRecordBet } from "@/lib/genlayer";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = new URL(req.url).searchParams.get("userId");
  if (!uid) return Response.json({ error: "userId required" }, { status: 400 });
  return Response.json({
    bets: await db.select().from(bets).where(eq(bets.userId, uid)).orderBy(desc(bets.createdAt)),
  });
}

/**
 * POST /api/bets — Place a bet
 *
 * Frontend sends USDC tx hash (user already sent USDC to pool wallet via MetaMask).
 * Server records bet + updates pool.
 */
export async function POST(req: Request) {
  const { userId, marketId, outcome, amount, txHash } = await req.json();
  if (!userId || !marketId || outcome === undefined || !amount)
    return Response.json({ error: "missing fields" }, { status: 400 });

  const amt = Number(amount);
  if (amt < 1) return Response.json({ error: "Min bet is 1 USDC" }, { status: 400 });

  const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u.length) return Response.json({ error: "User not found" }, { status: 404 });

  const m = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!m.length) return Response.json({ error: "Market not found" }, { status: 404 });
  if (m[0].isResolved) return Response.json({ error: "Market resolved" }, { status: 400 });

  const mkt = m[0];
  const oc = Number(outcome);

  // Update user stats
  await db.update(users).set({
    totalBets: u[0].totalBets + 1,
    totalStaked: (Number(u[0].totalStaked) + amt).toFixed(6),
  }).where(eq(users.id, userId));

  // Credit pool
  const poolField = oc === 1 ? "poolHome" : oc === 0 ? "poolDraw" : "poolAway";
  await db.update(markets).set({
    [poolField]: (Number(mkt[poolField]) + amt).toFixed(6),
    totalPool: (Number(mkt.totalPool) + amt).toFixed(6),
    totalBets: mkt.totalBets + 1,
  }).where(eq(markets.id, marketId));

  // Save bet with tx hash
  const bet = await db.insert(bets).values({
    marketId, userId, outcome: oc, amount: amt.toFixed(6), txHash: txHash || null,
  }).returning();

  // Fire-and-forget GenLayer record
  if (!mkt.onChainCreated) {
    glCreateMarket(marketId, mkt.gameDate, mkt.team1, mkt.team2)
      .then(() => db.update(markets).set({ onChainCreated: true }).where(eq(markets.id, marketId)))
      .catch(() => {});
  }
  glRecordBet(marketId, userId, oc, Math.round(amt * 1e6)).catch(() => {});

  // Return updated odds
  const updated = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  const mp = updated[0];
  const t = Number(mp.totalPool);

  return Response.json({
    success: true, bet: bet[0],
    odds: {
      home: t && Number(mp.poolHome) > 0 ? +(t / Number(mp.poolHome)).toFixed(2) : 2,
      draw: t && Number(mp.poolDraw) > 0 ? +(t / Number(mp.poolDraw)).toFixed(2) : 3,
      away: t && Number(mp.poolAway) > 0 ? +(t / Number(mp.poolAway)).toFixed(2) : 2,
    },
  });
}
