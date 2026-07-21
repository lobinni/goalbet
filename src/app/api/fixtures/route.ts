import { NextResponse } from "next/server";
import { getAllFixtures } from "@/lib/fixtures";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await getAllFixtures();
    return NextResponse.json({
      success: true,
      count: matches.length,
      lastUpdated: new Date().toISOString(),
      matches,
    });
  } catch (e) {
    console.error("GET /api/fixtures error:", e);
    return NextResponse.json({
      success: false,
      count: 0,
      matches: [],
      error: "Failed to fetch fixtures",
    }, { status: 500 });
  }
}
