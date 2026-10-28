/** One-time official CLI connection. No credential file is inspected or copied. */
import { existsSync,openSync,readSync,closeSync } from "node:fs";
import { execFileSync,spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { desktopBridgeStatus,readDesktopBridge,saveDesktopBridge,type DesktopBridge } from "../server/desktop-planner";
const [command,...args]=process.argv.slice(2);
function arg(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
function onPath(name:string){for(const folder of (process.env.PATH||"").split(path.delimiter)){for(const ext of process.platform==="win32"?[".exe","", ".cmd"]:[""]){const file=path.join(folder,name+ext);if(existsSync(file)){
  if(file.endsWith(".cmd")){const npmEntry=path.join(folder,"node_modules/@tencent-ai/codebuddy-code/bin/codebuddy");if(existsSync(npmEntry))return npmEntry;continue;}
  return file;
}}}return undefined;}
function locate(host:"workbuddy"|"codex"){
  if(arg("--cli"))return path.resolve(arg("--cli")!);
  if(host==="codex")return process.env.CODEX_APP_RUNTIME_CLI_PATH||onPath("codex");
  const installed=onPath("codebuddy");if(installed)return installed;
  const candidates:string[]=[];
  if(process.platform==="win32")try{
    const exe=execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command","Get-Process -Name WorkBuddy -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path"],{encoding:"utf8",windowsHide:true,timeout:5000}).trim();
    if(exe)candidates.push(path.join(path.dirname(exe),"resources/app.asar.unpacked/cli/bin/codebuddy"));
  }catch{}
  if(process.platform==="darwin")for(const app of ["WorkBuddy AI.app","WorkBuddy.app"])candidates.push(`/Applications/${app}/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`);
  return candidates.find(existsSync)||onPath("codebuddy");
}
async function main(){
  if(command==="connect"){
    const host=arg("--host");if(host!=="workbuddy"&&host!=="codex")throw new Error("请按安装宿主指定 --host workbuddy 或 --host codex，不能替用户切换账号来源。");
    const cli=locate(host);if(!cli||!existsSync(cli))throw new Error("没有找到对应官方 CLI。请打开已安装的 WorkBuddy，或安装官方 CLI；也可通过 --cli 指定其实际入口。");
    if(!/^(codex(?:\.exe)?|codebuddy(?:\.exe)?|codebuddy-lite-wb\.mjs)$/.test(path.basename(cli)))throw new Error("仅支持官方 codex/codebuddy CLI 入口，不接受任意 shell 命令。");
    const fd=openSync(cli,"r"),head=Buffer.alloc(80);try{readSync(fd,head,0,80,0);}finally{closeSync(fd);}
    const nodeEntry=/\.mjs$/.test(cli)||head.toString().includes("#!/usr/bin/env node");
    const lite=host==="workbuddy"&&existsSync(path.resolve(path.dirname(cli),"../dist/codebuddy-lite-wb.mjs"));
    let model=arg("--model");
    if(host==="workbuddy"&&!model)try{
      const help=execFileSync(nodeEntry?process.execPath:cli,nodeEntry?[cli,"--help"]:["--help"],{encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:200000,env:{...process.env,...(lite?{CODEBUDDY_FORCE_LITE_WB_BUNDLE:"1"}:{})}});
      const listed=help.match(/Currently supported:\s*\(([^)]+)\)/)?.[1].split(",").map(item=>item.trim())||[];
      model=["deepseek-v4.1-flash","glm-5.3-flash","minimax-m3.1-flash","deepseek-v3-2-volc"].find(item=>listed.includes(item));
    }catch{}
    const config:DesktopBridge={host,cli,nodeEntry,lite,...(model?{model}:{}),...(host==="workbuddy"&&process.env.CODEBUDDY_CONFIG_DIR?{configDir:process.env.CODEBUDDY_CONFIG_DIR}:{})};
    await saveDesktopBridge(config);console.log(JSON.stringify({connected:true,host,model:model||"CLI default",note:"网页生成将自动调用此宿主；若 CLI 未登录，请先运行 desktop:login 完成一次官方登录。"}));
  }else if(command==="status")console.log(JSON.stringify(await desktopBridgeStatus()));
  else if(command==="login"){
    let config=await readDesktopBridge();if(!config)throw new Error("请先连接本机宿主。");
    if(config.host==="workbuddy"&&config.lite){
      const full=onPath("codebuddy");
      if(!full)throw new Error("WorkBuddy 自带精简入口不含完整交互登录界面。请安装官方 CLI：npm install -g @tencent-ai/codebuddy-code，再重新执行 desktop:connect 和 desktop:login。不要复制桌面 App 的 Token。");
      const fd=openSync(full,"r"),head=Buffer.alloc(80);try{readSync(fd,head,0,80,0);}finally{closeSync(fd);}
      config={...config,cli:full,nodeEntry:head.toString().includes("#!/usr/bin/env node"),lite:false};await saveDesktopBridge(config);
    }
    const env={...process.env};if(config.configDir)env.CODEBUDDY_CONFIG_DIR=config.configDir;if(config.lite)env.CODEBUDDY_FORCE_LITE_WB_BUNDLE="1";
    const loginArgs=config.host==="codex"?["login"]:[];
    const child=spawn(config.nodeEntry?process.execPath:config.cli,config.nodeEntry?[config.cli,...loginArgs]:loginArgs,{cwd:os.tmpdir(),env,windowsHide:false,stdio:"inherit",shell:false});
    child.on("exit",code=>{process.exitCode=code||0;});child.on("error",()=>{console.error("无法打开官方登录 CLI");process.exitCode=1;});
  }else throw new Error("用法：connect --host workbuddy|codex [--cli 官方入口] | status | login");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"桌面连接未完成");process.exitCode=1;});
