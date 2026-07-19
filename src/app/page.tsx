import GoalBetApp from "./GoalBetApp";
import { getAllFixtures } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default async function Page() {
  const matches = await getAllFixtures();
  return <GoalBetApp initialMatches={matches} />;
}
