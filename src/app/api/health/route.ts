export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ 
    ok: true, 
    app: "GoalBet",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}
