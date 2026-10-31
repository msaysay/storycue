import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureBridgeToken, bridgeTokenPath } from "../../tools/bridge-token.mjs";
import { resolveVoiceRelayPort } from "../../tools/storycue-launch.mjs";
import { POST as postHandoff } from "../../src/app/api/trial/handoff/route";
import { GET as getHandoff } from "../../src/app/api/trial/handoff/[id]/route";
import { GET as getResult, POST as postResult } from "../../src/app/api/trial/handoff/[id]/result/route";
import { GET as getSetup, POST as postSetup } from "../../src/app/api/trial/setup/route";
import { POST as postSetupTest } from "../../src/app/api/trial/setup/test/route";
import { readHandoff, storeInterviewResult, generateEditingAdvice } from "../../server/storycue-handoff";
import { ASR_PROBE_PCM, runSetupTest, setSetupTestDepsForTests, type AsrProbeResult } from "../../server/storycue-setup-test";
import { saveDesktopBridge, readDesktopBridge, recordDesktopVerification } from "../../server/desktop-planner";
import { resetRelayLlmCacheForTests } from "../../server/relay-llm";
import { TTS_API_URL } from "../../server/volcengine-tts";

const ENV_KEYS = ["STORYCUE_DATA_DIR","STORYCUE_OPEN_SOURCE","STORYCUE_CONFIG_FILE","AURAL_LOCAL_TRIAL","NEXT_PUBLIC_APP_URL","DOUBAO_API_KEY","DOUBAO_APP_ID","DOUBAO_APP_KEY","DOUBAO_ACCESS_TOKEN","RELAY_LLM_API_KEY","RELAY_LLM_BASE_URL","RELAY_LLM_MODEL","RELAY_LLM_PROVIDER","RELAY_LLM_THINKING","TYPESAFE_API_KEY","STORYCUE_JEV_ENABLED","GEMINI_API_KEY","MINIMAX_API_KEY","KIMI_API_KEY","VOICE_RELAY_PORT"];
function captureEnv() { return Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])); }
function restoreEnv(before: Record<string, string | undefined>) { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
function sha(script: string) { return createHash("sha256").update(script, "utf8").digest("hex"); }
function handoffBody(overrides: Record<string, unknown> = {}) {
  const script = typeof overrides.script === "string" ? overrides.script : "已确认脚本。培训之后要落到一次具体行动。";
  return { schema: "danjie.storycue-handoff.v1", topicId: "topicA", revision: 1, title: "培训之后为什么还是做不成", framework: "北极星", background: "嘉宾做企业培训，想聊落地。", script, scriptSha256: sha(script), demo: true, createdAt: "2026-10-31T02:00:00.000Z", ...overrides, ...(overrides.script ? { script: overrides.script, scriptSha256: sha(String(overrides.script)) } : {}) };
}
function bridgePost(url: string, token: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Host: "127.0.0.1:3066", Origin: "http://127.0.0.1:8766", "X-StoryCue-Bridge-Token": token, ...headers }, body: JSON.stringify(body) });
}
const plan = { focus: "听一次培训之后没有落地的具体经过", questions: [{ label: "经历支撑", question: "能讲一次培训之后没落地的经过吗？", notes: "沿同一件事问行动和结果。" }] };
const entries = [
  { id: "e1", role: "AI", text: "能讲一次培训之后没落地的经过吗？", at: "2026-10-31T02:10:00.000Z" },
  { id: "e2", role: "嘉宾", text: "临时字幕还没核对", at: "2026-10-31T02:11:00.000Z", provisional: true },
  { id: "e3", role: "嘉宾", text: "我们改了两处，客户确认以后就停了。", at: "2026-10-31T02:12:00.000Z" },
];
const advice = { mainline: "嘉宾讲了培训之后一次没有落地的尝试", clips: [{ title: "一次没落地的尝试", rationale: "和这次选题直接相关，保留嘉宾自己的范围", readiness: "需补拍", segments: [{ purpose: "经历支撑", entryIds: ["e3"], note: "保留这次尝试的范围，不要扩成普遍结论" }], keyPhrases: [{ entryId: "e3", phrase: "改了两处" }], missing: ["还没有前后变化"], followUps: ["后来你具体改了哪一步？"] }], cautions: ["没有真实时间码"] };

