import { saveSetup,setupStatus,SetupInputError } from "../../../../../server/storycue-setup";
export const runtime="nodejs";
function allowed(request:Request){
  const url=new URL(request.url),origin=request.headers.get("origin");
  // Next may canonicalize request.url to localhost while the browser uses 127.0.0.1.
  // Compare against the actual Host as well, retaining local-only and same-origin checks.
  const host=request.headers.get("host")||url.host;
  let localOrigin:URL;try{localOrigin=new URL(`${url.protocol}//${host}`);}catch{return false;}
  if(localOrigin.username||localOrigin.password||localOrigin.pathname!=="/"||localOrigin.search||localOrigin.hash)return false;
  const loopback=(hostname:string)=>["127.0.0.1","localhost","[::1]"].includes(hostname);
  return process.env.STORYCUE_OPEN_SOURCE==="1"&&loopback(url.hostname)&&loopback(localOrigin.hostname)&&(!origin||origin===localOrigin.origin)&&request.headers.get("sec-fetch-site")!=="cross-site";
}
export async function GET(request:Request){if(!allowed(request))return new Response(null,{status:403});return Response.json(await setupStatus(),{headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
  if(!allowed(request))return new Response(null,{status:403});
  if(!request.headers.get("content-type")?.startsWith("application/json"))return new Response(null,{status:415});
  try{const body=await request.text();if(body.length>5000)return new Response(null,{status:413});return Response.json(await saveSetup(JSON.parse(body)),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return Response.json({error:error instanceof SetupInputError?error.message:"配置未保存。请检查两类服务各自的 Key、即时追问模型名和 HTTPS Base URL（不要附加 /chat/completions、查询参数或账号密码）。"},{status:400});}
}
