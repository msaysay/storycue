import { checkJevAvailability } from "../../../../../server/jev-turn-taking";
import { planProvider } from "../../../../../server/storycue-agent-jobs";

export const runtime = "nodejs";
export async function GET() {
  if (process.env.AURAL_LOCAL_TRIAL !== "1") return new Response(null, { status: 404 });
  return Response.json({ jev: await checkJevAvailability(),planProvider:planProvider(),setup:process.env.STORYCUE_OPEN_SOURCE==="1" }, { headers: { "Cache-Control": "no-store" } });
}
