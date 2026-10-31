import { HandoffInputError, MAX_HANDOFF_BYTES, handoffOpenUrl, saveHandoff } from "../../../../../server/storycue-handoff";
import { bridgeTokenAllowed, noStore } from "../../../../../server/trial-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown): Response {
  if (error instanceof HandoffInputError) {
    const status = /script 超过|交接内容过长/.test(error.message) ? 413 : 400;
    return noStore({ ok: false, error: error.message }, status);
  }
  return noStore({ ok: false, error: "交接内容无法解析。" }, 400);
}

export async function POST(request: Request) {
  if (process.env.AURAL_LOCAL_TRIAL !== "1") return new Response(null, { status: 404 });
  if (!await bridgeTokenAllowed(request)) return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return noStore({ ok: false, error: "请求格式不正确。" }, 415);
  try {
    const raw = await request.text();
    if (raw.length > MAX_HANDOFF_BYTES) return noStore({ ok: false, error: "交接内容过长。请缩短脚本，或由工作台把背景压缩到 1200 字以内。" }, 413);
    const saved = await saveHandoff(JSON.parse(raw));
    return noStore({ ok: true, handoffId: saved.handoffId, openUrl: handoffOpenUrl(request, saved.handoffId) });
  } catch (error) {
    return failure(error);
  }
}
