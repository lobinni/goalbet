import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __pool?: Pool;
  __db?: ReturnType<typeof drizzle>;
};

function getPool() {
  if (globalForDb.__pool) return globalForDb.__pool;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: url });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pool = pool;
  }
  return pool;
}

/** Lazy-initialized — safe to import at build time */
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    return Reflect.get(getPool(), prop);
  },
});

function getDb() {
  if (globalForDb.__db) return globalForDb.__db;
  const d = drizzle(getPool());
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__db = d;
  }
  return d;
}

/** Lazy-initialized — safe to import at build time */
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});
