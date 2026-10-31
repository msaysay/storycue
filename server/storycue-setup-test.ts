import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import WebSocket from "ws";
import type { IncomingMessage } from "node:http";
import { desktopBridgeStatus } from "./desktop-planner";
import { isTtsAuthConfigured, resolveTtsAuthConfig, TTS_API_URL } from "./volcengine-tts";
import { BIGMODEL_ASR_URL, buildBigModelAudioRequest, buildBigModelFullRequest, buildBigModelHeaders, parseAsrResponse } from "./volcengine-asr";
import { TRIAL_VOICES } from "../src/lib/voice/trial-settings";

export type SetupTestTarget = "doubao_tts" | "doubao_asr" | "text_llm" | "jev" | "desktop";
export type SetupTestResult = { ok: boolean; code: string; message: string };
const TARGETS = new Set<SetupTestTarget>(["doubao_tts", "doubao_asr", "text_llm", "jev", "desktop"]);
export function isSetupTestTarget(value: unknown): value is SetupTestTarget {
  return typeof value === "string" && TARGETS.has(value as SetupTestTarget);
}

/** 100ms of 16 kHz mono s16le silence. Confirms ASR permission without speaking. */
export const ASR_PROBE_PCM = Buffer.alloc(16_000 * 0.1 * 2);

export type AsrProbeResult =
  | { kind: "ok" }
  | { kind: "http"; status: number; body: string }
  | { kind: "error"; errorCode?: number; errorMessage?: string }
  | { kind: "network" };

export type SetupTestDeps = {
  fetch?: typeof fetch;
  asrProbe?: (headers: Record<string, string>) => Promise<AsrProbeResult>;
};

type Saved = Record<string, string>;
async function savedConfig(): Promise<Saved> {
  const file = process.env.STORYCUE_CONFIG_FILE || path.resolve(".env.local");
  try { return parse(await readFile(file)); } catch { return {}; }
}
function pick(saved: Saved, key: string): string {
  return (saved[key] || process.env[key] || "").trim();
}

const SPEECH_CONSOLE = "请到火山引擎控制台的「语音技术」创建 API Key，并为该 Key 开通大模型流式语音识别和语音合成。不要填写火山方舟的文本模型 Key，也不要只填 AppID + Access Token。";
const ARK_MISUSE = "这个 Key 可以访问火山方舟，但豆包语音拒绝了它。语音识别和合成要用「语音技术」控制台的 API Key，不能把方舟文本模型 Key 填到豆包语音。请另行创建语音 Key 并开通对应权限。";
const APP_PAIR = "当前只有 AppID 和 Access Token。大模型流式识别不接受这一对。请到语音技术控制台创建 API Key，填到豆包语音 API Key（DOUBAO_API_KEY），并开通流式识别。";

function speechAuthResult(input: { status?: number; body?: string; onlyAppCredentials: boolean; arkAcceptsKey: boolean; apiKeyIgnoredByAppPair: boolean; kind: "tts" | "asr" }): SetupTestResult {
  if (input.onlyAppCredentials) return { ok: false, code: "app_id_token_only", message: APP_PAIR };
  if (input.arkAcceptsKey) return { ok: false, code: "ark_key_misused", message: ARK_MISUSE };
  const extra = input.apiKeyIgnoredByAppPair ? "语音合成会优先使用已保存的 AppID + Access Token；若你只想使用语音控制台 API Key，请从 .env.local 删除 DOUBAO_APP_ID 和 DOUBAO_ACCESS_TOKEN 后重试。" : SPEECH_CONSOLE;
  const name = input.kind === "tts" ? "语音合成" : "语音识别";
  const status = input.status ? `（HTTP ${input.status}）` : "";
  return { ok: false, code: "auth_failed", message: `${name}鉴权失败${status}。${extra}` };
}

