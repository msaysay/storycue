import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import { z } from "zod";
import { desktopBridgeStatus } from "./desktop-planner";
const fields={speechKey:"DOUBAO_API_KEY",textKey:"RELAY_LLM_API_KEY",llmBaseUrl:"RELAY_LLM_BASE_URL",llmModel:"RELAY_LLM_MODEL",jevKey:"TYPESAFE_API_KEY"} as const;
const text=z.string().trim().max(500).refine(s=>!/[\r\n\0]/.test(s));
const modelBase=z.string().trim().max(500).url().refine(s=>{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&!/\/chat\/completions\/?$/.test(u.pathname);}).transform(s=>s.replace(/\/+$/,""));
const defaultBase="https://ark.cn-beijing.volces.com/api/v3";
const defaultModel="doubao-seed-2-0-lite-260428";
export const SetupSchema=z.object({speechKey:text.default(""),textKey:text.default(""),llmBaseUrl:modelBase.default(defaultBase),llmModel:text.min(1).default(defaultModel),enableJev:z.boolean().default(false),jevKey:text.default("")});
const file=()=>process.env.STORYCUE_CONFIG_FILE||path.resolve(".env.local");
export class SetupInputError extends Error {}
export async function saveSetup(raw:unknown){
  const input=SetupSchema.parse(raw);let previous:Record<string,string>={};try{previous=parse(await readFile(file()));}catch{}
  const oldBase=modelBase.safeParse(previous.RELAY_LLM_BASE_URL);
  if(!input.textKey&&previous.RELAY_LLM_API_KEY&&(!oldBase.success||new URL(oldBase.data).origin!==new URL(input.llmBaseUrl).origin))throw new SetupInputError("切换文本服务地址时，请填写新服务商的即时追问模型 Key；豆包语音 Key 可以留空保留。");
  const next={...previous};for(const[k,key]of Object.entries(fields)){const value=input[k as keyof typeof fields];if(value)next[key]=value;}
  next.STORYCUE_JEV_ENABLED=input.enableJev?"1":"0";next.RELAY_LLM_PROVIDER="openai";
  // A different text provider must not inherit an Ark-only request parameter.
  next.RELAY_LLM_THINKING="auto";
  if(!next.DOUBAO_API_KEY || !next.RELAY_LLM_API_KEY)throw new SetupInputError("请分别填写豆包语音 Key 和即时追问文本模型 Key。");
  if(input.enableJev&&!next.TYPESAFE_API_KEY)throw new SetupInputError("启用增强语义判断时需要填写对应 Key");
  await writeFile(file(),Object.entries(next).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join("\n")+"\n",{mode:0o600});
  Object.assign(process.env,next);return {saved:true,restartVoice:true};
}
export async function setupStatus(){let saved:Record<string,string>={};try{saved=parse(await readFile(file()));}catch{}
  const has=(key:string)=>!!(saved[key]||process.env[key]);
  const base=modelBase.safeParse(saved.RELAY_LLM_BASE_URL||process.env.RELAY_LLM_BASE_URL||defaultBase);
  const model=text.safeParse(saved.RELAY_LLM_MODEL||process.env.RELAY_LLM_MODEL||defaultModel);
  return {desktopBridge:await desktopBridgeStatus(),speechConfigured:has("DOUBAO_API_KEY"),textConfigured:has("RELAY_LLM_API_KEY"),jevEnabled:(saved.STORYCUE_JEV_ENABLED||process.env.STORYCUE_JEV_ENABLED)==="1",llmBaseUrl:base.success?base.data:"",llmModel:model.success?model.data:""};
}