test("bridge token is created once with mode 0600 and only 127.0.0.1 plus the token crosses origins", async () => {
  const before = captureEnv();
  const dir = await mkdtemp(path.join(os.tmpdir(), "storycue-token-"));
  Object.assign(process.env, { STORYCUE_DATA_DIR: dir, STORYCUE_OPEN_SOURCE: "1", AURAL_LOCAL_TRIAL: "1", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3066" });
  try {
    const token = await ensureBridgeToken();
    assert.equal(token, await ensureBridgeToken());
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.equal((await stat(bridgeTokenPath())).mode & 0o777, 0o600);
    const body = handoffBody();
    assert.equal((await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", "wrong-token", body))).status, 403);
    assert.equal((await postHandoff(bridgePost("http://localhost:3066/api/trial/handoff", token, body, { Host: "localhost:3066" }))).status, 403);
    assert.equal((await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, body, { "X-Forwarded-For": "8.8.8.8" }))).status, 403);
    assert.equal((await postHandoff(new Request("http://127.0.0.1:3066/api/trial/handoff", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:8766" }, body: JSON.stringify(body) }))).status, 403);
    const created = await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, body));
    assert.equal(created.status, 200);
    const payload = await created.json();
    assert.deepEqual(payload, { ok: true, handoffId: "topicA-1", openUrl: "http://127.0.0.1:3066/trial?handoff=topicA-1" });
    assert.equal((await stat(path.join(dir, "handoffs", "topicA-1.json"))).mode & 0o777, 0o600);
  } finally { restoreEnv(before); }
});

test("handoff stores the canonical framework, supersedes older revisions or changed scripts, and blocks old results", async () => {
  const before = captureEnv();
  const dir = await mkdtemp(path.join(os.tmpdir(), "storycue-handoff-"));
  Object.assign(process.env, { STORYCUE_DATA_DIR: dir, STORYCUE_OPEN_SOURCE: "1", AURAL_LOCAL_TRIAL: "1", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3066" });
  for (const key of ["DOUBAO_API_KEY","RELAY_LLM_API_KEY","GEMINI_API_KEY","MINIMAX_API_KEY","KIMI_API_KEY","TYPESAFE_API_KEY"]) delete process.env[key];
  resetRelayLlmCacheForTests();
  try {
    const token = await ensureBridgeToken();
    const named = await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ framework: "观点破题" })));
    assert.equal(named.status, 200);
    assert.equal((await readHandoff("topicA-1"))?.framework, "北极星");
    assert.equal((await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ background: "字".repeat(1201) })))).status, 400);
    assert.equal((await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ scriptSha256: "a".repeat(64) })))).status, 400);
    assert.equal((await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ topicId: "../secret" })))).status, 400);
    const tooLong = await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ script: "稿".repeat(100_001) })));
    assert.equal(tooLong.status, 413);
    assert.match((await tooLong.json()).error, /1200/);
    const page = await getHandoff(new Request("http://127.0.0.1:3066/api/trial/handoff/topicA-1", { headers: { Origin: "http://127.0.0.1:3066" } }), { params: Promise.resolve({ id: "topicA-1" }) });
    const view = await page.json();
    assert.equal(view.title, "培训之后为什么还是做不成");
    assert.equal(view.background, "嘉宾做企业培训，想聊落地。");
    assert.equal(view.status, "active");
    assert.equal("script" in view, false);
    const saved = await postResult(new Request("http://127.0.0.1:3066/api/trial/handoff/topicA-1/result", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3066" }, body: JSON.stringify({ plan, entries }) }), { params: Promise.resolve({ id: "topicA-1" }) });
    assert.equal(saved.status, 200);
    const exported = await saved.json();
    assert.equal(exported.schema, "storycue.interview-export.v1");
    assert.deepEqual(exported.entries.map((entry: { id: string }) => entry.id), ["e1", "e3"]);
    assert.equal(JSON.stringify(exported).includes("provisional"), false);
    assert.equal(exported.editingAdvice, null);
    assert.equal((await postResult(bridgePost("http://127.0.0.1:3066/api/trial/handoff/topicA-1/result", token, { plan, entries }))).status, 403);
    const read = await getResult(bridgePost("http://127.0.0.1:3066/api/trial/handoff/topicA-1/result", token, {}), { params: Promise.resolve({ id: "topicA-1" }) });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).scriptSha256, exported.scriptSha256);
    assert.equal((await getResult(new Request("http://127.0.0.1:3066/api/trial/handoff/topicA-1/result", { headers: { Origin: "http://127.0.0.1:3066" } }), { params: Promise.resolve({ id: "topicA-1" }) })).status, 403);
    const nextRevision = await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ revision: 2, title: "新的修订" })));
    assert.equal((await nextRevision.json()).handoffId, "topicA-2");
    assert.equal((await readHandoff("topicA-1"))?.status, "superseded");
    assert.equal((await readHandoff("topicA-2"))?.status, "active");
    const stale = await postResult(new Request("http://127.0.0.1:3066/api/trial/handoff/topicA-1/result", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3066" }, body: JSON.stringify({ plan, entries }) }), { params: Promise.resolve({ id: "topicA-1" }) });
    assert.equal(stale.status, 409);
    assert.match((await stale.json()).error, /取代/);
    assert.equal((await getResult(bridgePost("http://127.0.0.1:3066/api/trial/handoff/topicA-1/result", token, {}), { params: Promise.resolve({ id: "topicA-1" }) })).status, 409);
    const changed = await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ revision: 2, script: "脚本改过了，需要重新访谈。" })));
    assert.equal(changed.status, 200);
    assert.equal((await getResult(bridgePost("http://127.0.0.1:3066/api/trial/handoff/topicA-2/result", token, {}), { params: Promise.resolve({ id: "topicA-2" }) })).status, 404);
    const older = await postHandoff(bridgePost("http://127.0.0.1:3066/api/trial/handoff", token, handoffBody({ revision: 1 })));
    assert.equal(older.status, 200);
    assert.equal((await readHandoff("topicA-2"))?.status, "active");
    assert.equal((await readHandoff("topicA-1"))?.status, "superseded");
    const kept = await storeInterviewResult("topicA-2", { plan, entries: entries.filter(entry => !entry.provisional), editingAdvice: advice }, async () => { throw new Error("valid advice must not call the model"); });
    assert.equal(kept.editingAdvice?.mainline, advice.mainline);
    const failed = await storeInterviewResult("topicA-2", { plan, entries: entries.filter(entry => !entry.provisional) }, async () => { throw new Error("model down"); });
    assert.equal(failed.editingAdvice, null);
  } finally { setSetupTestDepsForTests(null); resetRelayLlmCacheForTests(); restoreEnv(before); }
});

