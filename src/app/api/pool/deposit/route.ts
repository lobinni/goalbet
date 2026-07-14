import { db } from "@/db";
import { pool } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/pool/deposit
 *
 * Add GEN to the pool to provide liquidity for payouts.
 * Mirrors the contract's deposit() payable method.
 */
export async function POST(request: Request) {
  const { amount } = await request.json();
  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0)
    return Response.json({ error: "Amount must be positive" }, { status: 400 });

  const poolRows = await db.select().from(pool).limit(1);

  if (poolRows.length > 0) {
    const p = poolRows[0];
    const newBalance = (Number(p.poolBalance) + amountNum).toFixed(18);
    await db.update(pool).set({ poolBalance: newBalance, updatedAt: new Date() })
      .where(eq(pool.id, "singleton"));
  } else {
    await db.insert(pool).values({
      id: "singleton",
      poolBalance: (1000 + amountNum).toFixed(18),
      pendingPayouts: "0",
    });
  }

  const updated = await db.select().from(pool).limit(1);
  const p = updated[0];
  return Response.json({
    success: true,
    deposited: amountNum,
    poolBalance: Number(p.poolBalance),
    pendingPayouts: Number(p.pendingPayouts),
    availableLiquidity: Number(p.poolBalance) - Number(p.pendingPayouts),
  });
}
