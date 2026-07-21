import { NextResponse } from "next/server";
import { getFixtureGroups } from "@/lib/fixtures";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await getFixtureGroups();
    const matches = groups.flatMap((g) => g.matches);
    return NextResponse.json({
      success: true,
      count: matches.length,
      lastUpdated: new Date().toISOString(),
      matches,
      groups: groups.map((g) => ({
        league: g.league,
        matchCount: g.matches.length,
        matches: g.matches,
      })),
    });
  } catch (e) {
    console.error("GET /api/fixtures error:", e);
    return NextResponse.json(
      { success: false, count: 0, matches: [], groups: [], error: "Failed to fetch fixtures" },
      { status: 500 },
    );
  }
}
