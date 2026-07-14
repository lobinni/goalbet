import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return Response.json({ error: "Address is required" }, { status: 400 });
  }

  const existing = await db.select().from(users).where(eq(users.address, address)).limit(1);

  if (existing.length > 0) {
    return Response.json({ user: existing[0] });
  }

  return Response.json({ user: null });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { address, name } = body;

  if (!address) {
    return Response.json({ error: "Address is required" }, { status: 400 });
  }

  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.address, address)).limit(1);

  if (existing.length > 0) {
    return Response.json({ user: existing[0] });
  }

  // Create new user with 1000 GEN starting balance
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const newUser = await db.insert(users).values({
    id,
    address,
    name: name || `Player_${address.slice(0, 6)}`,
    balance: "1000",
    totalBets: 0,
    totalStaked: "0",
    totalWon: "0",
    totalLost: "0",
    wins: 0,
    losses: 0,
  }).returning();

  return Response.json({ user: newUser[0] });
}