async function arkAccepts(key: string, fetchImpl: typeof fetch): Promise<boolean> {
  if (!key) return false;
  try {
    const response = await fetchImpl("https://ark.cn-beijing.volces.com/api/v3/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.status !== 401 && response.status !== 403 && response.ok;
  } catch {
    return false;
  }
}

function providerCode(body: string): number | null {
  const match = body.match(/"code"\s*:\s*(-?\d+)/);
  return match ? Number(match[1]) : null;
}

async function readPrefix(response: Response, max = 4096): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < max) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text.slice(0, max);
}

export async function probeDoubaoAsr(headers: Record<string, string>): Promise<AsrProbeResult> {
  const ws = new WebSocket(BIGMODEL_ASR_URL, { headers, handshakeTimeout: 8_000 });
  return await new Promise(resolve => {
    let settled = false;
    let opened = false;
    const finish = (result: AsrProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish(opened ? { kind: "ok" } : { kind: "network" }), 8_000);
    ws.on("unexpected-response", (_request: IncomingMessage, response: IncomingMessage) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => finish({ kind: "http", status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8").slice(0, 500) }));
      response.on("error", () => finish({ kind: "http", status: response.statusCode || 0, body: "" }));
    });
    ws.on("error", () => finish(opened ? { kind: "ok" } : { kind: "network" }));
    ws.on("open", () => {
      opened = true;
      ws.send(buildBigModelFullRequest({ format: "pcm", rate: 16000, bits: 16, channels: 1, codec: "raw", showUtterance: true, enablePunc: true }, "storycue-setup-test"));
      ws.send(buildBigModelAudioRequest(ASR_PROBE_PCM, 2, true));
    });
    ws.on("message", data => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const parsed = parseAsrResponse(buffer);
      if (parsed.errorCode != null || parsed.messageType === 0b1111) {
        finish({ kind: "error", errorCode: parsed.errorCode, errorMessage: parsed.errorMessage || "" });
        return;
      }
      if (parsed.messageType) finish({ kind: "ok" });
    });
    ws.on("close", () => { if (opened) finish({ kind: "ok" }); });
  });
}

async function testDoubaoTts(saved: Saved, fetchImpl: typeof fetch): Promise<SetupTestResult> {
  const appId = pick(saved, "DOUBAO_APP_ID");
  const accessToken = pick(saved, "DOUBAO_ACCESS_TOKEN");
  const apiKey = pick(saved, "DOUBAO_API_KEY");
  if (!isTtsAuthConfigured({ appId, accessToken, apiKey })) return { ok: false, code: "not_configured", message: `还没有豆包语音合成凭据。${SPEECH_CONSOLE}` };
  const auth = resolveTtsAuthConfig({ appId, accessToken, apiKey, resourceId: pick(saved, "DOUBAO_TTS_RESOURCE_ID") || "seed-tts-2.0" });
  const onlyAppCredentials = !apiKey && !!(appId && accessToken);
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Api-Resource-Id": auth.resourceId, "X-Api-Request-Id": "storycue-setup-test" };
  if (auth.apiKey) headers["X-Api-Key"] = auth.apiKey;
  else { headers["X-Api-App-Id"] = auth.appId; headers["X-Api-Access-Key"] = auth.accessToken; }
  let response: Response;
  try {
    response = await fetchImpl(TTS_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ user: { uid: "storycue-setup-test" }, req_params: { text: "嗯", speaker: TRIAL_VOICES[0].id, audio_params: { format: "mp3", sample_rate: 24000 } } }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { ok: false, code: "unreachable", message: "连不上语音合成服务。请检查本机网络后重试。不要改用方舟地址。" };
  }
  const body = await readPrefix(response);
  const code = providerCode(body);
  const httpOk = response.ok && (code == null || code === 0 || code === 20000000);
  if (httpOk) {
    const note = onlyAppCredentials ? "当前使用的是 AppID + Access Token。大模型流式识别仍需要语音控制台 API Key。" : "语音控制台 Key 可以完成极短合成。";
    return { ok: true, code: "ok", message: `语音合成已接通。${note}` };
  }
  if (response.status === 401 || response.status === 403 || (code != null && /unauthorized|invalid api|auth/i.test(body))) {
    const ark = auth.apiKey ? await arkAccepts(auth.apiKey, fetchImpl) : false;
    return speechAuthResult({ status: response.status, body, onlyAppCredentials, arkAcceptsKey: ark, apiKeyIgnoredByAppPair: !!apiKey && !!auth.appId && !auth.apiKey, kind: "tts" });
  }
  if (onlyAppCredentials && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return { ok: false, code: "app_id_token_only", message: APP_PAIR };
  }
  return { ok: false, code: "provider_error", message: `语音合成没有返回音频（HTTP ${response.status}）。请确认该 Key 已开通语音合成，资源 ID 为 ${auth.resourceId}。` };
}

