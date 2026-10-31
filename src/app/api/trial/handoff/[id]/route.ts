import { HandoffInputError, handoffView, isSafeHandoffId, readHandoff } from "../../../../../../server/storycue-handoff";
import { bridgeTokenAllowed, noStore, sameOriginLoopback } from "../../../../../../server/trial-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.AURAL_LOCAL_TRIAL !== "1") return new Response(null, { status: 404 });
  if (!sameOriginLoopback(request) && !await bridgeTokenAllowed(request)) return new Response(null, { status: 403 });
  try {
    const { id } = await context.params;
    if (!isSafeHandoffId(id)) throw new HandoffInputError("交接编号无效。");
    const row = await readHandoff(id);
    if (!row) return noStore({ ok: false, error: "找不到这次交接。" }, 404);
    return noStore(handoffView(row));
  } catch (error) {
    const message = error instanceof HandoffInputError ? error.message : "无法读取交接。";
    return noStore({ ok: false, error: message }, 400);
  }
}
