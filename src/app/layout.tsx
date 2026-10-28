import type {ReactNode} from 'react';
import {AppLocaleProvider} from '@/components/app-locale-provider';
import './globals.css';
export default function RootLayout({children}:{children:ReactNode}){return <html lang="zh-CN"><body><AppLocaleProvider>{children}</AppLocaleProvider></body></html>;}
