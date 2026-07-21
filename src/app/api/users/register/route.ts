import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: "Invalid request body" }, { status: 400 });

    const { walletAddress } = body;
    if (!walletAddress) return Response.json({ error: "walletAddress required" }, { status: 400 });
    const addr = walletAddress.toLowerCase();

    const existing = await db.select().from(users).where(eq(users.walletAddress, addr)).limit(1);
    if (existing.length) return Response.json({ user: existing[0] });

    const row = await db.insert(users).values({
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      walletAddress: addr,
    }).returning();
    return Response.json({ user: row[0] });
  } catch (e) {
    console.error("POST /api/users/register error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
