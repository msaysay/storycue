import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { availableTurnTaking,interviewCommitDelay } from "../../src/lib/voice/trial-settings";
import { checkJevAvailability } from "../../server/jev-turn-taking";
import { createPlanJob,pendingPlanJobs,completePlanJob,readPlanJob } from "../../server/storycue-agent-jobs";
import { POST as generate } from "../../src/app/api/trial/interview-plan/route";
import { GET as poll } from "../../src/app/api/trial/agent-plan/[id]/route";
import { POST as configure,GET as status } from "../../src/app/api/trial/setup/route";
const plan={focus:"了解企业老板培训之后实际执行的卡点和判断依据",questions:[
 {label:"观点入口",question:"老板培训后做IP，最容易忽略什么？",notes:"先听实际判断，不预设所有培训都无效。"},
 {label:"支撑经历",question:"能讲一次让你形成判断的具体经历吗？",notes:"沿同一件事追行动和变化，没有经历可以说观察。"},
 {label:"金句提炼",question:"如果只留一句提醒，你想说什么？",notes:"从本人刚才的表达里提炼，不替嘉宾编造金句。"},
 {label:"转化承接",question:"想进一步找你帮助的人，应该怎么开始？",notes:"确认现有服务范围和本人愿意公开的入口，没有就尊重。"},
]};
test("the published desktop-agent CLI really runs in the default CommonJS package",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"storycue-cli-test-"));
  const result=execFileSync(process.execPath,["--import","tsx",path.resolve("tools/storycue-agent.ts"),"pending"],{cwd:process.cwd(),env:{...process.env,STORYCUE_DATA_DIR:dir},encoding:"utf8",timeout:20000});
  assert.deepEqual(JSON.parse(result),[]);
});
test("no Jev means automatic commit, no key/network requirement and no manual button",async t=>{
 const before={enabled:process.env.STORYCUE_JEV_ENABLED,key:process.env.TYPESAFE_API_KEY};process.env.STORYCUE_JEV_ENABLED="0";process.env.TYPESAFE_API_KEY="fixture-disabled-key";
 t.mock.method(globalThis,"fetch",async()=>{throw new Error("Disabled Jev must not make network requests");});
 try{assert.equal(await checkJevAvailability(),"not_configured");assert.equal(availableTurnTaking("SEMANTIC","not_configured"),"PATIENT");assert.equal(availableTurnTaking("SEMANTIC","region_unavailable"),"PATIENT");assert.notEqual(interviewCommitDelay("PATIENT",1,3500),null);assert.equal(availableTurnTaking("SEMANTIC","available"),"SEMANTIC");}
 finally{if(before.enabled===undefined)delete process.env.STORYCUE_JEV_ENABLED;else process.env.STORYCUE_JEV_ENABLED=before.enabled;if(before.key===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=before.key;}
});
test("desktop API queues without model calls; strict submit roundtrips and completed plans cannot be overwritten",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"storycue-agent-test-"));const before={dir:process.env.STORYCUE_DATA_DIR,provider:process.env.STORYCUE_PLAN_PROVIDER,local:process.env.AURAL_LOCAL_TRIAL,url:process.env.NEXT_PUBLIC_APP_URL};
 Object.assign(process.env,{STORYCUE_DATA_DIR:dir,STORYCUE_PLAN_PROVIDER:"desktop",AURAL_LOCAL_TRIAL:"1",NEXT_PUBLIC_APP_URL:"http://127.0.0.1:3066"});
 t.mock.method(globalThis,"fetch",async()=>{throw new Error("Desktop planning must not use a model API");});
 try{
  const r=await generate(new Request("http://127.0.0.1:3066/api/trial/interview-plan",{method:"POST",headers:{"Content-Type":"application/json",Origin:"http://127.0.0.1:3066"},body:JSON.stringify({topic:"老板培训后为什么做不成IP？",framework:"观点破题",background:""})}));assert.equal(r.status,202);const {jobId}=await r.json();
  await assert.rejects(()=>completePlanJob(jobId,JSON.stringify({...plan,questions:plan.questions.slice(0,2)})));assert.equal((await readPlanJob(jobId)).status,"pending");
  await completePlanJob(jobId,JSON.stringify(plan));await assert.rejects(()=>completePlanJob(jobId,JSON.stringify(plan)));
  const response=await poll(new Request("http://127.0.0.1:3066/api/trial/agent-plan/"+jobId),{params:Promise.resolve({id:jobId})});const value=await response.json();assert.deepEqual(value.questions,plan.questions);assert.equal(value.status,"completed");assert.equal((await pendingPlanJobs()).length,0);
  await assert.rejects(()=>readPlanJob("../../anything"));
  const other=await createPlanJob({topic:"方法起步",framework:"方法直给"});await assert.rejects(()=>completePlanJob(other.id,JSON.stringify(plan)));assert.equal((await readPlanJob(other.id)).status,"pending");
 }finally{for(const[k,v]of Object.entries({STORYCUE_DATA_DIR:before.dir,STORYCUE_PLAN_PROVIDER:before.provider,AURAL_LOCAL_TRIAL:before.local,NEXT_PUBLIC_APP_URL:before.url})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test("local setup never returns secret values and cross-site config writes are refused",async()=>{
 const file=path.join(await mkdtemp(path.join(os.tmpdir(),"storycue-config-test-")),".env.local");const keys=["STORYCUE_OPEN_SOURCE","STORYCUE_CONFIG_FILE","DOUBAO_API_KEY","RELAY_LLM_API_KEY","RELAY_LLM_BASE_URL","RELAY_LLM_MODEL","RELAY_LLM_PROVIDER","TYPESAFE_API_KEY","STORYCUE_JEV_ENABLED"];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{STORYCUE_OPEN_SOURCE:"1",STORYCUE_CONFIG_FILE:file});
 const body={speechKey:"fixture-speech-key",textKey:"fixture-text-key",llmBaseUrl:"https://example.com/v1",llmModel:"fixture-model",enableJev:false};
 const req=(origin:string)=>new Request("http://127.0.0.1:3066/api/trial/setup",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(body)});
 try{assert.equal((await configure(req("https://unrelated.example"))).status,403);const r=await configure(req("http://127.0.0.1:3066"));assert.equal(r.status,200);assert.ok(!(await r.text()).includes(body.speechKey));const state=await status(new Request("http://127.0.0.1:3066/api/trial/setup"));const value=await state.text();assert.ok(!value.includes(body.textKey));assert.ok(!value.includes(body.speechKey));assert.match(await readFile(file,"utf8"),/STORYCUE_JEV_ENABLED="0"/);}
 finally{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
