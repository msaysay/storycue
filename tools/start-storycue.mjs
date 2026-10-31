import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { ensureBridgeToken } from './bridge-token.mjs';
import { resolveVoiceRelayPort } from './storycue-launch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const configuration = path.join(root, '.env.local');
const config = existsSync(configuration) ? parse(readFileSync(configuration)) : {};
const port = process.env.STORYCUE_PORT || config.STORYCUE_PORT || '3066';
let voicePort;
try {
  // Process environment wins over .env.local, then the fixed 8866 default.
  voicePort = resolveVoiceRelayPort({ ...config, ...process.env });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
const dataDir = path.resolve(process.env.STORYCUE_DATA_DIR || config.STORYCUE_DATA_DIR || path.join(root, '.storycue-data'));
process.env.STORYCUE_DATA_DIR = dataDir;
try {
  await ensureBridgeToken();
} catch (error) {
  console.error('无法创建 bridge token：', error instanceof Error ? error.message : error);
  process.exit(1);
}
const env = {
  ...process.env,
  ...config,
  AURAL_LOCAL_TRIAL: '1',
  NEXT_PUBLIC_AURAL_LOCAL_TRIAL: '1',
  STORYCUE_OPEN_SOURCE: '1',
  STORYCUE_PLAN_PROVIDER: config.STORYCUE_PLAN_PROVIDER || 'desktop',
  STORYCUE_JEV_ENABLED: config.STORYCUE_JEV_ENABLED || '0',
  STORYCUE_CONFIG_FILE: configuration,
  STORYCUE_DATA_DIR: dataDir,
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  VOICE_RELAY_PORT: voicePort,
  NEXT_PUBLIC_VOICE_RELAY_URL: `ws://127.0.0.1:${voicePort}`,
  NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL: `ws://127.0.0.1:${voicePort}`,
  NEXT_PUBLIC_VOICE_RELAY_PRIMARY: 'voice',
  RELAY_LLM_PROVIDER: config.RELAY_LLM_PROVIDER || process.env.RELAY_LLM_PROVIDER || 'openai',
  DOUBAO_ASR_RESOURCE_ID: config.DOUBAO_ASR_RESOURCE_ID || 'volc.seedasr.sauc.duration',
  DOUBAO_TTS_RESOURCE_ID: config.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0',
  RELAY_LLM_THINKING: config.RELAY_LLM_THINKING || process.env.RELAY_LLM_THINKING || 'auto',
};
// No vaults, publisher servers, account files or proxy discovery. Only user env/config.
const children = [];
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const relayScript = path.join(root, 'server', 'voice-relay.ts');
if (!existsSync(nextBin)) {
  console.error('找不到 Next.js。请先在项目目录运行 npm ci。');
  process.exit(1);
}
function start(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true, shell: false });
  child.on('error', error => {
    console.error('StoryCue 子进程启动失败：', error.message);
    shutdown();
    process.exitCode = 1;
  });
  children.push(child);
  return child;
}
if (env.DOUBAO_API_KEY && env.RELAY_LLM_API_KEY) start(['--import', 'tsx', relayScript]);
else console.log('语音尚未配置：请在本机网页 /trial/setup 填写自己的 Key，保存后重新启动。');
const dev = process.argv.includes('--dev');
start([nextBin, dev ? 'dev' : 'start', ...(dev ? ['--webpack'] : []), '--hostname', '127.0.0.1', '--port', String(port)]);
console.log(`StoryCue: http://127.0.0.1:${port}/trial/mobile · 语音中继 ws://127.0.0.1:${voicePort} · 默认自动接话 · 主问题使用桌面 AI`);
function shutdown() { for (const child of children) if (child.exitCode === null && !child.killed) child.kill(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
if (process.platform === 'win32') process.on('SIGBREAK', shutdown);
for (const child of children) child.on('exit', code => { shutdown(); process.exitCode = code || 0; });
