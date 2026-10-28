"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, BookOpen, ChevronLeft, ChevronRight, Clock3, Download, Headphones, Loader2, Mic, Pause, Play, Radio, Send, ShieldCheck, Sparkles, Square, WandSparkles, FileText, X } from "lucide-react";
import { InterviewStage, type InterviewPhase } from "./interview-stage";
import { BrandMark } from "./brand-mark";
import { QuestionPlanEditor } from "./question-plan-editor";
import { GeneratedPlanSchema, PlanInputSchema, PLAN_DRAFT_KEY, PlanDraftSchema, planMatches, type PlanMeta } from "@/lib/voice/interview-plan";
import "./console.css";
import { useVoice } from "@/hooks/use-voice";
import { InterviewResult } from "./interview-result";
import { mobileRelayUrl, type AdviceResult } from "@/lib/voice/mobile-interview";
import { storycuePath } from "@/lib/voice/storycue-path";



import { buildInterviewDirection, FRAMEWORKS, getFrameworkGuide, GUIDE, TOPIC, type GuideItem, type InterviewFramework } from "./interview-guide";
import { appendRoundEntry, restoreTrialRounds, TRIAL_ROUNDS_KEY, LEGACY_TRANSCRIPT_KEY, type TrialEntry, type TrialRound } from "@/lib/voice/trial-rounds";
import { availableTurnTaking, TRIAL_VOICES, type TurnTaking, type VoiceDelivery } from "@/lib/voice/trial-settings";

import { FRAMEWORK_IDS, frameworkName } from "@/lib/voice/video-frameworks";

const ROUND_STATUS = { active: "采访中", paused: "已暂停", completed: "已结束", interrupted: "连接已结束" };

