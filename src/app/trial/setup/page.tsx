"use client";
import { useEffect,useState } from "react";
import { storycuePath } from "@/lib/voice/storycue-path";
import "../console.css";
export default function Setup(){
  const [status,setStatus]=useState("");const [enabled,setEnabled]=useState(false);const [busy,setBusy]=useState(false);
  useEffect(()=>{fetch(storycuePath("/api/trial/setup")).then(r=>r.json()).then(d=>{setEnabled(d.jevEnabled);setStatus(d.speechConfigured&&d.textConfigured?"已配置，留空的 Key 会保留原值。":"请先配置自己的语音和即时追问服务。");}).catch(()=>setStatus("配置页只允许在运行服务的本机打开。"));},[]);
  return <main className="storycue-console"><div className="sc-shell" style={{maxWidth:640}}><h1>StoryCue 服务配置</h1><p>主问题由你自己的 WorkBuddy / Codex 生成；以下服务用于实时识别、播报和即时追问。</p><form className="sc-panel" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;setBusy(true);try{const data=Object.fromEntries(new FormData(form));const r=await fetch(storycuePath("/api/trial/setup"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,enableJev:enabled})});const result=await r.json();if(!r.ok)throw new Error(result.error);form.reset();setStatus("配置已保存在本机。请重新运行启动器使语音配置生效，再回到采访页面。");}catch(error){setStatus(error instanceof Error?error.message:"保存失败");}finally{setBusy(false);}}}>
  <div className="sc-field"><label htmlFor="speech-key">豆包语音 API Key</label><input id="speech-key" name="speechKey" type="password" autoComplete="off" placeholder="已配置时可留空" /></div>
  <div className="sc-field"><label htmlFor="text-key">即时追问模型 API Key</label><input id="text-key" name="textKey" type="password" autoComplete="off" placeholder="已配置时可留空" /></div>
  <div className="sc-field"><label htmlFor="llm-base">模型地址</label><input id="llm-base" name="llmBaseUrl" defaultValue="https://ark.cn-beijing.volces.com/api/v3" /></div>
  <div className="sc-field"><label htmlFor="llm-model">模型名称或接入点 ID</label><input id="llm-model" name="llmModel" defaultValue="doubao-seed-2-0-lite-260428" /></div>
  <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} /> 启用增强语义接话（可选，需要服务网络可达）</label>
  <p>默认自动根据停顿接话，不需要额外服务，也不需要每次点击提交。</p>
  {enabled?<div className="sc-field"><label htmlFor="jev-key">增强语义服务 Key（Jev）</label><input id="jev-key" name="jevKey" type="password" autoComplete="off" /></div>:null}
  <button className="sc-button sc-button-primary" disabled={busy}>保存本机配置</button><p role="status">{status}</p><p>Key 仅保存到本机 .env.local，不会回显、写入浏览器记录或提交到 Git。</p><a href={storycuePath("/trial/mobile")}>回到访谈</a></form></div></main>;
}
