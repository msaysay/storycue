/** A short output tail, independent of the guest's end-of-answer silence window. */
export const PLAYBACK_ECHO_TAIL_MS = 450;
const ECHO_TEXT_WINDOW_MS = 4_000;

function speechKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

/** Conservative text backstop: don't reject a real answer merely for mentioning the topic. */
export function matchesPlaybackEcho(candidate: string, spoken: string): boolean {
  const input = speechKey(candidate);
  const output = speechKey(spoken);
  if (input.length < 8 || output.length < 8) return false;
  return output.includes(input) ||
    (input.includes(output) && output.length / input.length >= 0.9);
}

/** Uses one caller-supplied monotonic clock on the browser or relay, never React render state. */
export class PlaybackEchoGuard {
  private active = false;
  private holdUntil = 0;
  private spoken: Array<{ text: string; at: number }> = [];

  start(text: string, now: number): void {
    this.active = true;
    this.holdUntil = 0;
    if (text.trim()) this.spoken.push({ text, at: now });
    this.spoken = this.spoken.slice(-3);
  }

  finish(now: number): void {
    if (!this.active) return;
    this.active = false;
    this.holdUntil = now + PLAYBACK_ECHO_TAIL_MS;
    // The text window starts at actual playback completion, even for a long question.
    for (const entry of this.spoken) entry.at = now;
  }

  isBlocked(now: number): boolean {
    return this.active || now < this.holdUntil;
  }

  isEcho(text: string, now: number): boolean {
    return this.spoken.some(entry =>
      (this.active || now - entry.at <= ECHO_TEXT_WINDOW_MS) &&
      matchesPlaybackEcho(text, entry.text));
  }

  /**
   * Send silence during output to keep streaming ASR warm. Mask the overlapping part of a
   * capture buffer too, but retain samples after the tail so the first answer syllable survives.
   */
  protectAudio(input: Float32Array, bufferEndMs: number, sampleRate: number): Float32Array {
    if (!this.active && !this.holdUntil) return input;
    const bufferStartMs = bufferEndMs - input.length / sampleRate * 1_000;
    const mutedSamples = this.active ? input.length : Math.min(input.length,
      Math.max(0, Math.ceil((this.holdUntil - bufferStartMs) / 1_000 * sampleRate)));
    if (!mutedSamples) return input;
    const protectedAudio = input.slice();
    protectedAudio.fill(0, 0, mutedSamples);
    return protectedAudio;
  }
}
