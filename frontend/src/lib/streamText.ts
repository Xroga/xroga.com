/**
 * Instant paint for already-complete Phase-1 replies.
 * (Fake typewriter after a full round-trip made chat feel twice as slow.)
 * Keep a tiny async yield so React can commit once before continuing.
 */
export async function streamTextReveal(
  text: string,
  onChunk: (partial: string) => void,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  onChunk(text);
  await Promise.resolve();
}
