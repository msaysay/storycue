import { readPlanJob } from "../../../../../../server/storycue-agent-jobs";
export const runtime="nodejs";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  if(process.env.AURAL_LOCAL_TRIAL!=="1")return new Response(null,{status:404});
  try{
    const {id}=await context.params;const job=await readPlanJob(id);
    return Response.json({id:job.id,status:job.status,...(job.result?{...job.input,...job.result,source:"AI"}:{})},{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }catch{return Response.json({error:"任务不存在或尚不可读，原提纲仍在。"},{status:404});}
}
