import { db } from "@/db";
import { users, markets, bets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ethers } from "ethers";
export const dynamic = "force-dynamic";

/**
 * POST /api/seed-test
 *
 * Seeds World Cup 2026 markets + test users with bets
 * for end-to-end testing of the full GoalBet flow.
 */
export async function POST() {
  try {
    // Clean previous test data
    await db.delete(bets).where(sql`${bets.userId} LIKE 'u-test-%'`);
    await db.delete(markets).where(sql`${markets.id} LIKE 'wc2026-%'`);
    await db.delete(users).where(sql`${users.id} LIKE 'u-test-%'`);

    // ═══════ Test Users ═══════
    const testUsers = [];
    for (const t of [
      { name: "messi_fan", bal: "500" },
      { name: "mbappé_fan", bal: "500" },
      { name: "neutral_bet", bal: "500" },
    ]) {
      const w = ethers.Wallet.createRandom();
      const row = await db.insert(users).values({
        id: `u-test-${t.name}`,
        username: t.name,
        walletAddress: `0x${Buffer.from(t.name).toString("hex").padEnd(40, "0")}`,
        projectWallet: w.address,
        projectWalletPk: w.privateKey,
        balance: `${t.bal}.000000`,
      }).returning();
      testUsers.push(row[0]);
    }

    // ═══════ World Cup 2026 Semi-final ═══════
    const sfId = "wc2026-sf-fra-eng";
    await db.insert(markets).values({
      id: sfId,
      gameDate: "2026-07-18",
      team1: "France", team2: "England",
      team1Code: "FRA", team2Code: "ENG",
      league: "FIFA World Cup 2026",
      kickoffTime: "2026-07-18T21:00:00Z",
      poolHome: "320.000000",   // France bets
      poolDraw: "90.000000",
      poolAway: "240.000000",   // England bets
      totalPool: "650.000000",
      totalBets: 12,
      isResolved: false, winningOutcome: -1,
      onChainCreated: false,
    });

    // messi_fan bets on France
    await db.insert(bets).values({
      marketId: sfId, userId: testUsers[0].id,
      outcome: 1, amount: "80.000000",
    });
    // mbappé_fan bets on France too
    await db.insert(bets).values({
      marketId: sfId, userId: testUsers[1].id,
      outcome: 1, amount: "60.000000",
    });
    // neutral bets on England
    await db.insert(bets).values({
      marketId: sfId, userId: testUsers[2].id,
      outcome: 2, amount: "100.000000",
    });

    // ═══════ World Cup 2026 FINAL ═══════
    const finalId = "wc2026-final-esp-arg";
    await db.insert(markets).values({
      id: finalId,
      gameDate: "2026-07-19",
      team1: "Spain", team2: "Argentina",
      team1Code: "ESP", team2Code: "ARG",
      league: "FIFA World Cup 2026",
      kickoffTime: "2026-07-19T19:00:00Z",
      poolHome: "180.000000",   // Spain bets
      poolDraw: "60.000000",
      poolAway: "280.000000",   // Argentina bets (Messi hype)
      totalPool: "520.000000",
      totalBets: 15,
      isResolved: false, winningOutcome: -1,
      onChainCreated: false,
    });

    // messi_fan bets on Argentina (of course!)
    await db.insert(bets).values({
      marketId: finalId, userId: testUsers[0].id,
      outcome: 2, amount: "120.000000",
    });
    // mbappé_fan bets on Spain
    await db.insert(bets).values({
      marketId: finalId, userId: testUsers[1].id,
      outcome: 1, amount: "90.000000",
    });
    // neutral bets on Draw
    await db.insert(bets).values({
      marketId: finalId, userId: testUsers[2].id,
      outcome: 0, amount: "50.000000",
    });

    // Update user stats
    await db.update(users).set({ totalBets: 2, totalStaked: "200.000000" }).where(eq(users.id, testUsers[0].id));
    await db.update(users).set({ totalBets: 2, totalStaked: "150.000000" }).where(eq(users.id, testUsers[1].id));
    await db.update(users).set({ totalBets: 2, totalStaked: "150.000000" }).where(eq(users.id, testUsers[2].id));

    return Response.json({
      success: true,
      message: "🏆 World Cup 2026 test data seeded!",
      users: testUsers.map(u => ({
        username: u.username, id: u.id, balance: u.balance,
      })),
      markets: [
        {
          id: sfId,
          match: "🇫🇷 France vs England 🏴󠁧󠁢󠁥󠁮󠁧󠁿",
          type: "Semi-final",
          kickoff: "July 18, 2026 — 21:00 UTC",
          venue: "Hard Rock Stadium, Miami",
          pool: "650 USDC",
          bets: "messi_fan→France(80), mbappé_fan→France(60), neutral→England(100)",
        },
        {
          id: finalId,
          match: "🇪🇸 Spain vs Argentina 🇦🇷",
          type: "🏆 FINAL",
          kickoff: "July 19, 2026 — 19:00 UTC",
          venue: "MetLife Stadium, New Jersey",
          pool: "520 USDC",
          bets: "messi_fan→Argentina(120), mbappé_fan→Spain(90), neutral→Draw(50)",
        },
      ],
      payoutExamples: {
        "If France wins semi-final": "messi_fan gets (80/320)×650 = 162.50 USDC from 80 stake",
        "If Argentina wins final": "messi_fan gets (120/280)×520 = 222.86 USDC from 120 stake",
      },
    });
  } catch (err) {
    console.error("Seed error:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
