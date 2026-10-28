import { spawn } from 'node:child_process';
import { readFileSync,existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const configuration=path.join(root,'.env.local');
const config=existsSync(configuration)?parse(readFileSync(configuration)):{};
const port=process.env.STORYCUE_PORT||'3066',voicePort=process.env.VOICE_RELAY_PORT||'8866';
const env={...process.env,...config,AURAL_LOCAL_TRIAL:'1',NEXT_PUBLIC_AURAL_LOCAL_TRIAL:'1',STORYCUE_OPEN_SOURCE:'1',STORYCUE_PLAN_PROVIDER:config.STORYCUE_PLAN_PROVIDER||'desktop',STORYCUE_JEV_ENABLED:config.STORYCUE_JEV_ENABLED||'0',STORYCUE_CONFIG_FILE:configuration,NEXT_PUBLIC_APP_URL:`http://127.0.0.1:${port}`,VOICE_RELAY_PORT:voicePort,NEXT_PUBLIC_VOICE_RELAY_URL:`ws://127.0.0.1:${voicePort}`,NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL:`ws://127.0.0.1:${voicePort}`,NEXT_PUBLIC_VOICE_RELAY_PRIMARY:'voice',RELAY_LLM_PROVIDER:config.RELAY_LLM_PROVIDER||process.env.RELAY_LLM_PROVIDER||'openai',DOUBAO_ASR_RESOURCE_ID:config.DOUBAO_ASR_RESOURCE_ID||'volc.seedasr.sauc.duration',DOUBAO_TTS_RESOURCE_ID:config.DOUBAO_TTS_RESOURCE_ID||'seed-tts-2.0',RELAY_LLM_THINKING:'disabled'};
// No vaults, publisher servers, account files or proxy discovery. Only user env/config.
const children=[];
if(env.DOUBAO_API_KEY&&env.RELAY_LLM_API_KEY)children.push(spawn(process.execPath,['--import','tsx','server/voice-relay.ts'],{cwd:root,env,stdio:'inherit',windowsHide:true}));
else console.log('语音尚未配置：请在本机网页 /trial/setup 填写自己的 Key，保存后重新启动。');
const next=spawn(process.execPath,['node_modules/next/dist/bin/next',process.argv.includes('--dev')?'dev':'start',...(process.argv.includes('--dev')?['--webpack']:[]),'--hostname','127.0.0.1','--port',port],{cwd:root,env,stdio:'inherit',windowsHide:true});children.push(next);
console.log(`StoryCue: http://127.0.0.1:${port}/trial/mobile · 默认自动接话 · 主问题使用桌面 AI`);
function shutdown(){for(const child of children)if(child.exitCode===null)child.kill();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
for(const child of children)child.on('exit',code=>{shutdown();process.exitCode=code||0;});
