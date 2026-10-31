import { HandoffInputError, MAX_RESULT_BYTES, readInterviewResult, storeInterviewResult } from "../../../../../../../server/storycue-handoff";
import { bridgeTokenAllowed, noStore, sameOriginLoopback } from "../../../../../../../server/trial-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown): Response {
  if (error instanceof HandoffInputError) {
    const status = /找不到/.test(error.message) ? 404 : /取代|不一致/.test(error.message) ? 409 : 400;
    return noStore({ ok: false, error: error.message }, status);
  }
  return noStore({ ok: false, error: "回传失败。" }, 400);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.AURAL_LOCAL_TRIAL !== "1") return new Response(null, { status: 404 });
  if (!await bridgeTokenAllowed(request)) return new Response(null, { status: 403 });
  try {
    const { id } = await context.params;
    const result = await readInterviewResult(id);
    if (!result) return noStore({ ok: false, error: "还没有回传结果。" }, 404);
    return noStore(result);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.AURAL_LOCAL_TRIAL !== "1") return new Response(null, { status: 404 });
  if (!sameOriginLoopback(request)) return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return noStore({ ok: false, error: "请求格式不正确。" }, 415);
  try {
    const raw = await request.text();
    if (raw.length > MAX_RESULT_BYTES) return noStore({ ok: false, error: "回传内容过长。" }, 413);
    const { id } = await context.params;
    return noStore(await storeInterviewResult(id, JSON.parse(raw)));
  } catch (error) {
    return failure(error);
  }
}
