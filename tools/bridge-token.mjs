import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Default data directory is the project `.storycue-data`, overridable with STORYCUE_DATA_DIR. */
export function storycueDataDir() {
  return path.resolve(process.env.STORYCUE_DATA_DIR || path.join(process.cwd(), ".storycue-data"));
}

export function bridgeTokenPath() {
  return path.join(storycueDataDir(), "bridge-token");
}

async function restrictOwnerOnly(file, mode) {
  if (process.platform === "win32") return;
  await chmod(file, mode);
  const info = await stat(file);
  if ((info.mode & 0o777) !== mode) {
    throw new Error(`无法把 ${path.basename(file)} 限制为 ${mode.toString(8)}`);
  }
}

function validToken(text) {
  const token = String(text || "").trim();
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}

/** Create `<STORYCUE_DATA_DIR>/bridge-token` (0600, 32 random bytes hex) once. Never rotates a valid file. */
export async function ensureBridgeToken() {
  const file = bridgeTokenPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await restrictOwnerOnly(path.dirname(file), 0o700);
  try {
    const existing = validToken(await readFile(file, "utf8"));
    if (existing) {
      await restrictOwnerOnly(file, 0o600);
      return existing;
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  const token = randomBytes(32).toString("hex");
  try {
    const handle = await open(file, "wx", 0o600);
    try {
      await handle.writeFile(token + "\n");
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error && error.code === "EEXIST") {
      const raced = validToken(await readFile(file, "utf8"));
      if (raced) return raced;
    }
    throw error;
  }
  await restrictOwnerOnly(file, 0o600);
  return token;
}

/** Constant-time compare. A length mismatch is a normal rejection, not an exception. */
export function tokensMatch(presented, expected) {
  if (typeof presented !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(presented.trim());
  const right = Buffer.from(expected.trim());
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