test("setup accepts the bridge token without echoing keys, and each setup test target is classified from mocked calls", async t => {
  const before = captureEnv();
  const dir = await mkdtemp(path.join(os.tmpdir(), "storycue-setup-bridge-"));
  const file = path.join(dir, ".env.local");
  Object.assign(process.env, { STORYCUE_DATA_DIR: dir, STORYCUE_CONFIG_FILE: file, STORYCUE_OPEN_SOURCE: "1", AURAL_LOCAL_TRIAL: "1", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3066", STORYCUE_JEV_ENABLED: "0" });
  for (const key of ["DOUBAO_API_KEY","DOUBAO_APP_ID","DOUBAO_ACCESS_TOKEN","RELAY_LLM_API_KEY","GEMINI_API_KEY","MINIMAX_API_KEY","KIMI_API_KEY","TYPESAFE_API_KEY"]) delete process.env[key];
  const token = await ensureBridgeToken();
  const speechKey = "fixture-speech-console-key";
  const textKey = "fixture-text-model-key";
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    const href = String(url);
    calls.push(href);
    if (href === "https://ark.cn-beijing.volces.com/api/v3/models") return new Response("[]", { status: 200 });
    if (href === TTS_API_URL) return new Response(JSON.stringify({ code: 0, data: "QQ==" }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (href.endsWith("/chat/completions")) {
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${textKey}`);
      assert.equal(JSON.parse(String(init?.body)).messages[0].content, "请只回复：好");
      return new Response(JSON.stringify({ choices: [{ message: { content: "好" } }] }), { status: 200 });
    }
    if (href === "https://api.typesafe.ai/v1/models") return new Response("[]", { status: 200 });
    return new Response("missing", { status: 500 });
  });
  try {
    assert.equal((await runSetupTest("doubao_tts")).code, "not_configured");
    assert.equal((await runSetupTest("doubao_asr", { asrProbe: async () => { throw new Error("missing credentials must not open ASR"); } })).code, "not_configured");
    assert.equal((await runSetupTest("text_llm")).code, "not_configured");
    assert.equal((await runSetupTest("jev")).code, "disabled");
    assert.equal(calls.length, 0);
    const saved = await postSetup(bridgePost("http://127.0.0.1:3066/api/trial/setup", token, { speechKey, textKey, llmBaseUrl: "https://text.example/v1", llmModel: "fixture-model", enableJev: false }));
    assert.equal(saved.status, 200);
    assert.equal((await saved.text()).includes(speechKey), false);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const state = await getSetup(new Request("http://127.0.0.1:3066/api/trial/setup", { headers: { Host: "127.0.0.1:3066", Origin: "http://127.0.0.1:8766", "X-StoryCue-Bridge-Token": token } }));
    const statusText = await state.text();
    assert.equal(state.status, 200);
    assert.equal(statusText.includes(speechKey) || statusText.includes(textKey), false);
    assert.equal((await postSetup(new Request("http://127.0.0.1:3066/api/trial/setup", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:8766" }, body: "{}" }))).status, 403);
    const desktop = await postSetupTest(bridgePost("http://127.0.0.1:3066/api/trial/setup/test", token, { target: "desktop" }));
    const desktopBody = await desktop.json();
    assert.equal(desktopBody.ok, false);
    assert.equal(desktopBody.code, "not_connected");
    assert.match(desktopBody.message, /npm run desktop:doctor/);
    assert.equal((await postSetupTest(bridgePost("http://127.0.0.1:3066/api/trial/setup/test", token, { target: "nope" }))).status, 400);
    const tts = await runSetupTest("doubao_tts");
    assert.equal(tts.ok, true);
    assert.equal(tts.code, "ok");
    assert.equal(JSON.stringify(tts).includes(speechKey), false);
    const llm = await runSetupTest("text_llm");
    assert.deepEqual({ ok: llm.ok, code: llm.code }, { ok: true, code: "ok" });
    assert.equal(calls.some(url => url === "https://text.example/v1/chat/completions"), true);
    t.mock.method(globalThis, "fetch", async (url: unknown) => {
      const href = String(url);
      if (href === TTS_API_URL) return new Response("unauthorized", { status: 401 });
      if (href === "https://ark.cn-beijing.volces.com/api/v3/models") return new Response("[]", { status: 200 });
      if (href.endsWith("/chat/completions")) return new Response("missing model", { status: 404 });
      if (href === "https://api.typesafe.ai/v1/models") return new Response("no", { status: 451 });
      return new Response("no", { status: 401 });
    });
    const misused = await runSetupTest("doubao_tts");
    assert.equal(misused.code, "ark_key_misused");
    assert.match(misused.message, /方舟/);
    assert.equal(JSON.stringify(misused).includes(speechKey), false);
    const missingModel = await runSetupTest("text_llm");
    assert.equal(missingModel.code, "bad_model");
    process.env.STORYCUE_JEV_ENABLED = "1";
    process.env.TYPESAFE_API_KEY = "fixture-jev-key";
    await writeFile(file, `STORYCUE_JEV_ENABLED="1"\nTYPESAFE_API_KEY="fixture-jev-key"\nDOUBAO_API_KEY="${speechKey}"\nRELAY_LLM_API_KEY="${textKey}"\nRELAY_LLM_BASE_URL="https://text.example/v1"\nRELAY_LLM_MODEL="fixture-model"\n`, { mode: 0o600 });
    const region = await runSetupTest("jev");
    assert.deepEqual({ ok: region.ok, code: region.code }, { ok: false, code: "region_unavailable" });
    t.mock.method(globalThis, "fetch", async () => new Response("[]", { status: 401 }));
    assert.equal((await runSetupTest("jev")).code, "auth_failed");
    process.env.STORYCUE_JEV_ENABLED = "0";
    await writeFile(file, `STORYCUE_JEV_ENABLED="0"\nDOUBAO_APP_ID="fixture-app"\nDOUBAO_ACCESS_TOKEN="fixture-access-token"\n`, { mode: 0o600 });
    delete process.env.DOUBAO_API_KEY;
    let asrHeaders: Record<string, string> = {};
    const probe = async (headers: Record<string, string>): Promise<AsrProbeResult> => { asrHeaders = headers; return { kind: "http", status: 400, body: "AppID and token are not accepted" }; };
    const appOnly = await runSetupTest("doubao_asr", { asrProbe: probe, fetch: async () => { throw new Error("app-id token ASR must not ask Ark"); } });
    assert.equal(appOnly.code, "app_id_token_only");
    assert.match(appOnly.message, /API Key/);
    assert.equal(asrHeaders["X-Api-Key"], undefined);
    assert.equal(asrHeaders["X-Api-App-Key"], "fixture-app");
    await writeFile(file, `DOUBAO_API_KEY="fixture-ark-key"\n`, { mode: 0o600 });
    const arkAsr = await runSetupTest("doubao_asr", {
      asrProbe: async headers => { assert.equal(headers["X-Api-Key"], "fixture-ark-key"); return { kind: "http", status: 401, body: "Invalid X-Api-Key" }; },
      fetch: async url => new Response("[]", { status: String(url).includes("ark.cn-beijing") ? 200 : 401 }),
    });
    assert.equal(arkAsr.code, "ark_key_misused");
    assert.equal(JSON.stringify(arkAsr).includes("fixture-ark-key"), false);
    const okAsr = await runSetupTest("doubao_asr", { asrProbe: async () => ({ kind: "ok" }), fetch: async () => { throw new Error("successful ASR must not call Ark"); } });
    assert.equal(okAsr.ok, true);
    assert.match(okAsr.message, /语音控制台 Key/);
    assert.equal(ASR_PROBE_PCM.length, 3200);
    assert.equal(ASR_PROBE_PCM.every(byte => byte === 0), true);
    const bridge = { host: "codex" as const, cli: process.execPath, nodeEntry: false, lite: false };
    await saveDesktopBridge(bridge);
    const stored = await readDesktopBridge();
    assert.ok(stored);
    await recordDesktopVerification(stored);
    assert.equal((await runSetupTest("desktop")).code, "verified");
    const verification = path.join(dir, "desktop-verification.json");
    const old = JSON.parse(await readFile(verification, "utf8"));
    old.checkedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await writeFile(verification, JSON.stringify(old), { mode: 0o600 });
    const expired = await runSetupTest("desktop");
    assert.equal(expired.code, "not_verified");
    assert.match(expired.message, /desktop:doctor/);
    setSetupTestDepsForTests({ asrProbe: async () => ({ kind: "ok" }) });
    const throughRoute = await postSetupTest(bridgePost("http://127.0.0.1:3066/api/trial/setup/test", token, { target: "doubao_asr" }));
    const throughBody = await throughRoute.json();
    assert.equal(throughRoute.status, 200);
    assert.equal(throughBody.code, "ok");
    assert.equal(JSON.stringify(throughBody).includes("fixture-ark-key"), false);
  } finally { setSetupTestDepsForTests(null); resetRelayLlmCacheForTests(); restoreEnv(before); }
});

test("editing advice uses the text model and becomes null when that call fails", async t => {
  const before = captureEnv();
  Object.assign(process.env, { RELAY_LLM_PROVIDER: "openai", RELAY_LLM_API_KEY: "fixture-text-only", RELAY_LLM_BASE_URL: "https://text.example/v1", RELAY_LLM_MODEL: "fixture-model", RELAY_LLM_THINKING: "auto" });
  delete process.env.GEMINI_API_KEY; delete process.env.MINIMAX_API_KEY; delete process.env.KIMI_API_KEY;
  resetRelayLlmCacheForTests();
  const input = { sessionId: "topicA-2", topic: "培训之后为什么还是做不成", framework: "北极星" as const, entries: entries.filter(entry => !entry.provisional) };
  try {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(advice) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const generated = await generateEditingAdvice(input);
    assert.equal(generated?.mainline, advice.mainline);
    t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
    resetRelayLlmCacheForTests();
    assert.equal(await generateEditingAdvice(input), null);
  } finally { resetRelayLlmCacheForTests(); restoreEnv(before); }
});

test("the launcher defaults the voice relay to 8866 and still honors VOICE_RELAY_PORT", async () => {
  assert.equal(resolveVoiceRelayPort({}), "8866");
  assert.equal(resolveVoiceRelayPort({ VOICE_RELAY_PORT: "8877" }), "8877");
  assert.throws(() => resolveVoiceRelayPort({ VOICE_RELAY_PORT: "0" }), /65535/);
  assert.throws(() => resolveVoiceRelayPort({ VOICE_RELAY_PORT: "nope" }), /整数/);
  const source = await readFile(path.resolve("tools/start-storycue.mjs"), "utf8");
  const relay = await readFile(path.resolve("server/voice-relay.ts"), "utf8");
  assert.match(source, /resolveVoiceRelayPort\(\{ \.\.\.config, \.\.\.process\.env \}\)/);
  assert.match(source, /ensureBridgeToken/);
  assert.match(source, /VOICE_RELAY_PORT: voicePort/);
  assert.match(source, /windowsHide: true/);
  assert.match(source, /shell: false/);
  assert.match(relay, /VOICE_RELAY_PORT\) \|\| 8866/);
});
