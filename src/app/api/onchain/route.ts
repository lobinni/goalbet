import { glGetStats, glGetAllMarkets, CONTRACT_ADDRESS, EXPLORER_ADDR } from "@/lib/genlayer";
export const dynamic = "force-dynamic";

/** GET /api/onchain — read on-chain state from GenLayer V2 contract */
export async function GET() {
  try {
    const [stats, onchainMarkets] = await Promise.all([
      glGetStats().catch(() => null),
      glGetAllMarkets().catch(() => []),
    ]);

    return Response.json({
      contract: CONTRACT_ADDRESS,
      explorer: EXPLORER_ADDR + CONTRACT_ADDRESS,
      stats,
      markets: onchainMarkets,
    });
  } catch (err) {
    return Response.json({
      error: (err as Error).message?.slice(0, 100),
      contract: CONTRACT_ADDRESS,
    }, { status: 500 });
  }
}
