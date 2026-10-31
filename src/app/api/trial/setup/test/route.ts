import { isSetupTestTarget, runSetupTest } from "../../../../../../server/storycue-setup-test";
import { noStore, setupAllowed } from "../../../../../../server/trial-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await setupAllowed(request)) return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return noStore({ ok: false, code: "bad_request", message: "请求格式不正确。" }, 415);
  try {
    const raw = await request.text();
    if (raw.length > 2000) return noStore({ ok: false, code: "bad_request", message: "测试请求过长。" }, 413);
    const target = (JSON.parse(raw) as { target?: unknown }).target;
    if (!isSetupTestTarget(target)) return noStore({ ok: false, code: "bad_target", message: "target 必须是 doubao_tts、doubao_asr、text_llm、jev 或 desktop。" }, 400);
    return noStore(await runSetupTest(target));
  } catch {
    return noStore({ ok: false, code: "bad_request", message: "测试请求无法解析。" }, 400);
  }
}
