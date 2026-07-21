import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const addr = new URL(req.url).searchParams.get("wallet")?.toLowerCase();
    if (!addr) return Response.json({ error: "wallet required" }, { status: 400 });

    const row = await db.select().from(users).where(eq(users.walletAddress, addr)).limit(1);
    if (!row.length) return Response.json({ user: null });
    return Response.json({ user: { ...row[0], projectWalletPk: undefined } });
  } catch (e) {
    console.error("GET /api/users/me error:", e);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