async function testDoubaoAsr(saved: Saved, fetchImpl: typeof fetch, probe: (headers: Record<string, string>) => Promise<AsrProbeResult>): Promise<SetupTestResult> {
  const appId = pick(saved, "DOUBAO_APP_ID") || pick(saved, "DOUBAO_APP_KEY");
  const accessToken = pick(saved, "DOUBAO_ACCESS_TOKEN");
  const apiKey = pick(saved, "DOUBAO_API_KEY");
  if (!apiKey && !(appId && accessToken)) return { ok: false, code: "not_configured", message: `还没有豆包语音识别凭据。${SPEECH_CONSOLE}` };
  const onlyAppCredentials = !apiKey && !!(appId && accessToken);
  const headers = buildBigModelHeaders(appId, accessToken, "storycue-setup-test", pick(saved, "DOUBAO_ASR_RESOURCE_ID") || "volc.seedasr.sauc.duration", apiKey || undefined);
  let result: AsrProbeResult;
  try { result = await probe(headers); }
  catch { return { ok: false, code: "unreachable", message: "连不上流式语音识别。请检查本机网络后重试。" }; }
  if (result.kind === "ok") {
    return { ok: true, code: "ok", message: onlyAppCredentials ? "流式识别已接通。" : "语音控制台 Key 正确，流式识别已接通。" };
  }
  if (result.kind === "network") return { ok: false, code: "unreachable", message: "连不上流式语音识别。请检查本机网络后重试。" };
  const status = result.kind === "http" ? result.status : result.errorCode;
  const body = result.kind === "http" ? result.body : result.errorMessage || "";
  const authFailed = result.kind === "http"
    ? [400, 401, 403].includes(result.status)
    : /auth|key|token|unauthorized|forbidden|invalid/i.test(body) || [401, 403].includes(result.errorCode || 0);
  if (onlyAppCredentials && (authFailed || result.kind === "error")) return { ok: false, code: "app_id_token_only", message: APP_PAIR };
  if (!authFailed) return { ok: false, code: "provider_error", message: `流式识别没有完成（HTTP ${status || "未知"}）。请确认已开通大模型流式语音识别，资源 ID 为 ${headers["X-Api-Resource-Id"]}。` };
  const ark = await arkAccepts(apiKey, fetchImpl);
  return speechAuthResult({ status: typeof status === "number" ? status : undefined, body, onlyAppCredentials: false, arkAcceptsKey: ark, apiKeyIgnoredByAppPair: false, kind: "asr" });
}

