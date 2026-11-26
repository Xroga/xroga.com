/** Only the backend's explicit ordinary availability result permits retaining
 * already-visible browser speech as a fallback. Unknown, security, accounting,
 * cancellation and session-change failures never authorize automatic sending.
 */
export function isTerminalVoiceFailure(error: unknown): boolean {
  const value = error as {status?: unknown; data?: {code?: unknown}} | null;
  return value?.status !== 503 || value.data?.code !== 'VOICE_PROVIDER_UNAVAILABLE';
}

/** One signal that aborts on timeout or cancellation. AbortSignal.any does not exist before iOS 17.4,
 * where calling it threw a TypeError and every voice upload failed before it was sent. */
export function voiceDeadline(timeoutMs: number, cancellation?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  if (cancellation?.aborted) { controller.abort(); return controller.signal; }
  const abort = () => {
    clearTimeout(timer);
    cancellation?.removeEventListener('abort', abort);
    controller.abort();
  };
  const timer = setTimeout(abort, timeoutMs);
  cancellation?.addEventListener('abort', abort, {once: true});
  return controller.signal;
}

export function voiceClientAwait<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Voice request cancelled.'), {name: 'AbortError'}));
    if (signal.aborted) {pending.catch(() => {}); abort(); return;}
    signal.addEventListener('abort', abort, {once: true});
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
