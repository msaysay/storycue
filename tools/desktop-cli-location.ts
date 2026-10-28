import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export function locateOfficialCli(host:"workbuddy"|"codex",projectRoot=process.cwd(),searchPath=process.env.PATH||""){
  if(host==="workbuddy"){
    try{const pkg=createRequire(path.join(projectRoot,"package.json")).resolve("@tencent-ai/codebuddy-code/package.json");const entry=path.join(path.dirname(pkg),"bin/codebuddy");if(existsSync(entry))return entry;}catch{}
  }
  if(host==="codex"&&process.env.CODEX_APP_RUNTIME_CLI_PATH&&existsSync(process.env.CODEX_APP_RUNTIME_CLI_PATH))return process.env.CODEX_APP_RUNTIME_CLI_PATH;
  const names=host==="workbuddy"?["codebuddy","codebuddy-code"]:["codex"];
  for(const folder of searchPath.split(path.delimiter).filter(Boolean))for(const name of names)for(const ext of process.platform==="win32"?[".exe","", ".cmd"]:[""]){
    const file=path.join(folder,name+ext);if(!existsSync(file))continue;
    if(ext!==".cmd")return file;
    const npmEntry=path.join(folder,host==="workbuddy"?"node_modules/@tencent-ai/codebuddy-code/bin/codebuddy":"node_modules/@openai/codex/bin/codex.js");
    if(existsSync(npmEntry))return npmEntry;
  }
  return undefined;
}
