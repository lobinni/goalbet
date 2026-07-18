import { db } from "@/db";
import { bets, markets, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { glCreateMarket, glRecordBet } from "@/lib/genlayer";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = new URL(req.url).searchParams.get("userId");
  if (!uid) return Response.json({ error: "userId required" }, { status: 400 });
  const rows = await db.select().from(bets).where(eq(bets.userId, uid)).orderBy(desc(bets.createdAt));
  return Response.json({ bets: rows });
}

/**
 * POST /api/bets — Place a bet
 *
 * 1. Validate user balance + market status
 * 2. Deduct USDC from user balance (PostgreSQL)
 * 3. Credit market pool (PostgreSQL)
 * 4. Save bet in database
 * 5. Fire-and-forget: record on GenLayer (non-blocking background)
 */
export async function POST(req: Request) {
  const { userId, marketId, outcome, amount } = await req.json();
  if (!userId || !marketId || outcome === undefined || !amount)
    return Response.json({ error: "missing fields" }, { status: 400 });

  const amt = Number(amount);
  if (amt < 1) return Response.json({ error: "Min bet is 1 USDC" }, { status: 400 });
  if (![0, 1, 2].includes(Number(outcome)))
    return Response.json({ error: "outcome must be 0, 1, or 2" }, { status: 400 });

  // Validate user
  const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u.length) return Response.json({ error: "User not found" }, { status: 404 });
  if (Number(u[0].balance) < amt)
    return Response.json({ error: "Insufficient balance. Deposit more USDC." }, { status: 400 });

  // Validate market
  const m = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!m.length) return Response.json({ error: "Market not found" }, { status: 404 });
  if (m[0].isResolved) return Response.json({ error: "Market already resolved" }, { status: 400 });

  const mkt = m[0];
  const oc = Number(outcome);

  // 1. Deduct balance
  await db.update(users).set({
    balance: (Number(u[0].balance) - amt).toFixed(6),
    totalBets: u[0].totalBets + 1,
    totalStaked: (Number(u[0].totalStaked) + amt).toFixed(6),
  }).where(eq(users.id, userId));

  // 2. Credit pool
  const poolField = oc === 1 ? "poolHome" : oc === 0 ? "poolDraw" : "poolAway";
  await db.update(markets).set({
    [poolField]: (Number(mkt[poolField]) + amt).toFixed(6),
    totalPool: (Number(mkt.totalPool) + amt).toFixed(6),
    totalBets: mkt.totalBets + 1,
  }).where(eq(markets.id, marketId));

  // 3. Save bet in DB
  const bet = await db.insert(bets).values({
    marketId, userId, outcome: oc, amount: amt.toFixed(6),
  }).returning();

  // 4. Fire-and-forget GenLayer recording (don't wait)
  if (!mkt.onChainCreated) {
    glCreateMarket(marketId, mkt.gameDate, mkt.team1, mkt.team2)
      .then(() => db.update(markets).set({ onChainCreated: true }).where(eq(markets.id, marketId)))
      .catch(() => {});
  }
  glRecordBet(marketId, userId, oc, Math.round(amt * 1e6)).catch(() => {});

  // 5. Return updated odds
  const updated = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  const mp = updated[0];
  const t = Number(mp.totalPool);

  return Response.json({
    success: true,
    bet: bet[0],
    pools: { home: mp.poolHome, draw: mp.poolDraw, away: mp.poolAway, total: mp.totalPool },
    odds: {
      home: t && Number(mp.poolHome) > 0 ? +(t / Number(mp.poolHome)).toFixed(2) : 2,
      draw: t && Number(mp.poolDraw) > 0 ? +(t / Number(mp.poolDraw)).toFixed(2) : 3,
      away: t && Number(mp.poolAway) > 0 ? +(t / Number(mp.poolAway)).toFixed(2) : 2,
    },
  });
}
