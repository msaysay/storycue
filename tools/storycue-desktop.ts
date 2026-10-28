/** One-time official CLI connection. No credential file is inspected or copied. */
import { existsSync,openSync,readSync,closeSync } from "node:fs";
import { execFileSync,spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { desktopBridgeStatus,readDesktopBridge,saveDesktopBridge,desktopChildEnvironment,callDesktopPlanner,recordDesktopVerification,type DesktopBridge } from "../server/desktop-planner";
import { locateOfficialCli } from "./desktop-cli-location";
const [command,...args]=process.argv.slice(2);
function arg(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
function locate(host:"workbuddy"|"codex"){
  if(arg("--cli"))return path.resolve(arg("--cli")!);
  return locateOfficialCli(host);
}
async function main(){
  if(command==="connect"){
    const host=arg("--host");if(host!=="workbuddy"&&host!=="codex")throw new Error("请按安装宿主指定 --host workbuddy 或 --host codex，不能替用户切换账号来源。");
    const cli=locate(host);if(!cli||!existsSync(cli))throw new Error("没有找到对应官方 CLI。请打开已安装的 WorkBuddy，或安装官方 CLI；也可通过 --cli 指定其实际入口。");
    if(!/^(codex(?:\.exe|\.js)?|codebuddy(?:\.exe)?)$/.test(path.basename(cli)))throw new Error("仅支持官方 codex/codebuddy CLI 入口，不接受任意 shell 命令。");
    const fd=openSync(cli,"r"),head=Buffer.alloc(80);try{readSync(fd,head,0,80,0);}finally{closeSync(fd);}
    const nodeEntry=/\.mjs$/.test(cli)||head.toString().includes("#!/usr/bin/env node");
    const lite=host==="workbuddy"&&existsSync(path.resolve(path.dirname(cli),"../dist/codebuddy-lite-wb.mjs"))&&!existsSync(path.resolve(path.dirname(cli),"../dist/codebuddy.js"));
    if(lite)throw new Error("不再连接 WorkBuddy App 内置精简 CLI。请先在本项目 npm ci 安装完整官方 CLI，再重新连接；不要复制 App 登录凭据。");
    let model=arg("--model");
    if(host==="workbuddy"&&!model)try{
      const help=execFileSync(nodeEntry?process.execPath:cli,nodeEntry?[cli,"--help"]:["--help"],{encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:200000,env:desktopChildEnvironment({host,cli,nodeEntry,lite:false})});
      const listed=help.match(/Currently supported:\s*\(([^)]+)\)/)?.[1].split(",").map(item=>item.trim())||[];
      model=["deepseek-v4.1-flash","glm-5.3-flash","minimax-m3.1-flash","deepseek-v3-2-volc"].find(item=>listed.includes(item));
    }catch{}
    const config:DesktopBridge={host,cli,nodeEntry,lite,...(model?{model}:{}),...(host==="workbuddy"&&arg("--config-dir")?{configDir:path.resolve(arg("--config-dir")!)}:{})};
    await saveDesktopBridge(config);console.log(JSON.stringify({connected:true,verified:false,host,model:model||"CLI default",note:"已保存入口，尚未验证模型。请运行 npm run desktop:doctor；若未登录，再运行 desktop:login 完成官方登录。"}));
  }else if(command==="status")console.log(JSON.stringify(await desktopBridgeStatus()));
  else if(command==="doctor"){
    const config=await readDesktopBridge();if(!config)throw new Error("请先运行 desktop:connect 连接本机宿主。");
    const started=Date.now();try{const raw=await callDesktopPlanner(config,{topic:"为什么企业老板上了培训班，仍然做不成个人IP？",framework:"北极星",background:"连通性测试，只生成采访问题，不编造嘉宾事实。"});await recordDesktopVerification(config);console.log(JSON.stringify({verified:true,host:config.host,model:config.model||"CLI default",questions:JSON.parse(raw).questions.length,elapsedMs:Date.now()-started}));}
    catch(error){const message=error instanceof Error?error.message:"模型连通性检查失败";await recordDesktopVerification(config,message);throw new Error(message);}
  }
  else if(command==="login"){
    const config=await readDesktopBridge();if(!config)throw new Error("请先连接本机宿主。");
    if(config.host==="workbuddy"&&config.lite){
      throw new Error("旧配置使用精简入口。请先 npm ci，再重新 desktop:connect，使用完整官方 CLI 登录。");
    }
    const env=desktopChildEnvironment(config);
    const loginArgs=config.host==="codex"?["login"]:[];
    const child=spawn(config.nodeEntry?process.execPath:config.cli,config.nodeEntry?[config.cli,...loginArgs]:loginArgs,{cwd:os.tmpdir(),env,windowsHide:false,stdio:"inherit",shell:false});
    child.on("exit",code=>{process.exitCode=code||0;});child.on("error",()=>{console.error("无法打开官方登录 CLI");process.exitCode=1;});
  }else throw new Error("用法：connect --host workbuddy|codex [--cli 官方入口] [--config-dir 官方CLI配置目录] | status | doctor | login");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"桌面连接未完成");process.exitCode=1;});
