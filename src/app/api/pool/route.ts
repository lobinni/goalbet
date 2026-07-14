import { db } from "@/db";
import { pool } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/pool
 *
 * Returns the current pool state.
 * Mirrors the on-chain get_total_pool() view method.
 */
export async function GET() {
  const poolRows = await db.select().from(pool).limit(1);

  if (poolRows.length === 0) {
    return Response.json({
      poolBalance: 1000,
      pendingPayouts: 0,
      availableLiquidity: 1000,
    });
  }

  const p = poolRows[0];
  const poolBalance = Number(p.poolBalance);
  const pendingPayouts = Number(p.pendingPayouts);

  return Response.json({
    poolBalance,
    pendingPayouts,
    availableLiquidity: poolBalance - pendingPayouts,
  });
}
