import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import { z } from "zod";
const fields={speechKey:"DOUBAO_API_KEY",textKey:"RELAY_LLM_API_KEY",llmBaseUrl:"RELAY_LLM_BASE_URL",llmModel:"RELAY_LLM_MODEL",jevKey:"TYPESAFE_API_KEY"} as const;
const text=z.string().trim().max(500).refine(s=>!/[\r\n\0]/.test(s));
export const SetupSchema=z.object({speechKey:text.default(""),textKey:text.default(""),llmBaseUrl:z.string().url().refine(s=>{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash;}).default("https://ark.cn-beijing.volces.com/api/v3"),llmModel:text.min(1).default("doubao-seed-2-0-lite-260428"),enableJev:z.boolean().default(false),jevKey:text.default("")});
const file=()=>process.env.STORYCUE_CONFIG_FILE||path.resolve(".env.local");
export async function saveSetup(raw:unknown){
  const input=SetupSchema.parse(raw);let previous:Record<string,string>={};try{previous=parse(await readFile(file()));}catch{}
  const next={...previous};for(const[k,key]of Object.entries(fields)){const value=input[k as keyof typeof fields];if(value)next[key]=value;}
  next.STORYCUE_JEV_ENABLED=input.enableJev?"1":"0";next.RELAY_LLM_PROVIDER="openai";
  if(!next.DOUBAO_API_KEY || !next.RELAY_LLM_API_KEY)throw new Error("请填写语音与即时追问的 Key");
  if(input.enableJev&&!next.TYPESAFE_API_KEY)throw new Error("启用增强语义判断时需要填写对应 Key");
  await writeFile(file(),Object.entries(next).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join("\n")+"\n",{mode:0o600});
  Object.assign(process.env,next);return {saved:true,restartVoice:true};
}
export async function setupStatus(){let saved:Record<string,string>={};try{saved=parse(await readFile(file()));}catch{}
  const has=(key:string)=>!!(saved[key]||process.env[key]);return {speechConfigured:has("DOUBAO_API_KEY"),textConfigured:has("RELAY_LLM_API_KEY"),jevEnabled:(saved.STORYCUE_JEV_ENABLED||process.env.STORYCUE_JEV_ENABLED)==="1"};
}
