import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { callRelayLLM } from "./relay-llm";
import { storycueDataDir } from "../tools/bridge-token.mjs";
import { AdviceInputSchema, EditingAdviceSchema, validateEditingAdvice, type AdviceInput, type EditingAdvice } from "../src/lib/voice/mobile-interview";
import { buildEditingAdvicePrompt } from "../src/lib/voice/editing-advice";
import { InterviewFrameworkSchema } from "../src/lib/voice/video-frameworks";

export const HANDOFF_SCHEMA = "danjie.storycue-handoff.v1";
export const INTERVIEW_EXPORT_SCHEMA = "storycue.interview-export.v1";
export const MAX_SCRIPT_CHARS = 100_000;
export const MAX_HANDOFF_BYTES = 600_000;
export const MAX_RESULT_BYTES = 400_000;

export class HandoffInputError extends Error {}

const HandoffSchema = z.object({
  schema: z.literal(HANDOFF_SCHEMA),
  topicId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/, "topicId 只能包含字母、数字、下划线和连字符，最长 80"),
  revision: z.number().int().nonnegative().max(1_000_000),
  title: z.string().trim().min(1).max(240),
  framework: InterviewFrameworkSchema,
  background: z.string().trim().max(1200),
  script: z.string().min(1).max(MAX_SCRIPT_CHARS).refine(script => script.trim().length > 0, "脚本是空的"),
  scriptSha256: z.string().regex(/^[a-f0-9]{64}$/i).transform(value => value.toLowerCase()),
  demo: z.boolean(),
  createdAt: z.string().datetime(),
});
export type HandoffInput = z.infer<typeof HandoffSchema>;
export type HandoffStatus = "active" | "superseded";
export type StoredHandoff = HandoffInput & { handoffId: string; status: HandoffStatus; receivedAt: string };

const ResultBodySchema = z.object({
  plan: z.object({
    focus: z.string().trim().max(500).default(""),
    questions: z.array(z.object({
      label: z.string().trim().min(1).max(80),
      question: z.string().trim().min(1).max(200),
      notes: z.string().trim().max(800).default(""),
    })).min(1).max(8),
  }),
  entries: z.array(z.object({
    id: z.string().trim().min(1).max(80).optional(),
    role: z.enum(["嘉宾", "AI"]),
    text: z.string().trim().min(1).max(16000),
    at: z.string().datetime(),
    provisional: z.boolean().optional(),
  })).max(1000),
  editingAdvice: z.unknown().optional(),
});

const ExportEntrySchema = z.object({
  id: z.string().min(1).max(80),
  role: z.enum(["嘉宾", "AI"]),
  text: z.string().min(1).max(16000),
  at: z.string().datetime(),
});
export const InterviewExportSchema = z.object({
  schema: z.literal(INTERVIEW_EXPORT_SCHEMA),
  handoffId: z.string(),
  topicId: z.string(),
  scriptSha256: z.string(),
  framework: InterviewFrameworkSchema,
  plan: ResultBodySchema.shape.plan,
  entries: z.array(ExportEntrySchema).max(1000),
  editingAdvice: EditingAdviceSchema.nullable(),
  exportedAt: z.string().datetime(),
  demo: z.boolean(),
});
export type InterviewExport = z.infer<typeof InterviewExportSchema>;

export function isSafeHandoffId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/.test(id);
}

function handoffDir() {
  return path.join(storycueDataDir(), "handoffs");
}
function handoffPath(id: string) {
  const file = path.join(handoffDir(), `${id}.json`);
  const root = path.resolve(handoffDir());
  if (!isSafeHandoffId(id) || !path.resolve(file).startsWith(root + path.sep)) throw new HandoffInputError("交接编号无效。");
  return file;
}
function resultPath(id: string) {
  return handoffPath(id).replace(/\.json$/, ".result.json");
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(path.dirname(file), 0o700).catch(() => {});
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  if (process.platform !== "win32") await chmod(tmp, 0o600);
  await rename(tmp, file);
}

