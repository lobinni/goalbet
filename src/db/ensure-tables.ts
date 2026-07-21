import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Ensure the required database tables exist.
 * 
 * On Vercel, if the user forgot to run `npx drizzle-kit push`,
 * every API call would 500 with "relation does not exist".
 * 
 * This function creates the tables idempotently (IF NOT EXISTS).
 * Called once on first API error, then cached.
 */

let _ensured = false;

export async function ensureTables(): Promise<void> {
  if (_ensured) return;

  try {
    // Quick check: try a simple query on the users table
    await db.execute(sql`SELECT 1 FROM users LIMIT 0`);
    _ensured = true;
    return;
  } catch {
    // Table doesn't exist — create all tables
    console.log("Tables not found, creating schema...");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL UNIQUE,
        total_bets INTEGER NOT NULL DEFAULT 0,
        total_staked NUMERIC(36,6) NOT NULL DEFAULT '0',
        total_won NUMERIC(36,6) NOT NULL DEFAULT '0',
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_idx ON users (wallet_address)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS markets (
        id TEXT PRIMARY KEY,
        game_date TEXT NOT NULL,
        team1 TEXT NOT NULL,
        team2 TEXT NOT NULL,
        team1_code TEXT NOT NULL DEFAULT '',
        team2_code TEXT NOT NULL DEFAULT '',
        league TEXT NOT NULL DEFAULT '',
        kickoff_time TEXT,
        pool_home NUMERIC(36,6) NOT NULL DEFAULT '0',
        pool_draw NUMERIC(36,6) NOT NULL DEFAULT '0',
        pool_away NUMERIC(36,6) NOT NULL DEFAULT '0',
        total_pool NUMERIC(36,6) NOT NULL DEFAULT '0',
        total_bets INTEGER NOT NULL DEFAULT 0,
        is_resolved BOOLEAN NOT NULL DEFAULT false,
        winning_outcome INTEGER NOT NULL DEFAULT -1,
        final_score TEXT,
        resolved_at TIMESTAMP,
        on_chain_created BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS markets_date_idx ON markets (game_date)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bets (
        id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL REFERENCES markets(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        outcome INTEGER NOT NULL,
        amount NUMERIC(36,6) NOT NULL,
        tx_hash TEXT,
        payout NUMERIC(36,6),
        payout_tx TEXT,
        is_won BOOLEAN,
        claimed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        claimed_at TIMESTAMP
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS bets_market_idx ON bets (market_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS bets_user_idx ON bets (user_id)
    `);

    console.log("✅ All tables created successfully");
    _ensured = true;
  } catch (e) {
    console.error("Failed to create tables:", (e as Error).message);
    throw e;
  }
}
