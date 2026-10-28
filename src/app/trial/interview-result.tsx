"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import type { TrialRound } from "@/lib/voice/trial-rounds";
import { EditingAdviceSchema, type AdviceInput, type AdviceResult } from "@/lib/voice/mobile-interview";
import { storycuePath } from "@/lib/voice/storycue-path";

import { frameworkId, frameworkName, FRAMEWORKS } from "@/lib/voice/video-frameworks";

export function InterviewResult({round,onAdvice,onConfirmEntry,onNew}:{round:TrialRound;onAdvice:(id:string,advice:AdviceResult)=>void;onConfirmEntry:(id:string,index:number)=>void;onNew:()=>void}) {
  const [tab,setTab]=useState<"transcript"|"advice">("transcript");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const requestRef=useRef<AbortController|null>(null);
  const requestedRef=useRef("");
  const input=useMemo<AdviceInput>(()=>({sessionId:round.id,topic:round.title,framework:frameworkId(round.frameworkId) || frameworkId(round.framework) || "业务传记",entries:round.entries.map((e,i)=>({...e,id:`e${i+1}`}))}),[round.id,round.title,round.frameworkId,round.framework,round.entries]);
  const sourceKey=JSON.stringify(input);
  const hasGuest=input.entries.some(e=>e.role==="嘉宾" && !e.provisional);
  const generate=useCallback(async()=>{
    requestRef.current?.abort();
    const controller=new AbortController();requestRef.current=controller;
    setLoading(true);setError("");
    try{
      const response=await fetch(storycuePath("/api/trial/editing-advice"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(90000)])});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || "建议生成失败，原稿仍在。");
      if(controller.signal.aborted) return;
      const advice=EditingAdviceSchema.parse(data);
      if(data.sessionId!==input.sessionId || typeof data.sourceDigest!=="string") throw new Error("建议与本轮访谈不匹配，请重试。");
      onAdvice(input.sessionId,{...advice,sessionId:data.sessionId,sourceDigest:data.sourceDigest,methodVersion:String(data.methodVersion)});
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error && e.name==="TimeoutError" ? "生成等待超时，原稿已保留，可以稍后重试。" : e instanceof Error ? e.message : "建议生成失败，原稿仍在。");}
    finally{if(requestRef.current===controller){requestRef.current=null;setLoading(false);}}
  },[input,onAdvice]);
  useEffect(()=>{
    // Defer until after mount replay so Strict Mode cannot abort the only automatic request.
    const timer=setTimeout(()=>{
      if(!round.advice && hasGuest && requestedRef.current!==sourceKey){requestedRef.current=sourceKey;void generate();}
    },0);
    return ()=>clearTimeout(timer);
  },[round.advice,hasGuest,sourceKey,generate]);
  useEffect(()=>()=>requestRef.current?.abort(),[]);
  function exportText(){
    const transcript=`${round.title}\n${frameworkName(round.frameworkId || round.framework)} · ${new Date(round.startedAt).toLocaleString("zh-CN")}\n\n`+round.entries.map((e,i)=>`[${i+1}] ${e.role==="AI"?"主持人":"嘉宾"}${e.provisional?"（待校对）":""}\n${e.text}`).join("\n\n");
    const suggestions=round.advice ? "\n\n剪辑建议（不是已完成的剪辑）\n"+round.advice.mainline+"\n"+round.advice.clips.map((clip,i)=>`\n${i+1}. ${clip.title} · ${clip.readiness}\n${clip.rationale}\n`+clip.segments.map(s=>`${s.purpose}：${s.entryIds.map(id=>`[${id.slice(1)}]`).join("、")} ${s.note}`).join("\n")+"\n待补拍："+clip.followUps.join("；")+"\n缺口："+clip.missing.join("；")).join("\n")+"\n注意："+round.advice.cautions.join("；") : "";
    const url=URL.createObjectURL(new Blob([transcript+suggestions],{type:"text/plain;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download=`StoryCue-访谈稿-${new Date(round.startedAt).toISOString().slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function locate(id:string){setTab("transcript");requestAnimationFrame(()=>document.getElementById(`sc-transcript-${id}`)?.scrollIntoView({behavior:"smooth",block:"center"}));}
  return <section className="sc-result" aria-label="本轮访谈结果">
    <div className="sc-result-heading"><div><p className="sc-subtle">{round.status==="completed"?"本轮已结束":"本轮记录已保留"} · {Math.floor(round.elapsedSeconds/60)} 分 {round.elapsedSeconds%60} 秒</p><h1>把故事，留成素材。</h1><p>{round.title}</p></div><button className="sc-button sc-button-primary" onClick={onNew}><Plus size={15}/>新一轮访谈</button></div>
    <div className="sc-result-actions"><div role="tablist" aria-label="结果内容"><button role="tab" aria-selected={tab==="transcript"} onClick={()=>setTab("transcript")}><FileText size={15}/>访谈原稿</button><button role="tab" aria-selected={tab==="advice"} onClick={()=>setTab("advice")}><Sparkles size={15}/>剪辑建议{loading?<Loader2 size={13} className="sc-spinner"/>:null}</button></div><button className="sc-button" disabled={!round.entries.length} onClick={exportText}><Download size={14}/>导出</button></div>
    {loading?<p className="sc-result-progress" role="status"><Loader2 size={15} className="sc-spinner"/>原稿已保存，正在整理剪辑建议…</p>:null}
    {error?<p role="alert" className="sc-error">{error}<button className="sc-button" disabled={loading} onClick={()=>void generate()}>重新生成建议</button></p>:null}
    {tab==="transcript"?<div role="tabpanel" aria-label="访谈原稿" className="sc-transcript"><p className="sc-subtle">按真实问答顺序保存的语音转写，可对照原视频校对；不是音视频逐字时间轴。</p>{!round.entries.length?<p>本轮还没有问答。可以开始新一轮访谈。</p>:round.entries.map((entry,index)=><article key={index} id={`sc-transcript-e${index+1}`} data-role={entry.role}><header><span>{entry.role==="AI"?"主持人":"嘉宾"}</span><small>段落 {index+1}{entry.provisional?" · 待校对":""}</small></header><p>{entry.text}</p>{entry.provisional?<div className="sc-provisional"><p>结束前尚未确认的字幕已保留，暂不作为剪辑依据。</p><button className="sc-button" onClick={()=>onConfirmEntry(round.id,index)}>已核对，这段文字准确</button></div>:null}</article>)}</div>:<div role="tabpanel" aria-label="剪辑建议" className="sc-advice">
      <p className="sc-subtle">{frameworkName(input.framework)}：{FRAMEWORKS[input.framework].path}。建议引用本轮原文，不代表已经剪成视频。</p>
      {!hasGuest?<p>还没有已确认的嘉宾回答。请先完成访谈，或核对原稿中的待确认字幕。</p>:!round.advice&&!loading&&!error?<button className="sc-button sc-button-primary" onClick={()=>void generate()}>生成剪辑建议</button>:null}
      {round.advice?<><div className="sc-advice-mainline"><span>这一轮的主线</span><p>{round.advice.mainline}</p></div>{!round.advice.clips.length?<p>素材还不足以形成独立视频。请根据下方提醒补充后再整理。</p>:round.advice.clips.map((clip,index)=><article className="sc-advice-clip" key={index}><header><span>方向 {index+1} · {clip.readiness}</span><h2>{clip.title}</h2></header><p>{clip.rationale}</p><ol>{clip.segments.map((segment,i)=><li key={i}><strong>{segment.purpose}</strong><p>{segment.note}</p><div className="sc-source-links">{segment.entryIds.map(id=><button key={id} onClick={()=>locate(id)}>查看原文 [{id.slice(1)}]</button>)}</div><details><summary>展开引用原文</summary>{segment.entryIds.map(id=><blockquote key={id}>{input.entries.find(e=>e.id===id)?.text}</blockquote>)}</details></li>)}</ol>{clip.keyPhrases.length?<div className="sc-advice-keywords"><h3>原话里的关键词</h3>{clip.keyPhrases.map((key,i)=><button key={i} onClick={()=>locate(key.entryId)}>“{key.phrase}”</button>)}</div>:null}{clip.missing.length?<div className="sc-advice-missing"><h3>还缺什么</h3><ul>{clip.missing.map((text,i)=><li key={i}>{text}</li>)}</ul></div>:null}{clip.followUps.length?<div className="sc-advice-followups"><h3>下次可以补问</h3><ul>{clip.followUps.map((text,i)=><li key={i}>{text}</li>)}</ul></div>:null}</article>)}{round.advice.cautions.length?<div className="sc-advice-cautions"><h3>剪之前核对</h3><ul>{round.advice.cautions.map((text,i)=><li key={i}>{text}</li>)}</ul></div>:null}<button className="sc-button" disabled={loading} onClick={()=>void generate()}><RefreshCw size={14}/>重新整理建议</button></>:null}
    </div>}
  </section>;
}
