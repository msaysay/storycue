import { ensureBridgeToken, tokensMatch } from "../tools/bridge-token.mjs";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostFrom(request: Request): { url: URL; host: URL } | null {
  const url = new URL(request.url);
  const header = request.headers.get("host") || url.host;
  try {
    const host = new URL(`${url.protocol}//${header}`);
    if (host.username || host.password || host.pathname !== "/" || host.search || host.hash) return null;
    return { url, host };
  } catch {
    return null;
  }
}

/** Existing same-origin loopback gate. Cross-site browser calls stay rejected. */
export function sameOriginLoopback(request: Request): boolean {
  const parsed = hostFrom(request);
  if (!parsed) return false;
  const origin = request.headers.get("origin");
  return process.env.STORYCUE_OPEN_SOURCE === "1"
    && LOOPBACK.has(parsed.url.hostname)
    && LOOPBACK.has(parsed.host.hostname)
    && (!origin || origin === parsed.host.origin)
    && request.headers.get("sec-fetch-site") !== "cross-site";
}

/**
 * Workbench server-to-server calls.
 * Only a literal 127.0.0.1 Host plus the bridge token may cross origins.
 * localhost and public hosts stay on the same-origin rule.
 */
export function isBridgeHost(request: Request): boolean {
  const parsed = hostFrom(request);
  if (!parsed) return false;
  if (parsed.host.hostname !== "127.0.0.1") return false;
  if (!LOOPBACK.has(parsed.url.hostname)) return false;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded && forwarded.split(",")[0]?.trim() !== "127.0.0.1") return false;
  return true;
}

export async function bridgeTokenAllowed(request: Request): Promise<boolean> {
  if (process.env.STORYCUE_OPEN_SOURCE !== "1") return false;
  const presented = request.headers.get("x-storycue-bridge-token");
  if (!presented || !isBridgeHost(request)) return false;
  const expected = await ensureBridgeToken();
  return tokensMatch(presented, expected);
}

export async function setupAllowed(request: Request): Promise<boolean> {
  return sameOriginLoopback(request) || await bridgeTokenAllowed(request);
}

export function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
