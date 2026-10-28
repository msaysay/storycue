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
import { saveSetup,setupStatus,SetupSchema } from "../../server/storycue-setup";
import { callRelayLLM,resetRelayLlmCacheForTests } from "../../server/relay-llm";
import { parse } from "dotenv";
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
 const dir=await mkdtemp(path.join(os.tmpdir(),"storycue-agent-test-"));const before={dir:process.env.STORYCUE_DATA_DIR,provider:process.env.STORYCUE_PLAN_PROVIDER,local:process.env.AURAL_LOCAL_TRIAL,url:process.env.NEXT_PUBLIC_APP_URL,host:process.env.STORYCUE_DESKTOP_HOST};
 Object.assign(process.env,{STORYCUE_DATA_DIR:dir,STORYCUE_PLAN_PROVIDER:"desktop",STORYCUE_DESKTOP_HOST:"manual",AURAL_LOCAL_TRIAL:"1",NEXT_PUBLIC_APP_URL:"http://127.0.0.1:3066"});
 t.mock.method(globalThis,"fetch",async()=>{throw new Error("Desktop planning must not use a model API");});
 try{
  const r=await generate(new Request("http://127.0.0.1:3066/api/trial/interview-plan",{method:"POST",headers:{"Content-Type":"application/json",Origin:"http://127.0.0.1:3066"},body:JSON.stringify({topic:"老板培训后为什么做不成IP？",framework:"观点破题",background:""})}));assert.equal(r.status,202);const {jobId}=await r.json();
  await assert.rejects(()=>completePlanJob(jobId,JSON.stringify({...plan,questions:plan.questions.slice(0,2)})));assert.equal((await readPlanJob(jobId)).status,"pending");
  await completePlanJob(jobId,JSON.stringify(plan));await assert.rejects(()=>completePlanJob(jobId,JSON.stringify(plan)));
  const response=await poll(new Request("http://127.0.0.1:3066/api/trial/agent-plan/"+jobId),{params:Promise.resolve({id:jobId})});const value=await response.json();assert.deepEqual(value.questions,plan.questions);assert.equal(value.status,"completed");assert.equal((await pendingPlanJobs()).length,0);
  await assert.rejects(()=>readPlanJob("../../anything"));
  const other=await createPlanJob({topic:"方法起步",framework:"方法直给"});await assert.rejects(()=>completePlanJob(other.id,JSON.stringify(plan)));assert.equal((await readPlanJob(other.id)).status,"pending");
 }finally{for(const[k,v]of Object.entries({STORYCUE_DATA_DIR:before.dir,STORYCUE_PLAN_PROVIDER:before.provider,AURAL_LOCAL_TRIAL:before.local,NEXT_PUBLIC_APP_URL:before.url,STORYCUE_DESKTOP_HOST:before.host})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test("local setup never returns secret values and cross-site config writes are refused",async()=>{
 const file=path.join(await mkdtemp(path.join(os.tmpdir(),"storycue-config-test-")),".env.local");const keys=["STORYCUE_OPEN_SOURCE","STORYCUE_CONFIG_FILE","DOUBAO_API_KEY","RELAY_LLM_API_KEY","RELAY_LLM_BASE_URL","RELAY_LLM_MODEL","RELAY_LLM_PROVIDER","RELAY_LLM_THINKING","TYPESAFE_API_KEY","STORYCUE_JEV_ENABLED"];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{STORYCUE_OPEN_SOURCE:"1",STORYCUE_CONFIG_FILE:file});
 const body={speechKey:"fixture-speech-key",textKey:"fixture-text-key",llmBaseUrl:"https://example.com/v1",llmModel:"fixture-model",enableJev:false};
 const req=(origin:string)=>new Request("http://127.0.0.1:3066/api/trial/setup",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(body)});
 try{assert.equal((await configure(req("https://unrelated.example"))).status,403);const r=await configure(req("http://127.0.0.1:3066"));assert.equal(r.status,200);assert.ok(!(await r.text()).includes(body.speechKey));const state=await status(new Request("http://127.0.0.1:3066/api/trial/setup"));const value=await state.text();assert.ok(!value.includes(body.textKey));assert.ok(!value.includes(body.speechKey));assert.match(await readFile(file,"utf8"),/STORYCUE_JEV_ENABLED="0"/);
  const canonical=(host:string,origin:string)=>new Request("http://localhost:3066/api/trial/setup",{method:"POST",headers:{Host:host,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal((await configure(canonical("127.0.0.1:3066","http://127.0.0.1:3066"))).status,200);
  assert.equal((await configure(canonical("unrelated.example","https://unrelated.example"))).status,403);
  assert.equal((await configure(canonical("127.0.0.1:3066","https://unrelated.example"))).status,403);
 }
 finally{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test("switching text providers retains speech, requires a new provider key and restores only nonsecret settings",async()=>{
 const keys=["STORYCUE_CONFIG_FILE","DOUBAO_API_KEY","RELAY_LLM_API_KEY","RELAY_LLM_BASE_URL","RELAY_LLM_MODEL","RELAY_LLM_PROVIDER","RELAY_LLM_THINKING","STORYCUE_JEV_ENABLED"];
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const file=path.join(await mkdtemp(path.join(os.tmpdir(),"storycue-two-services-")),".env.local");process.env.STORYCUE_CONFIG_FILE=file;
 try{
  await saveSetup({speechKey:"fixture-speech-only",textKey:"fixture-old-text",llmBaseUrl:"https://ark.cn-beijing.volces.com/api/v3",llmModel:"example-ark-model"});
  const previous=await readFile(file,"utf8");
  await assert.rejects(()=>saveSetup({llmBaseUrl:"https://text.example/v1/",llmModel:"fast-example"}),/新服务商/);
  assert.equal(await readFile(file,"utf8"),previous);
  await saveSetup({textKey:"fixture-new-text",llmBaseUrl:"https://text.example/v1/",llmModel:"fast-example"});
  const saved=parse(await readFile(file,"utf8"));
  assert.equal(saved.DOUBAO_API_KEY,"fixture-speech-only");assert.equal(saved.RELAY_LLM_API_KEY,"fixture-new-text");assert.equal(saved.RELAY_LLM_BASE_URL,"https://text.example/v1");assert.equal(saved.RELAY_LLM_THINKING,"auto");
  const state=await setupStatus();assert.equal(state.llmBaseUrl,"https://text.example/v1");assert.equal(state.llmModel,"fast-example");assert.ok(!JSON.stringify(state).includes("fixture-"));
  for(const llmBaseUrl of ["https://text.example/v1/chat/completions","https://text.example/v1?token=fixture","https://user:pass@text.example/v1"]){assert.equal(SetupSchema.safeParse({llmBaseUrl}).success,false);}
 }finally{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test("compatible text calls use their own URL/key and omit Ark-only thinking on other providers",async t=>{
 const keys=["RELAY_LLM_PROVIDER","RELAY_LLM_API_KEY","RELAY_LLM_MODEL","RELAY_LLM_BASE_URL","RELAY_LLM_THINKING","RELAY_LLM_AUTH_HEADER","MINIMAX_API_KEY","DOUBAO_API_KEY"];
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{RELAY_LLM_PROVIDER:"openai",RELAY_LLM_API_KEY:"fixture-text-only",DOUBAO_API_KEY:"fixture-speech-only",RELAY_LLM_MODEL:"fast-example",RELAY_LLM_BASE_URL:"https://text.example/v1/",RELAY_LLM_THINKING:"auto"});delete process.env.MINIMAX_API_KEY;delete process.env.RELAY_LLM_AUTH_HEADER;
 const requests:{url:string;body:Record<string,unknown>;authorization:string|null}[]=[];
 t.mock.method(globalThis,"fetch",async(url:unknown,init:RequestInit)=>{
  requests.push({url:String(url),body:JSON.parse(String(init.body)),authorization:new Headers(init.headers).get("Authorization")});
  return new Response('data: {"choices":[{"delta":{"content":"当时你怎么做的？"}}]}\n\ndata: [DONE]\n\n',{headers:{"Content-Type":"text/event-stream"}});
 });
 try{
  resetRelayLlmCacheForTests();const updates:string[]=[];assert.equal(await callRelayLLM("fixture prompt",120,x=>updates.push(x)),"当时你怎么做的？");
  assert.equal(requests[0].url,"https://text.example/v1/chat/completions");assert.equal(requests[0].authorization,"Bearer fixture-text-only");assert.equal(requests[0].body.model,"fast-example");assert.equal(requests[0].body.stream,true);assert.equal("thinking" in requests[0].body,false);assert.equal(updates.length,1);
  process.env.RELAY_LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3";resetRelayLlmCacheForTests();await callRelayLLM("fixture prompt",120,()=>{});assert.deepEqual(requests[1].body.thinking,{type:"disabled"});
 }finally{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}resetRelayLlmCacheForTests();}
});
