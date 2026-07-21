import { db } from "@/db";
import { ensureTables } from "@/db/ensure-tables";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {
    env_database_url: !!process.env.DATABASE_URL,
    env_contract: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "(default)",
    timestamp: new Date().toISOString(),
  };

  try {
    await db.execute(sql`select 1`);
    checks.database = "connected";
  } catch (e) {
    checks.database = "error";
    checks.db_error = (e as Error).message?.slice(0, 200);
    return Response.json({ ok: false, ...checks }, { status: 500 });
  }

  try {
    await ensureTables();
    checks.tables = "ready";
  } catch (e) {
    checks.tables = "error";
    checks.tables_error = (e as Error).message?.slice(0, 200);
    return Response.json({ ok: false, ...checks }, { status: 500 });
  }

  return Response.json({ ok: true, ...checks });
}
