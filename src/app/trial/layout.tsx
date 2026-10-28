import type { Metadata } from "next";
import type { ReactNode } from "react";

const description = "辅助拍视频的语音采访搭子，支持观点破题、四维信任、方法直给、痛点解答、情绪共鸣、人物故事、现场探访与决策问答，围绕选题倾听和追问。";
export const metadata: Metadata = {
  title: { absolute: "StoryCue · 访谈搭子" },
  description,
  icons: { icon: "/storycue.svg" },
  openGraph: { title: "StoryCue · 访谈搭子", siteName: "StoryCue", description, locale: "zh_CN", images: [] },
  twitter: { title: "StoryCue · 访谈搭子", description, images: [] },
};

export default function InterviewLayout({ children }: { children: ReactNode }) {
  return children;
}