async function testTextLlm(saved: Saved, fetchImpl: typeof fetch): Promise<SetupTestResult> {
  const base = (pick(saved, "RELAY_LLM_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
  const model = pick(saved, "RELAY_LLM_MODEL");
  const key = pick(saved, "RELAY_LLM_API_KEY");
  let parsed: URL;
  try { parsed = new URL(base); } catch { return { ok: false, code: "not_configured", message: "即时追问 Base URL 不是合法地址。请填写该服务商的 HTTPS API 基础地址，不要附加 /chat/completions。" }; }
  if (!key || !model || parsed.protocol !== "https:") return { ok: false, code: "not_configured", message: "即时追问还没配齐。请填写同一服务商的 HTTPS Base URL、API Key 和模型名。Base URL 不要加 /chat/completions，也不要填控制台网页。" };
  let response: Response;
  try {
    response = await fetchImpl(`${parsed.origin}${parsed.pathname}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "请只回复：好" }], max_tokens: 16, temperature: 0 }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { ok: false, code: "unreachable", message: "连不上即时追问模型。请检查 Base URL 和本机网络。地址应类似 https://ark.cn-beijing.volces.com/api/v3 。" };
  }
  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: true, code: "ok", message: "即时追问模型已接通。" };
  }
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 401 || response.status === 403) return { ok: false, code: "auth_failed", message: `文本模型拒绝了这个 Key（HTTP ${response.status}）。请确认 Key 属于当前 Base URL 的服务商，而不是豆包语音 Key。` };
  if (response.status === 404) return { ok: false, code: "bad_model", message: "模型名或接入点不可用。请改成该服务商已经开通的模型名，不要沿用其他服务的示例模型。" };
  return { ok: false, code: "provider_error", message: `即时追问返回 HTTP ${response.status}。请核对 Base URL、模型名和 Key 是否属于同一服务商。` };
}

async function testJev(saved: Saved, fetchImpl: typeof fetch): Promise<SetupTestResult> {
  const enabled = (saved.STORYCUE_JEV_ENABLED || process.env.STORYCUE_JEV_ENABLED) === "1";
  const key = pick(saved, "TYPESAFE_API_KEY");
  if (!enabled) return { ok: true, code: "disabled", message: "Jev 未启用。这一步可以跳过，访谈会用停顿自动接话。" };
  if (!key) return { ok: false, code: "not_configured", message: "已打开增强语义，但还没有 Jev Key。请填写 Key，或关闭该选项。" };
  let response: Response;
  try {
    response = await fetchImpl("https://api.typesafe.ai/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8_000) });
  } catch {
    return { ok: false, code: "unreachable", message: "连不上 Jev。请检查网络，或关闭增强语义，继续用自动停顿接话。" };
  }
  await response.body?.cancel().catch(() => undefined);
  if (response.ok) return { ok: true, code: "ok", message: "Jev 可用。" };
  if (response.status === 451) return { ok: false, code: "region_unavailable", message: "当前地区无法使用 Jev（HTTP 451）。请关闭增强语义，访谈会改用自动停顿接话。" };
  if (response.status === 401 || response.status === 403) return { ok: false, code: "auth_failed", message: `Jev Key 鉴权失败（HTTP ${response.status}）。请核对 Key，或关闭增强语义。` };
  return { ok: false, code: "unreachable", message: `Jev 返回 HTTP ${response.status}。可以稍后重试，或关闭增强语义。` };
}

async function testDesktop(): Promise<SetupTestResult> {
  const status = await desktopBridgeStatus();
  if (!status.configured) return { ok: false, code: "not_connected", message: "尚未连接 WorkBuddy 或 Codex。请在 StoryCue 项目目录运行 npm run desktop:connect -- --host workbuddy（Codex 用 --host codex），然后运行 npm run desktop:doctor。" };
  if (!status.verified) return { ok: false, code: "not_verified", message: "桌面 AI 尚未通过检查，或上次通过已超过 24 小时。请在项目目录运行 npm run desktop:doctor。若提示未登录，先运行 npm run desktop:login，再重新 doctor。" };
  return { ok: true, code: "verified", message: "本机桌面 AI 已通过最近 24 小时的检查。" };
}

export async function runSetupTest(target: SetupTestTarget, deps: SetupTestDeps = {}): Promise<SetupTestResult> {
  const merged = { ...hookedSetupTestDeps, ...deps };
  const fetchImpl = merged.fetch || fetch;
  const saved = await savedConfig();
  if (target === "doubao_tts") return testDoubaoTts(saved, fetchImpl);
  if (target === "doubao_asr") return testDoubaoAsr(saved, fetchImpl, merged.asrProbe || probeDoubaoAsr);
  if (target === "text_llm") return testTextLlm(saved, fetchImpl);
  if (target === "jev") return testJev(saved, fetchImpl);
  return testDesktop();
}

let hookedSetupTestDeps: SetupTestDeps | null = null;
/** Test-only. Production requests never set this. */
export function setSetupTestDepsForTests(deps: SetupTestDeps | null) { hookedSetupTestDeps = deps; }
