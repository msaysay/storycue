import { saveSetup,setupStatus,SetupInputError } from "../../../../../server/storycue-setup";
import { setupAllowed } from "../../../../../server/trial-access";
export const runtime="nodejs";
export async function GET(request:Request){if(!await setupAllowed(request))return new Response(null,{status:403});return Response.json(await setupStatus(),{headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
  if(!await setupAllowed(request))return new Response(null,{status:403});
  if(!request.headers.get("content-type")?.startsWith("application/json"))return new Response(null,{status:415});
  try{const body=await request.text();if(body.length>5000)return new Response(null,{status:413});return Response.json(await saveSetup(JSON.parse(body)),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return Response.json({error:error instanceof SetupInputError?error.message:"配置未保存。请检查两类服务各自的 Key、即时追问模型名和 HTTPS Base URL（不要附加 /chat/completions、查询参数或账号密码）。"},{status:400});}
}
