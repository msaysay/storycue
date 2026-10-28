import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { storycuePath } from "@/lib/voice/storycue-path";
export const metadata:Metadata={title:{absolute:"StoryCue · 语音访谈"},manifest:storycuePath("/api/trial/mobile-manifest"),icons:{icon:storycuePath("/storycue.svg")},appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"StoryCue"}};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#060d18"};
export default function MobileLayout({children}:{children:ReactNode}){return children;}
