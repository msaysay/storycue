import { FRAMEWORKS, frameworkMethod, type InterviewFramework } from "@/lib/voice/video-frameworks";
import { FRAMEWORK_INTERVIEWS, type GuideItem } from "@/lib/voice/framework-interview-methods";
export { FRAMEWORKS, type InterviewFramework, type GuideItem };

export const TOPIC = "老板学了 AI，为什么公司还是没用起来？";
export const GUIDE_TITLE = "辅助拍视频 · 围绕选题采访";
export const GUIDE: readonly GuideItem[] = FRAMEWORK_INTERVIEWS["北极星"].questions.map((item,index) => index === 0 ? {...item, question:"老板学了AI，公司却没用起来，你觉得卡在哪儿？"} : item);

export const NORTH_STAR_GUIDE = FRAMEWORK_INTERVIEWS["北极星"].questions;
const CORE_REQUIREMENTS = "主问题只有3～5个，按所选方向安排不同主问题。支撑、原话关键词和自然承接贯穿整套提纲，细节在追问里展开，不在每题重复索要案例或联系方式。支撑可以是经历、步骤解释、现场细节或本人感受，不能把所有方向都套成反常识论证。金句从本人原话提炼，已说清就不重复；承接符合方向与本人意愿，无现有服务或不愿公开则不强推销售。";
export function getFrameworkGuide(framework: InterviewFramework, topic: string): readonly GuideItem[] {
  if (framework === "北极星" && topic.trim() === TOPIC) return GUIDE;
  return FRAMEWORK_INTERVIEWS[framework].questions;
}
export function buildInterviewDirection(framework: InterviewFramework, topic: string): string {
  const selected = FRAMEWORK_INTERVIEWS[framework];
  return `这是一场辅助拍视频的中文采访。本轮选题：${topic.trim()}。视频框架：${FRAMEWORKS[framework].name}。
${frameworkMethod(framework)}
本方向采访目的：${selected.focus}
本方向追问重点：${selected.followUp}
优先使用所选方向的动线；以下通用故事技巧只在相关时触发，不把所有方向问成观点论证或业务传记。
大纲是方向，不是逐条盘问的清单。每次只问一个短问题，直接承接最新回答。相关性先于故事深度，无关细节先桥接，仍无关就过题。例子、现场和数字必须由回答确认，背景不代表经历已经发生。
认可只针对本人已讲出的行动或判断，简短具体；不固定感谢分享，不替未核实结论背书。不强造冲突、痛苦、成功反转或反常识；保留不知道、没发生与记不清。
数字核对归属、时间、条件与口径。设计、建议、未来计划和已发生成果分开；故事与情绪不自动成为因果证据，口述不等于现场已看见。
采访不设总时长上限，不按秒数催促或结束。追问预算无需用满，已回答的角度不重复。不要朗读框架名称、题号或导演提示。
${CORE_REQUIREMENTS}`;
}
export const DIRECTION = buildInterviewDirection("北极星", TOPIC);
