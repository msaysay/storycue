import { callRelayLLM } from "../../../../../server/relay-llm";
import { buildPlanPrompt, parseGeneratedPlan, PlanInputSchema, PlanDirectionError, validatePlanDirection } from "@/lib/voice/interview-plan";
import { createPlanJob, planProvider } from "../../../../../server/storycue-agent-jobs";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (process.env.AURAL_LOCAL_TRIAL !== "1") return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if ((origin && origin !== appOrigin) || (!origin && request.headers.get("sec-fetch-site") === "cross-site")) {
    return Response.json({ error: "请从采访页面生成提纲。" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "请求格式不正确。" }, { status: 415 });
  let input;
  try {
    const body = await request.text();
    if (body.length > 6000) return Response.json({ error: "选题或背景过长，请缩短后重试。" }, { status: 413 });
    input = PlanInputSchema.parse(JSON.parse(body));
  } catch {
    return Response.json({ error: "请填写选题，背景不超过 1200 字。" }, { status: 400 });
  }
  try {
    if(planProvider()==="desktop"){
      const job=await createPlanJob(input);
      return Response.json({jobId:job.id,status:"pending",provider:"desktop"},{status:202,headers:{"Cache-Control":"no-store"}});
    }
    const prompt = buildPlanPrompt(input);
    const raw = await callRelayLLM(prompt, 2600, undefined, request.signal);
    let generated = parseGeneratedPlan(raw);
    try { generated = validatePlanDirection(generated, input.framework, input.background); }
    catch (error) {
      if (!(error instanceof PlanDirectionError)) throw error;
      const corrected = await callRelayLLM(prompt + "\n上次提纲首题没有符合所选方向。请重新生成完整JSON，修正这一点：" + error.message, 2600, undefined, request.signal);
      generated = validatePlanDirection(parseGeneratedPlan(corrected), input.framework, input.background);
    }
    return Response.json({ ...input, ...generated, source: "AI" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "主问题生成未完成，请重试。已有提纲已保留，也可以手动编辑。" }, { status: 502 });
  }
}
