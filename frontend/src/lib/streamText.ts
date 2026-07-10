/** Simulates streaming by revealing text in small chunks (for non-SSE responses). */
export async function streamTextReveal(
  text: string,
  onChunk: (partial: string) => void,
  signal?: AbortSignal,
  chunkSize = 3,
  delayMs = 12
): Promise<void> {
  let acc = '';
  for (let i = 0; i < text.length; i += chunkSize) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    acc += text.slice(i, i + chunkSize);
    onChunk(acc);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
