import { db } from "@/db";
import { markets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { glCreateMarket, glResolveMarket, glGetMarket, EXPLORER_TX } from "@/lib/genlayer";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/resolve — GenLayer AI Oracle Resolution
 *
 * 1. Ensure market exists on GenLayer V2 contract
 * 2. Call resolve_market → AI fetches BBC Sport → LLM consensus
 * 3. Read verified result from on-chain
 * 4. Update PostgreSQL with winner + score
 */
export async function POST(req: Request) {
  const { marketId } = await req.json();
  if (!marketId) return Response.json({ error: "marketId required" }, { status: 400 });

  const rows = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!rows.length) return Response.json({ error: "Market not found" }, { status: 404 });
  const market = rows[0];

  if (market.isResolved) {
    return Response.json({
      success: true, alreadyResolved: true,
      winner: market.winningOutcome, score: market.finalScore,
    });
  }

  try {
    // Step 1: ensure market on-chain
    if (!market.onChainCreated) {
      try {
        await glCreateMarket(marketId, market.gameDate, market.team1, market.team2);
      } catch { /* may already exist */ }
      await db.update(markets).set({ onChainCreated: true }).where(eq(markets.id, marketId));
    }

    // Step 2: AI Oracle resolution
    const txHash = await glResolveMarket(marketId);

    // Step 3: read verified result from chain
    const onChainResult = await glGetMarket(marketId);

    if (onChainResult && onChainResult.resolved && onChainResult.winner !== -1) {
      // Step 4: update DB
      await db.update(markets).set({
        isResolved: true,
        winningOutcome: onChainResult.winner,
        finalScore: onChainResult.score || "",
        resolvedAt: new Date(),
      }).where(eq(markets.id, marketId));

      return Response.json({
        success: true,
        txHash,
        explorerUrl: EXPLORER_TX + txHash,
        winner: onChainResult.winner,
        score: onChainResult.score,
      });
    }

    return Response.json({
      error: "Match not finished yet. BBC Sport doesn't have the final score.",
    }, { status: 400 });

  } catch (err) {
    const msg = (err as Error).message || "Resolution failed";
    console.error("Resolve error:", msg.slice(0, 300));

    if (msg.includes("not finished") || msg.includes("match not finished")) {
      return Response.json({
        error: "Match has not finished yet.",
      }, { status: 400 });
    }
    if (msg.includes("already resolved")) {
      // Sync from chain
      try {
        const r = await glGetMarket(marketId);
        if (r && r.resolved) {
          await db.update(markets).set({
            isResolved: true, winningOutcome: r.winner,
            finalScore: r.score || "", resolvedAt: new Date(),
          }).where(eq(markets.id, marketId));
          return Response.json({ success: true, winner: r.winner, score: r.score });
        }
      } catch { /* ignore */ }
      return Response.json({ success: true, alreadyResolved: true });
    }
    if (msg.includes("Rate limit")) {
      return Response.json({
        error: "GenLayer rate limit. Please wait a few minutes.",
      }, { status: 429 });
    }

    return Response.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
