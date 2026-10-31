/** Voice relay port. Default 8866 so it does not take the workbench's 8766. */
export function resolveVoiceRelayPort(env = process.env) {
  const raw = env.VOICE_RELAY_PORT;
  if (raw == null || String(raw).trim() === "") return "8866";
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) throw new Error("VOICE_RELAY_PORT 必须是 1 到 65535 的整数");
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("VOICE_RELAY_PORT 必须是 1 到 65535 的整数");
  return String(port);
}
