import { saveSetup,setupStatus } from "../../../../../server/storycue-setup";
export const runtime="nodejs";
function allowed(request:Request){const url=new URL(request.url);const origin=request.headers.get("origin");return process.env.STORYCUE_OPEN_SOURCE==="1"&&["127.0.0.1","localhost","[::1]"].includes(url.hostname)&&(!origin||origin===url.origin)&&request.headers.get("sec-fetch-site")!=="cross-site";}
export async function GET(request:Request){if(!allowed(request))return new Response(null,{status:403});return Response.json(await setupStatus(),{headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
  if(!allowed(request))return new Response(null,{status:403});
  if(!request.headers.get("content-type")?.startsWith("application/json"))return new Response(null,{status:415});
  try{const body=await request.text();if(body.length>5000)return new Response(null,{status:413});return Response.json(await saveSetup(JSON.parse(body)),{headers:{"Cache-Control":"no-store"}});}
  catch{return Response.json({error:"请检查 Key 与 HTTPS 模型地址；配置没有完成。"},{status:400});}
}