export function parseHandoffBody(raw: unknown): HandoffInput {
  if (!raw || typeof raw !== "object") throw new HandoffInputError("交接内容不是 JSON 对象。");
  const body = raw as Record<string, unknown>;
  if (body.schema !== HANDOFF_SCHEMA) throw new HandoffInputError("schema 必须是 danjie.storycue-handoff.v1。");
  if (typeof body.topicId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(body.topicId)) {
    throw new HandoffInputError("topicId 只能包含字母、数字、下划线和连字符，最长 80，以便作为本机文件名。");
  }
  if (typeof body.revision !== "number" || !Number.isInteger(body.revision) || body.revision < 0) throw new HandoffInputError("revision 必须是非负整数。");
  if (typeof body.title === "string" && body.title.trim().length > 240) throw new HandoffInputError("title 不能超过 240 字。");
  if (typeof body.background === "string" && body.background.trim().length > 1200) {
    throw new HandoffInputError("background 不能超过 1200 字。请由工作台把过长脚本压缩进 background 后再交接。");
  }
  if (typeof body.script === "string" && body.script.length > MAX_SCRIPT_CHARS) {
    throw new HandoffInputError(`script 超过 ${MAX_SCRIPT_CHARS} 字。请由工作台压缩进不超过 1200 字的 background，StoryCue 不保存超长脚本。`);
  }
  if (typeof body.framework === "string" && !InterviewFrameworkSchema.safeParse(body.framework).success) {
    throw new HandoffInputError("framework 不是 StoryCue 的 8 个框架之一。可用 ID：北极星、四喜、抄近路、消费心理、情绪、业务传记、云参访、业务硬控。");
  }
  let input: HandoffInput;
  try { input = HandoffSchema.parse(body); }
  catch (error) {
    if (error instanceof HandoffInputError) throw error;
    throw new HandoffInputError("交接字段不符合 danjie.storycue-handoff.v1。请检查 topicId、revision、title、framework、background、script、scriptSha256、demo 和 createdAt。");
  }
  const actual = createHash("sha256").update(input.script, "utf8").digest("hex");
  if (actual !== input.scriptSha256) throw new HandoffInputError("scriptSha256 与 script 的 UTF-8 SHA-256 不一致。");
  return input;
}

async function readStored(id: string): Promise<StoredHandoff | null> {
  try {
    const parsed = JSON.parse(await readFile(handoffPath(id), "utf8")) as StoredHandoff;
    if (parsed?.schema !== HANDOFF_SCHEMA || !isSafeHandoffId(parsed.handoffId) || (parsed.status !== "active" && parsed.status !== "superseded")) return null;
    return parsed;
  } catch { return null; }
}

async function listStored(): Promise<StoredHandoff[]> {
  let names: string[] = [];
  try { names = await readdir(handoffDir()); } catch { return []; }
  const rows: StoredHandoff[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.endsWith(".result.json") || name.endsWith(".tmp")) continue;
    const row = await readStored(name.slice(0, -".json".length));
    if (row) rows.push(row);
  }
  return rows;
}

let queue: Promise<unknown> = Promise.resolve();
function locked<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

export async function saveHandoff(raw: unknown): Promise<StoredHandoff> {
  const input = parseHandoffBody(raw);
  return locked(async () => {
    const handoffId = `${input.topicId}-${input.revision}`;
    const siblings = (await listStored()).filter(row => row.topicId === input.topicId);
    const current = siblings.find(row => row.handoffId === handoffId);
    const higherActive = siblings.some(row => row.status === "active" && row.revision > input.revision);
    if (current && current.scriptSha256 === input.scriptSha256 && current.revision === input.revision) {
      if (current.status === "active") {
        const next: StoredHandoff = { ...current, ...input, handoffId, status: "active", receivedAt: current.receivedAt };
        await writeJson(handoffPath(handoffId), next);
        return next;
      }
      return current;
    }
    const status: HandoffStatus = higherActive ? "superseded" : "active";
    if (status === "active") {
      for (const old of siblings) {
        if (old.handoffId === handoffId) continue;
        if (old.status !== "superseded") await writeJson(handoffPath(old.handoffId), { ...old, status: "superseded" });
      }
    }
    if (current && current.scriptSha256 !== input.scriptSha256) await rm(resultPath(handoffId), { force: true });
    const stored: StoredHandoff = { ...input, handoffId, status, receivedAt: new Date().toISOString() };
    await writeJson(handoffPath(handoffId), stored);
    return stored;
  });
}

export async function readHandoff(id: string): Promise<StoredHandoff | null> {
  if (!isSafeHandoffId(id)) return null;
  return readStored(id);
}

export function handoffView(row: StoredHandoff) {
  return {
    ok: true as const,
    handoffId: row.handoffId,
    topicId: row.topicId,
    revision: row.revision,
    title: row.title,
    framework: row.framework,
    background: row.background,
    scriptSha256: row.scriptSha256,
    demo: row.demo,
    createdAt: row.createdAt,
    status: row.status,
  };
}