export function InterviewConsole({ mobile = false }: {mobile?: boolean}) {
  useEffect(() => {
    const host = window as Window & { __ssjfHydrated?: boolean };
    if (!host.__ssjfHydrated) {
      host.__ssjfHydrated = true;
      window.dispatchEvent(new Event("ssjf:hydrated"));
    }
  }, []);
  const [framework, setFramework] = useState<InterviewFramework>("北极星");
  const [topic, setTopic] = useState(mobile ? "" : TOPIC);
  const guide = getFrameworkGuide(framework, topic);
  const direction = buildInterviewDirection(framework, topic);
  const [questionItems, setQuestionItems] = useState<GuideItem[]>(mobile ? [] : GUIDE.map(item => ({ ...item })));
  const [background, setBackground] = useState("");
  const [planMeta, setPlanMeta] = useState<PlanMeta | null>(mobile ? null : { topic: TOPIC, framework: "北极星", background: "", focus: "", source: "MANUAL" });
  const [resultRoundId, setResultRoundId] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | undefined>(undefined);
  const interimRef = useRef("");
  const draftKey = mobile ? "storycue.mobile.plan.v1" : PLAN_DRAFT_KEY;
  const [editingPlan, setEditingPlan] = useState(true);
  const [drawer, setDrawer] = useState<"outline" | "history" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [planError, setPlanError] = useState("");
  const [desktopJobId,setDesktopJobId]=useState("");
  const [desktopMode,setDesktopMode]=useState(false);
  const [taskCopied,setTaskCopied]=useState(false);
  const [showSetup,setShowSetup]=useState(false);
  const planRequestRef = useRef<AbortController | null>(null);
  const questions = questionItems.map(item => item.question).join("\n");
  const planReady = planMatches(planMeta, { topic, framework, background });
  const [rounds, setRounds] = useState<TrialRound[]>([]);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [turnTaking, setTurnTaking] = useState<TurnTaking>("SEMANTIC");
  const [jevStatus, setJevStatus] = useState<string | null>(null);
  const activeTurnTaking=availableTurnTaking(turnTaking,jevStatus);
  const [voiceId, setVoiceId] = useState<string>(TRIAL_VOICES[0].id);
  const [voiceDelivery, setVoiceDelivery] = useState<VoiceDelivery>(mobile ? "EXPRESSIVE" : "CONVERSATIONAL");
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const seedAudioRef = useRef<HTMLAudioElement | null>(null);
  const roundsRef = useRef<TrialRound[]>([]);
  const activeRoundRef = useRef<string | null>(null);
  const connectedOnceRef = useRef(false);
  const operationRef = useRef(false);
  const elapsedRef = useRef(0);
  useEffect(() => {
    if(mobile) setRelayUrl(mobileRelayUrl(window.location));
    const controller = new AbortController();
    fetch(storycuePath("/api/trial/turn-detector"), { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject()).then(data => {setJevStatus(data.jev);setDesktopMode(data.planProvider==="desktop");setShowSetup(data.setup===true);}).catch(() => { if (!controller.signal.aborted) setJevStatus("unreachable"); });
    return () => controller.abort();
  }, [mobile]);
  const persist = useCallback((next: TrialRound[]) => {
    roundsRef.current = next; setRounds(next);
    try { localStorage.setItem(TRIAL_ROUNDS_KEY, JSON.stringify({ version: 2, rounds: next })); }
    catch { setError("浏览器保存失败，请及时导出记录。"); }
  }, []);
  const updateRound = useCallback((patch: Partial<TrialRound>) => {
    const id = activeRoundRef.current;
    if (id) persist(roundsRef.current.map(r => r.id === id ? { ...r, ...patch } : r));
  }, [persist]);
  const append = useCallback((role: TrialEntry["role"], content: string) => {
    if (!content.trim() || !activeRoundRef.current) return;
    persist(appendRoundEntry(roundsRef.current, activeRoundRef.current, { role, text: content.trim(), at: new Date().toISOString() }));
  }, [persist]);
  useEffect(() => {
    if (storageReady) return;
    try {
      const saved = JSON.parse(localStorage.getItem(TRIAL_ROUNDS_KEY) || "null");
      const legacy = saved?.version === 2 ? null : JSON.parse(localStorage.getItem(LEGACY_TRANSCRIPT_KEY) || "null");
      persist(restoreTrialRounds(saved, legacy, TOPIC));
    } catch { setError("旧记录无法读取，请先导出当前可见记录。"); }
    setStorageReady(true);
  }, [persist, storageReady]);
  useEffect(() => {
    try {
      const saved = PlanDraftSchema.safeParse(JSON.parse(localStorage.getItem(draftKey) || "null"));
      if (saved.success) { const draft = saved.data; setTopic(draft.topic); setFramework(draft.framework); setBackground(draft.background); setQuestionItems(draft.items); setPlanMeta(draft.meta); }
      const job=localStorage.getItem(draftKey+".desktopJob");if(job&&/^[0-9a-f-]{36}$/.test(job))setDesktopJobId(job);
    } catch { setPlanError("提纲草稿无法读取，已保留默认提纲。"); }
    return () => planRequestRef.current?.abort();
  }, [draftKey]);
  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ topic, framework, background, items: questionItems, meta: planMeta })); }
    catch { setPlanError("提纲草稿保存失败，请复制主问题后再刷新。"); }
  }, [storageReady, topic, framework, background, questionItems, planMeta, draftKey]);
  useEffect(()=>{if(desktopJobId)try{localStorage.setItem(draftKey+".desktopJob",desktopJobId);}catch{}},[desktopJobId,draftKey]);
  async function copyDesktopTask(){
    const instruction=`请使用 StoryCue 技能处理网页待生成提纲。任务编号：${desktopJobId}。必须在启动此网页的同一份 StoryCue 项目根目录运行公开 CLI：先 pending，再 prompt --id ${desktopJobId}；按工具返回的选题和视频框架，由你使用当前宿主模型生成 3～5 个主问题，再 submit 回填。不要读取任何 Key 或凭据，不用文本 API 代替宿主，不直接改任务文件。若 pending 找不到此编号，先核对网页服务与技能是否用了不同的项目目录，不要另建任务或伪造回填。`;
    try{await navigator.clipboard.writeText(instruction);setTaskCopied(true);}catch{setPlanError("复制失败。请在 WorkBuddy 中输入：使用 StoryCue 处理网页待生成提纲，任务编号 "+desktopJobId);}
  }
  function setQuestions(value: string) {
    setEditingPlan(true);
    setQuestionItems(previous => value.split("\n").map(q => q.trim().slice(0, 180)).filter(Boolean).slice(0, 20).map((q, i) => previous.find(item => item.question === q) || guide.find(item => item.question === q) || { label: "自定义问题 " + (i + 1), question: q, notes: "根据实际回答，只追问一个与主题有关的细节。" }));
  }
  async function generatePlan() {
    if (!topic.trim() || generating || isConnected || busy) return;
    const input = { topic: topic.trim(), framework, background: background.trim() };
    const controller = new AbortController();
    planRequestRef.current = controller; setGenerating(true); setEditingPlan(true); setPlanError("");setDesktopJobId("");setTaskCopied(false);
    try {
      const response = await fetch(storycuePath("/api/trial/interview-plan"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]) });
      let data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败，请重试。");
      if(response.status===202){
        setDesktopJobId(data.jobId);
        const deadline=Date.now()+5*60_000;
        while(!controller.signal.aborted){
          if(Date.now()>deadline)throw new Error("等待桌面 AI 回填已超过 5 分钟，已停止等待，任务仍保留。请在 WorkBuddy 发送此任务指令；完成后用下方“读取桌面 AI 提纲”恢复，不必重复创建任务。");
          await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException("Cancelled","AbortError"));};const timer=setTimeout(()=>{controller.signal.removeEventListener("abort",abort);resolve();},1500);controller.signal.addEventListener("abort",abort,{once:true});});
          const poll=await fetch(storycuePath("/api/trial/agent-plan/"+data.jobId),{signal:controller.signal,cache:"no-store"});
          if(!poll.ok)throw new Error("桌面任务读取失败，原提纲仍在。");
          const result=await poll.json();if(result.status==="completed"){data=result;break;}
        }
      }
      if (controller.signal.aborted) return;
      const plan = GeneratedPlanSchema.parse(data);
      setQuestionItems(plan.questions); setPlanMeta({ ...input, focus: plan.focus, source: "AI" });
    } catch (e) { if (!controller.signal.aborted) setPlanError(e instanceof Error && e.name === "TimeoutError" ? "生成等待超时，请重试。原提纲仍在。" : e instanceof Error ? e.message : "生成失败，请重试。"); }
    finally { if (planRequestRef.current === controller) { planRequestRef.current = null; setGenerating(false); } }
  }
  function confirmPlan() {
    if (busy || generating || isConnected || !topic.trim() || questionItems.some(q => !q.question.trim()) || questionItems.length < 3 || questionItems.length > 5) return;
    if (!planReady) setPlanMeta({ topic: topic.trim(), framework, background: background.trim(), focus: "", source: "MANUAL" });
    setEditingPlan(false); setPlanError(""); setDrawer(null);
    if(mobile && jevStatus!=="available") void fetch(storycuePath("/api/trial/turn-detector")).then(r=>r.json()).then(data=>setJevStatus(data.jev)).catch(()=>setJevStatus("unreachable"));
  }
  async function loadDesktopPlan(){
    if(!desktopJobId||generating||isConnected)return;
    try{
      const response=await fetch(storycuePath("/api/trial/agent-plan/"+desktopJobId.trim()),{cache:"no-store"});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(data.status!=="completed")throw new Error("任务还在等待桌面 AI 回填，不能据此判断模型已开始。请先在 WorkBuddy 发送此任务指令，并核对使用的是同一个 StoryCue 项目目录。");
      const input=PlanInputSchema.parse(data),plan=GeneratedPlanSchema.parse(data);
      setTopic(input.topic);setFramework(input.framework);setBackground(input.background);setQuestionItems(plan.questions);setPlanMeta({...input,focus:plan.focus,source:"AI"});setEditingPlan(true);setPlanError("");
    }catch(error){setPlanError(error instanceof Error?error.message:"读取失败，原稿仍在。");}
  }
  const context = useMemo(() => ({
    title: topic.trim(), objective: direction + (background.trim() ? "\n用户提供的嘉宾背景（尚需实际回答确认）：" + background.trim() : ""), aiName: "访谈搭子", aiTone: "FRIENDLY",
    language: "zh", followUpDepth: "DEEP", interviewStyle: "STORY" as const,
    turnTaking:activeTurnTaking, voiceId, voiceDelivery,
    turnProvider: "JEV" as const,
    questions: questionItems.filter(item => item.question.trim()).map((item, order) => ({
      text: item.question.trim(), description: `${direction}\n当前环节：${item.label}。\n${item.notes || "根据实际回答，只追问一个仍缺失的具体细节。"}`, order, type: "OPEN_ENDED",
    })),
  }), [topic, direction, background, questionItems, activeTurnTaking, voiceId, voiceDelivery]);
  const voice = useVoice({
    interviewId: "local-trial", sessionId: "local-trial", localOnly: true,
    relayUrl: mobile ? relayUrl : undefined,
    interviewContext: context,
    onTranscript: useCallback((content: string, final: boolean) => { interimRef.current = final ? "" : content; if (final) append("嘉宾", content); }, [append]),
    onAIResponse: useCallback((content: string) => append("AI", content), [append]),
    onError: useCallback((message: string) => setError(message), []),
  });
  const { isConnected, isPaused, isListening, isSpeaking, isProcessing, isTransitioning, isInterviewComplete, currentQuestionIndex, totalQuestions, disconnect, stopListening, pauseSession } = voice;
  const stop = useCallback(async () => {
    if (operationRef.current) return;
    operationRef.current = true; setBusy(true);
    const endingId=activeRoundRef.current;
    if(mobile && endingId && interimRef.current.trim()) {
      const entry={role:"嘉宾" as const,text:interimRef.current.trim(),at:new Date().toISOString(),provisional:true};
      persist(appendRoundEntry(roundsRef.current,endingId,entry));
    }
    interimRef.current="";
    updateRound({ status: "completed", endedAt: new Date().toISOString() });
    activeRoundRef.current = null; setActiveRoundId(null); connectedOnceRef.current = false;
    if(mobile && endingId) setResultRoundId(endingId);
    try { await disconnect(); } finally { operationRef.current = false; setBusy(false); }
  }, [disconnect, updateRound, mobile, persist]);
  useEffect(()=>{
    if(!mobile || !isConnected || isPaused) return;
    const pause=()=>{if(document.hidden){pauseSession();updateRound({status:"paused"});}};
    document.addEventListener("visibilitychange",pause);
    return ()=>document.removeEventListener("visibilitychange",pause);
  },[mobile,isConnected,isPaused,pauseSession,updateRound]);
  useEffect(() => {
    if (!isConnected || isPaused) return;
    connectedOnceRef.current = true;
    const startedAt = Date.now();
    const carriedSeconds = elapsedRef.current;
    const ticker = setInterval(() => {
      elapsedRef.current = carriedSeconds + Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => clearInterval(ticker);
  }, [isConnected, isPaused]);
  useEffect(() => {
    if (!activeRoundRef.current) return;
    updateRound({ elapsedSeconds: elapsed });
  }, [elapsed, updateRound]);
  useEffect(() => {
    if (isConnected || !connectedOnceRef.current || !activeRoundRef.current) return;
    updateRound({ status: "interrupted", endedAt: new Date().toISOString() });
    if(mobile) setResultRoundId(activeRoundRef.current);
    activeRoundRef.current = null; setActiveRoundId(null); connectedOnceRef.current = false;
    stopListening();
  }, [isConnected, updateRound, stopListening, mobile]);
  useEffect(() => {
    if (isInterviewComplete && !isSpeaking && activeRoundRef.current) void stop();
  }, [isInterviewComplete, isSpeaking, stop]);

  async function start() {
    if (!topic.trim() || !context.questions.length || operationRef.current || generating || !planReady || editingPlan || questionItems.length < 3 || questionItems.length > 5 || questionItems.some(q => !q.question.trim())) return;
    if(mobile && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) {setError("手机麦克风需要 HTTPS 安全网址。请使用正式测试链接，并允许浏览器访问麦克风。");return;}
    operationRef.current = true; setBusy(true); setError("");
    previewAudioRef.current?.pause(); seedAudioRef.current?.pause();
    interimRef.current=""; setResultRoundId(null);
    const id = crypto.randomUUID();
    activeRoundRef.current = id; setActiveRoundId(id); elapsedRef.current = 0; setElapsed(0); setText("");
    persist([...roundsRef.current, { id, title: topic.trim(), framework: FRAMEWORKS[framework].name, frameworkId:framework, startedAt: new Date().toISOString(), status: "active", elapsedSeconds: 0, entries: [] }]);
    try {
      await voice.startListening();
      await voice.connect({ fresh: true });
    } catch (e) {
      updateRound({ status: "interrupted", endedAt: new Date().toISOString() });
      activeRoundRef.current = null; setActiveRoundId(null);
      await disconnect();
      setError(e instanceof Error ? e.message : "连接失败");
    } finally { operationRef.current = false; setBusy(false); }
  }
  async function togglePause() {
    if (operationRef.current) return;
    operationRef.current = true; setBusy(true); setError("");
    try {
      if (isPaused) { await voice.resumeSession(); updateRound({ status: "active" }); }
      else { voice.pauseSession(); updateRound({ status: "paused" }); }
    } catch (e) { setError(e instanceof Error ? e.message : "继续采访失败"); }
    finally { operationRef.current = false; setBusy(false); }
  }
  function exportTranscript() {
    const content = roundsRef.current.map((round, i) => `第 ${i + 1} 轮 · ${ROUND_STATUS[round.status]} · ${frameworkName(round.frameworkId || round.framework)}\n${round.title}\n开始于 ${new Date(round.startedAt).toLocaleString("zh-CN")}\n\n` + round.entries.map(e => `${e.role}（${new Date(e.at).toLocaleTimeString("zh-CN")}）\n${e.text}`).join("\n\n")).join("\n\n--------------------\n\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "访谈搭子-多轮采访记录.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const status = busy ? "正在处理…" : !isConnected ? "准备开始新一轮采访" : isPaused ? "已暂停 · 点击继续采访回到本轮" : isSpeaking ? "AI 正在提问" : isProcessing || isTransitioning ? "AI 正在接话" : isListening ? (activeTurnTaking === "SEMANTIC" ? "正在倾听，智能判断接话时机" : "正在倾听，停顿约 3 秒后接话") : "已连接，可输入回答";
  const phase: InterviewPhase = !isConnected ? (busy && activeRoundId ? "connecting" : "idle") : isPaused ? "paused" : isSpeaking ? "speaking" : isProcessing || isTransitioning ? "thinking" : isListening ? "listening" : "idle";
  const currentQuestion = context.questions[currentQuestionIndex]?.text;
  const activeRound = rounds.find(round => round.id === activeRoundId);
  const lastGuestAnswer = [...(activeRound?.entries || [])].reverse().find(entry => entry.role === "嘉宾")?.text;
  const focusMode = isConnected || (busy && !!activeRoundId);
  const displayedQuestion = isConnected ? voice.aiTranscript || currentQuestion : undefined;
  const resultRound=rounds.find(r=>r.id===resultRoundId);
  const saveAdvice=useCallback((id:string,advice:AdviceResult)=>{
    persist(roundsRef.current.map(r=>r.id===id ? {...r,advice} : r));
  },[persist]);
  const confirmEntry=useCallback((id:string,index:number)=>{
    persist(roundsRef.current.map(r=>r.id===id ? {...r,advice:undefined,entries:r.entries.map((e,i)=>i===index ? {...e,provisional:false}:e)}:r));
  },[persist]);
  return <main className={"storycue-console" + (focusMode ? " sc-interview-focus" : "") + (mobile ? " sc-mobile" + (resultRound ? " sc-mobile-result" : editingPlan ? " sc-mobile-prepare" : " sc-mobile-ready") : "")}><div className="sc-shell">
    <header className="sc-header">
      <div className="sc-brand"><span className="sc-brand-mark"><BrandMark /></span><div><strong>StoryCue</strong><small>访谈搭子 · 把真实故事聊出来</small></div></div>
      <div className="sc-header-right">{mobile ? <button className="sc-button" disabled={focusMode} onClick={()=>setDrawer(drawer==="history"?null:"history")}><Clock3 size={14}/>历史访谈</button> : <a href="/trial/mobile"><Mic size={14}/>手机版</a>}{!mobile ? <a href="/trial/design" target="_blank" rel="noreferrer"><WandSparkles size={14} />动效预览</a> : null}{showSetup ? <a href={storycuePath("/trial/setup")}>服务配置</a> : null}<span className="sc-badge" data-testid="jev-health"><span className={"sc-dot " + (jevStatus !== "available" ? "sc-dot-warning" : "")} />{jevStatus === null ? "正在检测连接…" : jevStatus === "available" ? "智能接话已接通" : "自动接话已就绪"}</span></div>
    </header>
    {mobile ? <nav className="sc-mobile-progress" aria-label="访谈流程"><span data-active={!focusMode&&!resultRound}>01 选题与问题</span><span data-active={focusMode}>02 语音访谈</span><span data-active={!!resultRound}>03 访谈稿与建议</span></nav>:null}
    <div className="sc-intro"><div><p className="sc-eyebrow">INTERVIEW STUDIO / {FRAMEWORKS[framework].name}</p><h1>{topic.trim() || "这一轮，想聊什么？"}</h1></div><p className="sc-intro-note"><Radio size={13} />电脑提问，相机拍摄嘉宾</p></div>
    {focusMode ? <nav className="sc-focus-toolbar" aria-label="采访快捷操作"><span><span className="sc-dot" />{isPaused ? "已暂停" : "本轮采访"} · {currentQuestionIndex + 1}/{context.questions.length} · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span><div><button className="sc-button" aria-pressed={drawer === "outline"} onClick={() => setDrawer(drawer === "outline" ? null : "outline")}><BookOpen size={14} />主问题</button><button className="sc-button" aria-pressed={drawer === "history"} onClick={() => setDrawer(drawer === "history" ? null : "history")}><FileText size={14} />问答记录</button>{drawer ? <button className="sc-button" aria-label="收起侧栏" onClick={() => setDrawer(null)}><X size={14} />收起</button> : null}</div></nav> : null}
    {mobile && drawer==="history" && !focusMode ? <section className="sc-panel sc-mobile-history" aria-label="历史访谈"><div className="sc-panel-heading"><h2>历史访谈</h2><button className="sc-button" onClick={()=>setDrawer(null)}>收起</button></div>{!rounds.length?<p>还没有访谈记录。</p>:[...rounds].reverse().map(round=><button className="sc-mobile-history-item" key={round.id} onClick={()=>{setResultRoundId(round.id);setDrawer(null);}}>{round.title}<small>{new Date(round.startedAt).toLocaleString("zh-CN")} · {round.entries.length} 段</small></button>)}</section>:null}
    {mobile && resultRound ? <InterviewResult key={resultRound.id} round={resultRound} onAdvice={saveAdvice} onConfirmEntry={confirmEntry} onNew={()=>{setResultRoundId(null);setEditingPlan(true);setDrawer(null);setError("");}}/> : null}
    <div className="sc-workspace" hidden={mobile && !!resultRound}>
      <aside className="sc-column sc-plan-column" hidden={focusMode && drawer !== "outline"}>
        <section className="sc-panel sc-side-panel" aria-label="采访准备">
          <div className="sc-panel-heading"><h2><BookOpen size={16} />{mobile ? "这次想聊什么？" : "采访提纲"}</h2><small>BRIEF</small></div>
          <div className="sc-field"><label htmlFor="framework">视频框架</label><select id="framework" value={framework} disabled={isConnected || busy || generating} onChange={e => { setFramework(e.target.value as InterviewFramework); setEditingPlan(true); }}>{FRAMEWORK_IDS.map(id => <option key={id} value={id}>{FRAMEWORKS[id].name}</option>)}</select><p className="sc-subtle">{FRAMEWORKS[framework].summary}</p></div>
          <div className="sc-field"><label htmlFor="topic">本轮选题</label><textarea id="topic" value={topic} maxLength={240} rows={3} disabled={isConnected || busy || generating} onChange={e => { setTopic(e.target.value); setEditingPlan(true); }} placeholder="这条视频想聊什么？" /></div>
          <details className="sc-detail sc-background"><summary>补充嘉宾背景（可选）</summary><label htmlFor="guest-background">身份、接触的情况、希望面向谁</label><textarea id="guest-background" value={background} maxLength={1200} disabled={isConnected || busy || generating} onChange={e => { setBackground(e.target.value); setEditingPlan(true); }} placeholder="没有背景也能生成，实际经历在采访中确认。" /></details>
          <button className="sc-button sc-button-primary sc-generate" disabled={!storageReady || !topic.trim() || busy || generating || isConnected} onClick={() => void generatePlan()}>{generating&&!desktopJobId ? <Loader2 size={14} className="sc-spinner" /> : <Sparkles size={14} />}{generating ? (desktopJobId?"等待桌面 AI 回填（需发送指令）":desktopMode?"正在提交选题…":"正在生成主问题…") : "确认选题并生成主问题"}</button>
          {desktopMode ? <p className="sc-subtle">主问题由你自己的 WorkBuddy / Codex 生成，使用当前宿主的模型额度。</p> : null}
          {desktopMode&&!generating ? <details className="sc-detail sc-desktop-job"><summary>恢复桌面 AI 提纲</summary><label htmlFor="desktop-job">任务编号</label><input id="desktop-job" value={desktopJobId} onChange={e=>setDesktopJobId(e.target.value)} maxLength={36}/><button className="sc-button" disabled={!desktopJobId||isConnected} onClick={()=>void loadDesktopPlan()}>读取桌面 AI 提纲</button></details> : null}
          {desktopMode&&desktopJobId&&(!planReady||generating) ? <div role="status" className="sc-subtle"><p style={{overflowWrap:"anywhere"}}>桌面 AI 待回填 · 任务 {desktopJobId}</p><p><strong>网页已建任务，但不会自动唤起 WorkBuddy。</strong>请复制下方指令，在 WorkBuddy / Codex 中发送一次；桌面 AI 才会使用当前账号的模型生成，完成后网页自动回填。</p><button className="sc-button" onClick={()=>void copyDesktopTask()}>{taskCopied?"指令已复制，去 WorkBuddy 发送":"复制给 WorkBuddy 的指令"}</button><p>如果 WorkBuddy 找不到此任务，请让它核对：技能执行目录是否与启动网页的项目目录一致。</p>{generating?<button className="sc-button" onClick={()=>{planRequestRef.current?.abort();setGenerating(false);}}>取消等待（任务保留）</button>:null}</div> : null}
          <p className="sc-subtle" role="status">{planReady ? (planMeta?.source === "AI" ? "主问题已生成，可逐题修改。" : "已有提纲，可修改或重新生成。") : "选题或背景已改变，请生成新问题，或编辑后确认提纲。"}</p>
          <p className="sc-eyebrow">主问题 / {context.questions.length}</p>
          <ol className="sc-outline">{context.questions.map((item, i) => <li key={i + "-" + item.text} data-current={isConnected && i === currentQuestionIndex}><span>{String(i + 1).padStart(2, "0")}</span><p>{item.text}</p></li>)}</ol>
          <details className="sc-detail"><summary>编辑提纲</summary><label htmlFor="questions" className="sc-subtle">一行一个主问题</label><textarea id="questions" value={questions} onChange={e => setQuestions(e.target.value)} disabled={isConnected || busy || generating} />
          </details>
          <details className="sc-detail"><summary>条件追问与过题标准</summary><p className="sc-subtle">主题相关性先于故事深度。相关经历追现场细节、行动和结果；反常识观点追判断的支撑。允许“没发生、记不清、不知道”。</p><div className="sc-guide-notes">{questionItems.map((item, i) => <div key={i}><strong>{item.label}</strong><p>{item.notes}</p></div>)}</div></details>
        </section>
      </aside>
      <div className="sc-column sc-center-column">
        <div className="sc-plan-steps" aria-label="采访准备流程"><span>01 确认选题</span><ChevronRight size={12} /><span data-active={editingPlan}>02 生成与修改</span><ChevronRight size={12} /><span data-active={!editingPlan}>03 语音采访</span></div>
        {planError ? <p role="alert" className="sc-error">{planError}</p> : null}
        {editingPlan && (!mobile || questionItems.length>0 || generating) ? <QuestionPlanEditor items={questionItems} focus={planReady ? planMeta?.focus : undefined} generating={generating} awaitingDesktop={generating&&!!desktopJobId} disabled={busy || isConnected} ready={!!topic.trim() && storageReady} onChange={setQuestionItems} onConfirm={confirmPlan} /> : !editingPlan ? <>
        <button className="sc-button sc-edit-plan" disabled={isConnected || busy || generating} onClick={() => setEditingPlan(true)}>修改选题与主问题</button>
        <div className="sc-panel sc-session-meta"><span><Mic size={13} />{isConnected ? "本轮采访" : "准备开始新一轮"}<strong>{isConnected ? currentQuestionIndex + 1 : "—"}</strong> / {isConnected ? totalQuestions : context.questions.length}</span><span><Clock3 size={13} /><strong>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</strong></span></div>
        <InterviewStage phase={phase} audioLevel={voice.audioLevel} playbackAnalyser={voice.playbackAnalyserRef} question={displayedQuestion} answer={isConnected ? voice.userTranscript || lastGuestAnswer : undefined} status={status}>
          {!isConnected ? <button className="sc-button sc-button-primary" disabled={busy || generating || !planReady || !storageReady || !topic.trim() || (context.questions.length < 3 || context.questions.length > 5) || questionItems.some(q => !q.question.trim())} onClick={() => void start()}><Mic size={16} />{mobile ? "开始访谈" : "开始语音采访"}</button> : <>
            <button className={"sc-button " + (isPaused ? "sc-button-primary" : "")} disabled={busy} onClick={() => void togglePause()}>{isPaused ? <Play size={14} /> : <Pause size={14} />}{isPaused ? "继续采访" : "暂停采访"}</button>
            
            <button className="sc-button" disabled={isPaused || isTransitioning || isProcessing || busy || currentQuestionIndex<=0} onClick={voice.previousQuestion}><ChevronLeft size={13} />上一题</button>
            <button className="sc-button" disabled={isPaused || isTransitioning || isProcessing || busy || currentQuestionIndex>=totalQuestions-1} onClick={voice.nextQuestion}>下一题<ChevronRight size={13} /></button>
            <button className="sc-button sc-button-stop" disabled={busy} onClick={() => void stop()}><Square size={12} />{mobile ? "结束访谈" : "停止采访"}</button>
          </>}
        </InterviewStage>
        {error ? <p role="alert" className="sc-error">{error}</p> : null}
        <details className="sc-panel sc-text-answer"><summary>也可以用文字回答</summary><form onSubmit={async e => { e.preventDefault(); if (!text.trim() || !isConnected || isPaused) return; const answer = text.trim(); setText(""); append("嘉宾", answer); voice.sendTextMessage(answer); }}><label htmlFor="answer">输入一个真实回答</label><textarea id="answer" placeholder="说说当时发生了什么…" value={text} onChange={e => setText(e.target.value)} disabled={!isConnected || isPaused} /><button className="sc-button" type="submit" disabled={!isConnected || isPaused || !text.trim() || isProcessing || isSpeaking || isTransitioning}><Send size={13} />发送回答</button></form></details>
        <p className="sc-footer"><Headphones size={14} />建议佩戴耳机。采访不限时长，暂停不计时；停止后，再开始新一轮。</p>
        </>:null}
      </div>
      <aside className="sc-column sc-settings-column" hidden={focusMode && drawer !== "history"}>
        <section className="sc-panel sc-side-panel" aria-label="主持人设置">
          <div className="sc-panel-heading"><h2><AudioLines size={16} />主持人</h2><small>VOICE</small></div>
          {mobile ? <div className="sc-mobile-connection"><p className="sc-subtle" role="status">有起伏的语气 · {activeTurnTaking==="SEMANTIC" ? "语义接话" : "自动接话，无需点击提交"}</p>{jevStatus && jevStatus!=="available" ? <button className="sc-button" onClick={()=>void fetch(storycuePath("/api/trial/turn-detector")).then(r=>r.json()).then(data=>setJevStatus(data.jev)).catch(()=>setJevStatus("unreachable"))}>重新检测连接</button> : null}</div> : null}
          <div className="sc-field"><label htmlFor="voice-id">主持人声音</label><select id="voice-id" value={voiceId} onChange={e => { previewAudioRef.current?.pause(); setVoiceId(e.target.value); }} disabled={isConnected || busy}>{(mobile ? TRIAL_VOICES.slice(0,4) : TRIAL_VOICES).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
          <div className="sc-field sc-desktop-only"><label htmlFor="voice-delivery">说话语气</label><select id="voice-delivery" value={voiceDelivery} onChange={e => { previewAudioRef.current?.pause(); setVoiceDelivery(e.target.value as VoiceDelivery); }} disabled={isConnected || busy}><option value="CONVERSATIONAL">自然交谈 · 温暖、有好奇心</option><option value="EXPRESSIVE">语气更有起伏 · 结合嘉宾语境</option><option value="NEUTRAL">原始读法 · 用于比较</option></select></div>
          <div className="sc-field sc-desktop-only"><label htmlFor="turn-taking">接话方式</label><select id="turn-taking" value={activeTurnTaking} onChange={e => setTurnTaking(e.target.value as TurnTaking)} disabled={isConnected || busy}><option value="SEMANTIC" disabled={jevStatus !== "available"}>智能接话 · 语义判断</option><option value="PATIENT">自动接话 · 等待约 3 秒停顿</option></select><p className="sc-subtle">{activeTurnTaking === "SEMANTIC" ? "话说完整时及时接话；还在回忆或讲故事时，给你时间。" : "自动根据停顿接话，继续说会延后，无需点击提交。"}</p></div>
          <details className="sc-detail"><summary>试听声音</summary><audio key={voiceId + "-" + voiceDelivery} ref={previewAudioRef} controls={!isConnected} onPlay={() => { if (isConnected || busy) previewAudioRef.current?.pause(); else seedAudioRef.current?.pause(); }} preload="none" aria-label="主持人声音试听" src={storycuePath("/trial-voices/" + TRIAL_VOICES.find(v => v.id === voiceId)?.sample + "-" + voiceDelivery.toLowerCase() + ".mp3")} /><p className="sc-subtle">实时采访使用豆包流式语音。试听用于比较音色与语气。</p></details>
          <details className="sc-detail"><summary className="sc-desktop-only">更强表现力样音</summary><p className="sc-subtle">Seed Audio 1.0 非流式创作样音，仅用于比较表现力。</p><audio ref={seedAudioRef} controls={!isConnected} onPlay={() => { if (isConnected || busy) seedAudioRef.current?.pause(); else previewAudioRef.current?.pause(); }} preload="none" aria-label="Seed Audio 1.0 样音" src="/trial-voices/seed-audio-demo.mp3" /></details>
        </section>
        <section className="sc-panel sc-side-panel" aria-label="问答记录">
          <div className="sc-panel-heading"><h2><Clock3 size={16} />问答记录</h2><small>{rounds.length} 轮</small></div>
          <div className="sc-rounds">{!rounds.length ? <p className="sc-subtle">开聊后，问答会自动存到这里。每一轮都保留。</p> : [...rounds].reverse().map((round, i) => <details key={round.id} open={round.id === activeRoundId} className="sc-round" data-testid="interview-round">
            <summary>第 {rounds.length - i} 轮 · {ROUND_STATUS[round.status]}<small>{frameworkName(round.frameworkId || round.framework)} · {new Date(round.startedAt).toLocaleDateString("zh-CN")} · {round.entries.length} 条</small></summary>
            <p className="sc-round-title">{round.title}</p><div className="sc-entries">{!round.entries.length ? <p className="sc-subtle">等待本轮第一句问答。</p> : round.entries.map((entry, n) => <div key={entry.at + "-" + n}><p className="sc-entry-meta">{entry.role} · {new Date(entry.at).toLocaleTimeString("zh-CN")}</p><p className="sc-entry-text">{entry.text}</p></div>)}</div>
          </details>)}</div>
          <button className="sc-button sc-export" disabled={!rounds.some(r => r.entries.length)} onClick={exportTranscript}><Download size={13} />导出文字记录</button>
        </section>
      </aside>
    </div>
    <p className="sc-footer"><ShieldCheck size={13} />文字记录保存在当前浏览器 · 相机独立录制视频</p>
  </div></main>;
}
