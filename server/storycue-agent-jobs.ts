import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { buildPlanPrompt, parseGeneratedPlan, PlanInputSchema, validatePlanDirection, type PlanInput, type GeneratedPlan } from "../src/lib/voice/interview-plan";

export type PlanJob = { id:string; createdAt:string; input:PlanInput; status:"pending"|"completed"; result?:GeneratedPlan };
function directory(){return path.join(process.env.STORYCUE_DATA_DIR || path.resolve(".storycue-data"),"plan-jobs");}
function jobPath(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw new Error("无效任务编号");return path.join(directory(),id+".json");}
export function planProvider(){return process.env.STORYCUE_PLAN_PROVIDER === "desktop" ? "desktop" : "api";}
export async function createPlanJob(raw:unknown):Promise<PlanJob>{
  const job:PlanJob={id:randomUUID(),createdAt:new Date().toISOString(),input:PlanInputSchema.parse(raw),status:"pending"};
  await mkdir(directory(),{recursive:true,mode:0o700});
  await writeFile(jobPath(job.id),JSON.stringify(job,null,2),{flag:"wx",mode:0o600});return job;
}
export async function readPlanJob(id:string):Promise<PlanJob>{return JSON.parse(await readFile(jobPath(id),"utf8"));}
export async function pendingPlanJobs(){
  await mkdir(directory(),{recursive:true,mode:0o700});
  const jobs=await Promise.all((await readdir(directory())).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n)).map(n=>readPlanJob(n.slice(0,-5))));
  return jobs.filter(j=>j.status==="pending").sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function planJobPrompt(id:string){const job=await readPlanJob(id);return {job,prompt:buildPlanPrompt(job.input)};}
export async function completePlanJob(id:string,raw:string){
  const job=await readPlanJob(id);if(job.status!=="pending")throw new Error("任务已完成，请勿覆盖已确认提纲");
  const result=validatePlanDirection(parseGeneratedPlan(raw),job.input.framework,job.input.background);
  const next:PlanJob={...job,status:"completed",result};
  // Only one desktop agent may commit; no last-writer-wins replacement.
  const lock=jobPath(id)+".submitted";await writeFile(lock,"submitted",{flag:"wx",mode:0o600});
  const temp=jobPath(id)+"."+randomUUID()+".tmp";
  await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});await rename(temp,jobPath(id));return next;
}
