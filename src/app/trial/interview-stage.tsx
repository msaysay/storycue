"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { AudioLines } from "lucide-react";
import { RobotFace } from "./robot-face";

export type InterviewPhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "paused";
const PHASES = {
  idle: { label: "准备好，聊出你的故事", hint: "选好主题，开始这一轮采访", code: "STANDBY" },
  connecting: { label: "正在连接采访", hint: "准备麦克风与主持人声音", code: "CONNECTING" },
  listening: { label: "我在听，你慢慢讲", hint: "真实经历、当时的细节，都可以继续说", code: "LISTENING" },
  thinking: { label: "让我顺着你的故事想一想", hint: "寻找与主题相关、值得追问的细节", code: "THINKING" },
  speaking: { label: "有个细节，想再问问你", hint: "主持人提问时暂停识别，播完后恢复倾听", code: "SPEAKING" },
  paused: { label: "留一点时间给自己", hint: "采访已暂停，继续后回到这一轮", code: "PAUSED" },
} as const;

export function InterviewStage({ phase, audioLevel = 0, playbackAnalyser, previewHostLevel = 0, question, answer, status, children }: {
  phase: InterviewPhase; audioLevel?: number; playbackAnalyser?: RefObject<AnalyserNode | null>; previewHostLevel?: number; question?: string; answer?: string; status: string; children?: ReactNode;
}) {
  const info = PHASES[phase];
  const power = phase === "listening" ? Math.max(0, Math.min(1, audioLevel)) : 0;
  const coreRef = useRef<HTMLDivElement>(null);
  // Update transient audio values directly, without re-rendering the interview transcript.
  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.style.setProperty("--host-power", "0");
    if (phase !== "speaking") return;
    if (!playbackAnalyser) {
      core.style.setProperty("--host-power", String(Math.max(0, Math.min(1, previewHostLevel))));
      return () => { core.style.setProperty("--host-power", "0"); };
    }
    const data = new Float32Array(256);
    let frame = 0, last = 0, smoothed = 0;
    const sample = (now: number) => {
      if (now-last >= 50) {
        const analyser = playbackAnalyser.current;
        if (analyser && !document.hidden) {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const value of data) sum += value*value;
          const target = Math.min(1, Math.sqrt(sum/data.length)*6);
          smoothed += (target-smoothed)*(target>smoothed ? .65 : .3);
        } else smoothed = 0;
        core.style.setProperty("--host-power", smoothed.toFixed(3));
        last = now;
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => { cancelAnimationFrame(frame); core.style.setProperty("--host-power", "0"); };
  }, [phase, playbackAnalyser, previewHostLevel]);
  return <section className="sc-stage sc-panel" data-phase={phase} aria-label="语音采访控制台">
    <div className="sc-stage-top"><span><span className="sc-dot" /> {info.code}</span><span className="sc-stage-hint">VOICE COMPANION</span></div>
    <div ref={coreRef} className="sc-core-space" aria-hidden="true" style={{ "--voice-power": power } as CSSProperties}>
      <div className="sc-depth-grid" /><div className="sc-energy-disc" />
      <div className="sc-gyro sc-gyro-a" /><div className="sc-gyro sc-gyro-b" />
      <div className="sc-orbit sc-orbit-outer" /><div className="sc-orbit sc-orbit-ticks" />
      <div className="sc-orbit sc-orbit-middle" /><div className="sc-orbit sc-orbit-inner" />
      <svg className="sc-hud-ring" viewBox="0 0 400 400" fill="none">{Array.from({length:48},(_,i) => <path key={i} d={`M200 ${i%4 ? 11 : 7}V${i%4 ? 15 : 22}`} transform={`rotate(${i*7.5} 200 200)`} />)}<circle className="sc-hud-trace" cx="200" cy="200" r="177" pathLength="100" /><path className="sc-hud-brackets" d="M91 52H55V88M309 52H345V88M55 312V348H91M345 312V348H309" /></svg>
      <div className="sc-particles">{Array.from({length:18},(_,i) => <i key={i} style={{"--angle":`${i*20}deg`,"--distance":`${38+(i%4)*6}%`,"--delay":`${i*-.37}s` } as CSSProperties} />)}</div>
      <div className="sc-halo" /><RobotFace />
      <div className="sc-hud-label sc-hud-label-left"><span>STORYCUE</span><i /><small>{phase === "thinking" ? "寻找故事线索" : phase === "speaking" ? "正在提问" : phase === "paused" ? "采访已暂停" : phase === "listening" ? "正在倾听" : "准备开聊"}</small></div>
      <div className="sc-hud-label sc-hud-label-right"><span>{info.code}</span><i /><small>声音 · 故事 · 连接</small></div>
      <span className="sc-core-axis sc-axis-left" /><span className="sc-core-axis sc-axis-right" />
      <div className="sc-wave">{Array.from({ length: 29 }, (_, i) => <i key={i} style={{ "--bar": i, "--height": Math.round(6 + Math.sin(i * 1.7) ** 2 * 19) } as CSSProperties} />)}</div>
    </div>
    <div className="sc-stage-caption"><h2>{info.label}</h2><p>{info.hint}</p></div>
    <div className="sc-live-copy">
      <p className="sc-eyebrow"><AudioLines size={14} /> 主持人 · {phase === "idle" ? "准备开聊" : "当前话题"}</p>
      <p className="sc-question">{question || "从一次真实经历开始，把观点背后的故事聊清楚。"}</p>
      {answer ? <div className="sc-answer"><span>你的回答</span><p>{answer}</p></div> : null}
    </div>
    <div className="sc-stage-controls">{children}</div>
    <p role="status" className="sc-status">{status}</p>
  </section>;
}
