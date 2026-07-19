import {
  pgTable, text, integer, boolean, timestamp, numeric, index, uniqueIndex,
} from "drizzle-orm/pg-core";

/* ═══ USERS ═══ */
export const users = pgTable("users", {
  id:            text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  totalBets:     integer("total_bets").notNull().default(0),
  totalStaked:   numeric("total_staked", { precision: 36, scale: 6 }).notNull().default("0"),
  totalWon:      numeric("total_won",   { precision: 36, scale: 6 }).notNull().default("0"),
  wins:          integer("wins").notNull().default(0),
  losses:        integer("losses").notNull().default(0),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  walletIdx: uniqueIndex("users_wallet_idx").on(t.walletAddress),
}));

/* ═══ MARKETS ═══ */
export const markets = pgTable("markets", {
  id:             text("id").primaryKey(),
  gameDate:       text("game_date").notNull(),
  team1:          text("team1").notNull(),
  team2:          text("team2").notNull(),
  team1Code:      text("team1_code").notNull().default(""),
  team2Code:      text("team2_code").notNull().default(""),
  league:         text("league").notNull().default(""),
  kickoffTime:    text("kickoff_time"),
  poolHome:       numeric("pool_home", { precision: 36, scale: 6 }).notNull().default("0"),
  poolDraw:       numeric("pool_draw", { precision: 36, scale: 6 }).notNull().default("0"),
  poolAway:       numeric("pool_away", { precision: 36, scale: 6 }).notNull().default("0"),
  totalPool:      numeric("total_pool", { precision: 36, scale: 6 }).notNull().default("0"),
  totalBets:      integer("total_bets").notNull().default(0),
  isResolved:     boolean("is_resolved").notNull().default(false),
  winningOutcome: integer("winning_outcome").notNull().default(-1),
  finalScore:     text("final_score"),
  resolvedAt:     timestamp("resolved_at"),
  onChainCreated: boolean("on_chain_created").notNull().default(false),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  dateIdx: index("markets_date_idx").on(t.gameDate),
}));

/* ═══ BETS ═══ */
export const bets = pgTable("bets", {
  id:        text("id").primaryKey().$defaultFn(() =>
    `bet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  marketId:  text("market_id").notNull().references(() => markets.id),
  userId:    text("user_id").notNull().references(() => users.id),
  outcome:   integer("outcome").notNull(),
  amount:    numeric("amount", { precision: 36, scale: 6 }).notNull(),
  txHash:    text("tx_hash"),           // USDC transfer tx from user → pool
  payout:    numeric("payout", { precision: 36, scale: 6 }),
  payoutTx:  text("payout_tx"),         // USDC transfer tx from pool → user
  isWon:     boolean("is_won"),
  claimed:   boolean("claimed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  claimedAt: timestamp("claimed_at"),
}, (t) => ({
  marketIdx: index("bets_market_idx").on(t.marketId),
  userIdx:   index("bets_user_idx").on(t.userId),
}));
