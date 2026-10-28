import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {callDesktopPlanner,classifyDesktopFailure,runDesktopPlan} from "../../server/desktop-planner";
import {createPlanJob,readPlanJob,completePlanJob} from "../../server/storycue-agent-jobs";
import {POST as generate} from "../../src/app/api/trial/interview-plan/route";
const plan={focus:"了解企业老板培训后做个人IP实际遇到的卡点与判断依据",questions:[
 {label:"观点入口",question:"老板培训后做IP，最容易忽略什么？",notes:"先听本人的判断，不把所有培训都当作无效。"},
 {label:"支撑经历",question:"能讲一次让你形成判断的具体经历吗？",notes:"沿本人同一件事追行动和变化，没有经历可以谈观察。"},
 {label:"金句提炼",question:"如果只留一句提醒，你想说什么？",notes:"从刚才的表达提炼关键词，不替嘉宾编造口号。"},
 {label:"转化承接",question:"想进一步找你帮助的人，应该怎么开始？",notes:"确认目前的服务范围和本人愿公开的入口，没有服务就尊重。"},
]};
const input={topic:"老板培训后为什么做不成IP？",framework:"北极星" as const,background:""};
async function fixture(source:string){const dir=await mkdtemp(path.join(os.tmpdir(),"storycue-cli-fixture-"));const cli=path.join(dir,"fixture.mjs");await writeFile(cli,source);return{host:"workbuddy" as const,cli,nodeEntry:true,lite:false};}
test("actual CLI subprocess receives prompt and strict no-tools flags, not the interview API keys",async()=>{
 const before=process.env.DOUBAO_API_KEY;process.env.DOUBAO_API_KEY="fixture-private-speech-key";
 try{
  const config=await fixture(`if(process.env.DOUBAO_API_KEY)process.exit(7);const a=process.argv; if(!a.includes('--tools')||a[a.indexOf('--tools')+1]!==''||!a.includes('--strict-mcp-config'))process.exit(8);console.log(JSON.stringify({type:'result',structured_output:${JSON.stringify(plan)}}));`);
  assert.deepEqual(JSON.parse(await callDesktopPlanner(config,input,3000)),plan);
 }finally{if(before===undefined)delete process.env.DOUBAO_API_KEY;else process.env.DOUBAO_API_KEY=before;}
});
test("auth and timeout failures stop instead of waiting forever or echoing diagnostics",async()=>{
 const auth=await fixture(`console.error('Authentication required fixture-private-secret');`);
 await assert.rejects(()=>callDesktopPlanner(auth,input,3000),error=>error instanceof Error&&error.message.includes("尚未登录")&&!error.message.includes("fixture-private-secret"));
 const hung=await fixture(`setInterval(()=>{},1000);`);await assert.rejects(()=>callDesktopPlanner(hung,input,150),/已停止本次调用/);
 assert.match(classifyDesktopFailure("429 insufficient quota secret",1),/额度/);
 assert.ok(!classifyDesktopFailure('{"usage":{"credits":12},"total_cost_usd":0.01}',0).includes("额度"));
});
test("CodeBuddy JSON message arrays expose the terminal result, not usage metadata",async()=>{
 const config=await fixture(`console.log(JSON.stringify([{type:'message',role:'user',content:'fixture'},{type:'message',role:'assistant',content:'fixture'},{type:'result',subtype:'success',is_error:false,result:JSON.stringify(${JSON.stringify(plan)}),usage:{credits:12}}],null,2));`);
 assert.deepEqual(JSON.parse(await callDesktopPlanner(config,input,3000)),plan);
});
test("automatic queue completes once and a failed CLI has a terminal failure state",async()=>{
 const before=process.env.STORYCUE_DATA_DIR;process.env.STORYCUE_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),"storycue-auto-job-"));
 try{
  const ok=await fixture(`setTimeout(()=>console.log(JSON.stringify({type:'result',result:JSON.stringify(${JSON.stringify(plan)})})),80);`);
  const job=await createPlanJob(input);await Promise.all([runDesktopPlan(job.id,ok),runDesktopPlan(job.id,ok)]);assert.equal((await readPlanJob(job.id)).status,"completed");await assert.rejects(()=>completePlanJob(job.id,JSON.stringify(plan)));
  const broken=await fixture(`console.error('Authentication required');`);const failed=await createPlanJob(input);await runDesktopPlan(failed.id,broken);const state=await readPlanJob(failed.id);assert.equal(state.status,"failed");assert.match(state.error||"",/尚未登录/);
  const invalid=await fixture(`console.log(JSON.stringify({result:'{"focus":"bad"}'}));`);const bad=await createPlanJob(input);await runDesktopPlan(bad.id,invalid);assert.equal((await readPlanJob(bad.id)).status,"failed");
 }finally{if(before===undefined)delete process.env.STORYCUE_DATA_DIR;else process.env.STORYCUE_DATA_DIR=before;}
});
test("an unconnected host returns actionable 409 and does not create an endless pending task",async()=>{
 const vars={STORYCUE_DATA_DIR:await mkdtemp(path.join(os.tmpdir(),"storycue-no-bridge-")),STORYCUE_PLAN_PROVIDER:"desktop",STORYCUE_DESKTOP_HOST:"",AURAL_LOCAL_TRIAL:"1",NEXT_PUBLIC_APP_URL:"http://127.0.0.1:3066"};
 const before=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));Object.assign(process.env,vars);
 try{const response=await generate(new Request("http://127.0.0.1:3066/api/trial/interview-plan",{method:"POST",headers:{Origin:"http://127.0.0.1:3066","Content-Type":"application/json"},body:JSON.stringify(input)}));assert.equal(response.status,409);assert.match((await response.json()).error,/尚未连接/);}
 finally{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
