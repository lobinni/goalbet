import { NextResponse } from "next/server";
import { getAllFixtures } from "@/lib/fixtures";
export const dynamic = "force-dynamic";

export async function GET() {
  const matches = await getAllFixtures();
  return NextResponse.json({
    success: true,
    count: matches.length,
    lastUpdated: new Date().toISOString(),
    matches,
  });
}
