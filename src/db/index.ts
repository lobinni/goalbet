import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy-initialized database connection with global singleton caching.
 *
 * Key behaviors:
 * - Build time (no DATABASE_URL): module loads fine, crashes only on first query
 * - Runtime: Pool and Drizzle instance cached on globalThis (survives HMR + serverless reuse)
 * - SSL: auto-enabled for Neon/Supabase/cloud hosts (required by most providers)
 */

const globalForDb = globalThis as typeof globalThis & {
  __goalBetPool?: Pool;
  __goalBetDb?: NodePgDatabase;
};

function getDb(): NodePgDatabase {
  // Return cached instance if available (works in both dev and production)
  if (globalForDb.__goalBetDb) return globalForDb.__goalBetDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your Vercel project settings → Environment Variables.",
    );
  }

  // Create pool with SSL support for cloud databases (Neon, Supabase, etc.)
  const pool =
    globalForDb.__goalBetPool ??
    new Pool({
      connectionString: url,
      // Neon and most cloud PG providers require SSL
      ssl: url.includes("localhost") || url.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
      // Serverless-friendly: keep pool small, close idle connections fast
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

  const database = drizzle(pool);

  // Cache on globalThis — survives across requests in both dev and production
  globalForDb.__goalBetPool = pool;
  globalForDb.__goalBetDb = database;

  return database;
}

/**
 * `db` can be imported freely at the top of any file.
 * The actual PostgreSQL connection is only created on the first query.
 */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    if (typeof value === "function") {
      return value.bind(real);
    }
    return value;
  },
});
