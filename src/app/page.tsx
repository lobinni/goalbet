import GoalBetApp from "./GoalBetApp";
import { getFixtureGroups } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default async function Page() {
  const groups = await getFixtureGroups();
  return <GoalBetApp initialGroups={groups} />;
}
