"use client";
import { useEffect,useState } from "react";
import { storycuePath } from "@/lib/voice/storycue-path";
import "../console.css";
export default function Setup(){
  const [status,setStatus]=useState("正在读取本机配置…");const [enabled,setEnabled]=useState(false);const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);const [baseUrl,setBaseUrl]=useState("");const [model,setModel]=useState("");
  const [bridge,setBridge]=useState<{configured:boolean;host:string|null;model?:string|null;verified?:boolean;entry?:string}>({configured:false,host:null});
  useEffect(()=>{fetch(storycuePath("/api/trial/setup")).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{setEnabled(d.jevEnabled);setBaseUrl(d.llmBaseUrl);setModel(d.llmModel);setBridge(d.desktopBridge);setLoaded(true);setStatus(d.speechConfigured&&d.textConfigured?"已读取配置，留空的 Key 会保留原值。切换文本服务商时，请同时换成该服务商的 Key。":"请分别配置语音服务与文本模型，两者可以来自不同服务商。");}).catch(()=>setStatus("无法读取配置，请在运行服务的本机重试。"));},[]);
  return <main className="storycue-console sc-setup"><div className="sc-shell" style={{maxWidth:720}}><h1>StoryCue 服务配置</h1><p>主问题由你自己的 WorkBuddy / Codex 生成。采访中的“听与说”和“想怎么追问”使用下面两套独立服务。</p><form className="sc-panel" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;setBusy(true);try{const data=Object.fromEntries(new FormData(form));const r=await fetch(storycuePath("/api/trial/setup"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,enableJev:enabled})});const result=await r.json();if(!r.ok)throw new Error(result.error);for(const input of form.querySelectorAll<HTMLInputElement>('input[type="password"]'))input.value="";setStatus("配置已保存在本机。请停止并重新运行 StoryCue 启动器，让两套服务的新配置生效，再回到采访页面。");}catch(error){setStatus(error instanceof Error?error.message:"保存失败");}finally{setBusy(false);}}}>
  <h2>主问题 · 本机桌面 AI 自动生成</h2><p>{bridge.configured?`${bridge.entry==="bundled-lite"?"检测到旧版精简入口，请 npm ci 后重新 desktop:connect。":`${bridge.verified?"最近 24 小时内已通过真实模型调用":"已找到入口，尚未通过当前模型检查"}：${bridge.host==="workbuddy"?"WorkBuddy / CodeBuddy":"Codex"}${bridge.model?`（${bridge.model}）`:""}。`} 可在项目目录运行 npm run desktop:doctor 验证；未登录时再运行 desktop:login。网页点生成会调用这个独立 CLI 账号并回填，不需要主问题 API Key。`:"尚未连接。请让安装此工具的 WorkBuddy/Codex 在项目目录执行 npm ci，再执行 npm run desktop:connect -- --host workbuddy（Codex 用 --host codex），然后运行 npm run desktop:doctor。未登录时运行 desktop:login 完成一次官方登录，再重新检查。"}</p>
  <h2>1 · 豆包语音：听你回答，把问题读出来</h2>
  <p>使用火山引擎语音控制台的 API Key，并为该 Key 开通所需的语音识别与语音合成服务。它与火山方舟的文本模型 Key 属于不同服务，请分别核对权限和额度。</p>
  <div className="sc-field"><label htmlFor="speech-key">豆包语音 API Key</label><input id="speech-key" name="speechKey" type="password" autoComplete="off" placeholder="首次必填；已配置时可留空" /></div>
  <details><summary>查看固定语音地址（已内置，无需填写）</summary>
  <p style={{overflowWrap:"anywhere"}}>识别 ASR：<code>wss://openspeech.bytedance.com/api/v3/sauc/bigmodel</code></p>
  <p style={{overflowWrap:"anywhere"}}>合成 TTS：<code>https://openspeech.bytedance.com/api/v3/tts/unidirectional</code></p>
  <p>这里不使用下方文本模型的 Base URL，也不能把语音 Key 填进文本模型一栏。</p></details>
  <h2>2 · 即时追问：选择你自己的快速文本模型</h2>
  <p>可以与豆包语音使用不同服务商。当前支持 OpenAI Chat Completions 兼容接口：流式 SSE、Bearer Key 认证，以及标准 messages / temperature / max_tokens 参数。优先选择响应快、直接输出答案的模型；只支持其他协议的接口需要单独适配。</p>
  <div className="sc-field"><label htmlFor="text-key">即时追问模型 API Key（该文本服务商提供）</label><input id="text-key" name="textKey" type="password" autoComplete="off" placeholder="首次或切换服务商时填写；同服务可留空" /></div>
  <div className="sc-field"><label htmlFor="llm-base">即时追问模型 Base URL（独立于豆包语音）</label><input id="llm-base" name="llmBaseUrl" type="url" required value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://你的文本服务地址/v1" aria-describedby="llm-base-help" disabled={!loaded} /></div>
  <p id="llm-base-help">填写服务商给出的 HTTPS API 基础地址，保留其 /v1 或 /api/v3 等前缀，不要填写控制台网页，也不要附加 /chat/completions。工具会自动拼接此路径。</p>
  <div className="sc-field"><label htmlFor="llm-model">即时追问模型名称或接入点 ID</label><input id="llm-model" name="llmModel" required value={model} onChange={e=>setModel(e.target.value)} placeholder="按该服务商实际开通的模型填写" disabled={!loaded} /></div>
  <p>Key、Base URL、模型名必须属于同一文本服务。更换模型后，采访声音仍由上方豆包语音提供。此模型同时用于剪辑建议；主问题默认仍用桌面 AI。</p>
  <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} /> 启用增强语义接话（可选，需要服务网络可达）</label>
  <p>默认自动根据停顿接话，不需要额外服务，也不需要每次点击提交。</p>
  {enabled?<div className="sc-field"><label htmlFor="jev-key">增强语义服务 Key（Jev）</label><input id="jev-key" name="jevKey" type="password" autoComplete="off" /></div>:null}
  <button className="sc-button sc-button-primary" disabled={busy||!loaded}>保存本机配置</button><p role="status">{status}</p><p>Key 仅保存到本机 .env.local，不会回显、写入浏览器记录或提交到 Git。文本与语音服务分别计费，使用自己的账号额度。</p><a href={storycuePath("/trial/mobile")}>回到访谈</a></form></div></main>;
}