export function handoffOpenUrl(request: Request, handoffId: string): string {
  let port = process.env.STORYCUE_PORT || "3066";
  try {
    const host = request.headers.get("host") || new URL(request.url).host;
    const parsed = new URL(`http://${host}`);
    if (parsed.hostname === "127.0.0.1" && parsed.port) port = parsed.port;
  } catch { /* keep the default port */ }
  return `http://127.0.0.1:${port}/trial?handoff=${encodeURIComponent(handoffId)}`;
}

export async function generateEditingAdvice(input: AdviceInput): Promise<EditingAdvice | null> {
  if (!input.entries.some(entry => entry.role === "嘉宾" && !entry.provisional)) return null;
  try {
    const prompt = buildEditingAdvicePrompt(input);
    const signal = AbortSignal.timeout(12_000);
    const raw = await callRelayLLM(prompt, 4200, undefined, signal);
    if (!raw.trim()) return null;
    try { return validateEditingAdvice(raw, input); }
    catch {
      const corrected = await callRelayLLM(prompt + "\n格式纠正：上一份输出没有通过原稿引用校验。请只依据同一份原稿重新输出完整 JSON。", 4200, undefined, signal);
      if (!corrected.trim()) return null;
      return validateEditingAdvice(corrected, input);
    }
  } catch {
    return null;
  }
}

function acceptAdvice(value: unknown, input: AdviceInput): EditingAdvice | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<EditingAdvice>;
  const parsed = EditingAdviceSchema.safeParse({ mainline: source.mainline, clips: source.clips, cautions: source.cautions });
  if (!parsed.success) return null;
  try { return validateEditingAdvice(JSON.stringify(parsed.data), input); }
  catch { return null; }
}

export async function readInterviewResult(id: string): Promise<InterviewExport | null> {
  if (!isSafeHandoffId(id)) throw new HandoffInputError("交接编号无效。");
  const handoff = await readHandoff(id);
  if (!handoff) throw new HandoffInputError("找不到这次交接。");
  if (handoff.status === "superseded") throw new HandoffInputError("这次交接已被新的脚本取代，不能回传旧结果。请从工作台重新打开访谈。");
  let parsed: InterviewExport;
  try { parsed = InterviewExportSchema.parse(JSON.parse(await readFile(resultPath(id), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new HandoffInputError("回传文件无法读取。");
  }
  if (parsed.scriptSha256 !== handoff.scriptSha256 || parsed.handoffId !== handoff.handoffId) {
    throw new HandoffInputError("回传文件与当前脚本不一致，请重新回传。");
  }
  return parsed;
}

export async function storeInterviewResult(id: string, raw: unknown, advise: (input: AdviceInput) => Promise<EditingAdvice | null> = generateEditingAdvice): Promise<InterviewExport> {
  if (!isSafeHandoffId(id)) throw new HandoffInputError("交接编号无效。");
  let body: z.infer<typeof ResultBodySchema>;
  try { body = ResultBodySchema.parse(raw); }
  catch { throw new HandoffInputError("回传内容格式不正确。需要 plan（focus、questions）和 entries。"); }
  return locked(async () => {
    const handoff = await readHandoff(id);
    if (!handoff) throw new HandoffInputError("找不到这次交接。");
    if (handoff.status !== "active") throw new HandoffInputError("这次交接已被新的脚本取代，不能回传旧结果。请从工作台重新打开访谈。");
    const entries = body.entries.filter(entry => !entry.provisional).map((entry, index) => ({
      id: entry.id || `e${index + 1}`,
      role: entry.role,
      text: entry.text,
      at: entry.at,
    }));
    if (!entries.length) throw new HandoffInputError("没有已确认的问答。请先核对待校对字幕，或完成一轮访谈后再回传。");
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new HandoffInputError("回传段落编号重复。");
    const adviceInput = AdviceInputSchema.parse({
      sessionId: handoff.handoffId.slice(0, 80),
      topic: handoff.title,
      framework: handoff.framework,
      entries,
    });
    let editingAdvice = acceptAdvice(body.editingAdvice, adviceInput);
    if (!editingAdvice) {
      try { editingAdvice = await advise(adviceInput); }
      catch { editingAdvice = null; }
    }
    const exported = InterviewExportSchema.parse({
      schema: INTERVIEW_EXPORT_SCHEMA,
      handoffId: handoff.handoffId,
      topicId: handoff.topicId,
      scriptSha256: handoff.scriptSha256,
      framework: handoff.framework,
      plan: body.plan,
      entries,
      editingAdvice,
      exportedAt: new Date().toISOString(),
      demo: handoff.demo,
    });
    if (JSON.stringify(exported).includes('"provisional"')) throw new HandoffInputError("回传结果不能包含未确认字幕。");
    await writeJson(resultPath(id), exported);
    return exported;
  });
}
