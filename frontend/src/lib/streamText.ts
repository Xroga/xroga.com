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

/**
 * Reconcile a persisted/final answer with text already shown by a partial stream.
 * The overlap is bounded so reconnect cannot duplicate a prefix or scan unbounded text.
 */
export function reconcileAssistantText(existing: string, incoming: string, maxOverlap = 8_192): string {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming) || existing.endsWith(incoming)) return existing;

  let commonPrefix = 0;
  const prefixLimit = Math.min(existing.length, incoming.length, maxOverlap);
  while (commonPrefix < prefixLimit && existing[commonPrefix] === incoming[commonPrefix]) commonPrefix += 1;
  if (commonPrefix >= 8 && incoming.length >= existing.length && !existing.slice(commonPrefix).includes('\n')) {
    return incoming;
  }

  const limit = Math.min(existing.length, incoming.length, maxOverlap);
  for (let size = limit; size >= 1; size -= 1) {
    if (existing.slice(-size) === incoming.slice(0, size)) {
      return existing + incoming.slice(size);
    }
  }
  return `${existing}${existing.endsWith('\n') || incoming.startsWith('\n') ? '' : '\n'}${incoming}`;
}
