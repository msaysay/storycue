import { readPlanJob,failPlanJob } from "../../../../../../server/storycue-agent-jobs";
export const runtime="nodejs";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  if(process.env.AURAL_LOCAL_TRIAL!=="1")return new Response(null,{status:404});
  try{
    const {id}=await context.params;let job=await readPlanJob(id);
    if(job.status==="running"&&Date.now()-Date.parse(job.startedAt||job.createdAt)>180_000){await failPlanJob(id,"桌面 AI 调用已中断或超时，请重新生成；已有提纲仍在。");job=await readPlanJob(id);}
    return Response.json({id:job.id,status:job.status,automatic:job.automatic===true,host:job.host,...(job.status==="failed"?{error:job.error}:{}),...(job.result?{...job.input,...job.result,source:"AI"}:{})},{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }catch{return Response.json({error:"任务不存在或尚不可读，原提纲仍在。"},{status:404});}
}
