import { pgTable, text, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

/* ── Users / Players ─────────────────────────────────────────── */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  name: text("name").notNull(),
  balance: numeric("balance", { precision: 36, scale: 18 }).notNull().default("1000"),
  totalBets: integer("total_bets").notNull().default(0),
  totalStaked: numeric("total_staked", { precision: 36, scale: 18 }).notNull().default("0"),
  totalWon: numeric("total_won", { precision: 36, scale: 18 }).notNull().default("0"),
  totalLost: numeric("total_lost", { precision: 36, scale: 18 }).notNull().default("0"),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ── Bets ─────────────────────────────────────────────────────── */

export const bets = pgTable("bets", {
  id: text("id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  uid: text("uid")
    .primaryKey()
    .$defaultFn(() => `bet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  gameDate: text("game_date").notNull(),
  team1: text("team1").notNull(),
  team2: text("team2").notNull(),
  team1Code: text("team1_code"),
  team2Code: text("team2_code"),
  league: text("league"),
  predictedWinner: text("predicted_winner").notNull(),
  realWinner: text("real_winner").notNull().default(""),
  realScore: text("real_score").notNull().default(""),
  hasResolved: boolean("has_resolved").notNull().default(false),
  hasClaimed: boolean("has_claimed").notNull().default(false),
  stake: numeric("stake", { precision: 36, scale: 18 }).notNull(),
  odds: numeric("odds", { precision: 10, scale: 2 }).notNull(),
  payout: numeric("payout", { precision: 36, scale: 18 }).notNull(),
  isWon: boolean("is_won").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  claimedAt: timestamp("claimed_at"),
});

/* ── Pool (singleton row) ───────────────────────────────────────
 *
 *  poolBalance  = actual GEN the pool holds
 *                 (deposits + stakes from losing bets – payouts claimed)
 *  pendingPayouts = sum of payout fields for every *unresolved* bet
 *                   (GEN the pool must be able to pay if every
 *                    pending bet wins)
 *
 *  Invariant:  pendingPayouts ≤ poolBalance   (solvency)
 *
 *  When placing a bet:
 *    poolBalance  += stake
 *    pendingPayouts += stake × odds
 *    solvency check: pendingPayouts ≤ poolBalance
 *      → if violated, reject or cap the odds
 *
 *  When resolving (lost):
 *    pendingPayouts -= payout   (no longer at risk)
 *    // stake already in poolBalance, stays as surplus
 *
 *  When resolving (won, unclaimed):
 *    pendingPayouts -= payout   (moved from "pending" to "payable")
 *
 *  When claiming (won):
 *    poolBalance  -= payout     (GEN leaves the pool)
 */

export const pool = pgTable("pool", {
  id: text("id").primaryKey().default("singleton"),
  poolBalance: numeric("pool_balance", { precision: 36, scale: 18 })
    .notNull()
    .default("1000"),
  pendingPayouts: numeric("pending_payouts", { precision: 36, scale: 18 })
    .notNull()
    .default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
