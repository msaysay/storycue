"use client";

import { ArrowDown, ArrowUp, Check, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import type { GuideItem } from "./interview-guide";

export function QuestionPlanEditor({ items, focus, generating, awaitingDesktop=false, disabled, ready, onChange, onConfirm }: {
  items: readonly GuideItem[]; focus?: string; generating: boolean; awaitingDesktop?:boolean; disabled: boolean; ready: boolean;
  onChange: (items: GuideItem[]) => void; onConfirm: () => void;
}) {
  function move(index: number, offset: number) {
    const next = [...items];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  return <section className="sc-panel sc-plan-editor" aria-label="生成与修改主问题" aria-busy={generating}>
    <div className="sc-panel-heading"><h2><Sparkles size={16} />主问题 · 生成后可修改</h2><small>{items.length} 题</small></div>
    <p className="sc-subtle">3～5 个主问题 · 支撑经历 → 金句提炼 → 转化承接；细节在追问中展开。</p>
    {!generating&&(items.length > 5 || items.length < 3) ? <p className="sc-plan-limit" role="status">{items.length > 5 ? "旧提纲已保留。请合并或删除到 3～5 题，或重新生成精简提纲。" : "至少保留 3 个主问题，再确认提纲。"}</p> : null}
    {generating ? <p className="sc-plan-progress" role="status">{awaitingDesktop?<Sparkles size={16}/>:<Loader2 size={16}/>} {awaitingDesktop?"等待桌面 AI 回填；请先在 WorkBuddy 发送任务指令。":"正在围绕选题生成主问题与条件追问…"}</p> : <p className="sc-subtle">{focus || "确认左侧选题后生成，也可以直接修改已有提纲。"}</p>}
    <div className="sc-question-edit-list">{items.map((item, index) => <div className="sc-question-edit" key={index}>
      <div className="sc-question-edit-top"><label htmlFor={"plan-question-" + index}>{String(index + 1).padStart(2, "0")} · {item.label}</label><div>
        <button className="sc-icon-button" aria-label={"上移主问题 " + (index + 1)} disabled={disabled || generating || index === 0} onClick={() => move(index, -1)}><ArrowUp size={12} /></button>
        <button className="sc-icon-button" aria-label={"下移主问题 " + (index + 1)} disabled={disabled || generating || index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12} /></button>
        <button className="sc-icon-button" aria-label={"删除主问题 " + (index + 1)} disabled={disabled || generating} onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 size={12} /></button>
      </div></div>
      <textarea id={"plan-question-" + index} aria-label={"主问题 " + (index + 1)} value={item.question} maxLength={180} rows={2} disabled={disabled || generating} onChange={e => onChange(items.map((q, i) => i === index ? { ...q, question: e.target.value.replace(/[\r\n]/g, " ") } : q))} />
      <details className="sc-question-notes"><summary>条件追问与过题提示</summary><label htmlFor={"plan-notes-" + index}>主持人提示，不会朗读</label><textarea id={"plan-notes-" + index} value={item.notes} maxLength={700} disabled={disabled || generating} onChange={e => onChange(items.map((q, i) => i === index ? { ...q, notes: e.target.value } : q))} /></details>
    </div>)}</div>
    <div className="sc-plan-editor-actions"><button className="sc-button" disabled={disabled || generating || items.length >= 5} onClick={() => onChange([...items, { label: "自定义问题", question: "", notes: "根据实际回答，只追问一个与主题有关的细节；没有经历不预设案例。" }])}><Plus size={14} />添加主问题</button><button className="sc-button sc-button-primary" disabled={disabled || generating || !ready || (items.length < 3 || items.length > 5) || items.some(q => !q.question.trim())} onClick={onConfirm}><Check size={14} />确认提纲，准备采访</button></div>
  </section>;
}
