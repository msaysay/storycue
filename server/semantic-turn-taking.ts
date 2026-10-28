import { checkJevAvailability, judgeJevTurn, jevQuietTargetMs, type JevTurnState } from "./jev-turn-taking";

export type SemanticProvider = "JEV";
export interface SemanticDecision {
  choice: "READY" | "CONTINUE" | "THINKING" | "UNSURE";
  provider: SemanticProvider;
  quietMs: number;
  elapsedMs: number;
}
export async function judgeSemanticTurn(state: JevTurnState, provider: SemanticProvider, signal?: AbortSignal): Promise<SemanticDecision> {
  if (provider === "JEV") {
    const availability = await checkJevAvailability();
    signal?.throwIfAborted();
    if (availability !== "available") throw new Error(`Jev unavailable: ${availability}`);
    const result = await judgeJevTurn(state, signal);
    const quietMs = jevQuietTargetMs(result);
    return { choice: quietMs === 1800 ? "UNSURE" : result.choice, provider, quietMs, elapsedMs: result.elapsedMs };
  }
  throw new Error("Unsupported turn detector");
}

/** Results for old text or speech resumed after the request can never end the current turn. */
export function semanticWaitMs(input: { decision: SemanticDecision | null; resultMatches: boolean; requestPending: boolean; quietMs: number }): number {
  if (!input.resultMatches || input.requestPending) return 200;
  return Math.max(0, (input.decision?.quietMs ?? 1800) - input.quietMs);
}
