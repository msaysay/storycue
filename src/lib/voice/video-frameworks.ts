import { z } from "zod";
import registry from "./video-frameworks.generated.json";

// IDs are the editing protocol IDs. Public names may change; saved facts may not.
export const FRAMEWORK_IDS = ["北极星", "四喜", "抄近路", "消费心理", "情绪", "业务传记", "云参访", "业务硬控"] as const;
export type InterviewFramework = typeof FRAMEWORK_IDS[number];
const aliases = new Map<string, InterviewFramework>(registry.frameworks.flatMap(row =>
  [row.id, row.name, ...row.aliases].map(name => [name, row.id as InterviewFramework])));
aliases.set("NORTH_STAR", "北极星");
aliases.set("北极星视频", "北极星");
aliases.set("BIOGRAPHY", "业务传记");
export function frameworkId(value: unknown): InterviewFramework | undefined {
  return typeof value === "string" ? aliases.get(value) : undefined;
}
export const InterviewFrameworkSchema = z.preprocess(value => frameworkId(value) ?? value, z.enum(FRAMEWORK_IDS));
export const FRAMEWORKS = Object.fromEntries(registry.frameworks.map(row => [row.id, {
  ...row, summary: row.description, path: row.stages.map(stage => stage.name).join(" → "),
}])) as Record<InterviewFramework, typeof registry.frameworks[number] & { summary: string; path: string }>;
export function frameworkName(value: unknown): string {
  const id = frameworkId(value);
  return id ? FRAMEWORKS[id].name : typeof value === "string" && value ? value : "人物故事";
}
export function frameworkMethod(id: InterviewFramework): string {
  const row = FRAMEWORKS[id];
  const names = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const publicText = (text: string) => text.replace(pattern, name => frameworkName(name));
  return `视频方向：${row.name}。内容动线：${row.path}。\n与剪辑端共用的方法：${publicText(row.editingGuide)}\n${row.cautions.map(publicText).join("\n")}\n采访不设固定时长，不能为了框架参考秒数催促或截断回答。`;
}
