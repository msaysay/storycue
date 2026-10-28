export const TRIAL_ROUNDS_KEY = "aural.local-trial.business-biography.v2";
export const LEGACY_TRANSCRIPT_KEY = "aural.local-trial.business-biography.v1";
import type { AdviceResult } from "./mobile-interview";
import { frameworkId, frameworkName, type InterviewFramework } from "./video-frameworks";
export type TrialEntry = { role: "嘉宾" | "AI"; text: string; at: string; provisional?:boolean };
export type TrialRound = {
  id: string; title: string; framework?: string; startedAt: string; endedAt?: string;
  status: "active" | "paused" | "completed" | "interrupted";
  elapsedSeconds: number; entries: TrialEntry[];
  frameworkId?:InterviewFramework | "BIOGRAPHY" | "NORTH_STAR";
  advice?:AdviceResult;
};

function validEntry(value: unknown): value is TrialEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as TrialEntry;
  return (e.role === "AI" || e.role === "嘉宾") && typeof e.text === "string" && typeof e.at === "string";
}

/** Keep the v1 key intact as a backup. Only explicit opening greetings divide old rounds. */
export function restoreTrialRounds(saved: unknown, legacy: unknown, title: string): TrialRound[] {
  const data = saved as { version?: number; rounds?: TrialRound[] } | null;
  if (data?.version === 2 && Array.isArray(data.rounds)) {
    return data.rounds.filter(r => r && typeof r.id === "string" && typeof r.title === "string" && typeof r.startedAt === "string" && Array.isArray(r.entries))
      .map(r => ({ ...r, frameworkId: frameworkId(r.frameworkId) ?? frameworkId(r.framework), framework: frameworkName(r.frameworkId || r.framework), status: r.status === "completed" ? "completed" : "interrupted", elapsedSeconds: Number.isFinite(r.elapsedSeconds) ? Math.max(0, r.elapsedSeconds) : 0, entries: r.entries.filter(validEntry) }));
  }
  const old = legacy as { version?: number; entries?: unknown[] } | null;
  if (old?.version !== 1 || !Array.isArray(old.entries)) return [];
  const rounds: TrialRound[] = [];
  for (const entry of old.entries.filter(validEntry)) {
    if (!rounds.length || (entry.role === "AI" && /^你好[，,！!]?\s*我是访谈搭子/.test(entry.text) && rounds.at(-1)!.entries.length)) {
      rounds.push({ id: `legacy-${rounds.length}-${entry.at}`, title, startedAt: entry.at, status: "completed", elapsedSeconds: 0, entries: [] });
    }
    rounds.at(-1)!.entries.push(entry);
    rounds.at(-1)!.endedAt = entry.at;
  }
  return rounds;
}

/** A late callback from a stopped socket cannot spill into the following round. */
export function appendRoundEntry(rounds: TrialRound[], id: string | null, entry: TrialEntry): TrialRound[] {
  if (!id || !entry.text.trim()) return rounds;
  return rounds.map(r => r.id === id && (r.status === "active" || r.status === "paused") ? { ...r, entries: [...r.entries, entry] } : r);
}
