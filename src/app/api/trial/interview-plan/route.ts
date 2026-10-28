import { callRelayLLM } from "../../../../../server/relay-llm";
import { buildPlanPrompt, parseGeneratedPlan, PlanInputSchema, PlanDirectionError, validatePlanDirection } from "@/lib/voice/interview-plan";
import { createPlanJob, planProvider } from "../../../../../server/storycue-agent-jobs";
import { after } from "next/server";
import { readDesktopBridge,desktopBridgeStatus,runDesktopPlan } from "../../../../../server/desktop-planner";

export const runtime = "nodejs";
export const maxDuration = 180;
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
      const manual=process.env.STORYCUE_DESKTOP_HOST==="manual";
      if(!manual){
        const url=new URL(request.url);let host:URL;try{host=new URL(`${url.protocol}//${request.headers.get("host")||url.host}`);}catch{return new Response(null,{status:403});}
        if(!["localhost","127.0.0.1","[::1]"].includes(host.hostname))return Response.json({error:"自动调用本机桌面 AI 仅允许从本机页面发起；远程部署需要认证与受控代理。"},{status:403});
      }
      const config=await readDesktopBridge();
      if(!manual&&(!config||!(await desktopBridgeStatus()).configured))return Response.json({error:"主问题的本机桌面 AI 尚未连接。请让安装此工具的 WorkBuddy/Codex 在同一项目目录执行 npm run desktop:connect -- --host workbuddy（Codex 用 --host codex）。连接并完成官方 CLI 一次登录后，网页才能自动生成；不需要主问题 API Key。",code:"desktop_not_connected"},{status:409});
      const job=await createPlanJob(input,{automatic:!manual,host:config?.host});
      if(!manual&&config)after(()=>runDesktopPlan(job.id,config));
      return Response.json({jobId:job.id,status:"pending",provider:"desktop",automatic:!manual,host:config?.host},{status:202,headers:{"Cache-Control":"no-store"}});
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
