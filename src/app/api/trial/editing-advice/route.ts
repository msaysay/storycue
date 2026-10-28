import { createHash } from "node:crypto";
import { callRelayLLM } from "../../../../../server/relay-llm";
import { AdviceInputSchema, validateEditingAdvice } from "@/lib/voice/mobile-interview";
import { buildEditingAdvicePrompt, EDITING_METHOD_VERSION } from "@/lib/voice/editing-advice";

export const runtime="nodejs";
export async function POST(request:Request) {
  if(process.env.AURAL_LOCAL_TRIAL !== "1") return new Response(null,{status:404});
  const origin=request.headers.get("origin");
  const appOrigin=new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if((origin && origin !== appOrigin) || (!origin && request.headers.get("sec-fetch-site")==="cross-site")) return Response.json({error:"请从访谈页面生成建议。"},{status:403});
  if(!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({error:"请求格式不正确。"},{status:415});
  let input;
  try{
    const raw=await request.text();
    if(raw.length>400000) return Response.json({error:"访谈稿过长，请导出后分段整理。"},{status:413});
    input=AdviceInputSchema.parse(JSON.parse(raw));
  }catch{return Response.json({error:"访谈稿格式或长度不符合要求，原稿仍在。"},{status:400});}
  if(!input.entries.some(e=>e.role==="嘉宾" && !e.provisional)) return Response.json({error:"还没有已确认的嘉宾回答。请先访谈或校对未完成的字幕。"},{status:422});
  try{
    const prompt=buildEditingAdvicePrompt(input);
    const raw=await callRelayLLM(prompt,4200,undefined,request.signal);
    let advice;
    try { advice=validateEditingAdvice(raw,input); }
    catch {
      // A model may invent a purpose label. Regenerate once against the same
      // source; never relax role, confirmation or paragraph-reference checks.
      const corrected=await callRelayLLM(prompt+"\n格式纠正：上一份输出没有通过 JSON 格式或原稿引用校验。请依据上面的同一份原稿重新生成完整 JSON。segments.purpose 只能是示例枚举中的一个完整值，禁止自创‘适用条件说明’等分类；适用条件和未验证范围写进 note/cautions。entryIds 只可引用已有且已确认的相应角色段落，关键词必须逐字匹配。不足就明确列缺口或返回 clips=[]，不得补造原话。",4200,undefined,request.signal);
      advice=validateEditingAdvice(corrected,input);
    }
    return Response.json({...advice,sessionId:input.sessionId,sourceDigest:createHash("sha256").update(JSON.stringify(input)).digest("hex"),methodVersion:EDITING_METHOD_VERSION},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"建议暂未生成，访谈原稿已保留。可以稍后重试。"},{status:502});}
}
