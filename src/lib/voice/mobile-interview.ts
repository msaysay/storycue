import { z } from "zod";
import { storycuePath } from "./storycue-path";
import { InterviewFrameworkSchema } from "./video-frameworks";
import { FRAMEWORK_INTERVIEWS } from "./framework-interview-methods";

export const MobileEntrySchema = z.object({
  id: z.string().min(1).max(80), role: z.enum(["嘉宾", "AI"]),
  text: z.string().trim().min(1).max(16000), at: z.string().datetime(),
  provisional: z.boolean().optional(),
});
export type MobileEntry = z.infer<typeof MobileEntrySchema>;
export const AdviceInputSchema = z.object({
  sessionId: z.string().min(1).max(80), topic: z.string().trim().min(1).max(240),
  framework: InterviewFrameworkSchema,
  entries: z.array(MobileEntrySchema).min(1).max(1000),
}).superRefine((input, ctx) => {
  if (new Set(input.entries.map(e => e.id)).size !== input.entries.length) ctx.addIssue({ code: "custom", message: "段落编号重复" });
  if (input.entries.reduce((sum,e)=>sum+e.text.length,0)>80000) ctx.addIssue({code:"custom",message:"本轮超过单次分析长度，请导出后分段整理"});
});
export type AdviceInput = z.infer<typeof AdviceInputSchema>;
export const EditingAdviceSchema = z.object({
  mainline: z.string().trim().min(1).max(400),
  clips: z.array(z.object({
    title: z.string().trim().min(1).max(100),
    rationale: z.string().trim().min(1).max(500),
    readiness: z.enum(["可整理", "需补拍"]),
    segments: z.array(z.object({
      purpose: z.enum(["开场观点", "开场设定", "身份依据", "方法步骤", "问题与答案", "真实感受", "现场展示", "选择疑虑", "经历支撑", "金句关键词", "适用人群", "自然承接", "必要提问"]),
      entryIds: z.array(z.string().min(1).max(80)).min(1).max(12),
      note: z.string().trim().min(1).max(500),
    })).min(1).max(10),
    keyPhrases: z.array(z.object({entryId:z.string().min(1).max(80),phrase:z.string().trim().min(2).max(100)})).max(5),
    missing: z.array(z.string().trim().min(1).max(350)).max(10),
    followUps: z.array(z.string().trim().min(1).max(180)).max(5),
  })).max(3),
  cautions: z.array(z.string().trim().min(1).max(350)).max(8),
});
export type EditingAdvice = z.infer<typeof EditingAdviceSchema>;
export type AdviceResult = EditingAdvice & {sessionId:string; sourceDigest:string; methodVersion:string};
export function mobileRelayUrl(location: {protocol:string;hostname:string;host:string}): string {
  if (["127.0.0.1","localhost","[::1]"].includes(location.hostname)) return process.env.NEXT_PUBLIC_VOICE_RELAY_URL || `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.hostname}:8866`;
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${storycuePath("/ws/voice")}`;
}

/** Every proposed source must refer to real, confirmed text from this round. */
export function validateEditingAdvice(raw: string, input: AdviceInput): EditingAdvice {
  const selectedFramework = InterviewFrameworkSchema.parse(input.framework);
  const clean=raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const candidate=JSON.parse(clean);
  const entries=new Map(input.entries.map(entry=>[entry.id,entry]));
  let omittedUnverifiedPhrase=false;
  // An invalid optional keyword must not discard otherwise sourced editing advice.
  // Drop the keyword; never rewrite it into a quote the guest did not say.
  if(Array.isArray(candidate?.clips)) for(const clip of candidate.clips){
    if(!clip || typeof clip!=="object")continue;
    if(Array.isArray(clip.keyPhrases)) clip.keyPhrases=clip.keyPhrases.filter((key:{entryId?:string;phrase?:string})=>{
      const entry=entries.get(key?.entryId||"");
      const valid=!!entry&&entry.role==="嘉宾"&&!entry.provisional&&typeof key.phrase==="string"&&key.phrase.length>=2&&entry.text.includes(key.phrase);
      if(!valid)omittedUnverifiedPhrase=true;
      return valid;
    });
  }
  const parsed=EditingAdviceSchema.parse(candidate);
  if(omittedUnverifiedPhrase)parsed.cautions=["部分关键词没有匹配到嘉宾原话，已略去；请依据原稿校对。",...parsed.cautions].slice(0,8);
  for (const clip of parsed.clips) {
    let hasGuest=false;
    for (const segment of clip.segments) for (const id of segment.entryIds) {
      const entry=entries.get(id);
      if (!entry || entry.provisional) throw new Error("建议引用了不存在或待校对的段落");
      if (segment.purpose === "必要提问" ? entry.role !== "AI" : entry.role !== "嘉宾") throw new Error("主持人提问不能作为嘉宾的观点或证据");
      if (entry.role === "嘉宾") hasGuest=true;
    }
    if (!hasGuest) throw new Error("建议缺少嘉宾真实内容");
    for (const key of clip.keyPhrases) {
      const entry=entries.get(key.entryId);
      if (!entry || entry.role !== "嘉宾" || entry.provisional || !entry.text.includes(key.phrase)) throw new Error("关键词不是已确认的嘉宾原话");
    }
    if (clip.missing.length || !clip.segments.some(s=>FRAMEWORK_INTERVIEWS[selectedFramework].evidencePurposes.includes(s.purpose))) clip.readiness="需补拍";
  }
  return parsed;
}
