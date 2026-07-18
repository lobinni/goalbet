import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
export const dynamic = "force-dynamic";

/**
 * POST /api/users/register — auto-register on wallet connect (no username needed)
 */
export async function POST(req: Request) {
  const { walletAddress } = await req.json();
  if (!walletAddress)
    return Response.json({ error: "walletAddress required" }, { status: 400 });

  const addr = walletAddress.toLowerCase();

  // Return existing user
  const existing = await db.select().from(users).where(eq(users.walletAddress, addr)).limit(1);
  if (existing.length) return Response.json({ user: { ...existing[0], projectWalletPk: undefined } });

  // Auto-generate username from wallet address
  const username = `player_${addr.slice(2, 8)}`;

  // Create custodial project wallet
  const wallet = ethers.Wallet.createRandom();

  const row = await db.insert(users).values({
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    username,
    walletAddress: addr,
    projectWallet: wallet.address,
    projectWalletPk: wallet.privateKey,
  }).returning();

  return Response.json({ user: { ...row[0], projectWalletPk: undefined } });
}
