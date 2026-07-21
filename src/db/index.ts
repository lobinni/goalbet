import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy-initialized database connection.
 *
 * During Vercel builds, Next.js imports API route modules to collect metadata
 * (even for `force-dynamic` routes). At build time DATABASE_URL is not available,
 * so we must NOT create the Pool or throw at module-load time.
 *
 * Instead, the `db` export is a Proxy that defers Pool creation until the first
 * actual database call (which only happens at runtime, when DATABASE_URL exists).
 */

const globalForDb = globalThis as typeof globalThis & {
  __goalBetPool?: Pool;
  __goalBetDb?: NodePgDatabase;
};

function getDb(): NodePgDatabase {
  if (globalForDb.__goalBetDb) return globalForDb.__goalBetDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. " +
      "Add it to your Vercel environment variables or .env file."
    );
  }

  const pool =
    globalForDb.__goalBetPool ??
    new Pool({ connectionString: url });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__goalBetPool = pool;
  }

  const database = drizzle(pool);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__goalBetDb = database;
  }

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
