import { db } from "@/db";
import { bets, markets, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const uid = new URL(req.url).searchParams.get("userId");
    if (!uid) return Response.json({ error: "userId required" }, { status: 400 });
    return Response.json({
      bets: await db.select().from(bets).where(eq(bets.userId, uid)).orderBy(desc(bets.createdAt)),
    });
  } catch (e) {
    console.error("GET /api/bets error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/bets — Place a bet
 *
 * Frontend sends USDC tx hash (user already sent USDC to pool wallet via MetaMask).
 * Server records bet + updates pool.
 *
 * GenLayer on-chain recording is done best-effort after the response.
 * On Vercel serverless, fire-and-forget promises get killed, so we
 * skip GenLayer recording here and let /api/resolve handle on-chain state.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, marketId, outcome, amount, txHash } = body;
    if (!userId || !marketId || outcome === undefined || !amount)
      return Response.json({ error: "missing fields" }, { status: 400 });

    const amt = Number(amount);
    if (isNaN(amt) || amt < 1) return Response.json({ error: "Min bet is 1 USDC" }, { status: 400 });

    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u.length) return Response.json({ error: "User not found" }, { status: 404 });

    const m = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
    if (!m.length) return Response.json({ error: "Market not found" }, { status: 404 });
    if (m[0].isResolved) return Response.json({ error: "Market resolved" }, { status: 400 });

    const mkt = m[0];

    // Server-side kickoff lock: no bets once the match has started
    if (mkt.kickoffTime) {
      const ko = new Date(mkt.kickoffTime).getTime();
      if (!isNaN(ko) && Date.now() >= ko) {
        return Response.json({ error: "Kickoff has passed — betting is closed" }, { status: 400 });
      }
    }

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

    // NOTE: GenLayer on-chain recording (glCreateMarket, glRecordBet) is intentionally
    // skipped here. On Vercel serverless, fire-and-forget promises get killed after
    // the response is sent. The /api/resolve endpoint handles on-chain creation
    // when the market needs to be resolved.

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
  } catch (e) {
    console.error("POST /api/bets error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
