import { db } from "@/db";
import { users, deposits } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

/** Record a USDC deposit (frontend sends USDC to projectWallet, then calls this) */
export async function POST(req: Request) {
  const { userId, amount, txHash } = await req.json();
  if (!userId || !amount) return Response.json({ error: "missing fields" }, { status: 400 });

  const amt = Number(amount);
  if (amt <= 0) return Response.json({ error: "invalid amount" }, { status: 400 });

  const row = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row.length) return Response.json({ error: "user not found" }, { status: 404 });

  const newBal = (Number(row[0].balance) + amt).toFixed(6);
  await db.update(users).set({ balance: newBal }).where(eq(users.id, userId));

  await db.insert(deposits).values({ userId, amount: amt.toFixed(6), txHash: txHash || null });

  return Response.json({ success: true, balance: newBal });
}
