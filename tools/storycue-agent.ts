/** Public desktop-agent interface. Does not load API keys or user account files. */
import { readFile } from "node:fs/promises";
import { createPlanJob, pendingPlanJobs, planJobPrompt, completePlanJob } from "../server/storycue-agent-jobs";
const [command,...args]=process.argv.slice(2);
function arg(name:string){const index=args.indexOf(name);return index>=0?args[index+1]:undefined;}
async function main(){
try{
  if(command==="pending")console.log(JSON.stringify(await pendingPlanJobs(),null,2));
  else if(command==="prompt")console.log(JSON.stringify(await planJobPrompt(arg("--id")||""),null,2));
  else if(command==="submit"){
    const result=await completePlanJob(arg("--id")||"",await readFile(arg("--file")||"","utf8"));
    console.log(JSON.stringify({id:result.id,status:result.status,questions:result.result?.questions.length}));
  }else if(command==="create"){
    const job=await createPlanJob({topic:arg("--topic"),framework:arg("--framework")||"观点破题",background:arg("--background")||""});
    console.log(JSON.stringify({id:job.id,status:job.status}));
  }else throw new Error("用法：pending | prompt --id 编号 | submit --id 编号 --file JSON路径 | create --topic 选题 --framework 方向");
}catch(error){console.error(error instanceof Error?error.message:"任务失败");process.exitCode=1;}
}
void main();
