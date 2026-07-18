import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProjectWallet } from "@/lib/wallet";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { walletAddress } = await req.json();
  if (!walletAddress)
    return Response.json({ error: "walletAddress required" }, { status: 400 });

  const addr = walletAddress.toLowerCase();

  // Return existing user instantly
  const existing = await db.select().from(users).where(eq(users.walletAddress, addr)).limit(1);
  if (existing.length)
    return Response.json({ user: { ...existing[0], projectWalletPk: undefined } });

  // Create new user with lightweight wallet (no ethers.js)
  const wallet = createProjectWallet();

  const row = await db.insert(users).values({
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    username: `player_${addr.slice(2, 8)}`,
    walletAddress: addr,
    projectWallet: wallet.address,
    projectWalletPk: wallet.privateKey,
  }).returning();

  return Response.json({ user: { ...row[0], projectWalletPk: undefined } });
}
