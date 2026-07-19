import GoalBetApp from "./GoalBetApp";
import type { Match } from "@/lib/matches";

export const dynamic = "force-dynamic";

/** Server component: fetches fixtures at request time, passes to client */
async function getFixtures(): Promise<Match[]> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/fixtures`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.matches || [];
  } catch {
    return [];
  }
}

export default async function Page() {
  const matches = await getFixtures();
  return <GoalBetApp initialMatches={matches} />;
}
